import type { WorkItemTreeResult } from "../../../common/ado/IWorkItemTreeLoader";
import type { TeamMember, TeamMembersResult } from "../../../common/ado/TeamMembers";
import type {
  TrackedUser,
  TrackedWorkItem,
  TypeCatalogEntry,
} from "../../../common/ado/TrackedWorkItem";
import { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { buildQueryFolderUrl, buildWorkItemUrl } from "../../../common/ado/fetchAdoTree";
import { filterTreeForSprintRoster, wiqlForSprint } from "../../../common/ado/sprintQuery";
import type { SprintWindow, SprintWindowEntry } from "../../../common/ado/sprintWindow";
import {
  primaryWorkAncestors,
  primaryWorkWithDescendants,
  workItemTypeTextColor,
} from "../../../common/ado/workItemTypes";
import { MANUAL_ORDERING_POLICY, type OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import { WORK_ITEM_MARKERS, type WorkItemMarker } from "../../../common/settings/ExtensionSettings";
import {
  selectedAreaPathsForSprint,
  withSprintAreaPathSelection,
  type SprintAreaPathConfiguration,
  type SprintAreaPaths,
} from "../../../common/settings/SprintAreaPaths";
import type {
  DataDrivenViewContext,
  EnhancedView,
  EnhancedViewContext,
} from "../../../common/view-common/EnhancedView";
import { renderActivityFilterPills } from "../../../common/view-common/control/ActivityFilter/ActivityFilterPanel";
import { RecentNotesIndex } from "../../../common/view-common/control/ActivityFilter/RecentNotesIndex";
import {
  activityFilterInForce,
  matchesRecentActivity,
  recentWindowStart,
  type RecentActivityKind,
} from "../../../common/view-common/control/ActivityFilter/recentActivity";
import { renderAreaPathFilter } from "../../../common/view-common/control/AreaPathFilter/AreaPathFilter";
import {
  appendFilterPillCounts,
  filterPillStyle,
  renderFilterPillFamilies,
  type FilterPillCounts,
} from "../../../common/view-common/control/FilterPill/FilterPill";
import {
  renderRefreshButton,
  type RefreshButtonHandle,
} from "../../../common/view-common/control/HeaderButtons/HeaderButtons";
import {
  renderHierarchyFilter,
  type HierarchyFilterOption,
} from "../../../common/view-common/control/HierarchyFilter/HierarchyFilter";
import {
  createItemContextMenu,
  type ItemContextMenu,
  type ItemContextMenuCommand,
  type ItemContextMenuTarget,
} from "../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import { renderMarkerFilterPills } from "../../../common/view-common/control/MarkerPill/MarkerFilterPills";
import { itemHasMarker } from "../../../common/view-common/control/MarkerPill/markerPresence";
import { renderOrderingPicker } from "../../../common/view-common/control/OrderingPicker/OrderingPicker";
import {
  renderSprintPicker,
  sprintRelationDeclarations,
} from "../../../common/view-common/control/SprintPicker/SprintPicker";
import { renderViewScaffold } from "../../../common/view-common/control/ViewScaffold/ViewScaffold";
import { renderWriteQueueStatus } from "../../../common/view-common/control/WriteQueueStatus/WriteQueueStatus";
import type { WriteQueueStatusHandle } from "../../../common/view-common/control/WriteQueueStatus/WriteQueueStatus";
import {
  loadInterruptAcceptanceState,
  type InterruptAcceptanceState,
} from "../interrupt-acceptance/interruptAcceptanceState";
import { buildItemCommands } from "../project-tracking/item-commands/ItemCommands";
import { buildMarkerCommands } from "../project-tracking/item-commands/MarkerCommands";

import { renderSprintBoard, type SprintBoardItem } from "./SprintBoard";
import { SprintBulkMoveController, type SprintBulkMoveRequest } from "./SprintBulkMoveController";
import { renderSprintHeader } from "./SprintHeader";
import {
  sprintDefaultAreaPaths,
  sprintOrderingPolicy,
  sprintRecentChangesHours,
  sprintViewType,
} from "./sprintViewType";

const UNASSIGNED_KEY = "__unassigned__";

interface SprintSession {
  sprintName: string | null;
  selectedAreaPaths: Set<string>;
  selectedParentId: number | null;
  selectedPeople: Set<string>;
  selectedMarkers: Set<WorkItemMarker>;
  selectedActivity: Set<RecentActivityKind>;
  recentNotes: RecentNotesIndex;
  repaintQueuedOnNotes: boolean;
  expandedDoneIds: Set<number>;
  openChildPopupIds: Set<number>;
  orderingPolicy: OrderingPolicy | null;
}

interface LoadedSprintData {
  result: WorkItemTreeResult;
  sprintWindow: SprintWindow;
  teamMembers: TeamMembersResult;
  interruptAcceptance: InterruptAcceptanceState;
  queryWiql: string;
  selectedOffset: number;
  selectedSprint: SprintWindowEntry | null;
  sprintAreaPaths: SprintAreaPaths;
}

interface DisplayItem extends SprintBoardItem {
  item: TrackedWorkItem;
  parent: TrackedWorkItem | null;
  ancestors: readonly TrackedWorkItem[];
  depth: number;
  ancestorIds: number[];
  chain: string[];
}

interface SprintBoardHandle {
  refresh: RefreshButtonHandle;
  queueStatus: WriteQueueStatusHandle;
  bulkMoveStatus: HTMLElement;
}

interface StickyHeaderObservation {
  resizeObserver?: ResizeObserver;
  stop(): void;
}

const stickyHeaderObservers = new WeakMap<HTMLElement, StickyHeaderObservation>();

function stopObservingStickyHeader(root: HTMLElement): void {
  stickyHeaderObservers.get(root)?.stop();
  stickyHeaderObservers.delete(root);
}

function updateStickyColumnHeader(root: HTMLElement, boardHeader: HTMLElement): void {
  const stickyTop = Number.parseFloat(
    root.style.getPropertyValue("--awesomeado-sprint-column-header-top"),
  );
  const stickyViewportTop = (root.parentElement?.getBoundingClientRect().top ?? 0) + stickyTop;
  const bounds = boardHeader.getBoundingClientRect();
  const isSticky = bounds.top <= stickyViewportTop + 0.5 && bounds.bottom > stickyViewportTop;
  boardHeader.toggleAttribute("data-stuck", isSticky);
  for (const heading of boardHeader.querySelectorAll<HTMLElement>(
    ".awesomeado-sprint__column-title",
  )) {
    const background = isSticky
      ? heading.dataset.stickyBackground
      : heading.dataset.restingBackground;
    const opacity = isSticky ? heading.dataset.stickyOpacity : heading.dataset.restingOpacity;
    if (background !== undefined) {
      heading.style.setProperty("--sprint-column-header-background", background);
    }
    if (opacity !== undefined) {
      heading.style.setProperty("--sprint-column-header-opacity", opacity);
    }
  }
}

function observeStickyHeader(root: HTMLElement): void {
  stopObservingStickyHeader(root);
  const header = root.querySelector<HTMLElement>(".awesomeado-sprint__header");
  if (header === null) return;
  const boardHeader = root.querySelector<HTMLElement>(".awesomeado-sprint__board-header");
  if (boardHeader === null) return;
  const scrollport = root.parentElement;
  if (scrollport === null) return;
  const updateHeader = (): void => updateStickyColumnHeader(root, boardHeader);
  const updateOffset = (): void => {
    const margin = Number.parseFloat(header.style.marginBottom) || 0;
    root.style.setProperty(
      "--awesomeado-sprint-column-header-top",
      `${header.offsetHeight + margin / 2}px`,
    );
    root.style.setProperty(
      "--awesomeado-sprint-board-header-height",
      `${boardHeader.offsetHeight}px`,
    );
    updateStickyColumnHeader(root, boardHeader);
  };
  updateOffset();
  scrollport.addEventListener("scroll", updateHeader);
  root.ownerDocument.defaultView?.addEventListener("resize", updateHeader);
  const ResizeObserverConstructor = root.ownerDocument.defaultView?.ResizeObserver;
  const resizeObserver =
    ResizeObserverConstructor === undefined
      ? undefined
      : new ResizeObserverConstructor(updateOffset);
  resizeObserver?.observe(header);
  resizeObserver?.observe(boardHeader);
  stickyHeaderObservers.set(root, {
    resizeObserver,
    stop: () => {
      resizeObserver?.disconnect();
      scrollport.removeEventListener("scroll", updateHeader);
      root.ownerDocument.defaultView?.removeEventListener("resize", updateHeader);
    },
  });
}

interface SprintWriteState {
  pending: number;
  failed: number;
  lastError?: string;
}

interface SprintHeaderRenderOptions {
  context: DataDrivenViewContext;
  data: LoadedSprintData;
  session: SprintSession;
  areaPaths: readonly string[];
  projectOptions: readonly HierarchyFilterOption[];
  baseItems: readonly DisplayItem[];
  types: ReadonlyMap<string, TypeCatalogEntry>;
  repaint: () => void;
  onRefresh: () => void;
  onSprintChange: (name: string) => void;
  onAreaPathsChange: (paths: string[]) => void;
  onAreaPathsDismiss: () => void;
  onTitleContextMenu: (event: MouseEvent) => void;
  writeState: SprintWriteState;
}

function queryBreadcrumbs(result: WorkItemTreeResult, href: string) {
  return (result.folderPath ?? []).map((folder) => {
    const url = buildQueryFolderUrl(href, folder.path);
    return url === null ? { label: folder.label } : { label: folder.label, url };
  });
}

function markerPrefixes(context: DataDrivenViewContext): string[] {
  const tags = context.services.markerTags();
  return WORK_ITEM_MARKERS.map(({ key }) => tags[key].commentTag).filter(
    (prefix) => prefix.length > 0,
  );
}

function createSession(context: DataDrivenViewContext): SprintSession {
  return {
    sprintName: null,
    selectedAreaPaths: new Set<string>(),
    selectedParentId: null,
    selectedPeople: new Set<string>(),
    selectedMarkers: new Set<WorkItemMarker>(),
    selectedActivity: new Set<RecentActivityKind>(),
    recentNotes: new RecentNotesIndex(
      context.services.noteActivity,
      context.services.logger,
      markerPrefixes(context),
    ),
    repaintQueuedOnNotes: false,
    expandedDoneIds: new Set<number>(),
    openChildPopupIds: new Set<number>(),
    orderingPolicy: null,
  };
}

function flattenItems(roots: readonly TrackedWorkItem[]): DisplayItem[] {
  const result: DisplayItem[] = [];
  const visit = (
    item: TrackedWorkItem,
    depth: number,
    ancestorIds: number[],
    ancestors: TrackedWorkItem[],
    chain: string[],
    parent: TrackedWorkItem | null,
  ): void => {
    const nextChain = [...chain, item.title];
    result.push({ item, parent, ancestors, depth, ancestorIds, chain: nextChain });
    for (const child of item.children) {
      visit(child, depth + 1, [...ancestorIds, item.id], [...ancestors, item], nextChain, item);
    }
  };
  for (const root of roots) visit(root, 0, [], [], [], null);
  return result;
}

function personKey(user: TrackedUser | TeamMember | null): string {
  if (user === null) return UNASSIGNED_KEY;
  return (user.uniqueName ?? user.displayName).trim().toLocaleLowerCase();
}

function isActiveItem(
  item: TrackedWorkItem,
  types: ReadonlyMap<string, TypeCatalogEntry>,
): boolean {
  const type = types.get(item.type);
  return (
    type?.columns[1]?.states.some(
      (state) => state.toLocaleLowerCase() === item.state.toLocaleLowerCase(),
    ) === true
  );
}

function metricsFor(
  items: readonly DisplayItem[],
  types: ReadonlyMap<string, TypeCatalogEntry>,
): FilterPillCounts {
  return {
    total: items.length,
    active: items.filter(({ item }) => isActiveItem(item, types)).length,
  };
}

function isDeliveryWorkItem(item: TrackedWorkItem, workTypes: ReadonlySet<string>): boolean {
  return workTypes.has(item.type);
}

function selectedSprintEntry(
  window: SprintWindow,
  session: SprintSession,
): SprintWindowEntry | undefined {
  return window.entries.find((entry) => entry.name === session.sprintName);
}

function normalizeSprintSelection(window: SprintWindow, session: SprintSession): void {
  if (!window.entries.some((entry) => entry.name === session.sprintName)) {
    session.sprintName = window.currentName ?? window.entries[0]?.name ?? null;
  }
}

function selectedSprintOffset(
  window: SprintWindow,
  selected: SprintWindowEntry | undefined,
): number {
  const selectedIndex = selected === undefined ? -1 : window.entries.indexOf(selected);
  const currentIndex = window.entries.findIndex((entry) => entry.name === window.currentName);
  return selectedIndex - (currentIndex === -1 ? selectedIndex : currentIndex);
}

function loadQueryDefinition(context: DataDrivenViewContext) {
  return (
    context.services.loadQueryDefinition?.(context.queryId) ??
    Promise.resolve({ wiql: null, error: "Query definition loading is unavailable." })
  );
}

async function loadSprintData(
  context: DataDrivenViewContext,
  session: SprintSession,
): Promise<LoadedSprintData> {
  const definitionPromise = loadQueryDefinition(context);
  const teamMembersPromise = context.services.loadTeamMembers();
  const [sprintWindow, areaConfiguration] = await Promise.all([
    context.services.loadSprintWindow(),
    loadSprintAreaPathConfiguration(context),
  ]);
  normalizeSprintSelection(sprintWindow, session);
  const selectedSprint = selectedSprintEntry(sprintWindow, session) ?? null;
  session.selectedAreaPaths = new Set(
    selectedAreaPathsForSprint(
      sprintDefaultAreaPaths(context.properties),
      selectedSprint === null ? undefined : areaConfiguration.sprintAreaPaths[selectedSprint.path],
    ),
  );
  const offset = selectedSprintOffset(sprintWindow, selectedSprint ?? undefined);
  const [teamMembers, definition] = await Promise.all([teamMembersPromise, definitionPromise]);
  if (teamMembers.error !== null) throw new Error(teamMembers.error);
  if (definition.error !== null || definition.wiql === null) {
    throw new Error(definition.error ?? "The saved query has no WIQL body.");
  }
  const loaded = await context.services.loadTree(
    context.queryId,
    wiqlForSprint(definition.wiql, offset),
  );
  if (loaded.error !== null) throw new Error(loaded.error);
  const result: WorkItemTreeResult = {
    ...loaded,
    roots: filterTreeForSprintRoster(loaded.roots, teamMembers.members),
  };
  context.services.logger.info(
    `Sprint View loaded query ${context.queryId}: items=${flattenItems(result.roots).length}, ` +
      `teamMembers=${teamMembers.members.length}.`,
  );
  return {
    result,
    sprintWindow,
    teamMembers,
    interruptAcceptance: { acceptedIds: new Set<number>(), failedIds: new Set<number>() },
    queryWiql: definition.wiql,
    selectedOffset: offset,
    selectedSprint,
    sprintAreaPaths: areaConfiguration.sprintAreaPaths,
  };
}

async function loadSprintAreaPathConfiguration(
  context: DataDrivenViewContext,
): Promise<SprintAreaPathConfiguration> {
  return (
    (await context.services.sprintAreaPaths?.read()) ?? {
      sprintAreaPaths: {},
    }
  );
}

function hierarchyOptions(
  items: readonly DisplayItem[],
  shownItems: readonly DisplayItem[],
  types: ReadonlyMap<string, TypeCatalogEntry>,
): HierarchyFilterOption[] {
  const parentIds = new Set(shownItems.flatMap(({ ancestorIds }) => ancestorIds));
  const projectTypes = primaryWorkAncestors([...types.values()]);
  return items
    .filter(({ item }) => parentIds.has(item.id) && projectTypes.has(item.type))
    .map(({ item, depth }) => {
      const type = types.get(item.type);
      return {
        id: item.id,
        label: item.title,
        title: item.title,
        typeName: item.type,
        iconUrl: type?.icon ?? null,
        color: workItemTypeTextColor(type?.color),
        depth,
      };
    });
}

function normalizeProjectSelection(
  options: readonly HierarchyFilterOption[],
  session: SprintSession,
): void {
  if (!options.some((option) => option.id === session.selectedParentId)) {
    session.selectedParentId = null;
  }
}

function areaPathsOf(items: readonly DisplayItem[]): string[] {
  const paths = [
    ...new Set(
      items
        .map(({ item }) => item.areaPath)
        .filter((path): path is string => path !== null && path.length > 0),
    ),
  ];
  return paths
    .filter((path) => !paths.some((other) => other.startsWith(`${path}\\`)))
    .sort((left, right) => left.localeCompare(right));
}

function availableAreaPaths(
  areaPaths: readonly string[],
  selectedAreaPaths: readonly string[],
): string[] {
  const availableByKey = new Map(
    areaPaths.map((path) => [path.toLocaleLowerCase(), path] as const),
  );
  return selectedAreaPaths.map((path) => {
    const exact = availableByKey.get(path.toLocaleLowerCase());
    if (exact !== undefined) return exact;
    const parts = path.split("\\");
    if (parts.length > 2 && parts[1]?.toLocaleLowerCase() === "area") {
      const workItemPath = [parts[0], ...parts.slice(2)].join("\\");
      return availableByKey.get(workItemPath.toLocaleLowerCase()) ?? path;
    }
    return path;
  });
}

function pruneSelectedAreaPaths(areaPaths: readonly string[], session: SprintSession): void {
  session.selectedAreaPaths = new Set(
    availableAreaPaths(areaPaths, [...session.selectedAreaPaths]).filter((path) =>
      areaPaths.includes(path),
    ),
  );
}

function areaScope(items: readonly DisplayItem[], session: SprintSession): DisplayItem[] {
  return items.filter(({ item }) => {
    const areaMatches =
      session.selectedAreaPaths.size === 0 ||
      (item.areaPath !== null && session.selectedAreaPaths.has(item.areaPath));
    return areaMatches;
  });
}

function boardScope(items: readonly DisplayItem[], session: SprintSession): DisplayItem[] {
  return areaScope(items, session).filter(({ item, ancestorIds }) => {
    const parentMatches =
      session.selectedParentId === null ||
      item.id === session.selectedParentId ||
      ancestorIds.includes(session.selectedParentId);
    return parentMatches;
  });
}

function selectedSprintItems(items: readonly DisplayItem[], session: SprintSession): DisplayItem[] {
  return items.filter(({ item }) => item.sprintName === session.sprintName);
}

function baseQueue(items: readonly DisplayItem[], session: SprintSession): DisplayItem[] {
  return selectedSprintItems(boardScope(items, session), session);
}

function filteredQueue(
  items: readonly DisplayItem[],
  context: DataDrivenViewContext,
  session: SprintSession,
): DisplayItem[] {
  const markerTags = context.services.markerTags();
  const hours = sprintRecentChangesHours(context.properties);
  const sinceMs = recentWindowStart(context.services.now(), hours);
  const activity = activityFilterInForce(session.selectedActivity, session.recentNotes.isPending());
  return items.filter(({ item }) => {
    const personMatches =
      session.selectedPeople.size === 0 || session.selectedPeople.has(personKey(item.assignedTo));
    const markerMatches =
      session.selectedMarkers.size === 0 ||
      [...session.selectedMarkers].some((marker) => itemHasMarker(item, marker, markerTags));
    const activityMatches = matchesRecentActivity(item, {
      selected: activity,
      sinceMs,
      hasRecentNote: (candidate) => session.recentNotes.hasRecentNote(candidate, sinceMs),
    });
    return personMatches && markerMatches && activityMatches;
  });
}

function renderPersonPill(
  doc: Document,
  label: string,
  key: string,
  counts: FilterPillCounts,
  session: SprintSession,
  onChange: () => void,
): HTMLElement {
  const selected = session.selectedPeople.has(key);
  const pill = doc.createElement("button");
  pill.type = "button";
  pill.className = "awesomeado-sprint__person-pill";
  pill.dataset.person = key;
  pill.setAttribute("aria-pressed", String(selected));
  pill.style.cssText = filterPillStyle({
    background: "var(--control-background-muted)",
    color: "var(--text-primary-color)",
    selected,
  });
  pill.append(doc.createTextNode(label));
  appendFilterPillCounts(doc, pill, counts);
  pill.addEventListener("click", () => {
    if (selected) session.selectedPeople.delete(key);
    else session.selectedPeople.add(key);
    onChange();
  });
  return pill;
}

function renderTeamPills(
  doc: Document,
  members: readonly TeamMember[],
  items: readonly DisplayItem[],
  types: ReadonlyMap<string, TypeCatalogEntry>,
  session: SprintSession,
  onChange: () => void,
): HTMLElement[] {
  const pills: HTMLElement[] = [];
  const workTypes = primaryWorkWithDescendants([...types.values()]);
  const countedItems = items.filter(({ item }) => isDeliveryWorkItem(item, workTypes));
  const validKeys = new Set(members.map(personKey));
  const unassigned = countedItems.filter(({ item }) => item.assignedTo === null);
  if (unassigned.length > 0) validKeys.add(UNASSIGNED_KEY);
  for (const selected of [...session.selectedPeople]) {
    if (!validKeys.has(selected)) session.selectedPeople.delete(selected);
  }
  for (const member of members) {
    const key = personKey(member);
    const assigned = countedItems.filter(({ item }) => personKey(item.assignedTo) === key);
    pills.push(
      renderPersonPill(
        doc,
        member.displayName,
        key,
        metricsFor(assigned, types),
        session,
        onChange,
      ),
    );
  }
  if (unassigned.length > 0) {
    pills.push(
      renderPersonPill(
        doc,
        "Unassigned",
        UNASSIGNED_KEY,
        metricsFor(unassigned, types),
        session,
        onChange,
      ),
    );
  }
  return pills;
}

function renderMarkerPills(
  context: DataDrivenViewContext,
  scopedItems: readonly DisplayItem[],
  acceptedItems: readonly DisplayItem[],
  interruptAcceptance: InterruptAcceptanceState,
  session: SprintSession,
  onChange: () => void,
): HTMLElement[] {
  const markerTags = context.services.markerTags();
  return renderMarkerFilterPills(context.doc, {
    markers: WORK_ITEM_MARKERS.map(({ key }) => key),
    markerTags,
    selected: session.selectedMarkers,
    countsFor: (marker) => {
      const matching = scopedItems.filter(({ item }) => itemHasMarker(item, marker, markerTags));
      // An Interrupt is counted against the sprint it was accepted in; every other marker is simply
      // "carried right now", so its total is the accepted-scope count.
      const accepted =
        marker === "interrupt"
          ? matching.filter(({ item }) => interruptAcceptance.acceptedIds.has(item.id))
          : acceptedItems.filter(({ item }) => itemHasMarker(item, marker, markerTags));
      return {
        total: marker === "interrupt" ? matching.length : accepted.length,
        acceptedInSprint: marker === "interrupt" ? accepted.length : undefined,
      };
    },
    onChange,
  });
}

function scheduleNotesRepaint(
  data: LoadedSprintData,
  session: SprintSession,
  repaint: () => void,
): void {
  if (!session.selectedActivity.has("notes")) return;
  session.recentNotes.ensureItemsProbed(data.result.roots);
  if (!session.recentNotes.isPending() || session.repaintQueuedOnNotes) return;
  session.repaintQueuedOnNotes = true;
  void session.recentNotes.whenSettled().then(() => {
    session.repaintQueuedOnNotes = false;
    repaint();
  });
}

function renderFilterPanel(
  context: DataDrivenViewContext,
  scopedItems: readonly DisplayItem[],
  acceptedItems: readonly DisplayItem[],
  interruptAcceptance: InterruptAcceptanceState,
  session: SprintSession,
  onChange: () => void,
): HTMLElement {
  const panel = context.doc.createElement("div");
  panel.className = "awesomeado-sprint__filters";
  panel.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "flex-wrap:wrap",
    "padding:0 4px 12px",
  ].join(";");
  const label = context.doc.createElement("span");
  label.textContent = "Filters:";
  label.style.cssText = "font-size:11px;font-weight:600;color:var(--text-secondary-color)";
  const markerPills = renderMarkerPills(
    context,
    scopedItems,
    acceptedItems,
    interruptAcceptance,
    session,
    onChange,
  );
  const activityPills = renderActivityFilterPills(context.doc, {
    selected: session.selectedActivity,
    windowHours: sprintRecentChangesHours(context.properties),
    notesPending: session.recentNotes.isPending(),
    onChange,
  });
  panel.append(
    label,
    renderFilterPillFamilies(context.doc, [
      { name: "other", pills: markerPills },
      { name: "activity", pills: activityPills },
    ]),
  );
  return panel;
}

function renderHeaderStatuses(options: SprintHeaderRenderOptions): {
  refresh: RefreshButtonHandle;
  queueStatus: WriteQueueStatusHandle;
  bulkMoveStatus: HTMLElement;
} {
  const { context } = options;
  const refresh = renderRefreshButton(context.doc, "awesomeado-sprint__refresh");
  refresh.element.addEventListener("click", options.onRefresh);
  const queueStatus = renderWriteQueueStatus(context.doc, {
    onOpenLog: context.services.openDiagnosticsLog,
  });
  queueStatus.setCount(options.writeState.pending);
  queueStatus.setFailedCount(options.writeState.failed, options.writeState.lastError);
  const bulkMoveStatus = context.doc.createElement("span");
  bulkMoveStatus.className = "awesomeado-sprint__bulk-move-status";
  bulkMoveStatus.style.cssText = "display:inline-flex;align-items:center;margin-right:8px";
  return { refresh, queueStatus, bulkMoveStatus };
}

function renderBoardHeader(options: SprintHeaderRenderOptions): {
  header: HTMLElement;
  refresh: RefreshButtonHandle;
  queueStatus: WriteQueueStatusHandle;
  bulkMoveStatus: HTMLElement;
} {
  const { context, data, session, repaint } = options;
  const sprintPicker = renderSprintPicker(context.doc, {
    sprints: data.sprintWindow.entries,
    selectedName: session.sprintName,
    showFilterButton: false,
    onSprintChange: options.onSprintChange,
  });
  let laneSelectionChanged = false;
  const laneFilter = renderAreaPathFilter(context.doc, {
    label: "Lanes",
    areaPaths: options.areaPaths,
    selectedAreaPaths: [...session.selectedAreaPaths],
    onChange: (paths) => {
      laneSelectionChanged = true;
      options.onAreaPathsChange(paths);
    },
    onPopupClosed: () => {
      if (laneSelectionChanged) options.onAreaPathsDismiss();
    },
  });
  const projectFilter = renderHierarchyFilter(context.doc, {
    items: options.projectOptions,
    selectedId: session.selectedParentId,
    onChange: (id) => {
      session.selectedParentId = id;
      repaint();
    },
  });
  const { refresh, queueStatus, bulkMoveStatus } = renderHeaderStatuses(options);
  const currentOrderingPolicy = session.orderingPolicy ?? sprintOrderingPolicy(context.properties);
  const orderingPicker = renderOrderingPicker(context.doc, {
    policy: currentOrderingPolicy,
    dragReorderUnavailable: (policy) => {
      if (context.services.currentTeam() === null) {
        return "drag to reorder needs a team (set one in AwesomeADO options)";
      }
      return policy === MANUAL_ORDERING_POLICY
        ? null
        : "drag to reorder is only available when ordering by importance";
    },
    onChange: (policy) => {
      context.services.logger.info(
        `Sprint View ordering changed for this session: from=${currentOrderingPolicy}, ` +
          `to=${policy}, bindingPolicy=${sprintOrderingPolicy(context.properties)}.`,
      );
      session.orderingPolicy = policy;
      repaint();
    },
  });
  return {
    header: renderSprintHeader(context.doc, {
      breadcrumbs: queryBreadcrumbs(data.result, context.doc.location?.href ?? ""),
      orderingPicker,
      sprintPicker: sprintPicker.element,
      laneFilter: laneFilter.element,
      projectFilter: projectFilter.element,
      refresh,
      queueStatus: queueStatus.element,
      bulkMoveStatus,
      teamPills: renderTeamPills(
        context.doc,
        data.teamMembers.members,
        options.baseItems,
        options.types,
        session,
        repaint,
      ),
      onTitleContextMenu: options.onTitleContextMenu,
    }),
    refresh,
    queueStatus,
    bulkMoveStatus,
  };
}

const ALL_NOTES_SINCE = new Date(0).toISOString();

function sprintItemMenuTarget(params: {
  context: DataDrivenViewContext;
  item: TrackedWorkItem;
  writes: WorkItemWriteQueue;
  data: LoadedSprintData;
  areaPaths: readonly string[];
  repaint: () => void;
}): ItemContextMenuTarget {
  const target = {
    doc: params.context.doc,
    item: params.item,
    services: params.context.services,
    queue: params.writes,
    onChanged: params.repaint,
  };
  return {
    id: params.item.id,
    url: buildWorkItemUrl(params.context.doc.location?.href ?? "", params.item.id),
    commands: [
      ...buildItemCommands({
        ...target,
        sprintWindow: params.data.sprintWindow,
        areaPaths: params.areaPaths,
        notesSinceIso: ALL_NOTES_SINCE,
      }),
      ...buildMarkerCommands(target, params.data.interruptAcceptance),
    ],
  };
}

function bulkMoveLabel(doc: Document): Node[] {
  const done = doc.createElement("span");
  done.textContent = "DONE";
  done.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "margin:0 3px",
    "padding:0 5px",
    "border:1px solid var(--status-green-border)",
    "border-radius:8px",
    "background:var(--status-green-background)",
    "color:var(--completion-foreground)",
    "font-size:9px",
    "font-weight:700",
    "line-height:1.5",
  ].join(";");
  return [doc.createTextNode("Move all (non "), done, doc.createTextNode(") items to")];
}

