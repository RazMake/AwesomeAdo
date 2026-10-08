import type { WorkItemTreeResult } from "../../../common/ado/IWorkItemTreeLoader";
import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { buildWorkItemUrl } from "../../../common/ado/fetchAdoTree";
import {
  isInAreaPathBranches,
  isInAreaPaths,
  representedAreaPaths,
} from "../../../common/ado/workItemAreaPaths";
import { orderTrackedItems, workItemTypeDisplayColor } from "../../../common/ado/workItemTypes";
import { resolveMentionsIn } from "../../../common/browser/MessagingMentionDirectory";
import { replacePageSearch } from "../../../common/navigation/PageUrl";
import { MANUAL_ORDERING_POLICY, type OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import type { DataDrivenViewContext, EnhancedView } from "../../../common/view-common/EnhancedView";
import { queryFolderBreadcrumbs } from "../../../common/view-common/control/Breadcrumbs/queryFolderBreadcrumbs";
import {
  DragReorderController,
  type PlannedMove,
} from "../../../common/view-common/control/DragReorder/DragReorderController";
import { renderEmptyState } from "../../../common/view-common/control/EmptyState/EmptyState";
import type { RefreshRequest } from "../../../common/view-common/control/HeaderButtons/HeaderButtons";
import {
  createItemContextMenu,
  type ItemContextMenu,
} from "../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import {
  createRowEmphasisStyle,
  modifierHighlightTracker,
  restripeVisibleRows,
} from "../../../common/view-common/control/RowEmphasis/RowEmphasis";
import { renderToggleButton } from "../../../common/view-common/control/ToggleButton/ToggleButton";
import { treeRowEmphasisClasses } from "../../../common/view-common/control/TreeRow/TreeRow";
import type { ViewTitleBandHandle } from "../../../common/view-common/control/ViewHeader/ViewHeader";
import {
  renderViewScaffold,
  renderViewSurface,
} from "../../../common/view-common/control/ViewScaffold/ViewScaffold";
import { renderRetainedAreaPathFilter } from "../area-path-selection/retainedAreaPathFilter";
import { createBoardLoader } from "../board-lifecycle/boardLoader";
import { createBoardWriteQueue } from "../board-lifecycle/boardWriteQueue";
import { createBoardWriteStatus } from "../board-lifecycle/boardWriteStatus";
import { discardBoardCaches } from "../board-lifecycle/discardBoardCaches";
import { widestStatusLabelLength } from "../item-status/itemStatusBadge";
import { dragReorderUnavailableReason } from "../project-tracking/drag-reorder/dragReorderAvailability";
import { persistTreeMove } from "../project-tracking/drag-reorder/persistTreeMove";
import { buildCustomTagCommands } from "../project-tracking/item-commands/CustomTagCommands";
import { buildViewNotesCommand } from "../project-tracking/item-commands/ItemCommands";
import { buildUpdateParentCommand } from "../project-tracking/item-commands/UpdateParentCommand";
import type { NotesPanelState } from "../project-tracking/notes/NotesPanel";
import { renderTagConditionFilter } from "../tag-selection/TagConditionFilter";
import {
  describeTagCondition,
  matchesTagCondition,
  pruneTagCondition,
  tagsInUse,
  type TagCondition,
} from "../tag-selection/tagCondition";
import { readUrlTagCondition, searchWithTagCondition } from "../tag-selection/tagConditionUrl";

import { renderConsumerFilter } from "./ConsumerFilter";
import { renderConsumerRow, renderRequestOnlyRow, type ConsumerRowContext } from "./ConsumerRow";
import { renderConsumersHeader } from "./ConsumersHeader";
import {
  consumersSearchWithAreaPaths,
  consumersSearchWithConsumerIds,
  readConsumersUrlAreaPaths,
  readConsumersUrlConsumerIds,
} from "./consumersUrlPreferences";
import { consumersViewType, orderingPolicyOf, requestAreaPaths } from "./consumersViewType";
import { renderAddConsumerButton } from "./creation/AddConsumerButton";
import {
  buildAddConsumerCommand,
  consumerCreationCommands,
  type ConsumerCreationContext,
} from "./creation/creationCommands";
import {
  createConsumerContactEditor,
  type ConsumerContactEditor,
} from "./profile/ConsumerContactEditor";
import { contactRolesIn } from "./profile/consumerProfile";
import { collapseStep, expandStep } from "./treeExpansion";

