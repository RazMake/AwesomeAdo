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
import type { OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import type { DataDrivenViewContext, EnhancedView } from "../../../common/view-common/EnhancedView";
import { queryFolderBreadcrumbs } from "../../../common/view-common/control/Breadcrumbs/queryFolderBreadcrumbs";
import {
  DragReorderController,
  type PlannedMove,
} from "../../../common/view-common/control/DragReorder/DragReorderController";
import { renderEmptyState } from "../../../common/view-common/control/EmptyState/EmptyState";
import {
  createItemContextMenu,
  type ItemContextMenu,
} from "../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import {
  createRowEmphasisStyle,
  modifierHighlightTracker,
  restripeVisibleRows,
} from "../../../common/view-common/control/RowEmphasis/RowEmphasis";
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
import { widestStatusLabelLength } from "../item-status/itemStatusBadge";
import { dragReorderUnavailableReason } from "../project-tracking/drag-reorder/dragReorderAvailability";
import { persistTreeMove } from "../project-tracking/drag-reorder/persistTreeMove";
import { buildViewNotesCommand } from "../project-tracking/item-commands/ItemCommands";
import { buildUpdateParentCommand } from "../project-tracking/item-commands/UpdateParentCommand";
import type { NotesPanelState } from "../project-tracking/notes/NotesPanel";

import { renderConsumerRow, type ConsumerRowContext } from "./ConsumerRow";
import { renderConsumersHeader } from "./ConsumersHeader";
import { consumersSearchWithAreaPaths, readConsumersUrlAreaPaths } from "./consumersUrlPreferences";
import { consumerAreaPaths, consumersViewType, orderingPolicyOf } from "./consumersViewType";
import {
  createConsumerContactEditor,
  type ConsumerContactEditor,
} from "./profile/ConsumerContactEditor";
import { contactRolesIn } from "./profile/consumerProfile";
import { collapseStep, expandStep } from "./treeExpansion";

