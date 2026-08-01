import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { buildWorkItemUrl } from "../../../common/ado/fetchAdoTree";
import { WORK_ITEM_MARKERS } from "../../../common/settings/ExtensionSettings";
import type { DataDrivenViewContext } from "../../../common/view-common/EnhancedView";
import { renderChildItemsBadge } from "../../../common/view-common/control/ChildItemsBadge/ChildItemsBadge";
import { renderMarkerPill } from "../../../common/view-common/control/MarkerPill/MarkerPill";
import { itemHasMarker } from "../../../common/view-common/control/MarkerPill/markerPresence";

const VISIBLE_COLUMN_COUNT = 4;
const COLUMN_BACKGROUNDS = [
  "var(--status-neutral-background)",
  "var(--status-blue-background)",
  "var(--status-yellow-background)",
  "var(--status-green-background)",
] as const;

export interface SprintBoardItem {
  item: TrackedWorkItem;
  parent: TrackedWorkItem | null;
}

interface SprintBoardOptions {
  types: ReadonlyMap<string, TypeCatalogEntry>;
  boardColumns: readonly string[];
  writes: WorkItemWriteQueue;
  expandedDoneIds: Set<number>;
  onItemChanged: () => void;
}

interface Lane {
  areaPath: string | null;
  label: string;
}

function stateOrdinal(item: TrackedWorkItem, type: TypeCatalogEntry | undefined): number {
  const state = item.state.trim().toLocaleLowerCase();
  return (
    type?.columns.findIndex((column) =>
      column.states.some((candidate) => candidate.trim().toLocaleLowerCase() === state),
    ) ?? -1
  );
}

function lanesOf(items: readonly SprintBoardItem[]): Lane[] {
  const paths = new Set(items.map(({ item }) => item.areaPath));
  return [...paths]
    .sort((left, right) => (left ?? "").localeCompare(right ?? ""))
    .map((areaPath) => ({
      areaPath,
      label: areaPath?.split("\\").at(-1) ?? "No area path",
    }));
}

function renderChildrenBadge(
  context: DataDrivenViewContext,
  item: TrackedWorkItem,
  options: SprintBoardOptions,
): HTMLElement | null {
  if (item.children.length === 0) return null;
  const children = item.children.map((child) => {
    const childType = options.types.get(child.type);
    return {
      assignee: null,
      done: stateOrdinal(child, childType) === 3,
      title: child.title,
      titleColor: typeColor(childType?.color),
      eta: null,
      url: buildWorkItemUrl(context.doc.location?.href ?? "", child.id),
    };
  });
  return renderChildItemsBadge(context.doc, {
    children,
    completedCount: children.filter(({ done }) => done).length,
    color: options.types.get(item.children[0]?.type ?? "")?.color,
  });
}

function renderCardMeta(
  context: DataDrivenViewContext,
  item: TrackedWorkItem,
  options: SprintBoardOptions,
): HTMLElement {
  const meta = context.doc.createElement("div");
  meta.className = "awesomeado-sprint-card__meta";
  meta.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:7px",
    "flex-wrap:wrap",
    "font-size:10px",
    "color:var(--text-secondary-color)",
  ].join(";");
  const id = context.doc.createElement("span");
  id.textContent = `#${item.id}`;
  const assignee = context.doc.createElement("span");
  assignee.textContent = item.assignedTo?.displayName ?? "Unassigned";
  meta.append(id, assignee);
  const children = renderChildrenBadge(context, item, options);
  if (children !== null) meta.append(children);
  return meta;
}

function renderCardDetails(context: DataDrivenViewContext, entry: SprintBoardItem): HTMLElement {
  const details = context.doc.createElement("div");
  details.className = "awesomeado-sprint-card__details";
  details.style.cssText = "display:flex;flex-direction:column;gap:7px";
  const markerTags = context.services.markerTags();
  const markers = WORK_ITEM_MARKERS.filter(({ key }) => itemHasMarker(entry.item, key, markerTags));
  if (markers.length > 0) {
    const tags = context.doc.createElement("div");
    tags.className = "awesomeado-sprint-card__markers";
    tags.style.cssText = "display:flex;gap:4px;flex-wrap:wrap";
    for (const { key } of markers) {
      tags.append(
        renderMarkerPill(context.doc, {
          marker: key,
          title: `Azure DevOps tag "${markerTags[key].tag}"`,
        }),
      );
    }
    details.append(tags);
  }
  if (entry.parent !== null) {
    const parent = context.doc.createElement("div");
    parent.className = "awesomeado-sprint-card__parent";
    parent.textContent = `Parent: #${entry.parent.id} ${entry.parent.title}`;
    parent.style.cssText = [
      "font-size:11px",
      "color:var(--text-secondary-color)",
      "overflow:hidden",
      "text-overflow:ellipsis",
      "white-space:nowrap",
    ].join(";");
    parent.title = parent.textContent;
    details.append(parent);
  }
  return details;
}

