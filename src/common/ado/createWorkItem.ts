import { ADO_API_VERSION, AREA_PATH_FIELD } from "./adoApi";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";
import { formatWorkItemTags } from "./workItemTags";

/** The reference name of the field a new item's title is written to. */
const TITLE_FIELD = "System.Title";

/** The reference name of the multi-value field Azure DevOps stores tags in. */
const TAGS_FIELD = "System.Tags";

/** The reference name of the field that places a new item in an iteration. */
const ITERATION_PATH_FIELD = "System.IterationPath";

/** The link type Azure DevOps stores "my parent is" under. */
const PARENT_LINK = "System.LinkTypes.Hierarchy-Reverse";

/** One JSON Patch operation as the create endpoint takes it. */
export interface WorkItemCreateOperation {
  op: "add";
  path: string;
  value: string | { rel: string; url: string };
}

/** What a new work item is born with. */
export interface NewWorkItem {
  /** The work item type name (e.g. "Epic"), exactly as the process spells it. */
  type: string;
  title: string;
  /** Tags applied in the SAME creation revision, so the item is never briefly untagged. */
  tags: readonly string[];
  /** The full area path, or null to leave the project's default. */
  areaPath: string | null;
  /** The full iteration path, or null to leave the project's default. */
  iterationPath: string | null;
  /**
   * The work item the new one is born under, or null to create it unparented.
   *
   * A link rather than a field, and applied in the creation revision like the tags: an item created
   * first and parented second exists for a moment as an orphan no tree contains — and permanently so
   * if the second write fails.
   */
  parentId?: number | null;
}

/**
 * Build the REST URL that creates a work item of `type`, or null when `href` is not a
 * project-scoped ADO location.
 *
 * Project-scoped because a work item is born INTO a project — unlike an update, which the id alone
 * addresses. The `$` prefix is Azure DevOps' own marker for "create an item of this type"; it is
 * encoded together with the type name so a type containing a space or a slash still resolves.
 */
export function buildCreateWorkItemUrl(href: string, type: string): string | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null || type.trim().length === 0) {
    return null;
  }
  const { base, project } = resolved;
  const segment = encodeURIComponent(`$${type.trim()}`);
  return `${base}/${project}/_apis/wit/workitems/${segment}?api-version=${ADO_API_VERSION}`;
}

/**
 * The REST URL a hierarchy link points a new item's parent at, or null when `href` names no
 * organization.
 *
 * Organization-scoped rather than project-scoped because that is the address ADO itself stores in a
 * relation, and a link written with a project segment is rewritten on read anyway.
 */
export function buildParentLinkUrl(href: string, parentId: number): string | null {
  const resolved = resolveAdoProjectContext(href);
  return resolved === null ? null : `${resolved.base}/_apis/wit/workItems/${parentId}`;
}

/**
 * The JSON Patch that creates the item with everything it needs to be found again.
 *
 * Tags, classification paths and the parent link ride in the SAME document as the title rather than
 * following as edits: the query or tree that is about to show the item selects on exactly those
 * values, so an item created first and completed second exists for a moment as a row nothing
 * returns — and permanently so if the second write fails.
 */
export function buildCreateWorkItemPatch(
  item: NewWorkItem,
  parentUrl?: string | null,
): WorkItemCreateOperation[] {
  const operations: WorkItemCreateOperation[] = [
    { op: "add", path: `/fields/${TITLE_FIELD}`, value: item.title },
  ];
  const tags = formatWorkItemTags(item.tags);
  if (tags.length > 0) {
    operations.push({ op: "add", path: `/fields/${TAGS_FIELD}`, value: tags });
  }
  const areaPath = item.areaPath?.trim() ?? "";
  if (areaPath.length > 0) {
    operations.push({ op: "add", path: `/fields/${AREA_PATH_FIELD}`, value: areaPath });
  }
  const iterationPath = item.iterationPath?.trim() ?? "";
  if (iterationPath.length > 0) {
    operations.push({
      op: "add",
      path: `/fields/${ITERATION_PATH_FIELD}`,
      value: iterationPath,
    });
  }
  if (parentUrl) {
    operations.push({
      op: "add",
      path: "/relations/-",
      value: { rel: PARENT_LINK, url: parentUrl },
    });
  }
  return operations;
}

/**
 * The id, revision and fields Azure DevOps assigned, or null when the body carries no usable item.
 *
 * The fields are read back out of the CREATE response rather than fetched afterwards: the process
 * fills in defaults the caller never sent — the starting state, the priority, the classification
 * paths — and they are already in the answer, so a second read would only be a slower way to learn
 * what is in hand.
 */
export function parseCreatedWorkItem(
  raw: unknown,
): { id: number; rev: number; fields: Record<string, unknown> } | null {
  const body = raw as { id?: unknown; rev?: unknown; fields?: unknown } | null;
  const id = body?.id;
  if (typeof id !== "number" || !Number.isFinite(id)) {
    return null;
  }
  const rev = body?.rev;
  const fields = body?.fields;
  return {
    id,
    rev: typeof rev === "number" && Number.isFinite(rev) ? rev : 1,
    fields:
      typeof fields === "object" && fields !== null ? (fields as Record<string, unknown>) : {},
  };
}
