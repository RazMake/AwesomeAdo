import { ADO_API_VERSION, AREA_PATH_FIELD, ASSIGNED_TO_FIELD } from "./adoApi";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";
import { formatWorkItemTags } from "./workItemTags";

/** The reference name of the field a new item's title is written to. */
const TITLE_FIELD = "System.Title";

/** The reference name of the multi-value field Azure DevOps stores tags in. */
const TAGS_FIELD = "System.Tags";

/** The reference name of the field that places a new item in an iteration. */
const ITERATION_PATH_FIELD = "System.IterationPath";

/** The reference name of the field holding an item's long-form description. */
const DESCRIPTION_FIELD = "System.Description";

/** The reference name of the pseudo-field a discussion comment is written through. */
const HISTORY_FIELD = "System.History";

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
  /** The item's long-form description, stored as Markdown. Absent or blank leaves it unwritten. */
  description?: string | null;
  /**
   * Who the item is assigned to, as a unique name or display name Azure DevOps can resolve.
   *
   * Applied in the creation revision like the tags: an item created unassigned and assigned second
   * spends a moment in everyone's "nobody owns this" queries, and stays there if the second write
   * fails.
   */
  assignedTo?: string | null;
  /**
   * A discussion comment recorded in the SAME revision, saying why the item was raised.
   *
   * In the creation patch rather than posted afterwards for the reason `batch-work-item-writes`
   * gives: a comment posted through the comments API is its own revision, so the reason and the item
   * it explains could otherwise land — or fail — apart.
   */
  comment?: string | null;
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
 * Tags, classification paths, the assignee, the description, the reason it was raised and the parent
 * link ride in the SAME document as the title rather than following as edits: the query or tree that
 * is about to show the item selects on exactly those values, so an item created first and completed
 * second exists for a moment as a row nothing returns — and permanently so if the second write
 * fails.
 */
export function buildCreateWorkItemPatch(
  item: NewWorkItem,
  parentUrl?: string | null,
): WorkItemCreateOperation[] {
  const operations: WorkItemCreateOperation[] = [
    { op: "add", path: `/fields/${TITLE_FIELD}`, value: item.title },
  ];
  const addField = (field: string, value: string | null | undefined): void => {
    if (value !== null && value !== undefined && value.trim().length > 0) {
      operations.push({ op: "add", path: `/fields/${field}`, value: value.trim() });
    }
  };
  // Author-written prose carries its storage format in the same patch: a field still on ADO's
  // default HTML stores Markdown source verbatim, so the reader would see literal asterisks — and an
  // `@`-mention in a comment would arrive HTML-encoded instead of reaching the person.
  const addMarkdownField = (field: string, value: string | null | undefined): void => {
    if (value === null || value === undefined || value.trim().length === 0) return;
    operations.push(
      { op: "add", path: `/fields/${field}`, value },
      { op: "add", path: `/multilineFieldsFormat/${field}`, value: "Markdown" },
    );
  };

  addField(TAGS_FIELD, formatWorkItemTags(item.tags));
  addField(AREA_PATH_FIELD, item.areaPath);
  addField(ITERATION_PATH_FIELD, item.iterationPath);
  addField(ASSIGNED_TO_FIELD, item.assignedTo);
  addMarkdownField(DESCRIPTION_FIELD, item.description);
  addMarkdownField(HISTORY_FIELD, item.comment);

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
