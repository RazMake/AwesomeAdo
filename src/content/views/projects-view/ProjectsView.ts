import { collectAssignedDirectoryUsers } from "../../../common/ado/FeatureCrew";
import type { WorkItemTreeResult } from "../../../common/ado/IWorkItemTreeLoader";
import { parseQueryTagFilter } from "../../../common/ado/QueryDefinition";
import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { buildQueryFolderUrl, buildWorkItemUrl } from "../../../common/ado/fetchAdoTree";
import { DEFAULT_QUERY_FOLDER, type ProjectQueryLink } from "../../../common/ado/projectQuery";
import {
  flattenWorkItems,
  orderTrackedItems,
  workItemTypeColor,
} from "../../../common/ado/workItemTypes";
import { parseAdoContext } from "../../../common/navigation/AdoContext";
import { MANUAL_ORDERING_POLICY, type OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import type {
  DataDrivenViewContext,
  EnhancedView,
  EnhancedViewContext,
} from "../../../common/view-common/EnhancedView";
import type { BreadcrumbSegment } from "../../../common/view-common/control/Breadcrumbs/Breadcrumbs";
import {
  DragReorderController,
  type PlannedMove,
} from "../../../common/view-common/control/DragReorder/DragReorderController";
import { renderEmptyState } from "../../../common/view-common/control/EmptyState/EmptyState";
import {
  createItemContextMenu,
  type ItemContextMenu,
  type ItemContextMenuTarget,
} from "../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import { renderNewItemRow } from "../../../common/view-common/control/NewItemRow/NewItemRow";
import {
  createRowEmphasisStyle,
  modifierHighlightTracker,
  restripeVisibleRows,
  type RowEmphasisClasses,
} from "../../../common/view-common/control/RowEmphasis/RowEmphasis";
import { renderViewScaffold } from "../../../common/view-common/control/ViewScaffold/ViewScaffold";
import {
  renderWriteQueueStatus,
  type WriteQueueStatusHandle,
} from "../../../common/view-common/control/WriteQueueStatus/WriteQueueStatus";
import { childTypeOf, newChildSummary } from "../project-tracking/item-commands/NewChildCommands";
import { panelFor } from "../project-tracking/item-commands/itemCommandCore";

import { renderNewProjectRow } from "./NewProjectRow";
import { renderNewWorkItemPanel, type NewWorkItemValues } from "./NewWorkItemPanel";
import { buildProjectCommands } from "./ProjectCommands";
import { renderProjectRow, type ProjectRowContext } from "./ProjectRow";
import { renderProjectsHeader, type ProjectsHeaderHandle } from "./ProjectsHeader";
import { buildProjectsTitleCommands } from "./ProjectsTitleMenu";
import {
  idsKeptByTagCondition,
  isEmptyTagCondition,
  queryWideTagNames,
  queryWideTags,
  tagsInUse,
  type TagCondition,
} from "./projectTags";
import {
  configuredNewProjectAreaPath,
  configuredNewProjectTags,
  orderingPolicyOf,
  projectQueryFolderOf,
  projectsViewType,
} from "./projectsViewType";

/** What the reader has done to the board, kept outside the DOM so a repaint cannot lose it. */
interface ProjectsSession {
  /** Rows the reader opened. Everything starts closed: the view opens as a list of projects. */
  expandedIds: Set<number>;
  /**
   * The tag condition in force, keyed in lower case so it survives a tag's inconsistent casing in
   * Azure DevOps. Replaced wholesale on every change rather than mutated, so a paint can never read
   * a half-applied condition.
   */
  tags: TagCondition;
  /**
   * The ordering in force. Board-local by design (ADR-039): the binding's policy is what every board
   * opens on, and a pick here lasts only for this one.
   */
  policy: OrderingPolicy;
  /** Whether the "add a project" row is open above the list. */
  addingProject: boolean;
  /** The project the "add a milestone" box is open under, or null when none is. */
  addingChildOf: number | null;
  /**
   * The write queue's state, retained across repaints.
   *
   * The header is rebuilt on every paint, and the indicator inside it with it — without somewhere
   * outside the DOM to keep this, a repaint mid-save would drop the "Saving…" chip and, far worse,
   * the report that an edit was rejected.
   */
  write: { pending: number; failed: number; lastError?: string };
}

/** One load's answer, plus the catalog values the rows are painted with. */
interface LoadedProjects {
  result: WorkItemTreeResult;
  types: Map<string, TypeCatalogEntry>;
  /** Every tag worn anywhere in the tree, offered by the header's tag filter. */
  tags: string[];
  /** Lower-cased query membership tags, excluded from the tag filter's vocabulary. */
  hiddenTags: ReadonlySet<string>;
  /** The tags a project must be created with to belong to this catalog, as they are spelled. */
  newProjectTags: string[];
  /** Which items already own a tracking query, so the command that creates one can say so. */
  queryLinks: Map<number, ProjectQueryLink>;
  /**
   * Whether `queryLinks` is the answer Azure DevOps gave, rather than what a failed read left behind.
   * An empty map means "no item owns a query" only when this is true.
   */
  queryLinksKnown: boolean;
}

/** The catalog's own DOM, named for the shared stripe/hover/emphasis treatment. */
const ROW_EMPHASIS_CLASSES: RowEmphasisClasses = {
  wrapper: "awesomeado-projects__item",
  surface: "awesomeado-projects__row",
  children: "awesomeado-projects__children",
};

/** How wide the "Add work item" form opens: enough for a full area path to read without wrapping. */
const NEW_WORK_ITEM_WIDTH_PX = 460;

/** The view's own shell: a full-height, left-aligned surface ADO's stylesheet cannot restyle. */
function createRoot(doc: Document): HTMLElement {
  const root = doc.createElement("section");
  root.className = "awesomeado-view awesomeado-projects";
  root.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "min-height:100%",
    "box-sizing:border-box",
    "padding:2px 16px 16px",
    "font-family:inherit",
    "color:var(--text-primary-color)",
    "text-align:left",
  ].join(";");
  return root;
}

