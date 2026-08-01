import type { WorkItemTreeResult } from "../../../common/ado/IWorkItemTreeLoader";
import type { TeamMember, TeamMembersResult } from "../../../common/ado/TeamMembers";
import type {
  TrackedUser,
  TrackedWorkItem,
  TypeCatalogEntry,
} from "../../../common/ado/TrackedWorkItem";
import { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { buildQueryFolderUrl } from "../../../common/ado/fetchAdoTree";
import { filterTreeForSprintRoster, wiqlForSprint } from "../../../common/ado/sprintQuery";
import type { SprintWindow, SprintWindowEntry } from "../../../common/ado/sprintWindow";
import { WORK_ITEM_MARKERS, type WorkItemMarker } from "../../../common/settings/ExtensionSettings";
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
import { renderMarkerPill } from "../../../common/view-common/control/MarkerPill/MarkerPill";
import { itemHasMarker } from "../../../common/view-common/control/MarkerPill/markerPresence";
import { renderSprintPicker } from "../../../common/view-common/control/SprintPicker/SprintPicker";
import { renderViewScaffold } from "../../../common/view-common/control/ViewScaffold/ViewScaffold";
import { renderWriteQueueStatus } from "../../../common/view-common/control/WriteQueueStatus/WriteQueueStatus";
import type { WriteQueueStatusHandle } from "../../../common/view-common/control/WriteQueueStatus/WriteQueueStatus";

import { renderSprintBoard, type SprintBoardItem } from "./SprintBoard";
import { renderSprintHeader } from "./SprintHeader";
import { sprintRecentChangesHours, sprintViewType } from "./sprintViewType";

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
}

interface LoadedSprintData {
  result: WorkItemTreeResult;
  sprintWindow: SprintWindow;
  teamMembers: TeamMembersResult;
}

interface DisplayItem extends SprintBoardItem {
  item: TrackedWorkItem;
  parent: TrackedWorkItem | null;
  depth: number;
  ancestorIds: number[];
  chain: string[];
}

interface SprintBoardHandle {
  refresh: RefreshButtonHandle;
  queueStatus: WriteQueueStatusHandle;
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
  };
}