/** What the reader has done to the board, kept outside the DOM so a repaint cannot lose it. */
interface ConsumersSession {
  /** Consumers the reader closed; everything starts open, because the requests are the point. */
  collapsedIds: Set<number>;
  /** Description panels kept open while filters, ordering, or drag rebuild the list. */
  expandedDescriptionIds: Set<number>;
  /** Discussion panels kept open while filters, ordering, or drag rebuild the list. */
  expandedNoteIds: Set<number>;
  /** Discussion data cached per item so a repaint never refetches an opened panel. */
  notePanelStates: Map<number, NotesPanelState>;
  /** The header area-path filter, seeded from the page URL so a shared link opens narrowed. */
  selectedAreaPaths: Set<string>;
  /** The ordering in force; board-local, like every other view's ordering pick (ADR-039). */
  policy: OrderingPolicy;
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
  /** The binding's consumer area branches; empty lets every consumer through. */
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

/** Every consumer the binding's area branches keep, before the header filter narrows them. */
function inScopeConsumers(board: Board, grouping: TrackedWorkItem): TrackedWorkItem[] {
  return grouping.children.filter((consumer) =>
    isInAreaPathBranches(consumer.areaPath, board.configuredAreaPaths),
  );
}

/**
 * The consumers this paint draws, in the board's order.
 *
 * Only a CONSUMER is narrowed by area: the board answers "who is waiting on this team?", and a
 * consumer that is shown is shown with every request it made, wherever each request is filed.
 */
function shownConsumers(board: Board, grouping: TrackedWorkItem): TrackedWorkItem[] {
  return orderTrackedItems(
    inScopeConsumers(board, grouping).filter((consumer) =>
      isInAreaPaths(consumer.areaPath, board.session.selectedAreaPaths),
    ),
    (consumer) => consumer,
    board.session.policy,
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
 * Keep the page URL naming the header's area paths, so the address bar is always a shareable link
 * to exactly the board on screen.
 */
function writeAreaPathUrl(board: Board): void {
  replacePageSearch(board.context.doc, (search) =>
    consumersSearchWithAreaPaths(search, board.session.selectedAreaPaths),
  );
}

/**
 * Persist a dropped consumer or request and repaint once Azure DevOps has accepted it.
 *
 * A request handed to another consumer re-parents it under the same guarded write that ranks it;
 * its type never changes, because on this board a level is a role, not a type hierarchy.
 */
function persistMove(board: Board, loaded: LoadedConsumers | null, move: PlannedMove): void {
  const { services } = board.context;
  const team = services.currentTeam();
  const grouping = loaded?.grouping ?? null;
  if (grouping === null || team === null) {
    services.logger.error(
      `Consumers View move of item ${move.id} aborted: ${
        team === null
          ? "no team is configured, and backlog rank is per team in Azure DevOps"
          : "the board no longer shows a grouping item"
      }.`,
    );
    return;
  }
  void persistTreeMove({
    root: grouping,
    move,
    team,
    queue: board.queue,
    logger: services.logger,
  }).then((changed) => {
    if (!changed) return;
    // Opened so the request is visible where it landed rather than vanishing into a closed row.
    board.session.collapsedIds.delete(move.parentId);
    board.paintList();
  });
}

/** The row context for one paint: the session's live state plus what the filters keep. */
function createRowContext(
  board: Board,
  loaded: LoadedConsumers,
  grouping: TrackedWorkItem,
): ConsumerRowContext {
  const { context, session } = board;
  const draggable =
    dragReorderUnavailableReason(context.services.currentTeam(), session.policy) === null;
  return {
    doc: context.doc,
    types: loaded.types,
    boardColumns: loaded.boardColumns,
    queue: board.queue,
    services: context.services,
    statusWidthCh: widestStatusLabelLength(grouping.children, loaded.types),
    now: () => context.services.now(),
    policy: session.policy,
    collapsedIds: session.collapsedIds,
    expandedDescriptionIds: session.expandedDescriptionIds,
    expandedNoteIds: session.expandedNoteIds,
    notePanelStates: session.notePanelStates,
    mentionNames: context.services.mentionDirectory.knownNames(),
    groupingId: grouping.id,
    consumerSiblingIds: orderTrackedItems(grouping.children, (item) => item, session.policy).map(
      (consumer) => consumer.id,
    ),
    dragReorder: draggable ? board.dragReorder : null,
    contactEditor: board.contactEditor,
    contactRoles: contactRolesIn(grouping.children.map((consumer) => consumer.description)),
    onContextMenu: (item, event) =>
      board.contextMenu.openAt(event, {
        id: item.id,
        url: buildWorkItemUrl(context.doc.location?.href ?? "", item.id),
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
        ],
      }),
    repaint: () => board.paintList(),
  };
}

/** The consumers the filters keep, or the panel saying why there are none to draw. */
function renderConsumersList(
  board: Board,
  grouping: TrackedWorkItem,
  consumers: readonly TrackedWorkItem[],
  rowContext: ConsumerRowContext,
): HTMLElement {
  const { doc } = board.context;
  if (grouping.children.length === 0) {
    return renderEmptyState(doc, {
      message: "This query returned no consumers.",
      hint: "Link consumers under the query's top-level item in Azure DevOps, then refresh this board.",
    });
  }
  // Only the binding can hide every consumer: the header filter offers just the areas the kept
  // consumers sit in, so any pick from it keeps at least one of them.
  if (consumers.length === 0) {
    return renderEmptyState(doc, {
      message: "None of this query's consumers sit in this board's consumer area paths.",
      hint: "Change the consumer area paths in the query's binding, or the consumers' area in Azure DevOps, then refresh this board.",
    });
  }
  const list = doc.createElement("div");
  list.className = `${PREFIX}__list`;
  // No gap between rows: the alternating stripes are what separates one item from the next.
  list.style.cssText = "display:flex;flex-direction:column";
  for (const consumer of consumers) list.append(renderConsumerRow(consumer, rowContext));
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
  const requests = consumers.reduce((sum, consumer) => sum + consumer.children.length, 0);
  return (
    `Consumers View showing ${consumers.length} of ${grouping.children.length} consumer(s), ` +
    `with ${requests} feature request(s): configuredAreaPaths=${board.configuredAreaPaths.length}, ` +
    `selectedAreaPaths=${board.session.selectedAreaPaths.size}.`
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
  return {
    list: renderConsumersList(board, loaded.grouping, consumers, rowContext),
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
  const board: Board = {
    context,
    session: {
      collapsedIds: new Set(),
      expandedDescriptionIds: new Set(),
      expandedNoteIds: new Set(),
      notePanelStates: new Map(),
      selectedAreaPaths: new Set(readConsumersUrlAreaPaths(context.doc.location?.search ?? "")),
      policy: orderingPolicyOf(context.properties),
    },
    configuredAreaPaths: consumerAreaPaths(context.properties),
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
    }),
    dragReorder: new DragReorderController(
      context.doc,
      (move) => persistMove(board, hooks.loaded(), move),
      context.services.logger,
      // Consumers stay consumers and requests stay requests: a drop may reorder a level or hand a
      // request to another consumer, but never nest a consumer or lift a request to the top.
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
  // Requests are always leaves here, so the consumers with a request are the tree's only level.
  const levels = [consumers.filter((consumer) => consumer.children.length > 0).map(({ id }) => id)];
  const step =
    direction === "expand"
      ? expandStep(session, levels)
      : collapseStep(session, shownItemIds(consumers, session.collapsedIds), levels);
  board.context.services.logger.info(
    `Consumers View ${direction}: ${step ?? `nothing left to ${direction}`}.`,
  );
  board.paintList();
}

/** Every item on screen: the shown consumers, and the requests of each one that is open. */
function shownItemIds(
  consumers: readonly TrackedWorkItem[],
  collapsedIds: ReadonlySet<number>,
): number[] {
  return consumers.flatMap((consumer) =>
    collapsedIds.has(consumer.id)
      ? [consumer.id]
      : [consumer.id, ...consumer.children.map(({ id }) => id)],
  );
}
/** The header, wired to this board's session; rebuilt only by a full paint. */
function renderHeader(
  board: Board,
  loaded: LoadedConsumers,
  handlers: { queueStatus: HTMLElement; paint(): void; onRefresh(): void },
): ViewTitleBandHandle {
  const { context, session } = board;
  const areaPathFilter = renderRetainedAreaPathFilter(context.doc, {
    areaPaths:
      loaded.grouping === null
        ? []
        : representedAreaPaths(inScopeConsumers(board, loaded.grouping)),
    selection: session.selectedAreaPaths,
    onChange: (selected) => {
      context.services.logger.info(
        `Consumers View area-path filter: selectedCount=${selected.length}.`,
      );
      writeAreaPathUrl(board);
      board.paintList();
    },
  });
  // After the filter pruned paths this load no longer offers, so a link naming a path the board
  // cannot show leaves an address bar describing the board actually on screen.
  writeAreaPathUrl(board);
  const grouping = loaded.grouping;
  return renderConsumersHeader(context, {
    breadcrumbs: queryFolderBreadcrumbs(loaded.result.folderPath, context.doc.location?.href ?? ""),
    title: grouping?.title ?? consumersViewType.label,
    titleColor: workItemTypeDisplayColor(
      grouping === null ? null : loaded.types.get(grouping.type)?.color,
    ),
    policy: session.policy,
    dragReorderUnavailable: (policy) =>
      dragReorderUnavailableReason(context.services.currentTeam(), policy),
    queueStatus: handlers.queueStatus,
    areaPathFilter: areaPathFilter.element,
    onOrderingChange: (policy) => {
      session.policy = policy;
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
      onRefresh: () => loader.refresh(),
    });
    root.replaceChildren(header.element, rowStyle, listHost);
    paintList();
    resolveConsumerMentions(context.services, loaded.result.roots, paintList);
    header.refresh.setFailed(loader.refreshFailed());
  };

  const loader = createBoardLoader({
    fetch: () => loadConsumers(context),
    paint,
    showMessage: (message) => showMessage(context, root, message),
    loadingMessage: "Loading consumers…",
    failureLogMessage: "Consumers View could not load the query",
    logger: context.services.logger,
    openDiagnosticsLog: context.services.openDiagnosticsLog,
    queue: board.queue,
    refreshButton: () => header?.refresh ?? null,
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