function renderCard(
  context: DataDrivenViewContext,
  entry: SprintBoardItem,
  ordinal: number,
  options: SprintBoardOptions,
): HTMLElement {
  const { item } = entry;
  const type = options.types.get(item.type);
  const card = context.doc.createElement("article");
  card.className = "awesomeado-sprint__item awesomeado-sprint-card";
  card.dataset.itemId = String(item.id);
  card.draggable = true;
  card.style.setProperty("--sprint-item-type-color", typeColor(type?.color));
  card.style.cssText += [
    "display:flex",
    "flex-direction:column",
    "gap:8px",
    "padding:9px 10px",
    "background:var(--item-row-background)",
    "border:1px solid var(--control-border)",
    "border-left:4px solid var(--sprint-item-type-color)",
    "border-radius:4px",
    "box-sizing:border-box",
    "cursor:grab",
    "box-shadow:0 1px 2px var(--write-status-shadow)",
  ].join(";");

  const title = context.doc.createElement("div");
  title.className = "awesomeado-sprint-card__title";
  title.textContent = item.title;
  title.style.cssText = "font-size:12px;font-weight:700;line-height:1.35;overflow-wrap:anywhere";
  const details = renderCardDetails(context, entry);
  card.append(title, renderCardMeta(context, item, options), details);

  const setSize = (large: boolean): void => {
    card.dataset.size = large ? "large" : "compact";
    card.style.minHeight = large ? "112px" : "68px";
    details.style.display = large ? "flex" : "none";
    card.tabIndex = ordinal === 3 ? 0 : -1;
    if (ordinal === 3) card.setAttribute("aria-expanded", String(large));
  };
  setSize(ordinal !== 3 || options.expandedDoneIds.has(item.id));
  if (ordinal === 3) {
    const toggle = (): void => {
      if (options.expandedDoneIds.has(item.id)) options.expandedDoneIds.delete(item.id);
      else options.expandedDoneIds.add(item.id);
      setSize(options.expandedDoneIds.has(item.id));
    };
    card.addEventListener("click", toggle);
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    });
  }
  card.addEventListener("dragstart", (event) => {
    event.dataTransfer?.setData("text/plain", String(item.id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  });
  return card;
}

function typeColor(color: string | undefined): string {
  if (!color) return "var(--text-primary-color)";
  return color.startsWith("#") ? color : `#${color}`;
}

function primaryState(
  item: TrackedWorkItem,
  ordinal: number,
  options: SprintBoardOptions,
): string | null {
  return options.types.get(item.type)?.columns[ordinal]?.states[0] ?? null;
}

interface DropPlan {
  nextState: string;
  changesState: boolean;
  changesArea: boolean;
  destinationAreaPath: string | null;
  field: string;
  value: string | null;
  additionalFields?: { field: string; value: string | null }[];
  baseValue?: string | null;
}

function planDrop(
  source: SprintBoardItem,
  destinationOrdinal: number,
  requestedAreaPath: string | null,
  options: SprintBoardOptions,
): DropPlan | null {
  const nextState = primaryState(source.item, destinationOrdinal, options);
  if (nextState === null) return null;
  const currentOrdinal = stateOrdinal(source.item, options.types.get(source.item.type));
  const changesState = currentOrdinal !== destinationOrdinal;
  const destinationAreaPath = requestedAreaPath ?? source.item.areaPath;
  const changesArea = destinationAreaPath !== source.item.areaPath;
  if (!changesState && !changesArea) return null;
  const field = changesState ? "System.State" : "System.AreaPath";
  const value = changesState ? nextState : destinationAreaPath;
  let additionalFields: DropPlan["additionalFields"];
  let baseValue: string | null | undefined;
  if (changesState && changesArea) {
    additionalFields = [{ field: "System.AreaPath", value: destinationAreaPath }];
  } else {
    baseValue = changesState ? source.item.state : source.item.areaPath;
  }
  return {
    nextState,
    changesState,
    changesArea,
    destinationAreaPath,
    field,
    value,
    additionalFields,
    baseValue,
  };
}

function applyDrop(
  context: DataDrivenViewContext,
  source: SprintBoardItem,
  destinationOrdinal: number,
  destinationAreaPath: string | null,
  options: SprintBoardOptions,
): void {
  const plan = planDrop(source, destinationOrdinal, destinationAreaPath, options);
  if (plan === null) return;
  void options.writes
    .enqueue({
      id: source.item.id,
      currentRev: () => source.item.rev,
      field: plan.field,
      value: plan.value,
      additionalFields: plan.additionalFields,
      baseValue: plan.baseValue,
    })
    .then((result) => {
      if (!result.ok) return;
      if (plan.changesState) {
        source.item.state = plan.nextState;
        source.item.stateChangeDate = context.services.now().toISOString();
      }
      if (plan.changesArea) source.item.areaPath = plan.destinationAreaPath;
      if (result.rev !== undefined) source.item.rev = result.rev;
      options.onItemChanged();
    });
}

function renderCell(
  context: DataDrivenViewContext,
  lane: Lane,
  ordinal: number,
  items: readonly SprintBoardItem[],
  allItems: readonly SprintBoardItem[],
  options: SprintBoardOptions,
): HTMLElement {
  const cell = context.doc.createElement("div");
  cell.className = "awesomeado-sprint__cell";
  cell.dataset.areaPath = lane.areaPath ?? "";
  cell.dataset.columnOrdinal = String(ordinal);
  cell.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "gap:8px",
    "min-height:132px",
    "padding:8px",
    `background:${COLUMN_BACKGROUNDS[ordinal]}`,
    "border-right:1px solid var(--control-border)",
    "border-bottom:1px solid var(--control-border)",
  ].join(";");
  for (const entry of items) cell.append(renderCard(context, entry, ordinal, options));
  cell.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  });
  cell.addEventListener("drop", (event) => {
    event.preventDefault();
    const id = Number(event.dataTransfer?.getData("text/plain"));
    const source = allItems.find(({ item }) => item.id === id);
    if (source !== undefined) applyDrop(context, source, ordinal, lane.areaPath, options);
  });
  return cell;
}