/** What the reader has done to the board, kept outside the DOM so a repaint cannot lose it. */
interface ConsumersSession {
  /** Consumers the reader opened; every consumer starts closed, showing only its request count. */
  expandedIds: Set<number>;
  /** Description panels kept open while filters, ordering, or drag rebuild the list. */
  expandedDescriptionIds: Set<number>;
  /** Discussion panels kept open while filters, ordering, or drag rebuild the list. */
  expandedNoteIds: Set<number>;
  /** Discussion data cached per item so a repaint never refetches an opened panel. */
  notePanelStates: Map<number, NotesPanelState>;
  /** The header area-path filter over REQUESTS, seeded from the page URL so a shared link opens narrowed. */
  selectedAreaPaths: Set<string>;
  /** The header Consumer filter's picked consumer ids, seeded from the page URL; empty keeps all. */
  selectedConsumerIds: Set<number>;
  /** The header tag condition, judged on each CONSUMER's own tags; seeded from the page URL. */
  tags: TagCondition;
  /** The ordering in force; board-local, like every other view's ordering pick (ADR-039). */
  policy: OrderingPolicy;
  /**
   * Whether the board shows the consumer cards rather than its default, the flat requests list.
   * Seeded once from the reader's synced choice for this query, so it reopens the way it was left.
   */
  showConsumers: boolean;
}

/** Why a query cannot be drawn as consumers, phrased for the empty-state panel. */
interface QueryProblem {
  message: string;
  hint: string;
}

/**
 * The query's single root, which only groups the consumers and is never drawn itself — or, exactly
 * when there is no such root, why not.
 */
type GroupingOutcome =
  { grouping: TrackedWorkItem; problem: null } | { grouping: null; problem: QueryProblem };

/** One load's answer, plus the catalog values the rows are painted with. */
type LoadedConsumers = GroupingOutcome & {
  result: WorkItemTreeResult;
  types: Map<string, TypeCatalogEntry>;
  boardColumns: string[];
};

/** The live board, so a row or a command can reach what it has to change. */
interface Board {
  context: DataDrivenViewContext;
  session: ConsumersSession;
  /** The binding's request area branches; empty lets every request through. */
  configuredAreaPaths: readonly string[];
  queue: WorkItemWriteQueue;
  contactEditor: ConsumerContactEditor;
  contextMenu: ItemContextMenu;
  dragReorder: DragReorderController;
  /**
   * Rebuild ONLY the list, from the data already loaded. The header is where a live filter is being
   * operated from, and rebuilding it would close the dropdown the reader is still picking in.
   */
  paintList(): void;
  /** Re-read the query, for a change (a new parent) the loaded tree cannot represent. */
  reload(): void;
}

const PREFIX = "awesomeado-consumers";

const ROW_EMPHASIS_CLASSES = treeRowEmphasisClasses(PREFIX);

const ADJUST_QUERY_HINT = "Adjust the query in Azure DevOps, then refresh this board.";

/**
 * The grouping item, or why the query does not have exactly one.
 *
 * The problem is painted inside the board rather than instead of it, so Refresh stays on screen for
 * the reader who is fixing the query in another tab.
 */
function groupingOf(result: WorkItemTreeResult): GroupingOutcome {
  if (!result.isTreeQuery) {
    return {
      grouping: null,
      problem: {
        message: "Consumers View needs a tree (work item links) query.",
        hint: "Change the query to a tree of work items in Azure DevOps, then refresh this board.",
      },
    };
  }
  const [grouping] = result.roots;
  if (grouping === undefined) {
    return {
      grouping: null,
      problem: { message: "This query returned no work items.", hint: ADJUST_QUERY_HINT },
    };
  }
  if (result.roots.length > 1) {
    return {
      grouping: null,
      problem: {
        message: `Consumers View needs one top-level item grouping the consumers; this query returned ${result.roots.length}.`,
        hint: ADJUST_QUERY_HINT,
      },
    };
  }
  return { grouping, problem: null };
}

/** Read the tree plus the catalog values the board paints with, in one pass. */
async function loadConsumers(context: DataDrivenViewContext): Promise<LoadedConsumers> {
  const result = await context.services.loadTree(context.queryId);
  if (result.error !== null) {
    throw new Error(result.error);
  }
  return {
    result,
    types: new Map(context.services.getTypes().map((entry) => [entry.name, entry])),
    boardColumns: context.services.getBoardColumns(),
    ...groupingOf(result),
  };
}