/** The query's parent-folder trail, with a link on every folder ADO can address. */
function queryFolderTrail(result: WorkItemTreeResult, href: string): BreadcrumbSegment[] {
  const trail: BreadcrumbSegment[] = [];
  for (const folder of result.folderPath ?? []) {
    const url = buildQueryFolderUrl(href, folder.path);
    trail.push(url === null ? { label: folder.label } : { label: folder.label, url });
  }
  return trail;
}

/**
 * The catalog query's own folder, used when the binding does not override the generated-query folder.
 * A catalog sitting directly under a root container leaves no crumb, so the shared root is the only
 * remaining default.
 */
function queryFolderPathOf(result: WorkItemTreeResult): string {
  const crumbs = result.folderPath ?? [];
  return crumbs[crumbs.length - 1]?.path ?? DEFAULT_QUERY_FOLDER;
}

/** The project root is Azure DevOps' default iteration path for a newly created work item. */
function projectPathOf(context: EnhancedViewContext): string | null {
  return parseAdoContext(context.doc.location?.href ?? "")?.project ?? null;
}

/**
 * The tags a project created here is born with: the binding's tag, the query's WIQL tag filter, or
 * the tags every returned project carries.
 *
 * The derived fallback is what makes "Add new project" work with no configuration at all — a catalog
 * query selects its projects by a tag, and stamping the new project with exactly that tag is what
 * makes the query return it. Reading WIQL keeps that derivation valid even when only one project is
 * returned; the result-wide fallback preserves older and unusual query shapes.
 */
function newProjectTagsFor(
  context: EnhancedViewContext,
  roots: readonly TrackedWorkItem[],
  wiql: string | null,
): string[] {
  const configured = configuredNewProjectTags(context.properties);
  if (configured.length > 0) return configured;
  const fromQuery = parseQueryTagFilter(wiql);
  return fromQuery === null ? queryWideTagNames(roots) : [fromQuery];
}

/** Read the tree plus the catalog values the board paints with, in one pass. */
async function loadProjects(context: DataDrivenViewContext): Promise<LoadedProjects> {
  const [result, definition] = await Promise.all([
    context.services.loadTree(context.queryId),
    context.services.loadQueryDefinition?.(context.queryId) ??
      Promise.resolve({ wiql: null, error: null }),
  ]);
  if (result.error !== null) {
    throw new Error(result.error);
  }
  const configuredTag = configuredNewProjectTags(context.properties)[0] ?? null;
  const queryTag = configuredTag ?? parseQueryTagFilter(definition.wiql);
  const hiddenTags =
    queryTag === null ? queryWideTags(result.roots) : new Set([queryTag.toLowerCase()]);
  const items = flattenWorkItems(result.roots);
  const queries = await loadQueryLinks(context, items);
  return {
    result,
    types: new Map(context.services.getTypes().map((entry) => [entry.name, entry])),
    tags: tagsInUse(items, hiddenTags),
    hiddenTags,
    newProjectTags: newProjectTagsFor(context, result.roots, definition.wiql),
    queryLinks: queries.links,
    queryLinksKnown: queries.known,
  };
}