function moveAllCommands(params: {
  data: LoadedSprintData;
  onBulkMove: (destination: SprintWindowEntry) => void;
}): ItemContextMenuCommand[] {
  return params.data.sprintWindow.entries
    .filter((entry) => entry.relation !== "past")
    .map((entry) => ({
      label: entry.label,
      declarations: sprintRelationDeclarations(entry.relation),
      run: () => params.onBulkMove(entry),
    }));
}

function sprintTitleMenuTarget(params: {
  context: DataDrivenViewContext;
  data: LoadedSprintData;
  session: SprintSession;
  onResetLanes: (paths: string[]) => void;
  onBulkMove: (destination: SprintWindowEntry) => void;
}): ItemContextMenuTarget {
  const destinations = (): ItemContextMenuCommand[] => moveAllCommands(params);
  const source = selectedSprintEntry(params.data.sprintWindow, params.session);
  const defaults = sprintDefaultAreaPaths(params.context.properties);
  const commands: ItemContextMenuCommand[] = [
    {
      label: "Reset lanes to default",
      disabledReason: defaults.length === 0 ? "No default area paths are configured." : null,
      run: () => params.onResetLanes(defaults),
    },
  ];
  if (source?.relation === "past") {
    commands.push({
      label: "Move all non-DONE items to",
      renderLabel: bulkMoveLabel,
      separatorBefore: true,
      disabledReason:
        destinations().length === 0 ? "No current or future sprint is configured." : null,
      submenu: destinations,
    });
  }
  return {
    id: 0,
    url: params.context.doc.location?.href ?? null,
    standardCommands: ["copy-url"],
    commands,
  };
}

