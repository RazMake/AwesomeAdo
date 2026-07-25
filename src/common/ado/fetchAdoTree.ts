import type { WorkItemTreeResult } from "./IWorkItemTreeLoader";
import type { TrackedUser, TrackedWorkItem } from "./TrackedWorkItem";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";

const API_VERSION = "7.1";
// Cap tree depth to prevent runaway recursion if the ADO data contains cycles or deeply nested chains.
const MAX_TREE_DEPTH = 50;

/**
 * The Azure DevOps work-item fields the tree loader fetches. System.Parent is included to let the
 * tree parser verify each relation, but it is not exposed on TrackedWorkItem — the parent link is
 * implicit from tree placement.
 */
export const TRACKING_FIELDS: readonly string[] = [
  "System.Id",
  "System.WorkItemType",
  "System.Title",
  "System.State",
  "System.AssignedTo",
  "System.IterationPath",
  "System.CreatedDate",
  "System.CreatedBy",
  "System.ChangedDate",
  "System.ChangedBy",
  "System.Description",
  "System.Rev",
  "System.Parent",
];

/** The raw JSON bodies from the two ADO REST calls, before parsing into the normalized tree. */
export interface AdoRawTree {
  /** The `_apis/wit/wiql/{id}` response body (carries queryType + workItemRelations/workItems). */
  wiql: unknown;
  /** The accumulated `_apis/wit/workitemsbatch` result items (array of { id, rev, fields }). */
  items: unknown;
}

export interface AdoTreeUrls {
  wiqlUrl: string;
  batchUrl: string;
}

/**
 * Build the WIQL-by-id + workitemsbatch URLs for the ADO query named by href, or null when the
 * URL is not a project-scoped ADO location. api-version 7.1.
 */
export function buildAdoTreeUrls(href: string, queryId: string): AdoTreeUrls | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  const { base, project } = resolved;
  const encodedQueryId = encodeURIComponent(queryId);
  return {
    wiqlUrl: `${base}/${project}/_apis/wit/wiql/${encodedQueryId}?api-version=${API_VERSION}`,
    batchUrl: `${base}/${project}/_apis/wit/workitemsbatch?api-version=${API_VERSION}`,
  };
}

/**
 * Build the ADO REST URL for updating a work item by id, or null when the URL is not a supported
 * ADO location.
 *
 * The update URL is org-scoped (not project-scoped): work items exist in the collection and can be
 * updated without naming the project, so the URL is `{base}/_apis/wit/workitems/{id}?api-version=7.1`.
 * Reusing `resolveAdoProjectContext` extracts the collection base correctly for both dev.azure.com
 * and visualstudio.com hosts; the project segment returned is simply discarded because the item id
 * alone identifies what to update.
 */
export function buildWorkItemUpdateUrl(href: string, id: number): string | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  const { base } = resolved;
  return `${base}/_apis/wit/workitems/${id}?api-version=${API_VERSION}`;
}

/**
 * Parse the raw tree REST bodies into the normalized model.
 * - When the query is not a tree query (wiql.queryType !== "tree") → { isTreeQuery:false, roots:[], error:null }.
 * - When the raw is missing/malformed (no usable wiql body) → { isTreeQuery:false, roots:[], error:"Could not load this query from Azure DevOps." }.
 * - Otherwise build the tree from wiql.workItemRelations: a relation with source===null is a ROOT (its target id);
 *   a relation with source!==null links parent=source.id → child=target.id (preserve encounter order).
 *   Hydrate each node's fields from the batch items (map by id). Guard cycles (visited set) and cap depth.
 */
export function parseTrackedTree(
  raw: AdoRawTree,
  etaFieldByType: ReadonlyMap<string, string>,
): WorkItemTreeResult {
  const loadFailure: WorkItemTreeResult = {
    isTreeQuery: false,
    roots: [],
    error: "Could not load this query from Azure DevOps.",
  };

  // A missing/malformed WIQL body means the fetch itself failed (the in-page fetcher returns
  // `wiql: null` on error), so it is reported as a load error — distinct from a well-formed body
  // that simply is not a tree query. This ordering must precede the queryType check, otherwise a
  // null body reads as "not a tree query" and hides the failure.
  const wiql = raw.wiql;
  if (wiql === null || typeof wiql !== "object") {
    return loadFailure;
  }

  const typedWiql = wiql as { queryType?: unknown; workItemRelations?: unknown };

  // A well-formed body that is not a tree query is not an error: the view shows its "needs a tree
  // query" message rather than a failure.
  if (typedWiql.queryType !== "tree") {
    return { isTreeQuery: false, roots: [], error: null };
  }

  const relations = typedWiql.workItemRelations;
  if (!Array.isArray(relations)) {
    return loadFailure;
  }

  // Normalize batch items into a map by id. Accept both bare array and { value: [...] } body shapes.
  const itemsField = raw.items as { value?: unknown } | unknown[] | null;
  const itemsArray = Array.isArray(itemsField)
    ? itemsField
    : Array.isArray(itemsField?.value)
      ? itemsField.value
      : [];
  const itemsById = new Map<number, unknown>();
  for (const item of itemsArray) {
    if (typeof item === "object" && item !== null) {
      const id = (item as { id?: unknown }).id;
      if (typeof id === "number") {
        itemsById.set(id, item);
      }
    }
  }

  // Build parent→children adjacency list and identify roots from the relations array.
  const childrenById = new Map<number, number[]>();
  const rootIds: number[] = [];
  for (const relation of relations) {
    if (typeof relation !== "object" || relation === null) {
      continue;
    }
    const { source, target } = relation as { source?: unknown; target?: unknown };
    const targetObj = target as { id?: unknown } | null;
    const targetId = typeof targetObj?.id === "number" ? targetObj.id : null;
    if (targetId === null) {
      continue;
    }
    // source === null means the target is a root; otherwise source.id → target.id is a parent-child link.
    if (source === null) {
      rootIds.push(targetId);
    } else {
      const sourceObj = source as { id?: unknown } | null;
      const sourceId = typeof sourceObj?.id === "number" ? sourceObj.id : null;
      if (sourceId !== null) {
        const children = childrenById.get(sourceId) ?? [];
        children.push(targetId);
        childrenById.set(sourceId, children);
      }
    }
  }

  // Recursively build the tree from each root, guarding cycles and depth.
  const roots: TrackedWorkItem[] = [];
  for (const rootId of rootIds) {
    const node = buildNode(rootId, itemsById, childrenById, etaFieldByType, new Set(), 0);
    if (node !== null) {
      roots.push(node);
    }
  }

  return { isTreeQuery: true, roots, error: null };
}

