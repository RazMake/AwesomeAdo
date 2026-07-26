import type { ReorderWorkItemResponse } from "./WorkItemReorderRequest";

/**
 * Everything the in-page reorder needs, bundled into one serializable object.
 *
 * Passed as a single argument because `chrome.scripting.executeScript` sends `args` as structured
 * clones: a bundle keeps the call site readable and makes it impossible to transpose two of the many
 * same-typed ids by getting the positional order wrong.
 */
export interface ReorderWorkItemConfig {
  /** The team-scoped `_apis/work/workitemsorder` endpoint that owns backlog rank arithmetic. */
  orderUrl: string;
  /** `_apis/wit/workitems/{id}?$expand=relations`, read to locate the existing parent link. */
  relationsUrl: string;
  /** `_apis/wit/workitems/{id}`, the JSON Patch endpoint for the re-parent. */
  itemUrl: string;
  /** The new parent's link identity, or null when the item must end up with no parent. */
  parentLinkUrl: string | null;
  /** ADO's child→parent link type name (`System.LinkTypes.Hierarchy-Reverse`). */
  parentLinkType: string;
  id: number;
  rev: number;
  /** The parent ADO must rank the item within; `0` means "no parent". */
  parentId: number;
  previousId: number;
  nextId: number;
  /** False when the item keeps its current parent, so the link patch is skipped entirely. */
  reparent: boolean;
}

/**
 * Move a work item to a new position — and, when asked, under a new parent — from inside the ADO
 * page's MAIN world.
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
 * WHY two calls rather than one: the order endpoint accepts a `parentId`, but its documented job is
 * to rank items *within* a parent — it is not a contract to restructure the tree. The hierarchy link
 * is therefore moved explicitly first, with a `/rev` test so a concurrent edit is rejected instead of
 * silently overwritten, and only then is the item ranked among its new siblings. Doing it in that
 * order also means a rejected re-parent leaves BOTH the tree and the rank untouched.
 */
export function reorderWorkItemInPage(
  config: ReorderWorkItemConfig,
): Promise<ReorderWorkItemResponse> {
  const { id, parentId, previousId, nextId, parentLinkType, parentLinkUrl } = config;

  // Hand back WHAT the server said, not just that it said no. Azure DevOps explains its refusals in
  // the body ("TF401232: work item does not exist", a rule violation, a stale rev), and reporting a
  // bare "HTTP 400" throws away the only thing that makes such a failure diagnosable without a
  // repro. Interpreting the body is deliberately left to the worker: this function is serialized
  // into the page, so every line here is a line that cannot be unit-tested.
  const failResponse = (stage: string, response: Response): Promise<ReorderWorkItemResponse> => {
    const error = stage + " HTTP " + String(response.status);
    return response.text().then(
      (body) => ({ ok: false, error: error, detail: body.slice(0, 600) }),
      () => ({ ok: false, error: error }),
    );
  };

  // Rank the item among its new siblings. `rev` is deliberately absent: backlog order is team state,
  // not a field on the item, so ADO does not version it and a rev test here would reject harmlessly
  // concurrent moves of unrelated items.
  function applyOrder(newRev: number | undefined): Promise<ReorderWorkItemResponse> {
    return fetch(config.orderUrl, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        ids: [id],
        parentId: parentId,
        previousId: previousId,
        nextId: nextId,
      }),
    }).then((response) => {
      if (!response.ok) {
        return failResponse("order", response);
      }
      return response.json().then((json) => {
        const body = Array.isArray(json) ? json : (json as { value?: unknown }).value;
        const entries = (Array.isArray(body) ? body : []) as { id?: number; order?: number }[];
        const order = entries.filter((entry) => entry && entry.id === id)[0]?.order;
        return { ok: true, rev: newRev, order: typeof order === "number" ? order : undefined };
      });
    });
  }

  // Replace the child→parent link. The existing one is addressed by INDEX (JSON Patch has no way to
  // remove a link by value), which is the only reason the item has to be read first.
  function applyReparent(): Promise<ReorderWorkItemResponse> {
    return fetch(config.relationsUrl, { credentials: "include" })
      .then((response) => {
        if (!response.ok) {
          return failResponse("relations", response);
        }
        return response.json().then((json) => {
          const links = ((json as { relations?: unknown }).relations ?? []) as { rel?: string }[];
          const operations: unknown[] = [{ op: "test", path: "/rev", value: config.rev }];
          // A work item carries at most one parent link, so the first match is the only one, and
          // JSON Patch can only remove a link by its INDEX — which is the sole reason for the read.
          const existing = links.findIndex((link) => link && link.rel === parentLinkType);
          if (existing >= 0) {
            operations.push({ op: "remove", path: "/relations/" + String(existing) });
          }
          if (parentLinkUrl !== null) {
            const value = { rel: parentLinkType, url: parentLinkUrl };
            operations.push({ op: "add", path: "/relations/-", value: value });
          }
          return patchItem(operations);
        });
      })
      .then((outcome) => (outcome.ok ? applyOrder(outcome.rev) : outcome));
  }

  function patchItem(operations: unknown[]): Promise<ReorderWorkItemResponse> {
    return fetch(config.itemUrl, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json-patch+json", Accept: "application/json" },
      body: JSON.stringify(operations),
    }).then((response) => {
      if (!response.ok) {
        return failResponse("reparent", response);
      }
      return response.json().then((json) => {
        const newRev = (json as { rev?: unknown }).rev;
        return { ok: true, rev: typeof newRev === "number" ? newRev : undefined };
      });
    });
  }

  return (config.reparent ? applyReparent() : applyOrder(undefined)).catch((err) => ({
    ok: false,
    error: String(err),
  }));
}