/** Every request the binding's area branches keep, before the header Area filter narrows them. */
function inScopeRequests(board: Board, grouping: TrackedWorkItem): TrackedWorkItem[] {
  return grouping.children
    .flatMap((consumer) => consumer.children)
    .filter((request) => isInAreaPathBranches(request.areaPath, board.configuredAreaPaths));
}

/** Whether both area filters keep a request: inside a configured branch and an exact header pick. */
function keepsRequest(board: Board, request: TrackedWorkItem): boolean {
  return (
    isInAreaPathBranches(request.areaPath, board.configuredAreaPaths) &&
    isInAreaPaths(request.areaPath, board.session.selectedAreaPaths)
  );
}

/**
 * The consumers this paint draws, in the board's order.
 *
 * Consumers are never narrowed by area: an area path says where work is filed, not who asked for
 * it, so the area filters narrow only the requests each consumer lists and counts.
 */
function shownConsumers(board: Board, grouping: TrackedWorkItem): TrackedWorkItem[] {
  const { session } = board;
  const picked = session.selectedConsumerIds;
  return orderTrackedItems(
    grouping.children.filter(
      (consumer) =>
        // Judged on the consumer's OWN tags in both modes: the tags describe who is asking.
        matchesTagCondition(consumer, session.tags) &&
        (picked.size === 0 || picked.has(consumer.id)),
    ),
    (consumer) => consumer,
    session.policy,
  );
}

/** Replace the surface with the shared placeholder shell (loading, or a first load that failed). */
function showMessage(context: DataDrivenViewContext, root: HTMLElement, message: string): void {
  root.replaceChildren(
    renderViewScaffold(context.doc, {
      title: consumersViewType.label,
      message,
      extensionVersion: context.extensionVersion,
    }),
  );
}

/**
 * Keep the page URL naming the header's filters, so the address bar is always a shareable link to
 * exactly the board on screen.
 */
function writeFilterUrl(board: Board): void {
  const { session } = board;
  replacePageSearch(board.context.doc, (search) =>
    searchWithTagCondition(
      consumersSearchWithConsumerIds(
        consumersSearchWithAreaPaths(search, session.selectedAreaPaths),
        session.selectedConsumerIds,
      ),
      session.tags,
    ),
  );
}

/**
 * Persist a request dropped in the requests-only list and repaint once Azure DevOps accepted it.
 *
 * The list registers every request under the grouping item so the controller sees one level; here
 * the move is mapped back onto the request's REAL consumer before it is written, so the write only
 * ranks it — a drop in this list never hands a request to another consumer. The neighbours and the
 * full sibling list stay those of the flat list, which backlog rank (one order across the whole
 * backlog) can honour even when they belong to different consumers.
 */
function persistMove(board: Board, loaded: LoadedConsumers | null, move: PlannedMove): void {
  const { services } = board.context;
  const team = services.currentTeam();
  const grouping = loaded?.grouping ?? null;
  const consumer =
    grouping?.children.find((candidate) =>
      candidate.children.some((request) => request.id === move.id),
    ) ?? null;
  if (grouping === null || team === null || consumer === null) {
    services.logger.error(
      `Consumers View move of item ${move.id} aborted: ${moveAbortReason(team, grouping)}.`,
    );
    return;
  }
  void persistTreeMove({
    root: grouping,
    move: { ...move, parentId: consumer.id, currentParentId: consumer.id },
    team,
    queue: board.queue,
    logger: services.logger,
  }).then((changed) => {
    if (changed) board.paintList();
  });
}

/** Why a dropped request could not be persisted, for the error log. */
function moveAbortReason(team: string | null, grouping: TrackedWorkItem | null): string {
  if (team === null) return "no team is configured, and backlog rank is per team in Azure DevOps";
  if (grouping === null) return "the board no longer shows a grouping item";
  return "the request is no longer under any consumer on the board";
}

/**
 * Why a drag cannot be honoured right now, or null when it can. Shared by the ordering glyph and the
 * rows, so the glyph never claims a drag the rows do not offer.
 */
function dragUnavailableReason(board: Board, policy: OrderingPolicy): string | null {
  if (board.session.showConsumers) {
    return "drag to reorder is only available in the requests list; consumers keep a fixed order";
  }
  const teamReason = dragReorderUnavailableReason(
    board.context.services.currentTeam(),
    MANUAL_ORDERING_POLICY,
  );
  if (teamReason !== null) return teamReason;
  return policy === MANUAL_ORDERING_POLICY
    ? null
    : "drag to reorder is only available under Drag-and-drop order";
}