function createSprintContextMenu(params: {
  context: DataDrivenViewContext;
  header: HTMLElement;
  data: LoadedSprintData;
  allItems: readonly DisplayItem[];
  types: ReadonlyMap<string, TypeCatalogEntry>;
  writes: WorkItemWriteQueue;
  areaPaths: readonly string[];
  repaint: () => void;
  session: SprintSession;
  visibleItems: readonly DisplayItem[];
  onBulkMove: (destination: SprintWindowEntry, items: readonly TrackedWorkItem[]) => void;
}): {
  menu: ItemContextMenu;
  target: (item: TrackedWorkItem) => ItemContextMenuTarget;
  openTitle: (event: MouseEvent) => void;
} {
  const menu = createItemContextMenu({
    doc: params.context.doc,
    mountInto: params.header,
    logger: params.context.services.logger,
  });
  return {
    menu,
    target: (item) => sprintItemMenuTarget({ ...params, item }),
    openTitle: (event) =>
      menu.openAt(
        event,
        sprintTitleMenuTarget({
          ...params,
          onResetLanes: (paths) => {
            persistSprintAreaPaths(
              params.context,
              params.data,
              params.session,
              availableAreaPaths(params.areaPaths, paths),
            );
            params.repaint();
          },
          onBulkMove: (destination) =>
            params.onBulkMove(
              destination,
              params.visibleItems.map(({ item }) => item),
            ),
        }),
      ),
  };
}

