/**
 * A matched feature-crew work item. Module-scope type aliases are erased at build time (esbuild
 * strips types), so referencing this from the injected function below does not break its
 * self-contained serialization.
 */
type FeatureCrewFind = { id: number; rev: number; description: string };

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
 * `Function.prototype.toString`. It must not reference any import, module-scoped VALUE, or build
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
): Promise<FeatureCrewFind | null> {
  const MAX_CANDIDATES = 20;
  const rootIdString = String(rootId);

  // Escape single quotes by doubling them for WIQL.
  const escapeWiql = (value: string): string => value.replace(/'/g, "''");
  const query = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.Title] = '${escapeWiql(title)}' AND [System.WorkItemType] = '${escapeWiql(typeName)}' AND [System.State] = '${escapeWiql(state)}'`;

  // Shared "read JSON, degrade to null on any non-ok / failure" fetch used for both the WIQL search
  // and each candidate read, so the two paths cannot drift apart. Inline (not imported) because the
  // whole function is serialized into the ADO MAIN world.
  const getJson = (url: string, init: RequestInit): Promise<unknown> =>
    fetch(url, init)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);

  // Read the WIQL-matched ids, capped so a corrupt/huge result can never fan out into an unbounded
  // number of per-item reads below.
  const collectCandidateIds = (wiqlBody: unknown): number[] => {
    const workItems = (wiqlBody as { workItems?: unknown } | null)?.workItems;
    const ids: number[] = [];
    if (Array.isArray(workItems)) {
      for (const item of workItems) {
        const id = (item as { id?: unknown } | null)?.id;
        if (typeof id === "number") ids.push(id);
        if (ids.length >= MAX_CANDIDATES) break;
      }
    }
    return ids;
  };

  // A candidate is the crew item only if it carries the affectedBy relation pointing at the root; on
  // a match return its id/rev/description, otherwise null so the caller tries the next candidate.
  const readMatch = (itemBody: unknown, candidateId: number): FeatureCrewFind | null => {
    const relations = (itemBody as { relations?: unknown } | null)?.relations;
    if (!Array.isArray(relations)) return null;
    const linksRoot = relations.some((relation) => {
      const rel = (relation as { rel?: unknown } | null)?.rel;
      const relUrl = (relation as { url?: unknown } | null)?.url;
      if (rel !== affectedByRel || typeof relUrl !== "string") return false;
      // Compare the relation target's trailing id segment (before any query string) to the root id.
      const lastSegment = (relUrl.split("?")[0] ?? relUrl).split("/").pop();
      return lastSegment === rootIdString;
    });
    if (!linksRoot) return null;
    const id = (itemBody as { id?: unknown }).id;
    const rev = (itemBody as { rev?: unknown }).rev;
    const fields = (itemBody as { fields?: unknown }).fields;
    const description = (fields as { "System.Description"?: unknown } | null)?.[
      "System.Description"
    ];
    return {
      id: typeof id === "number" ? id : candidateId,
      rev: typeof rev === "number" ? rev : 0,
      description: typeof description === "string" ? description : "",
    };
  };

  // Walk the candidates in order, resolving at the first real match; sequential (not parallel) so a
  // match short-circuits the remaining per-item reads.
  const checkCandidate = (ids: number[], index: number): Promise<FeatureCrewFind | null> => {
    if (index >= ids.length) return Promise.resolve(null);
    const candidateId = ids[index];
    const url = `${itemBaseUrl}/${candidateId}?$expand=relations&api-version=7.1`;
    return getJson(url, { credentials: "include", headers: { Accept: "application/json" } }).then(
      (itemBody) => readMatch(itemBody, candidateId ?? 0) ?? checkCandidate(ids, index + 1),
    );
  };

  return getJson(wiqlUrl, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query }),
  }).then((wiqlBody) => checkCandidate(collectCandidateIds(wiqlBody), 0));
}
