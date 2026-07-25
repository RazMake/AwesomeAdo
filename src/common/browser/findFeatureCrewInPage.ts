/**
 * Find an existing feature-crew work item by matching title, type, state, and the affectedBy link to
 * a given root work item ID.
 *
 * WHY this exists / why it must stay self-contained: In Manifest V3 the extension's content script
 * runs in an isolated world whose origin is `chrome-extension://…`, so its cross-origin fetch to ADO
 * is CORS-blocked; a same-origin fetch from the extension page instead drops ADO's SameSite session
 * cookies and hits a login loop. The only path that is BOTH same-origin AND carries the signed-in
 * session is a fetch running in the ADO tab's MAIN (page) world. This function is therefore injected
 * verbatim via `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`. It must not reference any import, module-scoped variable, or build
 * helper — only its parameters and page globals (`fetch`, `Promise`, `Array`, `JSON`). Promise
 * chaining (not async/await) avoids any transpiler helper being hoisted out of the function body.
 */
export function findFeatureCrewInPage(
  wiqlUrl: string,
  itemBaseUrl: string,
  rootId: number,
  title: string,
  typeName: string,
  state: string,
  affectedByRel: string,
): Promise<{ id: number; rev: number; description: string } | null> {
  const MAX_CANDIDATES = 20;

  // Escape single quotes by doubling them for WIQL.
  const escapeWiql = (value: string): string => value.replace(/'/g, "''");

  const query = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.Title] = '${escapeWiql(title)}' AND [System.WorkItemType] = '${escapeWiql(typeName)}' AND [System.State] = '${escapeWiql(state)}'`;

  return fetch(wiqlUrl, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query }),
  })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)
    .then((wiqlBody) => {
      if (wiqlBody === null) {
        return null;
      }
      const workItems = (wiqlBody as { workItems?: unknown }).workItems;
      if (!Array.isArray(workItems)) {
        return null;
      }

      const candidateIds: number[] = [];
      for (const item of workItems) {
        if (typeof item === "object" && item !== null) {
          const id = (item as { id?: unknown }).id;
          if (typeof id === "number") {
            candidateIds.push(id);
          }
        }
        if (candidateIds.length >= MAX_CANDIDATES) {
          break;
        }
      }

      if (candidateIds.length === 0) {
        return null;
      }

      const rootIdString = String(rootId);

      // Check each candidate in sequence, stopping at the first match.
      const checkCandidate = (
        index: number,
      ): Promise<{
        id: number;
        rev: number;
        description: string;
      } | null> => {
        if (index >= candidateIds.length) {
          return Promise.resolve(null);
        }

        const candidateId = candidateIds[index];
        const url = `${itemBaseUrl}/${candidateId}?$expand=relations&api-version=7.1`;

        return fetch(url, {
          credentials: "include",
          headers: { Accept: "application/json" },
        })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null)
          .then((itemBody) => {
            if (itemBody === null) {
              return checkCandidate(index + 1);
            }

            const relations = (itemBody as { relations?: unknown }).relations;
            if (!Array.isArray(relations)) {
              return checkCandidate(index + 1);
            }

            // Check if any relation matches the affectedBy rel and points to the root ID.
            for (const relation of relations) {
              if (typeof relation !== "object" || relation === null) {
                continue;
              }
              const rel = (relation as { rel?: unknown }).rel;
              const relUrl = (relation as { url?: unknown }).url;
              if (rel !== affectedByRel || typeof relUrl !== "string") {
                continue;
              }

              // Extract last path segment (before any query string).
              const urlWithoutQuery = relUrl.split("?")[0] ?? relUrl;
              const segments = urlWithoutQuery.split("/");
              const lastSegment = segments[segments.length - 1];

              if (lastSegment === rootIdString) {
                // Match found.
                const id = (itemBody as { id?: unknown }).id;
                const rev = (itemBody as { rev?: unknown }).rev;
                const fields = (itemBody as { fields?: unknown }).fields;
                const description =
                  typeof fields === "object" && fields !== null
                    ? ((fields as { "System.Description"?: unknown })[
                        "System.Description"
                      ] as string)
                    : "";

                return {
                  id: typeof id === "number" ? id : (candidateId ?? 0),
                  rev: typeof rev === "number" ? rev : 0,
                  description: typeof description === "string" ? description : "",
                };
              }
            }

            return checkCandidate(index + 1);
          });
      };

      return checkCandidate(0);
    });
}