function renderSprintQueue(params: {
  context: DataDrivenViewContext;
  data: LoadedSprintData;
  session: SprintSession;
  visibleItems: readonly DisplayItem[];
  types: ReadonlyMap<string, TypeCatalogEntry>;
  writes: WorkItemWriteQueue;
  menus: ReturnType<typeof createSprintContextMenu>;
  repaint: () => void;
}): HTMLElement {
  const { context, data, session } = params;
  return renderSprintBoard(context, params.visibleItems, {
    types: params.types,
    boardColumns: context.services.getBoardColumns(),
    writes: params.writes,
    expandedDoneIds: session.expandedDoneIds,
    openChildPopupIds: session.openChildPopupIds,
    team: context.services.currentTeam(),
    assigneeSuggestions: () =>
      data.teamMembers.members.map(({ displayName, uniqueName, imageUrl }) => ({
        displayName,
        uniqueName,
        imageUrl,
      })),
    orderingPolicy: session.orderingPolicy ?? sprintOrderingPolicy(context.properties),
    interruptAcceptance: data.interruptAcceptance,
    notesSinceIso: ALL_NOTES_SINCE,
    contextMenu: params.menus.menu,
    menuTarget: params.menus.target,
    onItemChanged: params.repaint,
  });
}

function persistSprintAreaPaths(
  context: DataDrivenViewContext,
  data: LoadedSprintData,
  session: SprintSession,
  paths: string[],
): void {
  session.selectedAreaPaths = new Set(paths);
  if (data.selectedSprint !== null) {
    data.sprintAreaPaths = withSprintAreaPathSelection(
      data.sprintAreaPaths,
      data.selectedSprint,
      paths,
      context.services.now(),
    );
    void context.services.sprintAreaPaths?.save(data.sprintAreaPaths);
  }
}

