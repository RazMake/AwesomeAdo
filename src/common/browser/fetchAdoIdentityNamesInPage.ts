/**
 * The result of one bulk identity-name read.
 *
 * Unlike the search outcome next door, a partial answer is kept: the ids are split across batches
 * purely because they travel in a query string, so one failed batch must not throw away the names
 * the others returned. `failure` therefore reports the FIRST batch that went wrong while `bodies`
 * still carries everything that came back — a mention resolves or falls back to its placeholder
 * individually, and the log still says why the missing ones are missing (AGENTS.md §9).
 */
export interface AdoIdentityNamesOutcome {
  /** The HTTP status of the first failing batch, 200 when every batch succeeded, 0 for no response. */
  status: number;
  /** The raw bodies that were read; empty when none were. */
  bodies: unknown[];
  /**
   * `none` when every batch succeeded; `http` when ADO rejected one; `sign-in` when a 200 carried
   * something other than JSON (ADO answers an expired session with its HTML sign-in page); `network`
   * when a request never completed — which here also covers the browser refusing the cross-origin
   * hop to the identity service host.
   */
  failure: "none" | "http" | "sign-in" | "network";
}

/**
 * Read Azure DevOps identities in bulk from inside the ADO page's MAIN world.
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
 * NOTE this is the one ADO read here that is genuinely CROSS-origin: bulk identity reads are served
 * from the `vssps` service host, not from the collection base the rest of the extension's calls use
 * (see `resolveAdoIdentityServiceBase`). The ADO web application makes the same hop from the same
 * page, so the session rides along on `credentials: "include"` — but if a tenant ever refuses it, it
 * arrives as a `network` failure and every mention simply keeps its placeholder.
 *
 * The URLs are built by the caller (`buildAdoIdentityNamesUrls`) so the batching and the GUID
 * validation stay unit-testable; this function only carries the credentialed round-trips.
 */
export function fetchAdoIdentityNamesInPage(urls: string[]): Promise<AdoIdentityNamesOutcome> {
  // Every batch is the same read against the same endpoint, so the request is described once.
  // `X-TFS-FedAuthRedirect: Suppress` is what turns an expired session into a real failure instead
  // of a 200 carrying ADO's HTML sign-in page, which would parse as "nobody by that id" and
  // silently anonymize every mention.
  const request: RequestInit = {
    credentials: "include",
    headers: { Accept: "application/json", "X-TFS-FedAuthRedirect": "Suppress" },
  };

  const readBatch = (url: string): Promise<AdoIdentityNamesOutcome> =>
    fetch(url, request)
      .then((response) =>
        // Read as text first: a failing call must not be lost to a JSON parse error, and the parse
        // itself is what distinguishes a real answer from a sign-in page served with a 200.
        response.text().then((text) => {
          // Classified into the SAME shape the caller merges, so a batch's answer and the whole
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

  return Promise.all(urls.map(readBatch)).then((batches) => {
    const merged: AdoIdentityNamesOutcome = { status: 200, bodies: [], failure: "none" };
    for (const batch of batches) {
      for (const body of batch.bodies) {
        merged.bodies.push(body);
      }
      if (batch.failure !== "none" && merged.failure === "none") {
        // First failure wins: one reason is what the log needs, and a later batch failing the same
        // way would add nothing but noise to a bounded ring buffer.
        merged.failure = batch.failure;
        merged.status = batch.status;
      }
    }
    return merged;
  });
}
