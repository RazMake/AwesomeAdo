import type { QueryFolderCrumb, WorkItemTreeResult } from "./IWorkItemTreeLoader";
import type { TrackedUser, TrackedWorkItem } from "./TrackedWorkItem";
import { ADO_API_VERSION } from "./adoApi";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";

const API_VERSION = ADO_API_VERSION;
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

/** The raw JSON bodies from the ADO REST calls, before parsing into the normalized tree. */
export interface AdoRawTree {
  /** The `_apis/wit/wiql/{id}` response body (carries queryType + workItemRelations/workItems). */
  wiql: unknown;
  /** The accumulated `_apis/wit/workitemsbatch` result items (array of { id, rev, fields }). */
  items: unknown;
  /**
   * The `_apis/wit/queries/{id}` response body (a `QueryHierarchyItem`), read only for its `path` so
   * the view can show where the query lives. `null` when the metadata call failed — the breadcrumb
   * simply hides rather than blocking the tree.
   */
  query?: unknown;
}

export interface AdoTreeUrls {
  wiqlUrl: string;
  batchUrl: string;
  /** The query-metadata endpoint, read for the query's folder `path` (see `parseQueryFolderPath`). */
  queryUrl: string;
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
    queryUrl: `${base}/${project}/_apis/wit/queries/${encodedQueryId}?api-version=${API_VERSION}`,
  };
}

// ADO's two built-in top-level query containers. A query's `path` always starts with one of these,
// but neither is a folder the user filed the query into, so the breadcrumb starts below them.
const WELL_KNOWN_QUERY_ROOTS: ReadonlySet<string> = new Set(["shared queries", "my queries"]);

// The header shows only the query's parent and its parent's parent — the two nearest folders — so a
// deep trail is trimmed to those, matching how a reader thinks about "where does this live".
const MAX_FOLDER_CRUMBS = 2;

/**
 * Extract the query's ancestor-folder trail (outermost → nearest) from the raw query-metadata body.
 *
 * ADO returns the query's location as a separated `path` whose LAST segment is the query name itself
 * and whose FIRST segment is the built-in root container ("Shared Queries"/"My Queries"). The
 * breadcrumb shows only the folders *between* those two — the query's real parent folders — so a
 * query saved directly under a root yields an empty trail rather than echoing the root or the query
 * name. Only the two nearest folders survive (parent + grandparent); a deeper chain is trimmed.
 * Best-effort: a missing/malformed body (the metadata call is allowed to fail) yields `[]`.
 *
 * Each surviving crumb carries its FULL path from the root (root container included) so a caller can
 * build the folder's ADO link: the display drops the root container, but a folder is *addressed* by
 * its whole ancestry, so the path is kept intact inside the crumb even though it is not shown.
 *
 * The separator is normalized across `/` and `\`: the REST samples use forward slashes, but real
 * responses (and the ADO UI itself) also surface backslash-separated paths, and treating the wrong
 * one as a single opaque segment would silently collapse the whole trail to empty.
 */
export function parseQueryFolderPath(rawQuery: unknown): QueryFolderCrumb[] {
  const path = (rawQuery as { path?: unknown } | null)?.path;
  if (typeof path !== "string" || path.length === 0) {
    return [];
  }
  const segments = path.split(/[/\\]/).filter((segment) => segment.length > 0);
  // Drop the leaf: the last segment is the query's own name, not a folder.
  segments.pop();
  // Anchor each folder to its full path from the root so its link resolves; the paths always use "/"
  // regardless of which separator the source `path` used, because that is the separator ADO's folder
  // deep link expects.
  const crumbs: QueryFolderCrumb[] = segments.map((label, index) => ({
    label,
    path: segments.slice(0, index + 1).join("/"),
  }));
  // Drop the built-in root container from the DISPLAY trail (it is not a folder the user chose) while
  // keeping it inside each surviving crumb's `path` so the link still resolves.
  if (crumbs.length > 0 && WELL_KNOWN_QUERY_ROOTS.has((crumbs[0]?.label ?? "").toLowerCase())) {
    crumbs.shift();
  }
  return crumbs.slice(-MAX_FOLDER_CRUMBS);
}

/**
 * Build the ADO web URL that opens a query folder's contents, or null when `href` is not a
 * project-scoped ADO location. ADO's query hub deep-links a folder through a `path` query parameter
 * (`_queries/folder/?path=…`) whose slashes stay literal, so the caller passes the folder's full
 * path (root container included) exactly as `parseQueryFolderPath` produced it.
 */