function sprintBoardCollections(context: DataDrivenViewContext, data: LoadedSprintData) {
  const allItems = flattenItems(data.result.roots);
  return {
    allItems,
    areaPaths: areaPathsOf(allItems),
    types: new Map(context.services.getTypes().map((type) => [type.name, type])),
  };
}

function renderBoard(
  context: DataDrivenViewContext,
  data: LoadedSprintData,
  session: SprintSession,
  repaint: () => void,
  onRefresh: () => void,
  onSprintChange: (name: string) => void,
  writes: WorkItemWriteQueue,
  writeState: SprintWriteState,
  bulkMove: SprintBulkMoveController,
): { element: DocumentFragment; handle: SprintBoardHandle } {
  const { allItems, areaPaths, types } = sprintBoardCollections(context, data);
  pruneSelectedAreaPaths(areaPaths, session);
  scheduleNotesRepaint(data, session, repaint);
  const shownWithoutProject = filteredQueue(
    selectedSprintItems(areaScope(allItems, session), session),
    context,
    session,
  );
  const options = hierarchyOptions(allItems, shownWithoutProject, types);
  normalizeProjectSelection(options, session);
  const base = baseQueue(allItems, session);
  const visibleItems = filteredQueue(base, context, session);
  let openTitleMenu: (event: MouseEvent) => void = () => {};
  const controls = renderBoardHeader({
    context,
    data,
    session,
    areaPaths,
    projectOptions: options,
    baseItems: base,
    types,
    repaint,
    onRefresh,
    onSprintChange,
    onAreaPathsChange: (paths) => persistSprintAreaPaths(context, data, session, paths),
    onAreaPathsDismiss: repaint,
    onTitleContextMenu: (event) => openTitleMenu(event),
    writeState,
  });
  const menus = createSprintContextMenu({
    context,
    header: controls.header,
    data,
    allItems,
    types,
    writes,
    areaPaths,
    repaint,
    session,
    visibleItems,
    onBulkMove: (destination, items) => {
      const request = createBulkMoveRequest(context, data, session, destination, items, onRefresh);
      if (request !== null) bulkMove.open(request);
    },
  });
  openTitleMenu = menus.openTitle;
  bulkMove.attachStatus(controls.bulkMoveStatus);
  const fragment = context.doc.createDocumentFragment();
  fragment.append(
    controls.header,
    renderFilterPanel(
      context,
      boardScope(allItems, session),
      base,
      data.interruptAcceptance,
      session,
      repaint,
    ),
    renderSprintQueue({ context, data, session, visibleItems, types, writes, menus, repaint }),
  );
  return {
    element: fragment,
    handle: {
      refresh: controls.refresh,
      queueStatus: controls.queueStatus,
      bulkMoveStatus: controls.bulkMoveStatus,
    },
  };
}

