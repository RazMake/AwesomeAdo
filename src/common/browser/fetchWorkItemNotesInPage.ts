import type { RawWorkItemNotes } from "./WorkItemNoteRequest";

/**
 * Read one work item's discussion (and the signed-in identity) from inside the ADO page's MAIN world.
 *
 * WHY this exists / why it must stay self-contained: In Manifest V3 the extension's content script
 * runs in an isolated world whose origin is `chrome-extension://…`, so its cross-origin fetch to ADO
 * is CORS-blocked; a same-origin fetch from the extension page instead drops ADO's SameSite session
 * cookies and hits a login loop. The only path that is BOTH same-origin AND carries the signed-in
 * session is a fetch running in the ADO tab's MAIN (page) world. This function is therefore injected
 * verbatim via `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`. It must not reference any import, module-scoped variable, or build
 * helper — only its parameters and page globals (`fetch`, `Promise`, `Date`, `JSON`). Promise
 * chaining (not async/await) avoids any transpiler helper being hoisted out of the function body.
 *
 * Every failure is CLASSIFIED rather than reduced to "no data": an expired session, a rejected
 * request and a genuinely empty discussion would otherwise all reach the panel as an empty list, and
 * the log could not say which one happened (AGENTS.md §9).
 *
 * The comments collection PAGES: Azure DevOps caps a page regardless of the requested `$top`, so
 * reading only the first response would silently hide the older half of a busy discussion. Paging
 * stops as soon as a page reaches past the Updates window (the collection is requested newest-first,
 * so everything beyond it is older still), and `maxPages` guards against a server that ignores the
 * continuation token and would otherwise loop forever.
 */
export function fetchWorkItemNotesInPage(
  commentsUrl: string,
  connectionUrl: string,
  sinceIso: string,
  maxPages: number,
): Promise<RawWorkItemNotes> {
  const cutoff = Date.parse(sinceIso);

  const read = (
    url: string,
  ): Promise<{ body: unknown; status: number; failure: RawWorkItemNotes["failure"] }> =>
    fetch(url, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        // Without this, an expired session answers with a 200 + an HTML sign-in page instead of a
        // 401, which would parse as "this item has no notes" and look like an empty discussion.
        "X-TFS-FedAuthRedirect": "Suppress",
      },
    })
      .then((response) =>
        // Read as text first: the parse itself is what distinguishes a real answer from a sign-in
        // page served with a 200, and a failing call must not be lost to a JSON parse error.
        response.text().then((text) => {
          if (!response.ok) {
            return { body: null, status: response.status, failure: "http" as const };
          }
          try {
            return {
              body: JSON.parse(text) as unknown,
              status: response.status,
              failure: "none" as const,
            };
          } catch {
            return { body: null, status: response.status, failure: "sign-in" as const };
          }
        }),
      )
      .catch(() => ({ body: null, status: 0, failure: "network" as const }));

  // True once this page contains a comment older than the window, i.e. there is nothing left to ask
  // for. A page whose dates are all unreadable does NOT end the walk, because an unparseable date
  // says nothing about how far back the page reached.
  const reachedWindowStart = (page: unknown): boolean => {
    const comments = (page as { comments?: unknown } | null)?.comments;
    if (!Array.isArray(comments)) {
      return true;
    }
    return comments.some((comment) => {
      const created = (comment as { createdDate?: unknown }).createdDate;
      const at = typeof created === "string" ? Date.parse(created) : Number.NaN;
      return !isNaN(at) && at < cutoff;
    });
  };

  const walk = (url: string, pagesLeft: number, pages: unknown[]): Promise<RawWorkItemNotes> =>
    read(url).then((result) => {
      const stop = (failure: RawWorkItemNotes["failure"]): RawWorkItemNotes => ({
        pages: pages,
        connection: null,
        status: result.status,
        failure: failure,
      });
      if (result.failure !== "none") {
        // A LATER page that fails leaves the pages already read intact and reports success: a
        // partial discussion beats none at all. Only a first page that never arrived is a failure.
        return stop(pages.length === 0 ? result.failure : "none");
      }
      pages.push(result.body);
      const token = (result.body as { continuationToken?: unknown }).continuationToken;
      const next = typeof token === "string" ? token : "";
      const more = pagesLeft > 1 && next.length > 0 && !reachedWindowStart(result.body);
      return more
        ? walk(commentsUrl + "&continuationToken=" + encodeURIComponent(next), pagesLeft - 1, pages)
        : stop("none");
    });

  return Promise.all([walk(commentsUrl, maxPages, []), read(connectionUrl)]).then((results) => {
    const notes = results[0];
    // A failed identity read is NOT a failed notes read: the panel still shows every note, it just
    // cannot offer to edit any of them.
    notes.connection = results[1].body;
    return notes;
  });
}
