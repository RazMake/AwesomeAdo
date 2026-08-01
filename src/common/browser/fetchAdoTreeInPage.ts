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
 * helper — only its parameters and page globals (`fetch`, `setTimeout`, `Promise`, `Array`, `Set`).
 * Promise chaining (not async/await) avoids any transpiler helper being hoisted out of the body.
 */
export function fetchAdoTreeInPage(
  wiqlUrl: string,
  batchUrl: string,
  fields: string[],
  queryUrl: string,
  wiqlInit: RequestInit | null = null,
): Promise<AdoRawTree> {
  // Bound the ids-to-hydrate and batch-page counts so a misbehaving/huge query can never turn this
  // into an unbounded number of page-world fetches.
  const [MAX_IDS, PAGE_SIZE, MAX_PAGES, CONCURRENCY, MAX_ATTEMPTS] = [10000, 200, 100, 4, 3];

  // Keep transport failures as data because this injected function has no logger of its own. The
  // content-side loader logs the stage/status after the worker returns it; swallowing it here would
  // turn a rejected batch into the indistinguishable and incorrect conclusion "query has no items".
  // prettier-ignore
  const readJson = (
    url: string,
    init: RequestInit,
    stage: "wiql" | "batch",
    attempt = 1,
  ): Promise<unknown> =>
    fetch(url, init).then(
      (response) => {
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        if (!response.ok && retryable && attempt < MAX_ATTEMPTS) {
          return new Promise<void>((resolve) => setTimeout(resolve, attempt * 100))
            .then(() => readJson(url, init, stage, attempt + 1));
        }
        return response.ok ? response.json().catch(() => Promise.reject({ stage, status: response.status }))
          : Promise.reject({ stage, status: response.status });
      },
      () => attempt < MAX_ATTEMPTS
        ? new Promise<void>((resolve) => setTimeout(resolve, attempt * 100))
            .then(() => readJson(url, init, stage, attempt + 1))
        : Promise.reject({ stage, status: 0 }),
    );

  // Collect the work-item ids to hydrate from the WIQL body. Defined inline (not imported) because
  // this whole function is serialized and injected into the ADO MAIN world. A tree query carries both
  // endpoints of every parent/child edge (an item can be a target in one relation and a source in
  // another, so both sides are collected); a flat query lists its items directly.
  // prettier-ignore
  const collectIds = (wiql: unknown): number[] => {
    const relations = (wiql as { workItemRelations?: unknown } | null)?.workItemRelations;
    const workItems = (wiql as { workItems?: unknown } | null)?.workItems;
    const endpoints = Array.isArray(relations)
      ? relations.flatMap((relation) => {
        if (typeof relation !== "object" || relation === null) return [];
        const { source, target } = relation as { source?: unknown; target?: unknown };
        return source === null ? [target] : [target, source];
      })
      : Array.isArray(workItems) ? workItems : [];
    const ids = endpoints.map((endpoint) => (endpoint as { id?: unknown } | null)?.id)
      .filter((id): id is number => typeof id === "number");
    return Array.from(new Set(ids)).slice(0, MAX_IDS);
  };

  // The query's metadata (for its folder `path`) is an independent, best-effort read: it must never
  // block or fail the tree load, so it runs in parallel and degrades to `null` on any error.
  const readInit: RequestInit = { credentials: "include", headers: { Accept: "application/json" } };
  const queryMeta = readJson(queryUrl, readInit, "wiql").catch(() => null);

  // prettier-ignore
  const tree = readJson(wiqlUrl, wiqlInit ?? readInit, "wiql")
    .then((wiql) => {
      const idList = collectIds(wiql);
      if (idList.length === 0) return { wiql, items: [] };

      const pageCount = Math.min(Math.ceil(idList.length / PAGE_SIZE), MAX_PAGES);
      const pages = Array.from({ length: pageCount }, (_, page) => idList.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE));
      const answers: unknown[][] = [];
      let nextPage = 0;
      const drain = (): Promise<void> => {
        const pageIndex = nextPage++;
        const pageIds = pages[pageIndex];
        if (pageIds === undefined) return Promise.resolve();
        const init = {
          method: "POST", credentials: "include" as RequestCredentials,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ ids: pageIds, fields: fields }),
        };
        return readJson(batchUrl, init, "batch").then((body) => {
          const page = body as { value?: unknown };
          answers[pageIndex] = Array.isArray(page.value) ? page.value : [];
          return drain();
        });
      };

      const laneCount = Math.min(CONCURRENCY, pages.length);
      return Promise.all(Array.from({ length: laneCount }, drain))
        .then(() => ({ wiql, items: answers.flat() }));
    })
    .catch((error: unknown) => {
      const candidate = error as { stage?: unknown; status?: unknown } | null;
      const stage: "wiql" | "batch" = candidate?.stage === "batch" ? "batch" : "wiql";
      const status = typeof candidate?.status === "number" ? candidate.status : 0;
      return { wiql: null, items: [] as unknown[], failure: { stage, status } };
    });

  // Fold the best-effort query metadata into the tree result once both settle. Promise.all keeps the
  // metadata failure isolated (it already resolved to `null`), so the tree still returns normally.
  return Promise.all([tree, queryMeta]).then(([treeResult, query]) => ({ ...treeResult, query }));
}
