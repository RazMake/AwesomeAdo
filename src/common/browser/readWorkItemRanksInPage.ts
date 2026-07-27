/** Everything the in-page rank read needs, bundled into one serializable argument. */
export interface ReadWorkItemRanksConfig {
  /** The `_apis/wit/workitemsbatch` endpoint, already paged to at most 200 ids by the caller. */
  batchUrl: string;
  ids: number[];
  /** The rank field to read (`Microsoft.VSTS.Common.StackRank`). */
  field: string;
}

/** The raw batch body, or why it could not be read. */
export interface ReadWorkItemRanksResponse {
  ok: boolean;
  /** The `_apis/wit/workitemsbatch` response body, handed back unparsed. */
  body?: unknown;
  error?: string;
}

/**
 * Read the current rank of a page of work items from inside the ADO page's MAIN world.
 *
 * WHY this exists / why it must stay self-contained: In Manifest V3 the extension's content script
 * runs in an isolated world whose origin is `chrome-extension://…`, so its cross-origin fetch to ADO
 * is CORS-blocked; a same-origin fetch from the extension page instead drops ADO's SameSite session
 * cookies and hits a login loop. The only path that is BOTH same-origin AND carries the signed-in
 * session is a fetch running in the ADO tab's MAIN (page) world. This function is therefore injected
 * verbatim via `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`. It must not reference any import, module-scoped variable, or build
 * helper — only its parameter and page globals (`fetch`, `Promise`, `JSON`). Promise chaining (not
 * async/await) avoids any transpiler helper being hoisted out of the function body.
 *
 * The body is returned UNPARSED on purpose: every line here is a line that cannot be unit-tested, so
 * reading ranks out of it is left to `common/ado/rankFallback`, which is ordinary module code.
 */
export function readWorkItemRanksInPage(
  config: ReadWorkItemRanksConfig,
): Promise<ReadWorkItemRanksResponse> {
  return fetch(config.batchUrl, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ ids: config.ids, fields: [config.field] }),
  })
    .then((response): Promise<ReadWorkItemRanksResponse> => {
      if (!response.ok) {
        const status = "ranks HTTP " + String(response.status);
        // Hand back WHAT the server said: Azure DevOps explains a refusal in the body, and a bare
        // status throws away the only clue a reader gets without a live repro.
        return response.text().then(
          (body) => ({ ok: false, error: status + ": " + body.slice(0, 300) }),
          () => ({ ok: false, error: status }),
        );
      }
      return response.json().then((json) => ({ ok: true, body: json }));
    })
    .catch((err) => ({ ok: false, error: String(err) }));
}
