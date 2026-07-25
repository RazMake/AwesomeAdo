export interface FeatureCrewApplyConfig {
  mode: "create" | "update";
  url: string;
  description: string;
  title?: string;
  state?: string;
  rootRelationUrl?: string;
  affectedByRel?: string;
}

/**
 * Create or update a feature-crew work item in the ADO page world.
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
 * NOTE: Creating a work item directly in the "Removed" state may be rejected by some ADO process
 * transition rules, in which case the POST returns non-ok and this resolves null (the caller degrades
 * and logs).
 */
export function applyFeatureCrewInPage(
  config: FeatureCrewApplyConfig,
): Promise<{ id: number } | null> {
  let ops: unknown[];
  let method: string;

  if (config.mode === "create") {
    ops = [
      { op: "add", path: "/fields/System.Title", value: config.title },
      { op: "add", path: "/fields/System.State", value: config.state },
      { op: "add", path: "/fields/System.Description", value: config.description },
      {
        op: "add",
        path: "/relations/-",
        value: { rel: config.affectedByRel, url: config.rootRelationUrl },
      },
    ];
    method = "POST";
  } else {
    ops = [{ op: "add", path: "/fields/System.Description", value: config.description }];
    method = "PATCH";
  }

  return fetch(config.url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json-patch+json", Accept: "application/json" },
    body: JSON.stringify(ops),
  })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)
    .then((body) => {
      if (body === null) {
        return null;
      }
      const id = (body as { id?: unknown }).id;
      if (typeof id === "number") {
        return { id };
      }
      return null;
    });
}