/**
 * Which items already own a tracking query, and whether that answer came from Azure DevOps.
 *
 * Asked about the WHOLE tree, not just the projects: any item here may be given its own tracking
 * query, so a read that only covered the top level would leave every row below it claiming to have
 * none — and offering to create a second one for an item that already has it.
 *
 * A failure here never fails the load: this catalog's whole reason to exist is showing the projects,
 * and losing that because a secondary read was refused would be a far worse answer than a board
 * whose query-aware commands say they could not check. The cause is recorded, and the commands are
 * told the difference so none of them treats "unknown" as "none".
 */
async function loadQueryLinks(
  context: DataDrivenViewContext,
  items: readonly TrackedWorkItem[],
): Promise<{ links: Map<number, ProjectQueryLink>; known: boolean }> {
  const { links, error } = await context.services.projectQueries.readLinks(
    items.map((item) => item.id),
  );
  if (error !== null) {
    context.services.logger.error(
      `All Projects Catalog View could not read which items have a tracking query: ${error}`,
    );
  }
  return { links: new Map(links.map((link) => [link.workItemId, link])), known: error === null };
}

/** Replace the surface with the shared placeholder shell (loading, failure, unavailable services). */
function showMessage(context: EnhancedViewContext, root: HTMLElement, message: string): void {
  root.replaceChildren(
    renderViewScaffold(context.doc, {
      title: projectsViewType.label,
      message,
      extensionVersion: context.extensionVersion,
    }),
  );
}

/** Every id in the tree, so expand-all opens branches the reader has never rendered. */
function allItemIds(roots: readonly TrackedWorkItem[]): number[] {
  return flattenWorkItems(roots).map((item) => item.id);
}

/** The projects (the query's top-level items) the tag filter keeps, in the binding's order. */
function visibleProjects(data: LoadedProjects, rowContext: ProjectRowContext): TrackedWorkItem[] {
  const kept = rowContext.keptIds;
  const roots =
    kept === null ? data.result.roots : data.result.roots.filter((root) => kept.has(root.id));
  return orderTrackedItems(roots, (root) => root, rowContext.policy);
}

/** The ids the current tag condition keeps, or `null` when it narrows nothing and all are kept. */
function keptIdsFor(data: LoadedProjects, session: ProjectsSession): ReadonlySet<number> | null {
  return idsKeptByTagCondition(data.result.roots, session.tags);
}

/** How many of the query's projects survive the current tag condition. */
function visibleProjectCount(data: LoadedProjects, session: ProjectsSession): number {
  const kept = keptIdsFor(data, session);
  return kept === null
    ? data.result.roots.length
    : data.result.roots.filter((root) => kept.has(root.id)).length;
}

/**
 * Drop condition tags the tree no longer wears, and say so.
 *
 * The vocabulary moves under the reader: a refresh can return items that were re-tagged in Azure
 * DevOps, and a right-click command here can clear the last copy of a tag outright. Keeping the
 * stale condition would narrow the board by a tag the filter itself — which only ever offers tags
 * that exist — showed nothing selected for, so the reader would be looking at a short list with no
 * visible cause.
 */
function pruneTagCondition(
  context: DataDrivenViewContext,
  session: ProjectsSession,
  available: readonly string[],
): void {
  const offered = new Set(available.map((tag) => tag.toLowerCase()));
  const stale = (tags: ReadonlySet<string>): string[] =>
    [...tags].filter((tag) => !offered.has(tag));
  const dropped = [...stale(session.tags.required), ...stale(session.tags.excluded)];
  if (dropped.length === 0) return;
  session.tags = {
    required: new Set([...session.tags.required].filter((tag) => offered.has(tag))),
    excluded: new Set([...session.tags.excluded].filter((tag) => offered.has(tag))),
    matchAll: session.tags.matchAll,
  };
  context.services.logger.info(
    `All Projects Catalog View dropped tag filter(s) no longer present in the query: ${dropped.join(", ")}`,
  );
}

/** Build the scrolling list of projects, or the panel that explains why there is nothing to list. */
function renderProjectsList(
  context: DataDrivenViewContext,
  data: LoadedProjects,
  rowContext: ProjectRowContext,
): HTMLElement {
  const { doc } = context;
  if (data.result.roots.length === 0) {
    return renderEmptyState(doc, {
      message: "This query returned no work items.",
      hint: "Adjust the query in Azure DevOps, then refresh this board.",
    });
  }

  const list = doc.createElement("div");
  list.className = "awesomeado-projects__list";
  // No gap between rows: the alternating stripes are what separates one item from the next, and a
  // gap would let the page show through the zebra as a seam on every row.
  list.style.cssText = "display:flex;flex-direction:column";
  for (const project of visibleProjects(data, rowContext)) {
    list.append(renderProjectRow(project, rowContext, 0));
  }
  return list;
}

