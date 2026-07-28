/**
 * The result of one mention-resolution read.
 *
 * A partial answer is kept: the ids are split across requests purely because the Identity Picker
 * answers one identity per query, so one failed request must not throw away the names the others
 * returned. `failure` therefore reports the FIRST request that went wrong while `bodies` still
 * carries everything that came back — a mention resolves or falls back to its placeholder
 * individually, and the log still says why the missing ones are missing (AGENTS.md §9).
 */
export interface AdoIdentityNamesOutcome {
  /** The HTTP status of the first failing request, 200 when every one succeeded, 0 for no response. */
  status: number;
  /** The raw bodies that were read; empty when none were. */
  bodies: unknown[];
  /**
   * `none` when every request succeeded; `http` when ADO rejected one; `sign-in` when a 200 carried
   * something other than JSON (ADO answers an expired session with its HTML sign-in page); `network`
   * when a request never completed.
   */
  failure: "none" | "http" | "sign-in" | "network";
}

/**
 * Resolve Azure DevOps `@`-mention identities from inside the ADO page's MAIN world.
 *
 * WHY this exists / why it must stay self-contained: In Manifest V3 the extension's content script
 * runs in an isolated world whose origin is `chrome-extension://…`, so its fetch to ADO is
 * CORS-blocked; a same-origin fetch from the extension page instead drops ADO's SameSite session
 * cookies and hits a login loop. The only path that carries the signed-in session is a fetch running
 * in the ADO tab's MAIN (page) world. This function is therefore injected verbatim via
 * `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`. It must not reference any import, module-scoped variable, or build
 * helper — only its parameters and page globals (`fetch`, `Promise`, `JSON`). Promise chaining (not
 * async/await) avoids any transpiler helper being hoisted out of the function body.
 *
 * WHY one request per id: the endpoint is the Identity Picker, whose `query` is a single opaque
 * string — a comma-separated list comes back as one unmatched token, not a batch. The batched
 * `_apis/identities` read this replaced is unreachable from here: it is served only from the
 * separate `vssps` host, which answers a credentialed cross-origin fetch with
 * `Access-Control-Allow-Origin: *` and is therefore rejected by the browser outright. Requests run
 * through a bounded pool so a heavily-mentioned board cannot starve the ADO page's own traffic.
 *
 * The URL and the ids are built by the caller (`buildAdoIdentityPickerRequest`) so the GUID
 * validation and the ceiling stay unit-testable; this function only carries the credentialed
 * round-trips.
 */
export function fetchAdoIdentityNamesInPage(
  url: string,
  ids: string[],
  concurrency: number,
): Promise<AdoIdentityNamesOutcome> {
  // `queryTypeHint: "uid"` is what makes the picker treat the GUID as an identifier instead of text
  // to match display names against — without it every query matches nothing and every mention stays
  // anonymous. `X-TFS-FedAuthRedirect: Suppress` turns an expired session into a real failure
  // instead of a 200 carrying ADO's HTML sign-in page, which would parse as "nobody by that id".
  const requestFor = (id: string): RequestInit => ({
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-TFS-FedAuthRedirect": "Suppress",
    },
    body: JSON.stringify({
      query: id,
      queryTypeHint: "uid",
      identityTypes: ["user", "group"],
      operationScopes: ["ims", "source"],
      properties: ["DisplayName", "Mail", "Active"],
      options: { MinResults: 1, MaxResults: 1 },
    }),
  });

  const readOne = (id: string): Promise<AdoIdentityNamesOutcome> =>
    fetch(url, requestFor(id))
      .then((response) =>
        // Read as text first: a failing call must not be lost to a JSON parse error, and the parse
        // itself is what distinguishes a real answer from a sign-in page served with a 200.
        response.text().then((text) => {
          // Classified into the SAME shape the caller merges, so one query's answer and the whole
          // read's answer never need translating between two vocabularies.
          let bodies: unknown[] = [];
          let failure: AdoIdentityNamesOutcome["failure"] = response.ok ? "none" : "http";
          if (response.ok) {
            try {
              bodies = [JSON.parse(text)];
            } catch {
              failure = "sign-in";
            }
          }
          return { status: response.status, bodies: bodies, failure: failure };
        }),
      )
      .catch(() => ({ status: 0, bodies: [], failure: "network" as const }));

  // Answers are parked by REQUEST INDEX rather than appended as they land, so the merge below is
  // decided by the id order the caller chose and not by which request happened to finish first.
  // Otherwise "which failure gets reported" would vary run to run for the very same board.
  const answers: AdoIdentityNamesOutcome[] = [];
  let next = 0;
  const drain = (): Promise<void> => {
    const index = next;
    next += 1;
    if (index >= ids.length) {
      return Promise.resolve();
    }
    return readOne(ids[index]!).then((answer) => {
      answers[index] = answer;
      return drain();
    });
  };

  const lanes: Promise<void>[] = [];
  for (let lane = 0; lane < Math.min(concurrency, ids.length); lane += 1) {
    lanes.push(drain());
  }

  return Promise.all(lanes).then(() => {
    const merged: AdoIdentityNamesOutcome = { status: 200, bodies: [], failure: "none" };
    for (const answer of answers) {
      for (const body of answer.bodies) {
        merged.bodies.push(body);
      }
      if (answer.failure !== "none" && merged.failure === "none") {
        // First failure wins: one reason is what the log needs, and a later request failing the same
        // way would add nothing but noise to a bounded ring buffer.
        merged.failure = answer.failure;
        merged.status = answer.status;
      }
    }
    return merged;
  });
}