/**
 * Every request of every consumer — filtered out or not — in backlog-rank order, which a drop in
 * the requests-only list is ranked against.
 */
function allRequestIdsByRank(grouping: TrackedWorkItem): number[] {
  return orderTrackedItems(
    grouping.children.flatMap((consumer) => consumer.children),
    (request) => request,
    MANUAL_ORDERING_POLICY,
  ).map((request) => request.id);
}

/** What the Add new consumer / Add new request commands need from this board and load. */
function creationContext(
  board: Board,
  loaded: LoadedConsumers,
  grouping: TrackedWorkItem,
): ConsumerCreationContext {
  return {
    doc: board.context.doc,
    services: board.context.services,
    grouping,
    types: loaded.types,
    configuredAreaPaths: board.configuredAreaPaths,
    onCreated: board.reload,
  };
}

/** The row context for one paint: the session's live state plus what the filters keep. */
function createRowContext(
  board: Board,
  loaded: LoadedConsumers,
  grouping: TrackedWorkItem,
): ConsumerRowContext {
  const { context, session } = board;
  const draggable = dragUnavailableReason(board, session.policy) === null;
  return {
    doc: context.doc,
    types: loaded.types,
    boardColumns: loaded.boardColumns,
    queue: board.queue,
    services: context.services,
    statusWidthCh: widestStatusLabelLength(grouping.children, loaded.types),
    now: () => context.services.now(),
    policy: session.policy,
    expandedIds: session.expandedIds,
    expandedDescriptionIds: session.expandedDescriptionIds,
    expandedNoteIds: session.expandedNoteIds,
    notePanelStates: session.notePanelStates,
    mentionNames: context.services.mentionDirectory.knownNames(),
    groupingId: grouping.id,
    requestSiblingIds: draggable ? allRequestIdsByRank(grouping) : [],
    dragReorder: draggable ? board.dragReorder : null,
    hideConsumerTags: session.selectedConsumerIds.size > 0,
    contactEditor: board.contactEditor,
    contactRoles: contactRolesIn(grouping.children.map((consumer) => consumer.description)),
    onContextMenu: (item, event) =>
      board.contextMenu.openAt(event, {
        id: item.id,
        url: buildWorkItemUrl(context.doc.location?.href ?? "", item.id),
        workItem: { title: item.title, type: item.type },
        commands: [
          buildUpdateParentCommand({
            doc: context.doc,
            item,
            services: context.services,
            queue: board.queue,
            onChanged: board.paintList,
            queryId: context.queryId,
            onReload: board.reload,
          }),
          buildViewNotesCommand({
            doc: context.doc,
            item,
            services: context.services,
            queue: board.queue,
            onChanged: board.paintList,
          }),
          ...(grouping.children.includes(item)
            ? buildCustomTagCommands({
                doc: context.doc,
                item,
                services: context.services,
                queue: board.queue,
                onChanged: board.paintList,
                knownTags: tagsInUse(grouping.children),
                protectedTags: new Set(),
                itemKind: "Consumer",
                noRemovableTagsReason: "This consumer carries no custom tag to clear.",
              })
            : []),
          ...(grouping.children.includes(item)
            ? consumerCreationCommands(creationContext(board, loaded, grouping), item)
            : []),
        ],
      }),
    keepsRequest: (request) => keepsRequest(board, request),
    repaint: () => board.paintList(),
  };
}

/** The panel saying why there are no consumers to draw, or null when the filters keep some. */
function consumersEmptyState(
  board: Board,
  grouping: TrackedWorkItem,
  consumers: readonly TrackedWorkItem[],
): HTMLElement | null {
  const { doc } = board.context;
  if (grouping.children.length === 0) {
    return renderEmptyState(doc, {
      message: "This query returned no consumers.",
      hint: "Link consumers under the query's top-level item in Azure DevOps, then refresh this board.",
    });
  }
  if (consumers.length > 0) return null;
  return renderEmptyState(doc, {
    message: "No consumer matches the header filters.",
    hint: "Clear the Consumer or Tags filter to see more consumers.",
  });
}

/** An empty list element; no gap between rows, as the alternating stripes separate the items. */
function createList(doc: Document): HTMLElement {
  const list = doc.createElement("div");
  list.className = `${PREFIX}__list`;
  list.style.cssText = "display:flex;flex-direction:column";
  return list;
}