/** The live board, so a row or a command can reach the surfaces it has to change. */
interface Board {
  context: DataDrivenViewContext;
  session: ProjectsSession;
  queue: WorkItemWriteQueue;
  contextMenu: ItemContextMenu;
  dragReorder: DragReorderController;
  /** Rebuild the surface from the data already loaded. */
  paint(): void;
  /**
   * Rebuild ONLY the list of projects from the data already loaded.
   *
   * The header is what a live filter is being operated from, and a full repaint would rebuild it —
   * taking the open dropdown, and the condition half-stated inside it, with it.
   */
  paintList(): void;
  /** Re-read the query, for a change only Azure DevOps can describe (a new or retired project). */
  reload(): void;
}

/** The row context for one paint: the session's live sets plus what the tag filter currently keeps. */
function createRowContext(board: Board, data: LoadedProjects): ProjectRowContext {
  const { context, session } = board;
  return {
    doc: context.doc,
    services: context.services,
    queue: board.queue,
    types: data.types,
    policy: session.policy,
    expandedIds: session.expandedIds,
    keptIds: keptIdsFor(data, session),
    // Only the manual backlog rank can be rearranged by hand; every other policy is derived from the
    // items themselves, so a move made under one of them would be undone by the very next sort.
    dragReorder: session.policy === MANUAL_ORDERING_POLICY ? board.dragReorder : null,
    // The FULL top level, tag-filtered rows included: ranking against only what is on screen would
    // place a project relative to whatever the filter happened to leave visible, so clearing it
    // afterwards would reveal the project somewhere nobody dropped it.
    projectSiblingIds: orderTrackedItems(data.result.roots, (root) => root, session.policy).map(
      (root) => root.id,
    ),
    queryUrlOf: (item) => data.queryLinks.get(item.id)?.url ?? null,
    // Walked fresh on each open rather than cached: someone assigned a moment ago is then already
    // offered, with no second copy of "who works here" to drift from the tree.
    assigneeSuggestions: () => collectAssignedDirectoryUsers(data.result.roots),
    newChildRow: (item) =>
      session.addingChildOf === item.id ? newChildRowFor(board, data, item) : null,
    onContextMenu: (item, event) =>
      board.contextMenu.openAt(event, projectMenuTarget(board, data, item)),
    repaint: () => board.paint(),
  };
}

/** What the right-click menu acts on for one row of the catalog. */
function projectMenuTarget(
  board: Board,
  data: LoadedProjects,
  item: TrackedWorkItem,
): ItemContextMenuTarget {
  const { context } = board;
  return {
    id: item.id,
    url: buildWorkItemUrl(context.doc.location?.href ?? "", item.id),
    commands: buildProjectCommands({
      doc: context.doc,
      item,
      services: context.services,
      queue: board.queue,
      onChanged: () => board.paint(),
      types: data.types,
      knownTags: data.tags,
      queryTags: data.hiddenTags,
      queryLink: data.queryLinks.get(item.id) ?? null,
      queryLinkKnown: data.queryLinksKnown,
      queryFolderPath: projectQueryFolderOf(context.properties, queryFolderPathOf(data.result)),
      isProject: data.result.roots.includes(item),
      addingChild: board.session.addingChildOf === item.id,
      newWorkItemPanel: (typeName, close) =>
        newWorkItemPanelFor(board, data, item, typeName, close),
      onAddChild: () => {
        board.session.addingChildOf = item.id;
        // A closed project would hide the very box that was just asked for, and the reader has no
        // way to connect the missing box to the twisty they left shut.
        board.session.expandedIds.add(item.id);
        board.paint();
      },
      onReload: () => board.reload(),
    }),
  };
}

/** The catalog-wide menu opened from the view's title. */
function titleMenuTarget(board: Board): ItemContextMenuTarget {
  const { context, session } = board;
  return {
    id: 0,
    url: context.doc.location?.href ?? null,
    standardCommands: ["copy-url"],
    commands: buildProjectsTitleCommands({
      projectType: context.services.getTypes()[0]?.name ?? null,
      adding: session.addingProject,
      onAddProject: () => {
        session.addingProject = true;
        board.paint();
      },
    }),
  };
}