function createBulkMoveRequest(
  context: DataDrivenViewContext,
  data: LoadedSprintData,
  session: SprintSession,
  destination: SprintWindowEntry,
  visibleItems: readonly TrackedWorkItem[],
  onSettled: () => void,
): SprintBulkMoveRequest | null {
  const source = selectedSprintEntry(data.sprintWindow, session);
  if (source?.relation !== "past") return null;
  const operationHref = context.doc.location?.href ?? "";
  return {
    source,
    destination,
    visibleItems,
    types: context.services.getTypes(),
    loadRoots: async () => {
      if ((context.doc.location?.href ?? "") !== operationHref) {
        throw new Error("The Azure DevOps page changed during the bulk move.");
      }
      const loaded = await context.services.loadTree(
        context.queryId,
        wiqlForSprint(data.queryWiql, data.selectedOffset),
      );
      if (loaded.error !== null) throw new Error(loaded.error);
      return filterTreeForSprintRoster(loaded.roots, data.teamMembers.members);
    },
    onSettled,
  };
}

function renderLoadFailure(context: EnhancedViewContext, root: HTMLElement, error: unknown): void {
  context.services?.logger.error("Sprint View failed to load", error);
  root.replaceChildren(
    renderViewScaffold(context.doc, {
      title: "Sprint View",
      message: "Could not load this sprint.",
    }),
  );
}