/** The consumers the filters keep, or the panel saying why there are none to draw. */
function renderConsumersList(
  board: Board,
  grouping: TrackedWorkItem,
  consumers: readonly TrackedWorkItem[],
  rowContext: ConsumerRowContext,
): HTMLElement {
  const empty = consumersEmptyState(board, grouping, consumers);
  if (empty !== null) return empty;
  const list = createList(board.context.doc);
  for (const consumer of consumers) list.append(renderConsumerRow(consumer, rowContext));
  return list;
}

/** A shown request and the consumer that made it, which its row is tagged with. */
interface ShownRequest {
  request: TrackedWorkItem;
  consumer: TrackedWorkItem;
}

/**
 * Every shown consumer's requests as ONE list in the board's ordering — under importance, the most
 * important request first whoever asked for it, which is the question this mode exists to answer.
 */
function shownRequests(board: Board, consumers: readonly TrackedWorkItem[]): ShownRequest[] {
  return orderTrackedItems(
    consumers.flatMap((consumer) =>
      consumer.children
        .filter((request) => keepsRequest(board, request))
        .map((request) => ({ request, consumer })),
    ),
    (entry) => entry.request,
    board.session.policy,
  );
}

/** The requests-only list, or the panel saying why it has nothing to draw. */
function renderRequestsList(
  board: Board,
  grouping: TrackedWorkItem,
  consumers: readonly TrackedWorkItem[],
  rowContext: ConsumerRowContext,
): HTMLElement {
  const empty = consumersEmptyState(board, grouping, consumers);
  if (empty !== null) return empty;
  const { doc } = board.context;
  const requests = shownRequests(board, consumers);
  if (requests.length === 0) {
    // Area filters are told apart from a board that simply has no requests, since they hid them.
    const areaFiltered =
      board.configuredAreaPaths.length > 0 || board.session.selectedAreaPaths.size > 0;
    return renderEmptyState(
      doc,
      areaFiltered
        ? {
            message: "No feature request of the shown consumers matches the area paths.",
            hint: "Clear the Area filter, or change the request area paths in the query's binding.",
          }
        : {
            message: "None of the shown consumers has a feature request.",
            hint: "Press Show consumers to see the consumers, or link requests under them in Azure DevOps.",
          },
    );
  }
  const list = createList(doc);
  for (const { request, consumer } of requests) {
    list.append(renderRequestOnlyRow(request, consumer, rowContext));
  }
  return list;
}

/**
 * What the board is showing and why, in one log-readable line — so "where did my consumer go?" can
 * be answered from Diagnostics alone.
 */
function describeBoard(
  board: Board,
  grouping: TrackedWorkItem,
  consumers: readonly TrackedWorkItem[],
): string {
  const requests = shownRequests(board, consumers).length;
  return (
    `Consumers View showing ${consumers.length} of ${grouping.children.length} consumer(s), ` +
    `with ${requests} feature request(s): mode=${board.session.showConsumers ? "consumers" : "requests-only"}, ` +
    `configuredAreaPaths=${board.configuredAreaPaths.length}, ` +
    `selectedAreaPaths=${board.session.selectedAreaPaths.size}, ` +
    `selectedConsumers=${board.session.selectedConsumerIds.size}, ` +
    `tags=${describeTagCondition(board.session.tags)}.`
  );
}
/** The list for one paint, plus the line describing it for the diagnostics log. */
function renderBoardList(
  board: Board,
  loaded: LoadedConsumers,
): { list: HTMLElement; description: string } {
  if (loaded.grouping === null) {
    const { result } = loaded;
    return {
      list: renderEmptyState(board.context.doc, loaded.problem),
      description: `Consumers View cannot show this query: isTreeQuery=${result.isTreeQuery}, rootCount=${result.roots.length}.`,
    };
  }
  const rowContext = createRowContext(board, loaded, loaded.grouping);
  const consumers = shownConsumers(board, loaded.grouping);
  const renderList = board.session.showConsumers ? renderConsumersList : renderRequestsList;
  return {
    list: renderList(board, loaded.grouping, consumers, rowContext),
    description: describeBoard(board, loaded.grouping, consumers),
  };
}