/** Render the Sprint View's lane-by-application-state table. */
export function renderSprintBoard(
  context: DataDrivenViewContext,
  items: readonly SprintBoardItem[],
  options: SprintBoardOptions,
): HTMLElement {
  const section = context.doc.createElement("section");
  section.className = "awesomeado-sprint__queue awesomeado-sprint__board";
  const cardItems = items.filter(
    ({ item }) => options.types.get(item.type)?.isPrimaryWork === true,
  );
  if (cardItems.length === 0) {
    const empty = context.doc.createElement("p");
    empty.textContent = "No items match the current filters.";
    empty.style.cssText = "margin:16px 10px;color:var(--text-secondary-color)";
    section.append(empty);
    return section;
  }
  section.style.cssText = "overflow:auto;border:1px solid var(--control-border);border-radius:4px";
  const grid = context.doc.createElement("div");
  grid.className = "awesomeado-sprint__board-grid";
  grid.setAttribute("role", "table");
  grid.style.cssText = [
    "display:grid",
    "grid-template-columns:minmax(130px,170px) repeat(4,minmax(210px,1fr))",
    "min-width:970px",
  ].join(";");
  const laneHeading = context.doc.createElement("div");
  laneHeading.textContent = `${cardItems.length} item${cardItems.length === 1 ? "" : "s"}`;
  laneHeading.style.cssText =
    "padding:9px 10px;font-size:11px;font-weight:700;color:var(--text-secondary-color);border-right:1px solid var(--control-border);border-bottom:1px solid var(--control-border)";
  grid.append(laneHeading);
  for (let ordinal = 0; ordinal < VISIBLE_COLUMN_COUNT; ordinal += 1) {
    const heading = context.doc.createElement("div");
    heading.className = "awesomeado-sprint__column-title";
    heading.textContent = options.boardColumns[ordinal] ?? "";
    heading.style.cssText = [
      "padding:9px 10px",
      "font-size:12px",
      "font-weight:700",
      `background:${COLUMN_BACKGROUNDS[ordinal]}`,
      "border-right:1px solid var(--control-border)",
      "border-bottom:1px solid var(--control-border)",
    ].join(";");
    grid.append(heading);
  }
  for (const lane of lanesOf(cardItems)) {
    const laneLabel = context.doc.createElement("div");
    laneLabel.className = "awesomeado-sprint__lane";
    laneLabel.textContent = lane.label;
    laneLabel.title = lane.areaPath ?? lane.label;
    laneLabel.style.cssText = [
      "padding:10px",
      "font-size:11px",
      "font-weight:700",
      "overflow-wrap:anywhere",
      "background:var(--control-background)",
      "border-right:1px solid var(--control-border)",
      "border-bottom:1px solid var(--control-border)",
    ].join(";");
    grid.append(laneLabel);
    for (let ordinal = 0; ordinal < VISIBLE_COLUMN_COUNT; ordinal += 1) {
      const cellItems = cardItems.filter(
        (entry) =>
          entry.item.areaPath === lane.areaPath &&
          stateOrdinal(entry.item, options.types.get(entry.item.type)) === ordinal,
      );
      grid.append(renderCell(context, lane, ordinal, cellItems, cardItems, options));
    }
  }
  section.append(grid);
  return section;
}