function observeWriteState(
  writes: WorkItemWriteQueue,
  state: SprintWriteState,
  currentBoard: () => SprintBoardHandle | null,
): void {
  writes.onPendingChange((count) => {
    state.pending = count;
    currentBoard()?.queueStatus.setCount(count);
  });
  writes.onWriteFailed((count, lastError) => {
    state.failed = count;
    state.lastError = lastError;
    currentBoard()?.queueStatus.setFailedCount(count, lastError);
  });
}

function createWriteQueue(context: DataDrivenViewContext): WorkItemWriteQueue {
  return new WorkItemWriteQueue(
    context.services.writeField,
    context.services.logger,
    context.services.reorderItem,
  );
}

function createBulkMoveController(
  context: DataDrivenViewContext,
  root: HTMLElement,
  writes: WorkItemWriteQueue,
): SprintBulkMoveController {
  return new SprintBulkMoveController({
    doc: context.doc,
    mountInto: root,
    writes,
    logger: context.services.logger,
    openDiagnosticsLog: context.services.openDiagnosticsLog,
  });
}

function showSprintLoading(context: DataDrivenViewContext, root: HTMLElement): void {
  stopObservingStickyHeader(root);
  const loading = context.doc.createElement("div");
  loading.className = "awesomeado-sprint__loading";
  loading.textContent = "Loading spring data...";
  loading.style.cssText = "padding:16px 0;text-align:center;color:var(--text-secondary-color)";
  root.replaceChildren(loading);
}