/** The collaborators one board owns for its whole life, built once at the start. */
function createBoard(
  context: DataDrivenViewContext,
  root: HTMLElement,
  hooks: { loaded(): LoadedConsumers | null; paintList(): void; reload(): void },
): Board {
  const queue = createBoardWriteQueue(context.services);
  const search = context.doc.location?.search ?? "";
  const board: Board = {
    context,
    session: {
      expandedIds: new Set(),
      expandedDescriptionIds: new Set(),
      expandedNoteIds: new Set(),
      notePanelStates: new Map(),
      selectedAreaPaths: new Set(readConsumersUrlAreaPaths(search)),
      selectedConsumerIds: new Set(readConsumersUrlConsumerIds(search)),
      tags: readUrlTagCondition(search),
      policy: orderingPolicyOf(context.properties),
      // Replaced by the reader's saved choice before the first paint; see `applySavedMode`.
      showConsumers: false,
    },
    configuredAreaPaths: requestAreaPaths(context.properties),
    queue,
    contactEditor: createConsumerContactEditor({
      queue,
      userDirectory: context.services.userDirectory,
      logger: context.services.logger,
      mentionNames: () => context.services.mentionDirectory.knownNames(),
      // Every edit ends in a repaint, so a card shows what Azure DevOps accepted — a refused role
      // change snaps back instead of lingering as if it had been saved.
      onSettled: () => hooks.paintList(),
    }),
    contextMenu: createItemContextMenu({
      doc: context.doc,
      mountInto: root,
      logger: context.services.logger,
      collection: context.services.itemCollection,
    }),
    dragReorder: new DragReorderController(
      context.doc,
      (move) => persistMove(board, hooks.loaded(), move),
      context.services.logger,
      // Only the flat requests list registers rows, all at one depth: a drop reorders it and can
      // never nest one request under another.
      { fixedDepth: true },
    ),
    paintList: hooks.paintList,
    reload: hooks.reload,
  };
  return board;
}

/**
 * One press of the header's `+` or `−`, stepping through the tree a level at a time (and, for `−`,
 * closing open panels first — see `collapseStep`). Logged, because a press that closed panels
 * rather than the tree is exactly what a reader later asks about.
 */
function stepExpansion(
  board: Board,
  loaded: LoadedConsumers,
  direction: "expand" | "collapse",
): void {
  if (loaded.grouping === null) return;
  const { session } = board;
  const consumers = shownConsumers(board, loaded.grouping);
  // Requests are always leaves here, so the consumers with a request are the tree's only level —
  // and a requests-only list has no tree at all, leaving `−` only its panels to close.
  const levels = session.showConsumers
    ? [
        consumers
          .filter((consumer) => consumer.children.some((request) => keepsRequest(board, request)))
          .map(({ id }) => id),
      ]
    : [];
  const step =
    direction === "expand"
      ? expandStep(session, levels)
      : collapseStep(session, shownItemIds(board, consumers), levels);
  board.context.services.logger.info(
    `Consumers View ${direction}: ${step ?? `nothing left to ${direction}`}.`,
  );
  board.paintList();
}

/**
 * Every item on screen: every shown request in the requests-only list; otherwise the shown
 * consumers, and the requests of each one that is open.
 */
function shownItemIds(board: Board, consumers: readonly TrackedWorkItem[]): number[] {
  const { session } = board;
  return consumers.flatMap((consumer) => {
    const requestIds = consumer.children
      .filter((request) => keepsRequest(board, request))
      .map(({ id }) => id);
    if (!session.showConsumers) return requestIds;
    return session.expandedIds.has(consumer.id) ? [consumer.id, ...requestIds] : [consumer.id];
  });
}

/**
 * Read the reader's saved mode for this query. A failed read is logged and falls back to the
 * requests list, the board's default, rather than leaving the board unpainted.
 */
async function readSavedMode(context: DataDrivenViewContext): Promise<boolean> {
  const { consumersShowConsumers, logger } = context.services;
  if (consumersShowConsumers === undefined) return false;
  try {
    return await consumersShowConsumers.read(context.queryId);
  } catch (error) {
    logger.error("Consumers View could not read the saved Show consumers choice", error);
    return false;
  }
}

/** The header switch between the requests list (the default) and the consumer cards. */
function renderShowConsumersToggle(board: Board, repaint: () => void): HTMLElement {
  const { context, session } = board;
  return renderToggleButton(context.doc, {
    className: `${PREFIX}__show-consumers`,
    label: "Show consumers",
    pressed: session.showConsumers,
    pressedTitle: "Show only the feature requests again, as one list across every shown consumer",
    releasedTitle: "Show the consumers, each with its feature requests",
    onToggle: (showConsumers) => {
      session.showConsumers = showConsumers;
      context.services.logger.info(
        `Consumers View Show consumers: ${showConsumers ? "on" : "off"}.`,
      );
      // Saved per query and synced, so this query reopens in this mode on every signed-in browser.
      void context.services.consumersShowConsumers
        ?.write(context.queryId, showConsumers)
        .catch((error: unknown) => {
          context.services.logger.error(
            "Consumers View could not save the Show consumers choice",
            error,
          );
        });
      repaint();
    },
  });
}

