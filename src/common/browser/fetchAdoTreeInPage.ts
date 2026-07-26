import type { AdoRawTree } from "../ado/fetchAdoTree";

/**
 * Fetch the raw ADO WIQL query result and its hydrated field batches from inside the ADO page.
 *
 * WHY this exists / why it must stay self-contained: In Manifest V3 the extension's content script
 * runs in an isolated world whose origin is `chrome-extension://…`, so its cross-origin fetch to ADO
 * is CORS-blocked; a same-origin fetch from the extension page instead drops ADO's SameSite session
 * cookies and hits a login loop. The only path that is BOTH same-origin AND carries the signed-in
 * session is a fetch running in the ADO tab's MAIN (page) world. This function is therefore injected
 * verbatim via `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`. It must not reference any import, module-scoped variable, or build
 * helper — only its parameters and page globals (`fetch`, `Promise`, `Array`, `Set`). Promise
 * chaining (not async/await) avoids any transpiler helper being hoisted out of the function body.
 */
export function fetchAdoTreeInPage(
  wiqlUrl: string,
  batchUrl: string,
  fields: string[],
  queryUrl: string,
): Promise<AdoRawTree> {
  // Bound the ids-to-hydrate and batch-page counts so a misbehaving/huge query can never turn this
  // into an unbounded number of page-world fetches.
  const MAX_IDS = 10000;
  const PAGE_SIZE = 200;
  const MAX_BATCH_PAGES = 100;

  // Collect the work-item ids to hydrate from the WIQL body. Defined inline (not imported) because
  // this whole function is serialized and injected into the ADO MAIN world. A tree query carries both
  // endpoints of every parent/child edge (an item can be a target in one relation and a source in
  // another, so both sides are collected); a flat query lists its items directly.
  const collectIds = (wiql: unknown): number[] => {
    const ids = new Set<number>();
    const addId = (endpoint: unknown): void => {
      const id = (endpoint as { id?: unknown } | null)?.id;
      if (typeof id === "number") ids.add(id);
    };
    const relations = (wiql as { workItemRelations?: unknown } | null)?.workItemRelations;
    const workItems = (wiql as { workItems?: unknown } | null)?.workItems;
    if (Array.isArray(relations)) {
      for (const relation of relations) {
        if (typeof relation !== "object" || relation === null) continue;
        const { source, target } = relation as { source?: unknown; target?: unknown };
        addId(target);
        // source === null marks the relation's target as a root, so there is no source id to add.
        if (source !== null) addId(source);
      }
    } else if (Array.isArray(workItems)) {
      for (const item of workItems) addId(item);
    }
    return Array.from(ids).slice(0, MAX_IDS);
  };

  // The query's metadata (for its folder `path`) is an independent, best-effort read: it must never
  // block or fail the tree load, so it runs in parallel and degrades to `null` on any error.
  const queryMeta = fetch(queryUrl, {
    credentials: "include",
    headers: { Accept: "application/json" },
  })
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

  const tree = fetch(wiqlUrl, { credentials: "include", headers: { Accept: "application/json" } })
    .then((response) =>
      response.ok ? response.json() : Promise.reject(new Error("wiql request failed")),
    )
    .then((wiql) => {
      const idList = collectIds(wiql);
      if (idList.length === 0) return { wiql, items: [] };

      const items: unknown[] = [];
      const readBatchPage = (start: number, pagesLeft: number): Promise<void> => {
        const pageIds = idList.slice(start, start + PAGE_SIZE);
        return fetch(batchUrl, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ ids: pageIds, fields: fields }),
        })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null)
          .then((body) => {
            const page = body as { value?: unknown } | null;
            if (page !== null && Array.isArray(page.value)) items.push(...page.value);
            const nextStart = start + PAGE_SIZE;
            if (nextStart >= idList.length || pagesLeft <= 1) return undefined;
            return readBatchPage(nextStart, pagesLeft - 1);
          });
      };

      return readBatchPage(0, MAX_BATCH_PAGES).then(() => ({ wiql, items }));
    })
    .catch(() => ({ wiql: null, items: [] as unknown[] }));

  // Fold the best-effort query metadata into the tree result once both settle. Promise.all keeps the
  // metadata failure isolated (it already resolved to `null`), so the tree still returns normally.
  return Promise.all([tree, queryMeta]).then(([treeResult, query]) => ({
    wiql: treeResult.wiql,
    items: treeResult.items,
    query,
  }));
}
