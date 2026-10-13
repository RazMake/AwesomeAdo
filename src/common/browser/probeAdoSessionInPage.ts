import type { AdoSessionProbeOutcome } from "../ado-session/AdoSessionProbe";

/**
 * Read the organization's `ConnectionData` in the page's MAIN world, to learn whether the page's
 * Azure DevOps session is still signed in.
 *
 * MUST stay self-contained (no closures over module scope, no runtime imports — the type import is
 * erased): it is injected verbatim via `chrome.scripting.executeScript({ world: "MAIN", func })`,
 * which serializes it with `Function.prototype.toString`.
 *
 * `X-TFS-FedAuthRedirect: Suppress` turns an expired session into a 401 instead of ADO's sign-in
 * page, and `redirect: "manual"` keeps any remaining sign-in redirect visible instead of following
 * it cross-origin, where it would surface as an anonymous network failure.
 */
export function probeAdoSessionInPage(url: string): Promise<AdoSessionProbeOutcome> {
  return fetch(url, {
    credentials: "include",
    cache: "no-store",
    redirect: "manual",
    headers: { Accept: "application/json", "X-TFS-FedAuthRedirect": "Suppress" },
  }).then(
    (response): AdoSessionProbeOutcome | Promise<AdoSessionProbeOutcome> => {
      if (response.type === "opaqueredirect") {
        return { status: 302, body: null, error: "redirected toward sign-in" };
      }
      return response.text().then(
        (body) => ({ status: response.status, body }),
        (error: unknown) => ({
          status: response.status,
          body: null,
          error: `unreadable body: ${String(error)}`,
        }),
      );
    },
    (error: unknown) => ({ status: 0, body: null, error: `network: ${String(error)}` }),
  );
}