/**
 * Drop tags from the retained condition that no in-scope consumer wears any more, and say so: a
 * stale tag would narrow the board by something the filter shows as unselected.
 */
function pruneSessionTags(board: Board, vocabulary: readonly string[]): void {
  const pruned = pruneTagCondition(board.session.tags, vocabulary);
  if (pruned.dropped.length === 0) return;
  board.session.tags = pruned.condition;
  board.context.services.logger.info(
    `Consumers View dropped tag filter(s) no consumer wears any more: ${pruned.dropped.join(", ")}.`,
  );
}

/**
 * The Consumer and Tags filters over the consumers, and the Area filter over the requests the
 * binding's branches keep. Every change repaints the
 * LIST only, so the dropdown the reader is still picking in stays open, and is logged because it
 * silently decides how much of the query the reader sees.
 */
function renderHeaderFilters(board: Board, loaded: LoadedConsumers): HTMLElement[] {
  const { context, session } = board;
  const { logger } = context.services;
  const consumers = loaded.grouping?.children ?? [];
  const requests = loaded.grouping === null ? [] : inScopeRequests(board, loaded.grouping);
  const changed = (what: string): void => {
    logger.info(`Consumers View ${what}.`);
    writeFilterUrl(board);
    board.paintList();
  };
  const vocabulary = tagsInUse(consumers);
  pruneSessionTags(board, vocabulary);
  const filters = [
    renderConsumerFilter(context.doc, {
      consumers,
      selection: session.selectedConsumerIds,
      onChange: () => changed(`consumer filter: selectedCount=${session.selectedConsumerIds.size}`),
    }),
    renderTagConditionFilter(context.doc, {
      tags: vocabulary,
      condition: session.tags,
      onChange: (condition) => {
        session.tags = condition;
        changed(`tag filter set to ${describeTagCondition(condition)}`);
      },
    }),
    renderRetainedAreaPathFilter(context.doc, {
      areaPaths: representedAreaPaths(requests),
      selection: session.selectedAreaPaths,
      onChange: (selected) => changed(`area-path filter: selectedCount=${selected.length}`),
    }).element,
  ];
  // After every filter pruned what this load no longer offers, so a link naming something the
  // board cannot show leaves an address bar describing the board actually on screen.
  writeFilterUrl(board);
  return filters;
}