/** Create the project the reader typed a title for, then re-read the catalog so it appears. */
async function addProject(
  board: Board,
  data: LoadedProjects,
  title: string,
  iterationPath: string | null,
): Promise<boolean> {
  const { context } = board;
  const type = context.services.getTypes()[0]?.name ?? null;
  if (type === null) return false;
  const areaPath = configuredNewProjectAreaPath(context.properties);
  const result = await context.services.createWorkItem.create({
    type,
    title,
    tags: data.newProjectTags,
    areaPath,
    iterationPath,
  });
  if (!result.ok) return false;
  context.services.logger.info(
    `All Projects Catalog View added ${type} ${result.id ?? "?"} with tags ` +
      `[${data.newProjectTags.join(", ")}] under area "${areaPath ?? "(project default)"}" ` +
      `in iteration "${iterationPath ?? "(project default)"}".`,
  );
  board.session.addingProject = false;
  // Re-read rather than splice the new project in: only the query decides what belongs to this
  // catalog, so showing an item it has not been asked about would be a guess.
  board.reload();
  return true;
}

/**
 * Create the milestone the reader typed a title for under its project, then re-read the catalog.
 *
 * The same creation Project Tracking makes from its own title, so a milestone means one thing on
 * both surfaces: the project type's first configured child type, inheriting the project's area and
 * iteration until someone deliberately moves it. Re-read for the same reason a new project is: this
 * catalog shows the tree the query returned, and its answer is the only honest account of where the
 * new item sits in it.
 */
async function addChild(
  board: Board,
  parent: TrackedWorkItem,
  type: string,
  title: string,
): Promise<boolean> {
  const { context } = board;
  const result = await context.services.createWorkItem.create({
    type,
    title,
    tags: [],
    areaPath: parent.areaPath,
    iterationPath: parent.iterationPath,
    parentId: parent.id,
  });
  if (!result.ok) return false;
  context.services.logger.info(
    `All Projects Catalog View added ${type} ${result.id ?? "?"} under project ${parent.id}.`,
  );
  board.session.addingChildOf = null;
  board.reload();
  return true;
}

/** Every area path the catalog's work sits in, offered when new work is raised under a row. */
function areaPathsInUse(roots: readonly TrackedWorkItem[]): string[] {
  const paths = flattenWorkItems(roots)
    .map((item) => item.areaPath)
    .filter((path): path is string => path !== null && path.trim().length > 0);
  return [...new Set(paths)].sort((left, right) => left.localeCompare(right));
}

/** The "Add work item" form for one row, wired to this catalog's data and its creation. */
function newWorkItemPanelFor(
  board: Board,
  data: LoadedProjects,
  parent: TrackedWorkItem,
  typeName: string,
  close: () => void,
): HTMLElement {
  const { context } = board;
  return panelFor(
    context.doc,
    parent,
    { withTitle: true, titlePrefix: "Parent", widthPx: NEW_WORK_ITEM_WIDTH_PX },
    [
      renderNewWorkItemPanel({
        doc: context.doc,
        parent,
        typeName,
        services: context.services,
        areaPaths: areaPathsInUse(data.result.roots),
        assigneeSuggestions: () => collectAssignedDirectoryUsers(data.result.roots),
        onCreate: (values) => addWorkItem(board, parent, typeName, values),
        onCancel: close,
      }),
    ],
  );
}

/**
 * Create the work the reader described under its planning item, then re-read the catalog.
 *
 * Re-read rather than spliced in for the same reason every other creation here is: the query decides
 * what this catalog shows, and its answer is the only honest account of where the new item landed.
 */
async function addWorkItem(
  board: Board,
  parent: TrackedWorkItem,
  type: string,
  values: NewWorkItemValues,
): Promise<boolean> {
  const { context } = board;
  const result = await context.services.createWorkItem.create({
    type,
    title: values.title,
    tags: values.tags,
    areaPath: values.areaPath,
    iterationPath: values.iterationPath,
    assignedTo: values.assignedTo,
    description: values.description,
    comment: values.comment,
    parentId: parent.id,
  });
  if (!result.ok) return false;
  // The title, the description and the acceptance reason are deliberately absent: the diagnostics
  // log is exported with bug reports, and all three routinely name a customer (AGENTS.md §9).
  context.services.logger.info(
    `All Projects Catalog View added ${type} ${result.id ?? "?"} under ${parent.id} ` +
      `in area "${values.areaPath ?? "(default)"}", iteration "${values.iterationPath ?? "(default)"}", ` +
      `with ${values.tags.length} tag(s), ${values.assignedTo === null ? "unassigned" : "assigned"}` +
      `${values.comment === null ? "" : ", accepted with a stated reason"}.`,
  );
  board.reload();
  return true;
}

/**
 * Persist a dropped project's new backlog position and repaint once Azure DevOps has accepted it.
 *
 * Persist-then-reflect, like every other write here: nothing moves on screen until the rank landed,
 * so a rejected drop leaves the project visibly where it started rather than where nobody saved it.
 */