export function buildQueryFolderUrl(href: string, folderPath: string): string | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  const { base, project } = resolved;
  // Percent-encode each segment but keep the separators literal: ADO reads the whole `path` value as
  // a slash-delimited folder hierarchy, so an encoded slash (`%2F`) would collapse it to one name.
  const encodedPath = folderPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/${project}/_queries/folder/?path=${encodedPath}`;
}

/**
 * Build the ADO **web** URL that opens a work item by id, or null when `href` is not a
 * project-scoped ADO location.
 *
 * This is the human-facing deep link (`_workitems/edit/{id}`), not the REST endpoint: it is what a
 * view hands to an anchor so a reader can jump from a summarized child straight to the item in ADO.
 * The link is project-scoped because ADO's work item hub is reached through a project route, even
 * though the id alone identifies the item.
 */
export function buildWorkItemUrl(href: string, id: number): string | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  const { base, project } = resolved;
  return `${base}/${project}/_workitems/edit/${id}`;
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
  // The query's location is fetched alongside the tree in the same page-world pass, so it is
  // available even when the tree itself is empty or failed; surface it on every result path so the
  // header can show the breadcrumb regardless of the tree outcome.
  const folderPath = parseQueryFolderPath(raw.query);
  const loadFailure: WorkItemTreeResult = {
    isTreeQuery: false,
    roots: [],
    error: "Could not load this query from Azure DevOps.",
    folderPath,
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
    return { isTreeQuery: false, roots: [], error: null, folderPath };
  }

  const relations = typedWiql.workItemRelations;
  if (!Array.isArray(relations)) {
    return loadFailure;
  }

  const itemsById = indexItemsById(raw.items);
  const { childrenById, rootIds } = buildTreeAdjacency(relations);

  // Recursively build the tree from each root, guarding cycles and depth.
  const roots: TrackedWorkItem[] = [];
  for (const rootId of rootIds) {
    const node = buildNode(rootId, itemsById, childrenById, etaFieldByType, new Set(), 0);
    if (node !== null) {
      roots.push(node);
    }
  }

  return { isTreeQuery: true, roots, error: null, folderPath };
}

/**
 * Index the batch work items by id. Accepts both a bare array and a `{ value: [...] }` body shape
 * because the two ADO endpoints that feed this differ, and skips anything without a numeric id.
 */
function indexItemsById(rawItems: unknown): Map<number, unknown> {
  const itemsField = rawItems as { value?: unknown } | unknown[] | null;
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
  return itemsById;
}

/**
 * Split the WIQL relations into a parent→children adjacency list and the ordered root ids. A
 * relation with `source === null` marks its target as a root; otherwise `source.id → target.id` is a
 * parent-child link. Encounter order is preserved so siblings render in the query's own order.
 */
function buildTreeAdjacency(relations: unknown[]): {
  childrenById: Map<number, number[]>;
  rootIds: number[];
} {
  const childrenById = new Map<number, number[]>();
  const rootIds: number[] = [];
  for (const relation of relations) {
    if (typeof relation !== "object" || relation === null) {
      continue;
    }
    const { source, target } = relation as { source?: unknown; target?: unknown };
    const targetId = readRelationEndpointId(target);
    if (targetId === null) {
      continue;
    }
    if (source === null) {
      rootIds.push(targetId);
      continue;
    }
    const sourceId = readRelationEndpointId(source);
    if (sourceId !== null) {
      const children = childrenById.get(sourceId) ?? [];
      children.push(targetId);
      childrenById.set(sourceId, children);
    }
  }
  return { childrenById, rootIds };
}

/** Read a relation endpoint's numeric work-item id, or null when the endpoint is absent/malformed. */
function readRelationEndpointId(endpoint: unknown): number | null {
  const id = (endpoint as { id?: unknown } | null)?.id;
  return typeof id === "number" ? id : null;
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

  const node = hydrateTrackedWorkItem(id, item, etaFieldByType);

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
 * Hydrate a TrackedWorkItem's own fields from a batch item (children are attached by the caller). The
 * nested `field`/`readString` closures keep the many repeated `fields[...] ?? ""` reads out of this
 * function's own branching so it stays simple to follow.
 */
function hydrateTrackedWorkItem(
  id: number,
  item: object,
  etaFieldByType: ReadonlyMap<string, string>,
): TrackedWorkItem {
  const { rev, fields } = item as { rev?: unknown; fields?: unknown };
  const fieldsObj = typeof fields === "object" && fields !== null ? fields : {};
  const field = (key: string): unknown => (fieldsObj as Record<string, unknown>)[key];
  const readString = (key: string): string => String(field(key) ?? "");

  const type = readString("System.WorkItemType");
  const iterationPath = field("System.IterationPath");
  const iterationPathStr = typeof iterationPath === "string" ? iterationPath : null;

  // ETA comes from the type-specific field, if one is configured.
  const etaFieldRef = etaFieldByType.get(type);
  const etaValue = etaFieldRef ? field(etaFieldRef) : null;
  const eta = typeof etaValue === "string" && etaValue.length > 0 ? etaValue : null;

  return {
    id,
    rev: typeof rev === "number" ? rev : 0,
    type,
    title: readString("System.Title"),
    state: readString("System.State"),
    assignedTo: parseIdentity(field("System.AssignedTo")),
    iterationPath: iterationPathStr,
    sprintName: sprintLeaf(iterationPathStr),
    createdDate: readString("System.CreatedDate"),
    createdBy: parseIdentity(field("System.CreatedBy")),
    changedDate: readString("System.ChangedDate"),
    changedBy: parseIdentity(field("System.ChangedBy")),
    description: htmlToText(readString("System.Description")),
    eta,
    children: [],
  };
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

/** The HTML entities `htmlToText` decodes, mapped to the character each one stands for. */
const HTML_ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

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
  //
  // The decode is ONE pass over the string, not a chain of replaces: chained replaces let an earlier
  // substitution manufacture an entity a later one then decodes, so `&amp;lt;` — which encodes the
  // literal text `&lt;` — would wrongly come out as `<`.
  const decoded = html.replace(
    /&(?:amp|lt|gt|quot|#39|nbsp);/g,
    (entity) => HTML_ENTITIES[entity] ?? entity,
  );
  return decoded.replace(/<[^>]*>/g, "");
}