function flattenItems(roots: readonly TrackedWorkItem[]): DisplayItem[] {
  const result: DisplayItem[] = [];
  const visit = (
    item: TrackedWorkItem,
    depth: number,
    ancestorIds: number[],
    chain: string[],
    parent: TrackedWorkItem | null,
  ): void => {
    const nextChain = [...chain, item.title];
    result.push({ item, parent, depth, ancestorIds, chain: nextChain });
    for (const child of item.children) {
      visit(child, depth + 1, [...ancestorIds, item.id], nextChain, item);
    }
  };
  for (const root of roots) visit(root, 0, [], [], null);
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

function deliveryWorkTypes(types: readonly TypeCatalogEntry[]): ReadonlySet<string> {
  const workTypes = new Set(
    types.filter((type) => type.isPrimaryWork === true).map((type) => type.name),
  );
  const pending = [...workTypes];
  while (pending.length > 0) {
    const name = pending.pop() as string;
    for (const child of types.find((type) => type.name === name)?.children ?? []) {
      if (workTypes.has(child)) continue;
      workTypes.add(child);
      pending.push(child);
    }
  }
  return workTypes;
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
  const sprintWindow = await context.services.loadSprintWindow();
  normalizeSprintSelection(sprintWindow, session);
  const selectedSprint = selectedSprintEntry(sprintWindow, session);
  const [teamMembers, definition] = await Promise.all([teamMembersPromise, definitionPromise]);
  if (teamMembers.error !== null) throw new Error(teamMembers.error);
  if (definition.error !== null || definition.wiql === null) {
    throw new Error(definition.error ?? "The saved query has no WIQL body.");
  }
  const loaded = await context.services.loadTree(
    context.queryId,
    wiqlForSprint(definition.wiql, selectedSprintOffset(sprintWindow, selectedSprint)),
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
  return { result, sprintWindow, teamMembers };
}

function hierarchyOptions(
  items: readonly DisplayItem[],
  shownItems: readonly DisplayItem[],
  types: ReadonlyMap<string, TypeCatalogEntry>,
): HierarchyFilterOption[] {
  const parentIds = new Set(shownItems.flatMap(({ ancestorIds }) => ancestorIds));
  const projectTypes = primaryWorkParentTypes([...types.values()]);
  return items
    .filter(({ item }) => parentIds.has(item.id) && projectTypes.has(item.type))
    .map(({ item, depth }) => ({
      id: item.id,
      label: `${item.type}: ${item.title}`,
      title: item.title,
      color: typeColor(types.get(item.type)?.color),
      depth,
    }));
}

function typeColor(color: string | undefined): string {
  if (!color) return "var(--text-primary-color)";
  return color.startsWith("#") ? color : `#${color}`;
}

function primaryWorkParentTypes(types: readonly TypeCatalogEntry[]): ReadonlySet<string> {
  const descendants = new Set(
    types.filter((type) => type.isPrimaryWork === true).map((type) => type.name),
  );
  const parents = new Set<string>();
  let previousSize = -1;
  while (previousSize !== descendants.size) {
    previousSize = descendants.size;
    for (const type of types) {
      if (type.children?.some((child) => descendants.has(child))) {
        parents.add(type.name);
        descendants.add(type.name);
      }
    }
  }
  return parents;
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
  const workTypes = deliveryWorkTypes([...types.values()]);
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
  session: SprintSession,
  onChange: () => void,
): HTMLElement[] {
  const markerTags = context.services.markerTags();
  return WORK_ITEM_MARKERS.map(({ key }) => {
    const matching = scopedItems.filter(({ item }) => itemHasMarker(item, key, markerTags));
    const accepted = acceptedItems.filter(({ item }) => itemHasMarker(item, key, markerTags));
    return renderMarkerPill(context.doc, {
      marker: key,
      title: `Azure DevOps tag "${markerTags[key].tag}"`,
      interactive: true,
      selected: session.selectedMarkers.has(key),
      counts: {
        total: key === "interrupt" ? matching.length : accepted.length,
        acceptedInSprint: key === "interrupt" ? accepted.length : undefined,
      },
      onToggle: () => {
        if (session.selectedMarkers.has(key)) session.selectedMarkers.delete(key);
        else session.selectedMarkers.add(key);
        onChange();
      },
    });
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
  const markerPills = renderMarkerPills(context, scopedItems, acceptedItems, session, onChange);
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

function renderBoardHeader(options: SprintHeaderRenderOptions): {
  header: HTMLElement;
  refresh: RefreshButtonHandle;
  queueStatus: WriteQueueStatusHandle;
} {
  const { context, data, session, repaint } = options;
  const sprintPicker = renderSprintPicker(context.doc, {
    sprints: data.sprintWindow.entries,
    selectedName: session.sprintName,
    showFilterButton: false,
    onSprintChange: options.onSprintChange,
  });
  const laneFilter = renderAreaPathFilter(context.doc, {
    label: "Lane",
    areaPaths: options.areaPaths,
    selectedAreaPaths: [...session.selectedAreaPaths],
    onChange: (paths) => {
      session.selectedAreaPaths = new Set(paths);
      repaint();
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
  const refresh = renderRefreshButton(context.doc, "awesomeado-sprint__refresh");
  refresh.element.addEventListener("click", options.onRefresh);
  const queueStatus = renderWriteQueueStatus(context.doc, {
    onOpenLog: context.services.openDiagnosticsLog,
  });
  queueStatus.setCount(options.writeState.pending);
  queueStatus.setFailedCount(options.writeState.failed, options.writeState.lastError);
  return {
    header: renderSprintHeader(context.doc, {
      breadcrumbs: queryBreadcrumbs(data.result, context.doc.location?.href ?? ""),
      sprintPicker: sprintPicker.element,
      laneFilter: laneFilter.element,
      projectFilter: projectFilter.element,
      refresh,
      queueStatus: queueStatus.element,
      teamPills: renderTeamPills(
        context.doc,
        data.teamMembers.members,
        options.baseItems,
        options.types,
        session,
        repaint,
      ),
    }),
    refresh,
    queueStatus,
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
): { element: DocumentFragment; handle: SprintBoardHandle } {
  const allItems = flattenItems(data.result.roots);
  const areaPaths = areaPathsOf(allItems);
  for (const path of [...session.selectedAreaPaths]) {
    if (!areaPaths.includes(path)) session.selectedAreaPaths.delete(path);
  }
  const types = new Map(context.services.getTypes().map((type) => [type.name, type]));
  scheduleNotesRepaint(data, session, repaint);
  const shownWithoutProject = filteredQueue(
    selectedSprintItems(areaScope(allItems, session), session),
    context,
    session,
  );
  const options = hierarchyOptions(allItems, shownWithoutProject, types);
  normalizeProjectSelection(options, session);
  const base = baseQueue(allItems, session);
  const scoped = boardScope(allItems, session);
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
    writeState,
  });
  const fragment = context.doc.createDocumentFragment();
  fragment.append(
    controls.header,
    renderFilterPanel(context, scoped, base, session, repaint),
    renderSprintBoard(context, filteredQueue(base, context, session), {
      types,
      boardColumns: context.services.getBoardColumns(),
      writes,
      expandedDoneIds: session.expandedDoneIds,
      onItemChanged: repaint,
    }),
  );
  return {
    element: fragment,
    handle: { refresh: controls.refresh, queueStatus: controls.queueStatus },
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

function startSprintView(context: DataDrivenViewContext, root: HTMLElement): void {
  let session = createSession(context);
  let data: LoadedSprintData | null = null;
  let board: SprintBoardHandle | null = null;
  let refreshing = false;
  let loadGeneration = 0;
  let refreshFailed = false;
  const writes = createWriteQueue(context);
  const writeState: SprintWriteState = { pending: 0, failed: 0 };
  observeWriteState(writes, writeState, () => board);

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
    );
    board = rendered.handle;
    board.refresh.setFailed(refreshFailed);
    root.replaceChildren(rendered.element);
  };

  const showLoading = (): void => {
    const loading = context.doc.createElement("div");
    loading.className = "awesomeado-sprint__loading";
    loading.textContent = "Loading spring data...";
    loading.style.cssText = "padding:16px 0;text-align:center;color:var(--text-secondary-color)";
    root.replaceChildren(loading);
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
    showLoading();
    void loadSprintData(context, session)
      .then((loaded) => {
        if (generation !== loadGeneration) return;
        refreshFailed = false;
        data = loaded;
        paint();
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
    load(session.sprintName, false);
  }

  function switchSprint(name: string): void {
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
};