function persistProjectMove(board: Board, data: LoadedProjects, move: PlannedMove): void {
  const { context } = board;
  const moved = data.result.roots.find((root) => root.id === move.id);
  const team = context.services.currentTeam();
  if (moved === undefined || team === null) {
    context.services.logger.error(
      `Project reorder aborted: ${
        moved === undefined
          ? `project ${move.id} is no longer in the catalog`
          : "no team is configured, and backlog rank is per team in Azure DevOps"
      }.`,
    );
    return;
  }
  void board.queue
    .enqueueReorder({
      id: move.id,
      currentRev: () => moved.rev,
      // Projects are the query's top-level results, so ADO's own sentinel for "no parent" is the
      // only honest answer: a drop here re-ranks the backlog, it never re-parents anything.
      parentId: 0,
      currentParentId: 0,
      previousId: move.previousId,
      nextId: move.nextId,
      siblingIds: move.siblingIds,
      team,
    })
    .then((result) => {
      if (result.rev !== undefined) moved.rev = result.rev;
      if (!result.ok) return;
      applyRanks(data.result.roots, moved, result.order, result.ranks);
      board.paint();
    });
}

/**
 * Copy the ranks Azure DevOps reported back onto the catalog.
 *
 * Every reported rank is applied, not just the moved project's: placing one item can renumber its
 * whole level, and keeping the old numbers would scramble the list on the very next sort.
 */
function applyRanks(
  roots: readonly TrackedWorkItem[],
  moved: TrackedWorkItem,
  order: number | undefined,
  ranks: readonly { id: number; rank: number; rev?: number }[] | undefined,
): void {
  if (order !== undefined) {
    moved.importance = order;
  }
  for (const rank of ranks ?? []) {
    const target = roots.find((root) => root.id === rank.id);
    if (target === undefined) continue;
    target.importance = rank.rank;
    if (rank.rev !== undefined) target.rev = rank.rev;
  }
}

/** The write-queue indicator, rebuilt each paint from the state the session retained. */
function createQueueStatus(board: Board): WriteQueueStatusHandle {
  const status = renderWriteQueueStatus(board.context.doc, {
    onOpenLog: board.context.services.openDiagnosticsLog,
  });
  status.setCount(board.session.write.pending);
  status.setFailedCount(board.session.write.failed, board.session.write.lastError);
  return status;
}

/** The condition in one log-readable phrase, so a diagnostics reader can reconstruct the board. */
function describeTagCondition(condition: TagCondition): string {
  if (isEmptyTagCondition(condition)) return "none";
  const parts: string[] = [];
  if (condition.required.size > 0) {
    parts.push(
      `${condition.matchAll ? "all of" : "any of"} [${[...condition.required].join(", ")}]`,
    );
  }
  if (condition.excluded.size > 0) {
    parts.push(`none of [${[...condition.excluded].join(", ")}]`);
  }
  return parts.join(" and ");
}

/** Everything the header's controls do, gathered so one paint hands them over in one object. */
function headerOptionsFor(params: {
  board: Board;
  loaded: LoadedProjects;
  queueStatus: HTMLElement;
  onRefresh: () => void;
}): Parameters<typeof renderProjectsHeader>[1] {
  const { board, loaded } = params;
  const { context, session } = board;
  return {
    breadcrumbs: queryFolderTrail(loaded.result, context.doc.location?.href ?? ""),
    tags: loaded.tags,
    tagCondition: session.tags,
    policy: session.policy,
    queueStatus: params.queueStatus,
    onOrderingChange: (policy) => {
      session.policy = policy;
      board.paint();
    },
    onTagsChange: (selection) => {
      session.tags = {
        required: new Set(selection.included.map((tag) => tag.toLowerCase())),
        excluded: new Set(selection.excluded.map((tag) => tag.toLowerCase())),
        matchAll: selection.matchAll,
      };
      // The LIST only: the reader is watching what each tick leaves behind, and a full repaint would
      // rebuild the header and close the dropdown they are still composing in.
      //
      // Logged on the change itself, never on a repaint: it is the one input that silently decides
      // how much of the query the reader is looking at, and it cannot flood the bounded log because
      // it fires only when the condition actually moves.
      context.services.logger.info(
        `All Projects Catalog View tag filter set to ${describeTagCondition(session.tags)}: ` +
          `showing ${visibleProjectCount(loaded, session)} of ${loaded.result.roots.length} project(s)`,
      );
      board.paintList();
    },
    onExpandAll: () => {
      for (const id of allItemIds(loaded.result.roots)) session.expandedIds.add(id);
      board.paint();
    },
    onCollapseAll: () => {
      session.expandedIds.clear();
      board.paint();
    },
    onRefresh: params.onRefresh,
    onTitleContextMenu: (event) => board.contextMenu.openAt(event, titleMenuTarget(board)),
  };
}

