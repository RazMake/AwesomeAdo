import { ADO_API_VERSION } from "./adoApi";
import { buildTeamScopedApiUrl, resolveAdoProjectContext } from "./fetchAdoMetadata";

/**
 * The api-version the work-item order endpoint is served under.
 *
 * Deliberately NOT `ADO_API_VERSION`: `_apis/work/workitemsorder` has never left preview, and Azure
 * DevOps rejects a plain `7.1` on a preview-only route. Pinning the preview suffix here — beside the
 * only URL that needs it — keeps the shared version constant honest for every stable endpoint
 * instead of dragging the whole extension onto a preview contract.
 */
export const WORK_ITEMS_ORDER_API_VERSION = `${ADO_API_VERSION}-preview.1`;

/**
 * The ADO link type that points from a child work item to its parent.
 *
 * "Reverse" reads backwards but is ADO's own naming: the hierarchy link is defined parent → child,
 * so the child's end of it is the reverse direction. A child carries at most one of these, which is
 * what makes "find it and replace it" a complete re-parent.
 */
export const PARENT_LINK_TYPE = "System.LinkTypes.Hierarchy-Reverse";

/**
 * Build the team-scoped work-item order REST URL for the ADO project named by `href`, or null when
 * `href` is not a project-scoped ADO location or `team` is blank.
 *
 * Backlog order is a *team* concept in Azure DevOps — each team ranks the same items in its own
 * order — so the team must be part of the URL. URL construction lives here (a pure, chrome-free
 * module) so it stays unit-testable, while the credentialed PATCH runs in the ADO page's MAIN world
 * (see `common/browser/reorderWorkItemInPage`).
 */
export function buildWorkItemsOrderUrl(href: string, team: string): string | null {
  return buildTeamScopedApiUrl(href, team, "work/workitemsorder", WORK_ITEMS_ORDER_API_VERSION);
}

/**
 * Build the REST URL that reads one work item together with its links, or null when `href` is not a
 * supported ADO location.
 *
 * Re-parenting has to REPLACE the existing parent link, and JSON Patch addresses a link by its index
 * in the item's `relations` array — an index only this response can reveal. The URL is org-scoped
 * for the same reason `buildWorkItemUpdateUrl` is: the id alone identifies the item.
 */
export function buildWorkItemRelationsUrl(href: string, id: number): string | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  return `${resolved.base}/_apis/wit/workitems/${id}?$expand=relations&api-version=${ADO_API_VERSION}`;
}

/**
 * Build the REST URL that *identifies* a work item as a link target, or null when `href` is not a
 * supported ADO location.
 *
 * A hierarchy link's `url` is how ADO names the item on the other end, so this is the value written
 * into the new parent relation. It carries no `api-version`: it is an identity, not a request the
 * extension ever sends, and appending a version would make the stored link differ from the one ADO
 * writes itself.
 */
export function buildWorkItemLinkUrl(href: string, id: number): string | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  return `${resolved.base}/_apis/wit/workItems/${id}`;
}

/**
 * The new rank Azure DevOps assigned to a reordered item, read from a `ReorderResult[]` body.
 *
 * Returned so the caller can refresh its in-memory copy of the item's rank instead of re-reading the
 * tree: without it the board would keep the stale rank and re-sort a later pass back to where the
 * item was dragged FROM. `null` when the body is missing or carries no usable order for `id` — the
 * caller then leaves its copy alone rather than trusting a fabricated rank.
 */
export function parseReorderedRank(body: unknown, id: number): number | null {
  const entries = Array.isArray(body) ? body : (body as { value?: unknown } | null)?.value;
  if (!Array.isArray(entries)) {
    return null;
  }
  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const { id: entryId, order } = entry as { id?: unknown; order?: unknown };
    if (entryId === id && typeof order === "number" && Number.isFinite(order)) {
      return order;
    }
  }
  return null;
}
