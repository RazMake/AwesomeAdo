/**
 * The result of one identity search, carrying enough to say WHY it failed.
 *
 * The picker previously received a bare body that was `null` for every failure, so a rejected
 * request, an expired session and a genuine "nobody matched" were indistinguishable — the control
 * just said "No people found." and the log could not tell the developer which one had happened
 * (AGENTS.md §9). The status and the classification below are deliberately free of the typed text:
 * ADO's error payloads quote the query, which is a person's name.
 */
export interface AdoIdentitySearchOutcome {
  /** The HTTP status, or 0 when the request never completed at all. */
  status: number;
  /** The parsed response body on success; null for every failure. */
  body: unknown;
  /**
   * `none` on success; `http` when ADO rejected the request; `sign-in` when a 200 carried something
   * other than JSON (ADO answers an expired session with its HTML sign-in page); `network` when the
   * request never completed.
   */
  failure: "none" | "http" | "sign-in" | "network";
}

/**
 * Search Azure DevOps identities from inside the ADO page's MAIN world.
 *
 * WHY this exists / why it must stay self-contained: In Manifest V3 the extension's content script
 * runs in an isolated world whose origin is `chrome-extension://…`, so its cross-origin fetch to ADO
 * is CORS-blocked; a same-origin fetch from the extension page instead drops ADO's SameSite session
 * cookies and hits a login loop. The only path that is BOTH same-origin AND carries the signed-in
 * session is a fetch running in the ADO tab's MAIN (page) world. This function is therefore injected
 * verbatim via `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`. It must not reference any import, module-scoped variable, or build
 * helper — only its parameters and page globals (`fetch`, `Promise`, `JSON`). Promise chaining (not
 * async/await) avoids any transpiler helper being hoisted out of the function body.
 *
 * The URL and the request body are built by the caller (`buildAdoIdentitySearchRequest`) so the
 * query shape stays unit-testable; this function only carries the credentialed round-trip.
 */
export function fetchAdoIdentitiesInPage(
  url: string,
  body: string,
): Promise<AdoIdentitySearchOutcome> {
  return fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      // Without this, an expired session answers with a 200 + an HTML sign-in page instead of a 401,
      // which would parse as "no identities found" and look like an empty directory.
      "X-TFS-FedAuthRedirect": "Suppress",
    },
    body: body,
  })
    .then((response) =>
      // Read as text first: a failing call must not be lost to a JSON parse error, and the parse
      // itself is what distinguishes a real answer from a sign-in page served with a 200.
      response.text().then((text) => {
        if (!response.ok) {
          return { status: response.status, body: null, failure: "http" as const };
        }
        try {
          return {
            status: response.status,
            body: JSON.parse(text) as unknown,
            failure: "none" as const,
          };
        } catch {
          return { status: response.status, body: null, failure: "sign-in" as const };
        }
      }),
    )
    .catch(() => ({ status: 0, body: null, failure: "network" as const }));
}