/** The inline row that asks for the new project's title and sprint, wired to this catalog. */
function newProjectRowFor(board: Board, loaded: LoadedProjects): HTMLElement {
  const { context, session } = board;
  const type = context.services.getTypes()[0]?.name ?? "";
  return renderNewProjectRow({
    doc: context.doc,
    typeName: type,
    typeEntry: loaded.types.get(type),
    tags: loaded.newProjectTags,
    areaPath: configuredNewProjectAreaPath(context.properties),
    services: context.services,
    // Azure DevOps' own default for a new work item, used until the sprint list lands and whenever
    // the team has no sprints to choose from.
    defaultIterationPath: projectPathOf(context),
    onSubmit: (title, iterationPath) => addProject(board, loaded, title, iterationPath),
    onCancel: () => {
      session.addingProject = false;
      board.paint();
    },
  });
}

/** The inline box asking for a new milestone's title, at the top of the project's own level. */
function newChildRowFor(
  board: Board,
  loaded: LoadedProjects,
  parent: TrackedWorkItem,
): HTMLElement | null {
  const { context, session } = board;
  const type = childTypeOf(parent, loaded.types);
  if (type === null) return null;
  const entry = loaded.types.get(type);
  return renderNewItemRow({
    doc: context.doc,
    typeName: type,
    iconUrl: entry?.icon ?? null,
    color: workItemTypeColor(entry?.color),
    summary: newChildSummary(parent, type),
    onSubmit: (title) => addChild(board, parent, type, title),
    onCancel: () => {
      session.addingChildOf = null;
      board.paint();
    },
  });
}

/** The collaborators one board owns for its whole life, built once at the start. */
function createBoard(
  context: DataDrivenViewContext,
  root: HTMLElement,
  session: ProjectsSession,
  hooks: {
    loaded: () => LoadedProjects | null;
    paint: () => void;
    paintList: () => void;
    reload: () => void;
  },
): Board {
  const board: Board = {
    context,
    session,
    queue: new WorkItemWriteQueue(
      (request) => context.services.writeField(request),
      context.services.logger,
      (request) => context.services.reorderItem(request),
    ),
    contextMenu: createItemContextMenu({
      doc: context.doc,
      mountInto: root,
      logger: context.services.logger,
    }),
    dragReorder: new DragReorderController(
      context.doc,
      (move) => {
        const loaded = hooks.loaded();
        if (loaded !== null) persistProjectMove(board, loaded, move);
      },
      context.services.logger,
    ),
    paint: hooks.paint,
    paintList: hooks.paintList,
    reload: hooks.reload,
  };
  return board;
}

/**
 * Keep the write-queue's state in the session, and the indicator currently on screen in step.
 *
 * The indicator is rebuilt on every paint, so the subscription cannot hold one: it reads whichever
 * one the last paint produced, and the session keeps the values a fresh one is seeded from.
 */
function trackWriteQueue(board: Board, currentStatus: () => WriteQueueStatusHandle | null): void {
  const { write } = board.session;
  board.queue.onPendingChange((count) => {
    write.pending = count;
    currentStatus()?.setCount(count);
  });
  board.queue.onWriteFailed((count, lastError) => {
    write.failed = count;
    write.lastError = lastError;
    currentStatus()?.setFailedCount(count, lastError);
  });
}

/** Rebuild the whole surface from data already loaded, and hand back the parts a repaint reuses. */
function paintSurface(
  board: Board,
  loaded: LoadedProjects,
  parts: {
    root: HTMLElement;
    rowStyle: HTMLStyleElement;
    queueStatus: HTMLElement;
    onRefresh: () => void;
  },
): { header: ProjectsHeaderHandle; listHost: HTMLElement } {
  const { context, session } = board;
  const header = renderProjectsHeader(
    context,
    headerOptionsFor({ board, loaded, queueStatus: parts.queueStatus, onRefresh: parts.onRefresh }),
  );
  // The list lives in a host of its own so a filter can replace it without touching the header it is
  // being operated from.
  const listHost = context.doc.createElement("div");
  listHost.className = "awesomeado-projects__list-host";
  parts.root.replaceChildren(
    header.element,
    parts.rowStyle,
    ...(session.addingProject ? [newProjectRowFor(board, loaded)] : []),
    listHost,
  );
  paintList(board, loaded, listHost);
  return { header, listHost };
}

