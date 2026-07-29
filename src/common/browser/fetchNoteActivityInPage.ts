import type { RawNoteActivity } from "./NoteActivityRequest";

/**
 * Read the newest-comment date of MANY work items from inside the ADO page's MAIN world, in one
 * injection.
 *
 * WHY this exists / why it must stay self-contained: identical to `fetchWorkItemNotesInPage` — in
 * Manifest V3 only a fetch running in the ADO tab's MAIN (page) world is both same-origin and
 * carries the signed-in session, and this function is injected verbatim via
 * `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`. It must not reference any import, module-scoped variable, or build
 * helper — only its parameters and page globals (`fetch`, `Promise`, `Date`, `JSON`). Promise
 * chaining (not async/await) avoids any transpiler helper being hoisted out of the function body.
 *
 * WHY it takes the whole list rather than one item: the board asks about every commented item at
 * once, and doing that one message at a time meant one `executeScript` injection and one round-trip
 * to the service worker PER ITEM — overhead that dwarfed the fetch itself and made the first use of
 * the "New notes" filter a visible wait. Injected once, the fetches run side by side in the page.
 *
 * A failed item is reported in `failedIds` rather than as a null date, so the caller can keep
 * "nobody commented" and "nobody could find out" apart.
 */
export interface FetchNoteActivityConfig {
  requests: { workItemId: number; url: string }[];
  concurrency: number;
  excludedPrefixes: string[];
  maxPages: number;
}

export function fetchNoteActivityInPage(config: FetchNoteActivityConfig): Promise<RawNoteActivity> {
  const { requests, concurrency, excludedPrefixes, maxPages } = config;
  const result: RawNoteActivity = { newest: [], failedIds: [], failure: "none", status: 0 };
  let next = 0;

  // Built once, not per request: this is a fixed description of how ADO must be asked from the page
  // world. The FedAuth header is what turns an expired session into a real 401 — without it ADO
  // answers 200 with its HTML sign-in page, which would parse as "this item has no comments" and
  // quietly empty the filter.
  const init = {
    credentials: "include" as const,
    headers: { Accept: "application/json", "X-TFS-FedAuthRedirect": "Suppress" },
  };

  // Only the FIRST failure is kept: it is what the log reports, and a lost session would otherwise
  // overwrite itself once per item on a board where every read failed the same way.
  const fail = (workItemId: number, failure: RawNoteActivity["failure"], status: number): void => {
    result.failedIds.push(workItemId);
    if (result.failure === "none") {
      result.failure = failure;
      result.status = status;
    }
  };

  const readOne = (entry: { workItemId: number; url: string }): Promise<void> => {
    const readPage = (url: string, pagesLeft: number): Promise<string | null | undefined> =>
      fetch(url, init)
        .then((response) =>
          // Read as text first: the parse itself is what distinguishes a real answer from a sign-in
          // page served with a 200.
          response.text().then((text) => {
            if (!response.ok) {
              fail(entry.workItemId, "http", response.status);
              return undefined;
            }
            let body: unknown;
            try {
              body = JSON.parse(text);
            } catch {
              fail(entry.workItemId, "sign-in", response.status);
              return undefined;
            }
            const comments = (body as { comments?: unknown } | null)?.comments;
            if (!Array.isArray(comments)) {
              return null;
            }
            const newest = comments.find((raw) => {
              const comment = raw as { text?: unknown; createdDate?: unknown };
              const text = typeof comment.text === "string" ? comment.text : "";
              return (
                typeof comment.createdDate === "string" &&
                !isNaN(Date.parse(comment.createdDate)) &&
                !excludedPrefixes.some((prefix) => text.startsWith(prefix))
              );
            }) as { createdDate: string } | undefined;
            if (newest !== undefined) {
              return newest.createdDate;
            }
            const token = (body as { continuationToken?: unknown }).continuationToken;
            if (typeof token !== "string" || token.length === 0) {
              return null;
            }
            if (pagesLeft <= 1) {
              fail(entry.workItemId, "limit", 0);
              return undefined;
            }
            return readPage(
              entry.url + "&continuationToken=" + encodeURIComponent(token),
              pagesLeft - 1,
            );
          }),
        )
        .catch(() => {
          fail(entry.workItemId, "network", 0);
          return undefined;
        });

    return readPage(entry.url, maxPages > 0 ? maxPages : 1).then((newestNoteDate) => {
      if (newestNoteDate !== undefined) {
        result.newest.push({ workItemId: entry.workItemId, newestNoteDate });
      }
    });
  };

  // A worker pool rather than one `Promise.all` over everything: browsers cap concurrent same-origin
  // requests anyway, and releasing a whole board at once would queue the board's own writes and note
  // panels behind this read.
  const pump = (): Promise<void> =>
    next >= requests.length ? Promise.resolve() : readOne(requests[next++]!).then(pump);

  const width = Math.min(requests.length, Math.max(1, concurrency));
  const lanes = Array.from({ length: width }, () => pump());
  return Promise.all(lanes).then(() => result);
}