/** The header, wired to this board's session; rebuilt only by a full paint. */
function renderHeader(
  board: Board,
  loaded: LoadedConsumers,
  handlers: { queueStatus: HTMLElement; paint(): void; onRefresh(request: RefreshRequest): void },
): ViewTitleBandHandle {
  const { context, session } = board;
  const grouping = loaded.grouping;
  const addConsumer =
    grouping === null ? null : buildAddConsumerCommand(creationContext(board, loaded, grouping));
  return renderConsumersHeader(context, {
    breadcrumbs: queryFolderBreadcrumbs(loaded.result.folderPath, context.doc.location?.href ?? ""),
    title: grouping?.title ?? consumersViewType.label,
    titleColor: workItemTypeDisplayColor(
      grouping === null ? null : loaded.types.get(grouping.type)?.color,
    ),
    policy: session.policy,
    dragReorderUnavailable: (policy) => dragUnavailableReason(board, policy),
    queueStatus: handlers.queueStatus,
    filters: renderHeaderFilters(board, loaded),
    // A full paint, so the ordering glyph re-states whether a drag is available in the new mode.
    showConsumersToggle: renderShowConsumersToggle(board, handlers.paint),
    addConsumerButton: renderAddConsumerButton({
      doc: context.doc,
      className: `${PREFIX}__add-consumer`,
      showConsumers: session.showConsumers,
      command: addConsumer,
      openPanel: (button, command) => board.contextMenu.openPanel(button, command),
    }),
    onOrderingChange: (policy) => {
      session.policy = policy;
      context.services.logger.info(`Consumers View ordering: ${policy}.`);
      handlers.paint();
    },
    onExpandAll: () => stepExpansion(board, loaded, "expand"),
    onCollapseAll: () => stepExpansion(board, loaded, "collapse"),
    onRefresh: handlers.onRefresh,
    onTitleContextMenu: (event) =>
      board.contextMenu.openAt(event, {
        id: 0,
        url: context.doc.location?.href ?? null,
        standardCommands: ["copy-url"],
        commands: addConsumer === null ? [] : [addConsumer],
      }),
  });
}
/** The live board: header, list, and the session state both of them read and write. */
function startConsumersView(context: DataDrivenViewContext, root: HTMLElement): void {
  let header: ViewTitleBandHandle | null = null;
  const listHost = context.doc.createElement("div");
  listHost.className = `${PREFIX}__list-host`;
  // Built once and re-appended each paint: re-parsing the same rules on every repaint is waste.
  const rowStyle = createRowEmphasisStyle(context.doc, ROW_EMPHASIS_CLASSES);
  let lastDescription: string | null = null;

  const paintList = (): void => {
    const loaded = loader.data();
    if (loaded === null) return;
    // Every row the previous pass registered is about to be discarded, drag included.
    board.dragReorder.reset();
    const { list, description } = renderBoardList(board, loaded);
    listHost.replaceChildren(list);
    restripeVisibleRows(list, ROW_EMPHASIS_CLASSES);
    // Logged only when the conclusion changes: a repaint that shows the same board must not flood
    // the bounded log.
    if (description !== lastDescription) context.services.logger.info(description);
    lastDescription = description;
  };

  const board = createBoard(context, root, {
    loaded: () => loader.data(),
    paintList,
    reload: () => loader.refresh(),
  });
  // Read once, alongside the first load, so the query opens straight into the reader's saved mode
  // with no flash of the other one; a later Refresh never re-applies it over a flip made since.
  const applySavedMode = readSavedMode(context).then((showConsumers) => {
    board.session.showConsumers = showConsumers;
  });
  const writeStatus = createBoardWriteStatus(
    context.doc,
    board.queue,
    context.services.openDiagnosticsLog,
  );

  const paint = (): void => {
    const loaded = loader.data();
    if (loaded === null) return;
    header = renderHeader(board, loaded, {
      queueStatus: writeStatus.render(),
      paint,
      onRefresh: (request) => loader.refresh(request),
    });
    root.replaceChildren(header.element, rowStyle, listHost);
    paintList();
    resolveConsumerMentions(context.services, loaded.result.roots, paintList);
    header.refresh.setFailed(loader.refreshFailed());
  };

  const loader = createBoardLoader({
    fetch: async () => (await Promise.all([loadConsumers(context), applySavedMode]))[0],
    paint,
    showMessage: (message) => showMessage(context, root, message),
    loadingMessage: "Loading consumers…",
    failureLogMessage: "Consumers View could not load the query",
    logger: context.services.logger,
    openDiagnosticsLog: context.services.openDiagnosticsLog,
    queue: board.queue,
    refreshButton: () => header?.refresh ?? null,
    discardCaches: () =>
      discardBoardCaches(context.services, "Consumers View", [board.session.notePanelStates]),
  });

  loader.load(false);
}

/** Resolve every description's mention ids in one batch, then repaint only if names were learned. */
function resolveConsumerMentions(
  services: DataDrivenViewContext["services"],
  roots: readonly TrackedWorkItem[],
  repaint: () => void,
): void {
  const knownBefore = services.mentionDirectory.knownNames().size;
  const descriptions: string[] = [];
  const pending = [...roots];
  while (pending.length > 0) {
    const item = pending.pop()!;
    descriptions.push(item.description);
    pending.push(...item.children);
  }
  resolveMentionsIn(services.mentionDirectory, descriptions)
    .then((names) => {
      if (names.size > knownBefore) repaint();
    })
    .catch((error: unknown) => {
      services.logger.error("Consumers View could not resolve description mentions", error);
    });
}

/**
 * The Consumers View: the consumers a tree query groups under its single root, each opening onto
 * the feature requests it asked for, narrowed to the area paths the board is about.
 */
export const consumersView: EnhancedView = {
  id: consumersViewType.id,
  dispose: (root) => modifierHighlightTracker(root.ownerDocument).unregister(root),
  render: (context) => {
    if (context.services === undefined) {
      return renderViewScaffold(context.doc, {
        title: consumersViewType.label,
        message: "Data services are unavailable.",
        extensionVersion: context.extensionVersion,
      });
    }
    const root = renderViewSurface(context.doc, `awesomeado-view ${PREFIX}`);
    modifierHighlightTracker(context.doc).register(root);
    startConsumersView({ ...context, services: context.services }, root);
    return root;
  },
};