/** Fill (or refill) the list host, restriping once the rows are in the document. */
function paintList(board: Board, loaded: LoadedProjects, listHost: HTMLElement): void {
  // Every row the previous pass registered is about to be discarded, drag included.
  board.dragReorder.reset();
  const list = renderProjectsList(board.context, loaded, createRowContext(board, loaded));
  listHost.replaceChildren(list);
  restripeVisibleRows(list, ROW_EMPHASIS_CLASSES);
}

/** The live board: header, list, and the session state both of them read and write. */
function startProjectsView(context: DataDrivenViewContext, root: HTMLElement): void {
  const session: ProjectsSession = {
    expandedIds: new Set(),
    tags: { required: new Set(), excluded: new Set(), matchAll: false },
    policy: orderingPolicyOf(context.properties),
    addingProject: false,
    addingChildOf: null,
    write: { pending: 0, failed: 0 },
  };
  let data: LoadedProjects | null = null;
  let header: ProjectsHeaderHandle | null = null;
  let listHost: HTMLElement | null = null;
  let queueStatus: WriteQueueStatusHandle | null = null;
  let loadGeneration = 0;
  let refreshFailed = false;
  // Built once and re-appended each paint: `replaceChildren` discards it with the rest of the
  // surface, and re-parsing the same rules on every repaint would be work for nothing.
  const rowStyle = createRowEmphasisStyle(context.doc, ROW_EMPHASIS_CLASSES);

  const board = createBoard(context, root, session, {
    loaded: () => data,
    paint: () => paint(),
    paintList: () => repaintList(),
    reload: () => load(true),
  });
  trackWriteQueue(board, () => queueStatus);

  const paint = (): void => {
    const loaded = data;
    if (loaded === null) return;
    // Re-derived on every paint rather than only on load: a right-click command adds and clears tags
    // in place, and a filter still offering the load-time vocabulary would keep narrowing the board
    // by a tag nothing wears any more — with no way for the reader to see, let alone clear, it.
    loaded.tags = tagsInUse(flattenWorkItems(loaded.result.roots), loaded.hiddenTags);
    pruneTagCondition(context, session, loaded.tags);
    // Abandon any drag still in flight: the rows it was resolved against are about to be discarded.
    board.dragReorder.reset();
    queueStatus = createQueueStatus(board);
    const painted = paintSurface(board, loaded, {
      root,
      rowStyle,
      queueStatus: queueStatus.element,
      onRefresh: () => refresh(),
    });
    header = painted.header;
    listHost = painted.listHost;
    header.refresh.setFailed(refreshFailed);
  };

  const repaintList = (): void => {
    if (data !== null && listHost !== null) paintList(board, data, listHost);
  };

  const load = (isRefresh: boolean): void => {
    const generation = ++loadGeneration;
    // What the board is about to show comes from Azure DevOps, so a report about an edit that never
    // landed has nothing left to warn about.
    board.queue.clearFailures();
    if (!isRefresh) showMessage(context, root, "Loading projects…");
    header?.refresh.setBusy(true);
    void loadProjects(context)
      .then((loaded) => {
        if (generation !== loadGeneration) return;
        refreshFailed = false;
        data = loaded;
        paint();
      })
      .catch((error: unknown) => {
        if (generation !== loadGeneration) return;
        context.services.logger.error("All Projects Catalog View could not load the query", error);
        // A truthful-if-older board beats replacing it with a failure panel; the button says so.
        if (isRefresh && data !== null) {
          refreshFailed = true;
          paint();
          return;
        }
        showMessage(context, root, "Could not load this query.");
      });
  };

  function refresh(): void {
    // A failed refresh leaves the cause only in the log, so the next press hands the reader that log
    // rather than silently retrying the thing that just failed.
    if (refreshFailed) {
      refreshFailed = false;
      context.services.openDiagnosticsLog();
      paint();
      return;
    }
    load(true);
  }

  load(false);
}

/**
 * The All Projects Catalog View: every top-level item a query returns, listed as a project that
 * opens into its own tree, narrowed by the tags worn anywhere in that tree.
 */
export const projectsView: EnhancedView = {
  id: projectsViewType.id,
  dispose: (root) => modifierHighlightTracker(root.ownerDocument).unregister(root),
  render: (context) => {
    if (context.services === undefined) {
      return renderViewScaffold(context.doc, {
        title: projectsViewType.label,
        message: "Data services are unavailable.",
        extensionVersion: context.extensionVersion,
      });
    }
    const root = createRoot(context.doc);
    modifierHighlightTracker(context.doc).register(root);
    const dataContext: DataDrivenViewContext = { ...context, services: context.services };
    startProjectsView(dataContext, root);
    return root;
  },
};