function resolveSprintAcceptance(
  context: DataDrivenViewContext,
  loaded: LoadedSprintData,
  isCurrent: () => boolean,
  repaint: () => void,
): void {
  void loadInterruptAcceptanceState(loaded.result.roots, context.services)
    .then((acceptance) => {
      if (!isCurrent()) return;
      loaded.interruptAcceptance = acceptance;
      repaint();
    })
    .catch((error: unknown) => {
      context.services.logger.error("Sprint View could not resolve interrupt acceptance", error);
    });
}

function createSprintRuntime(
  context: DataDrivenViewContext,
  root: HTMLElement,
  writes: WorkItemWriteQueue,
  writeState: SprintWriteState,
  currentBoard: () => SprintBoardHandle | null,
): SprintBulkMoveController {
  const bulkMove = createBulkMoveController(context, root, writes);
  observeWriteState(writes, writeState, currentBoard);
  return bulkMove;
}

function startSprintView(context: DataDrivenViewContext, root: HTMLElement): void {
  let session = createSession(context);
  let data: LoadedSprintData | null = null;
  let board: SprintBoardHandle | null = null;
  let refreshing = false;
  let loadGeneration = 0;
  let refreshFailed = false;
  const writes = createWriteQueue(context);
  const writeState: SprintWriteState = { pending: 0, failed: 0 };
  const bulkMove = createSprintRuntime(context, root, writes, writeState, () => board);

  const paint = (): void => {
    if (data === null) return;
    const rendered = renderBoard(
      context,
      data,
      session,
      paint,
      requestRefresh,
      switchSprint,
      writes,
      writeState,
      bulkMove,
    );
    board = rendered.handle;
    board.refresh.setFailed(refreshFailed);
    root.replaceChildren(rendered.element);
    queueMicrotask(() => observeStickyHeader(root));
  };

  const load = (sprintName: string | null, resetSession: boolean): void => {
    if (refreshing) return;
    if (!resetSession && refreshFailed) {
      refreshFailed = false;
      context.services.openDiagnosticsLog();
      return;
    }
    if (resetSession) session = createSession(context);
    session.sprintName = sprintName;
    const previousData = data;
    refreshing = true;
    data = null;
    board = null;
    const generation = ++loadGeneration;
    showSprintLoading(context, root);
    void loadSprintData(context, session)
      .then((loaded) => {
        if (generation !== loadGeneration) return;
        refreshFailed = false;
        data = loaded;
        paint();
        resolveSprintAcceptance(
          context,
          loaded,
          () => generation === loadGeneration && data === loaded,
          paint,
        );
      })
      .catch((error: unknown) => {
        if (!resetSession && previousData !== null) {
          context.services.logger.error("Sprint View could not refresh", error);
          refreshFailed = true;
          data = previousData;
          paint();
          return;
        }
        renderLoadFailure(context, root, error);
      })
      .finally(() => {
        if (generation === loadGeneration) refreshing = false;
      });
  };

  function requestRefresh(): void {
    if (bulkMove.isActive) return;
    load(session.sprintName, false);
  }

  function switchSprint(name: string): void {
    if (bulkMove.isActive) return;
    load(name, true);
  }

  load(null, true);
}

/**
 * Sprint View's first data-driven slice: sprint/team/header filters plus a minimal item queue.
 */
export const sprintView: EnhancedView = {
  id: sprintViewType.id,
  render: (context) => {
    const root = context.doc.createElement("section");
    root.className = "awesomeado-view awesomeado-sprint";
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

    const title = context.doc.createElement("h1");
    title.className = "awesomeado-view__title";
    title.textContent = sprintViewType.label;
    title.style.cssText = "margin:0 0 16px;font-size:24px;font-weight:600";
    root.append(title);
    if (context.services === undefined) {
      const message = context.doc.createElement("p");
      message.textContent = "Data services are unavailable.";
      root.append(message);
      return root;
    }
    const dataContext: DataDrivenViewContext = { ...context, services: context.services };
    startSprintView(dataContext, root);
    return root;
  },
  dispose: stopObservingStickyHeader,
};