/**
 * Build a TrackedWorkItem node recursively, hydrating from the batch item and descending into
 * children. Returns null if the id has no batch item (defensive: normally every relation id is
 * fetched) or if a cycle/depth limit is hit.
 */
function buildNode(
  id: number,
  itemsById: ReadonlyMap<number, unknown>,
  childrenById: ReadonlyMap<number, number[]>,
  etaFieldByType: ReadonlyMap<string, string>,
  visited: Set<number>,
  depth: number,
): TrackedWorkItem | null {
  // Guard cycles and depth.
  if (visited.has(id) || depth >= MAX_TREE_DEPTH) {
    return null;
  }
  visited.add(id);

  const item = itemsById.get(id);
  if (typeof item !== "object" || item === null) {
    return null;
  }
  const { rev, fields } = item as { rev?: unknown; fields?: unknown };
  const fieldsObj = typeof fields === "object" && fields !== null ? fields : {};
  const field = (key: string): unknown => (fieldsObj as Record<string, unknown>)[key];

  const type = String(field("System.WorkItemType") ?? "");
  const title = String(field("System.Title") ?? "");
  const state = String(field("System.State") ?? "");
  const assignedTo = parseIdentity(field("System.AssignedTo"));
  const iterationPath = field("System.IterationPath");
  const iterationPathStr = typeof iterationPath === "string" ? iterationPath : null;
  const sprintName = sprintLeaf(iterationPathStr);
  const createdDate = String(field("System.CreatedDate") ?? "");
  const createdBy = parseIdentity(field("System.CreatedBy"));
  const changedDate = String(field("System.ChangedDate") ?? "");
  const changedBy = parseIdentity(field("System.ChangedBy"));
  const description = htmlToText(String(field("System.Description") ?? ""));
  const revisionValue = typeof rev === "number" ? rev : 0;

  // ETA comes from the type-specific field, if one is configured.
  const etaFieldRef = etaFieldByType.get(type);
  const etaValue = etaFieldRef ? field(etaFieldRef) : null;
  const eta = typeof etaValue === "string" && etaValue.length > 0 ? etaValue : null;

  const node: TrackedWorkItem = {
    id,
    rev: revisionValue,
    type,
    title,
    state,
    assignedTo,
    iterationPath: iterationPathStr,
    sprintName,
    createdDate,
    createdBy,
    changedDate,
    changedBy,
    description,
    eta,
    children: [],
  };

  // Recursively build children, preserving encounter order.
  const childIds = childrenById.get(id) ?? [];
  for (const childId of childIds) {
    const child = buildNode(childId, itemsById, childrenById, etaFieldByType, visited, depth + 1);
    if (child !== null) {
      node.children.push(child);
    }
  }

  return node;
}

/**
 * Parse an ADO identity field into a TrackedUser, or null when absent/malformed. ADO returns
 * identity fields as an object { displayName, uniqueName, imageUrl } (imageUrl may be under
 * `imageUrl`); accepts a plain string displayName too. uniqueName/imageUrl → null when missing.
 */
function parseIdentity(value: unknown): TrackedUser | null {
  if (typeof value === "string" && value.length > 0) {
    return { displayName: value, uniqueName: null, imageUrl: null };
  }
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const displayName = obj.displayName;
  if (typeof displayName !== "string" || displayName.length === 0) {
    return null;
  }
  const uniqueName = typeof obj.uniqueName === "string" ? obj.uniqueName : null;
  const imageUrl = typeof obj.imageUrl === "string" ? obj.imageUrl : null;
  return { displayName, uniqueName, imageUrl };
}

/**
 * Extract the sprint name from an iteration path. ADO iteration paths use backslash separators;
 * returns the last segment, or null when empty/absent.
 */
function sprintLeaf(iterationPath: string | null): string | null {
  if (iterationPath === null || iterationPath.length === 0) {
    return null;
  }
  const segments = iterationPath.split("\\");
  const leaf = segments[segments.length - 1];
  return leaf && leaf.length > 0 ? leaf : null;
}

/**
 * Strip HTML tags and decode a few common entities (&amp;&lt;&gt;&quot;&#39;&nbsp;) to plain text.
 * Returns "" when empty. Pure string ops — does NOT use DOM/DOMParser; this module must stay DOM-free.
 */
function htmlToText(html: string): string {
  if (html.length === 0) {
    return "";
  }
  // Decode entities BEFORE stripping tags: ADO can hand back descriptions whose markup is itself
  // entity-encoded (e.g. `&lt;p&gt;`), so decoding first turns those back into real tags that the
  // strip pass then removes — otherwise the encoded tags would survive as visible text. A literal
  // tag is unaffected by the decode pass and still gets stripped.
  const decoded = html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  return decoded.replace(/<[^>]*>/g, "");
}
