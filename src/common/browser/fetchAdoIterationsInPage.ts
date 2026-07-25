/**
 * Fetch the raw team-iterations REST body from inside the ADO page.
 *
 * WHY this exists / why it must stay self-contained: In Manifest V3 the extension's content script
 * runs in an isolated world whose origin is `chrome-extension://…`, so its cross-origin fetch to ADO
 * is CORS-blocked; a same-origin fetch from the extension page instead drops ADO's SameSite session
 * cookies and hits a login loop. The only path that is BOTH same-origin AND carries the signed-in
 * session is a fetch running in the ADO tab's MAIN (page) world. This function is therefore injected
 * verbatim via `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`. It must not reference any import, module-scoped variable, or build
 * helper — only its parameter and page globals (`fetch`, `Promise`). Promise chaining (not
 * async/await) avoids any transpiler helper being hoisted out of the function body.
 *
 * The team-iterations endpoint returns the whole (small, bounded) list in one response, so unlike the
 * paged tree fetch there is no cursor to advance here.
 */
export function fetchAdoIterationsInPage(iterationsUrl: string): Promise<unknown> {
  return fetch(iterationsUrl, { credentials: "include", headers: { Accept: "application/json" } })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);
}
