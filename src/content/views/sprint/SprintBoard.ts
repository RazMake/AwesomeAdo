import type { WorkItemReorderResult } from "../../../common/ado/IWorkItemReorderWriter";
import type {
  TrackedUser,
  TrackedWorkItem,
  TypeCatalogEntry,
} from "../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { ASSIGNED_TO_FIELD, identityFieldValue } from "../../../common/ado/adoApi";
import { buildWorkItemUrl } from "../../../common/ado/fetchAdoTree";
import { orderTrackedItems, workItemTypeTextColor } from "../../../common/ado/workItemTypes";
import { MANUAL_ORDERING_POLICY, type OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import { WORK_ITEM_MARKERS } from "../../../common/settings/ExtensionSettings";
import type { DataDrivenViewContext } from "../../../common/view-common/EnhancedView";
import {
  renderAssignedTo,
  type AssignedToHandle,
} from "../../../common/view-common/control/AssignedTo/AssignedTo";
import {
  renderChildItemsBadge,
  type ChildItemsBadgeHandle as ChildItemsBadgeControlHandle,
} from "../../../common/view-common/control/ChildItemsBadge/ChildItemsBadge";
import { collectRolledUpDescendants } from "../../../common/view-common/control/ChildItemsBadge/rolledUpDescendants";
import {
  DragReorderController,
  type PlannedMove,
} from "../../../common/view-common/control/DragReorder/DragReorderController";
import { renderEmptyState } from "../../../common/view-common/control/EmptyState/EmptyState";
import {
  renderEtaBadge,
  type EtaBadgeHandle,
} from "../../../common/view-common/control/EtaBadge/EtaBadge";
import type {
  ItemContextMenu,
  ItemContextMenuTarget,
} from "../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import {
  renderItemDetailsButton,
  renderItemDetailsContent,
} from "../../../common/view-common/control/ItemDetails/ItemDetails";
import { renderItemTypeIcon } from "../../../common/view-common/control/ItemTypeIcon/ItemTypeIcon";
import { itemHasMarker } from "../../../common/view-common/control/MarkerPill/markerPresence";
import {
  renderPriorityBadge,
  type PriorityBadgeHandle,
} from "../../../common/view-common/control/PriorityBadge/PriorityBadge";
import { createPopupHost } from "../../../common/view-common/control/popupHost/popupHost";
import type { InterruptAcceptanceState } from "../interrupt-acceptance/interruptAcceptanceState";
import { writeItemPriority } from "../item-priority/writeItemPriority";
import { renderMarkerReasonsPill } from "../project-tracking/marker-reasons/MarkerReasonsPill";

import { SprintCardDragController, type SprintCardMove } from "./SprintCardDragController";

const VISIBLE_COLUMN_COUNT = 4;
const BOARD_LAYOUT_COLUMNS = "minmax(130px,170px) minmax(0,1fr)";
const CARD_GRID_COLUMNS = "repeat(4,minmax(210px,1fr))";
const CARD_GRID_MIN_WIDTH = "840px";
const OPAQUE_BOARD_BACKGROUND = "var(--background-color)";
const STICKY_HEADER_OPACITY = 0.9;
const COLUMN_BACKGROUNDS = [
  "color-mix(in srgb, var(--status-neutral-background) 50%, transparent)",
  "color-mix(in srgb, var(--status-blue-background) 50%, transparent)",
  "color-mix(in srgb, var(--status-yellow-background) 50%, transparent)",
  "color-mix(in srgb, var(--status-green-background) 50%, transparent)",
] as const;
const COLUMN_HEADER_BACKGROUNDS = [
  "color-mix(in srgb,var(--status-neutral-background) 75%,transparent)",
  "color-mix(in srgb,var(--status-blue-background) 75%,transparent)",
  "color-mix(in srgb,var(--status-yellow-background) 75%,transparent)",
  "color-mix(in srgb,var(--status-green-background) 75%,transparent)",
] as const;
const STICKY_COLUMN_HEADER_BACKGROUNDS = [
  `linear-gradient(var(--status-neutral-background),var(--status-neutral-background)),${OPAQUE_BOARD_BACKGROUND}`,
  `linear-gradient(var(--status-blue-background),var(--status-blue-background)),${OPAQUE_BOARD_BACKGROUND}`,
  `linear-gradient(var(--status-yellow-background),var(--status-yellow-background)),${OPAQUE_BOARD_BACKGROUND}`,
  `linear-gradient(var(--status-green-background),var(--status-green-background)),${OPAQUE_BOARD_BACKGROUND}`,
] as const;
const COLUMN_FOREGROUNDS = [
  "var(--status-neutral-foreground)",
  "var(--status-blue-foreground)",
  "var(--status-yellow-foreground)",
  "var(--status-green-foreground)",
] as const;
// The stronger same-hue edge token, used as the count chip's fill: it reads as a deliberate step up
// from the column's own quiet tint in both the resting and the stuck header states.
const COLUMN_COUNT_BACKGROUNDS = [
  "var(--status-neutral-border)",
  "var(--status-blue-border)",
  "var(--status-yellow-border)",
  "var(--status-green-border)",
] as const;

export interface SprintBoardItem {
  item: TrackedWorkItem;
  parent: TrackedWorkItem | null;
  ancestors: readonly TrackedWorkItem[];
}

interface SprintBoardOptions {
  types: ReadonlyMap<string, TypeCatalogEntry>;
  boardColumns: readonly string[];
  writes: WorkItemWriteQueue;
  expandedDoneIds: Set<number>;
  openChildPopupIds: Set<number>;
  team: string | null;
  assigneeSuggestions: () => TrackedUser[];
  orderingPolicy: OrderingPolicy;
  interruptAcceptance: InterruptAcceptanceState;
  notesSinceIso: string;
  contextMenu: ItemContextMenu;
  menuTarget: (item: TrackedWorkItem) => ItemContextMenuTarget;
  onItemChanged: () => void;
  /**
   * How many cards this pass painted. The view owns the log line because the SELECTIONS that
   * emptied the board live there; the board only knows the number they came out to.
   */
  onCardsShown: (count: number) => void;
  cardDrag?: SprintCardDragController;
  dragReorder?: DragReorderController;
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

function renderItemAssignee(
  context: DataDrivenViewContext,
  item: TrackedWorkItem,
  options: SprintBoardOptions,
  editable = true,
): AssignedToHandle {
  const assignee: { handle?: AssignedToHandle } = {};
  assignee.handle = renderAssignedTo(context.doc, {
    user: item.assignedTo,
    userDirectory: context.services.userDirectory,
    suggestions: options.assigneeSuggestions,
    showTag: false,
    onChange: editable
      ? (picked) => {
          void options.writes
            .enqueue({
              id: item.id,
              currentRev: () => item.rev,
              field: ASSIGNED_TO_FIELD,
              value: identityFieldValue(picked),
            })
            .then((result) => {
              if (!result.ok) return;
              item.assignedTo = {
                displayName: picked.displayName,
                uniqueName: picked.uniqueName,
                imageUrl: picked.imageUrl,
              };
              if (result.rev !== undefined) item.rev = result.rev;
              assignee.handle?.setUser(item.assignedTo);
              options.onItemChanged();
            });
        }
      : undefined,
  });
  if (!editable) {
    const name = assignee.handle.querySelector<HTMLButtonElement>(".awesomeado-assigned__name");
    if (name !== null) {
      name.disabled = true;
      name.style.cursor = "default";
    }
  }
  return assignee.handle;
}

interface ChildBadgeHandle {
  element: HTMLElement;
  setEditable(editable: boolean): void;
  setVisible(visible: boolean): void;
}

interface ChildRowControls {
  assignee: AssignedToHandle;
  eta: EtaBadgeHandle;
}

function setChildControlsEditable(controls: readonly ChildRowControls[], editable: boolean): void {
  for (const control of controls) {
    const name = control.assignee.querySelector<HTMLButtonElement>(".awesomeado-assigned__name");
    if (name !== null) {
      name.disabled = !editable;
      name.style.cursor = editable ? "pointer" : "default";
    }
    control.eta.setAttribute("aria-disabled", String(!editable));
    control.eta.style.cursor = editable ? "pointer" : "default";
    const etaLabel = control.eta.querySelector<HTMLElement>(".awesomeado-eta__label");
    if (etaLabel !== null) etaLabel.style.pointerEvents = editable ? "" : "none";
  }
}

function toggleChildDone(
  context: DataDrivenViewContext,
  child: TrackedWorkItem,
  options: SprintBoardOptions,
  done: boolean,
  onCommitted: () => void,
): Promise<boolean> {
  const targetOrdinal = done ? 3 : 1;
  const targetState = options.types.get(child.type)?.columns[targetOrdinal]?.states[0];
  if (targetState === undefined) {
    context.services.logger.info(
      `Child ${child.id} (${child.type}) completion unchanged: no state routed to board column ${targetOrdinal}`,
    );
    return Promise.resolve(!done);
  }
  return options.writes
    .enqueue({
      id: child.id,
      currentRev: () => child.rev,
      field: "System.State",
      value: targetState,
      baseValue: child.state,
    })
    .then((result) => {
      if (!result.ok) return !done;
      child.state = targetState;
      child.stateChangeDate = context.services.now().toISOString();
      if (result.rev !== undefined) child.rev = result.rev;
      onCommitted();
      return done;
    });
}

function repaintKeepingChildPopupOpen(
  parentId: number,
  badge: ChildItemsBadgeControlHandle | undefined,
  options: SprintBoardOptions,
): void {
  const wasOpen = badge?.isPopupOpen() ?? false;
  badge?.closePopup();
  if (wasOpen) options.openChildPopupIds.add(parentId);
  options.onItemChanged();
}

function renderChildrenBadge(
  context: DataDrivenViewContext,
  item: TrackedWorkItem,
  options: SprintBoardOptions,
  onOpenChange: (open: boolean) => void,
): ChildBadgeHandle | null {
  const childEntries = collectRolledUpDescendants(
    item,
    (child) => options.types.get(child.type)?.isPrimaryWork !== true,
    options.orderingPolicy,
  );
  if (childEntries.length === 0) return null;
  const parentDone = stateOrdinal(item, options.types.get(item.type)) === 3;
  const controls: ChildRowControls[] = [];
  const badge: { handle?: ChildItemsBadgeControlHandle } = {};
  const children = childEntries.map(({ item: child, parent, siblingIds, depth }) => {
    const childType = options.types.get(child.type);
    const assignee = renderItemAssignee(context, child, options, !parentDone);
    const eta = renderItemEta(context, child, options, !parentDone);
    controls.push({ assignee, eta });
    return {
      depth,
      assignee,
      done: stateOrdinal(child, childType) === 3,
      onToggleDone: parentDone
        ? undefined
        : (done: boolean) =>
            toggleChildDone(context, child, options, done, () =>
              repaintKeepingChildPopupOpen(item.id, badge.handle, options),
            ),
      title: child.title,
      titleColor: workItemTypeTextColor(childType?.color),
      eta,
      url: buildWorkItemUrl(context.doc.location?.href ?? "", child.id),
      onContextMenu: (event: MouseEvent) =>
        options.contextMenu.openAt(event, options.menuTarget(child)),
      onRowReady:
        // Only the first popup level is reorderable: a deeper row's level is not the one the badge's
        // drop targets describe, so letting it drag would rank it against the wrong siblings.
        options.dragReorder === undefined || parentDone || depth > 0
          ? undefined
          : (
              row: HTMLElement,
              title: HTMLElement,
              dragContext: { surface: HTMLElement; close: () => void },
            ) =>
              options.dragReorder?.register({
                id: child.id,
                depth: 1,
                hasChildren: child.children.length > 0,
                parentId: parent.id,
                destinationType: null,
                siblingIds,
                handle: title,
                row,
                wrapper: row,
                dragSurface: dragContext.surface,
                onLeaveSurface: dragContext.close,
              }),
    };
  });
  const element = renderChildItemsBadge(context.doc, {
    children,
    completedCount: children.filter(({ done }) => done).length,
    color: options.types.get(item.children[0]?.type ?? "")?.color,
    initiallyOpen: options.openChildPopupIds.has(item.id),
    onOpenChange,
  });
  badge.handle = element;
  return {
    element,
    setVisible: (visible) => {
      element.style.display = visible ? "inline-flex" : "none";
    },
    setEditable: (editable) => setChildControlsEditable(controls, editable && !parentDone),
  };
}

function renderCardPriority(
  context: DataDrivenViewContext,
  item: TrackedWorkItem,
  options: SprintBoardOptions,
): PriorityBadgeHandle {
  const badge = renderPriorityBadge(context.doc, {
    priority: item.priority,
    onChange: (priority) => {
      writeItemPriority(item, priority, options.writes, (committed) =>
        badge.setPriority(committed),
      );
    },
  });
  badge.classList.add("awesomeado-sprint-card__priority");
  badge.style.justifySelf = "start";
  return badge;
}

function renderCardMeta(
  context: DataDrivenViewContext,
  item: TrackedWorkItem,
  options: SprintBoardOptions,
): { element: HTMLElement; priority: PriorityBadgeHandle } {
  const meta = context.doc.createElement("div");
  meta.className = "awesomeado-sprint-card__meta";
  meta.style.cssText = [
    "display:grid",
    "grid-template-columns:auto auto minmax(0,1fr)",
    "align-items:center",
    "gap:7px",
    "width:100%",
    "min-width:0",
    "font-size:10px",
    "color:var(--text-secondary-color)",
  ].join(";");
  const idGroup = context.doc.createElement("span");
  idGroup.className = "awesomeado-sprint-card__identity";
  idGroup.style.cssText = "position:relative;display:inline-flex;align-items:center;gap:4px";
  const id = context.doc.createElement("span");
  id.className = "awesomeado-sprint-card__id";
  id.textContent = `#${item.id}`;
  const details = renderItemDetailsButton(context.doc, {
    hasDescription: item.description.trim().length > 0,
    typeColor: workItemTypeTextColor(options.types.get(item.type)?.color),
    className: "awesomeado-sprint-card__describe",
  });
  createPopupHost({
    doc: context.doc,
    trigger: details,
    mountInto: idGroup,
    onOpened: () => details.setExpanded(true),
    onClosed: () => details.setExpanded(false),
    buildPopup: () => renderCardDetailsPopup(context, item),
  });
  idGroup.append(id, details);
  const priority = renderCardPriority(context, item, options);
  const assignee = renderItemAssignee(context, item, options);
  assignee.classList.add("awesomeado-sprint-card__assignee");
  assignee.style.cssText += ";justify-self:end;min-width:0;max-width:100%;overflow:visible";
  const assigneeName = assignee.querySelector<HTMLElement>(".awesomeado-assigned__name");
  if (assigneeName) {
    assigneeName.style.cssText +=
      ";min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  }
  meta.append(idGroup, priority, assignee);
  return { element: meta, priority };
}

function renderCardDetailsPopup(
  context: DataDrivenViewContext,
  item: TrackedWorkItem,
): HTMLElement {
  const popup = renderItemDetailsContent(
    context.doc,
    item,
    context.services.mentionDirectory.knownNames(),
  );
  popup.classList.add("awesomeado-sprint-card__description-popup");
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", `Details for item ${item.id}`);
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "width:380px",
    "min-width:280px",
    "max-width:calc(100vw - 24px)",
    "max-height:320px",
    "overflow-y:auto",
    "overflow-x:hidden",
    "overflow-wrap:anywhere",
    "word-break:break-word",
    "padding:10px",
    "box-sizing:border-box",
    "z-index:1000",
    "white-space:normal",
    "text-align:left",
    "background:var(--callout-background-color)",
    "border:1px solid var(--control-border-emphasis)",
    "border-radius:8px",
    "box-shadow:0 4px 12px var(--popup-shadow-strong)",
    "color:var(--text-primary-color)",
  ].join(";");
  for (const element of popup.querySelectorAll<HTMLElement>("*")) {
    element.style.maxWidth = "100%";
    element.style.overflowWrap = "anywhere";
  }
  for (const preformatted of popup.querySelectorAll<HTMLElement>("pre,code")) {
    preformatted.style.whiteSpace = "pre-wrap";
    preformatted.style.wordBreak = "break-word";
  }
  for (const table of popup.querySelectorAll<HTMLElement>("table")) {
    table.style.width = "100%";
    table.style.tableLayout = "fixed";
  }
  return popup;
}

function parentForeground(color: string | undefined): string {
  if (!color) return "var(--text-primary-color)";
  return `color-mix(in srgb, ${workItemTypeTextColor(color)} 62%, var(--text-primary-color))`;
}

function renderItemEta(
  context: DataDrivenViewContext,
  item: TrackedWorkItem,
  options: SprintBoardOptions,
  editable = true,
): EtaBadgeHandle {
  const etaField = options.types.get(item.type)?.etaField ?? null;
  const badge: { handle?: EtaBadgeHandle } = {};
  const onChange =
    etaField && editable
      ? (eta: string | null): void => {
          void options.writes
            .enqueue({ id: item.id, currentRev: () => item.rev, field: etaField, value: eta })
            .then((result) => {
              if (!result.ok) return;
              item.eta = eta;
              if (result.rev !== undefined) item.rev = result.rev;
              badge.handle?.setEta(eta);
            });
        }
      : undefined;
  const completed = stateOrdinal(item, options.types.get(item.type)) === 3;
  badge.handle = renderEtaBadge(context.doc, {
    eta: item.eta,
    now: context.services.now(),
    onChange,
    ...(completed ? { completedAt: item.stateChangeDate || null } : {}),
  });
  return badge.handle;
}

function renderParentPopup(
  context: DataDrivenViewContext,
  ancestors: readonly TrackedWorkItem[],
  options: SprintBoardOptions,
  editable: boolean,
): HTMLElement {
  const popup = context.doc.createElement("div");
  popup.className = "awesomeado-sprint-card__parent-popup";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Parent hierarchy");
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "display:flex",
    "flex-direction:column",
    "gap:4px",
    "width:max-content",
    "min-width:240px",
    "max-width:calc(100vw - 24px)",
    "padding:7px",
    "background:var(--callout-background-color)",
    "border:1px solid var(--control-border-strong)",
    "border-radius:3px",
    "box-shadow:0 2px 8px var(--shadow-subtle)",
    "z-index:1000",
  ].join(";");
  for (const ancestor of ancestors) {
    const type = options.types.get(ancestor.type);
    const row = context.doc.createElement("div");
    row.className = "awesomeado-sprint-card__parent-row";
    row.dataset.itemId = String(ancestor.id);
    row.style.cssText =
      "display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;min-width:0;padding:3px 4px";
    const identity = context.doc.createElement("span");
    identity.className = "awesomeado-sprint-card__parent-identity";
    identity.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:5px",
      "min-width:0",
      `color:${parentForeground(type?.color)}`,
    ].join(";");
    const icon = renderItemTypeIcon(context.doc, {
      iconUrl: type?.icon ?? null,
      color: workItemTypeTextColor(type?.color),
      typeName: ancestor.type,
    });
    const title = context.doc.createElement("span");
    title.textContent = ancestor.title;
    title.title = ancestor.title;
    title.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    identity.append(icon.element, title);
    row.append(identity, renderItemEta(context, ancestor, options, editable));
    popup.append(row);
  }
  return popup;
}

function renderParentContext(
  context: DataDrivenViewContext,
  entry: SprintBoardItem,
  options: SprintBoardOptions,
  editable: boolean,
): HTMLElement {
  const parentItem = entry.parent!;
  const parentType = options.types.get(parentItem.type);
  const parent = context.doc.createElement("div");
  parent.className = "awesomeado-sprint-card__parent";
  parent.style.cssText = [
    "position:relative",
    "display:inline-flex",
    "min-width:0",
    "margin-top:3px",
  ].join(";");
  const trigger = context.doc.createElement("button");
  trigger.type = "button";
  trigger.className = "awesomeado-sprint-card__parent-trigger";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.title = "Show parent hierarchy";
  trigger.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:3px",
    "min-width:0",
    "padding:0",
    "border:0",
    "background:transparent",
    "font:inherit",
    "font-size:11px",
    "font-weight:600",
    `color:${parentForeground(parentType?.color)}`,
    "cursor:pointer",
  ].join(";");
  const icon = renderItemTypeIcon(context.doc, {
    iconUrl: parentType?.icon ?? null,
    color: workItemTypeTextColor(parentType?.color),
    typeName: parentItem.type,
  });
  icon.element.style.background = OPAQUE_BOARD_BACKGROUND;
  icon.element.style.borderRadius = "50%";
  icon.element.style.padding = "1px";
  const title = context.doc.createElement("span");
  title.className = "awesomeado-sprint-card__parent-title";
  title.textContent = parentItem.title;
  title.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  trigger.append(icon.element, title);
  parent.append(trigger);
  createPopupHost({
    doc: context.doc,
    trigger,
    mountInto: parent,
    buildPopup: () => renderParentPopup(context, entry.ancestors, options, editable),
  });
  return parent;
}

function renderCardFooter(
  context: DataDrivenViewContext,
  item: TrackedWorkItem,
  options: SprintBoardOptions,
  onChildrenOpenChange: (open: boolean) => void,
): { element: HTMLElement; children: ChildBadgeHandle | null } {
  const footer = context.doc.createElement("div");
  footer.className = "awesomeado-sprint-card__footer";
  footer.style.cssText =
    "display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;font-size:10px";
  const eta = renderItemEta(context, item, options);
  eta.classList.add("awesomeado-sprint-card__eta");
  footer.append(eta);
  const children = renderChildrenBadge(context, item, options, onChildrenOpenChange);
  if (children !== null) {
    children.element.style.marginLeft = "auto";
    footer.append(children.element);
  }
  return { element: footer, children };
}

function renderCardDetails(
  context: DataDrivenViewContext,
  entry: SprintBoardItem,
  options: SprintBoardOptions,
  editableParentEta: boolean,
): HTMLElement {
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
      const pill = renderMarkerReasonsPill({
        doc: context.doc,
        item: entry.item,
        marker: key,
        tags: markerTags[key],
        accepted: key === "interrupt" && options.interruptAcceptance.acceptedIds.has(entry.item.id),
        notesSinceIso: options.notesSinceIso,
        services: context.services,
      });
      pill.style.marginLeft = "0";
      tags.append(pill);
    }
    details.append(tags);
  }
  if (entry.parent !== null) {
    details.append(renderParentContext(context, entry, options, editableParentEta));
  }
  return details;
}

function preventCompactFieldEditing(card: HTMLElement): void {
  card.addEventListener(
    "click",
    (event) => {
      if (card.dataset.size !== "compact") return;
      const target = event.target as Element | null;
      if (target?.closest(".awesomeado-assigned__name,.awesomeado-eta__label") === null) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );
}

function registerCardDrag(
  card: HTMLElement,
  entry: SprintBoardItem,
  ordinal: number,
  lane: Lane,
  siblingIds: readonly number[],
  controller: SprintCardDragController | undefined,
): void {
  controller?.registerCard({
    id: entry.item.id,
    lane: lane.areaPath ?? "",
    ordinal,
    parentId: entry.parent?.id ?? 0,
    siblingIds,
    element: card,
  });
}

function wireCardContextMenu(
  card: HTMLElement,
  item: TrackedWorkItem,
  options: SprintBoardOptions,
): void {
  card.addEventListener("contextmenu", (event) =>
    options.contextMenu.openAt(event, options.menuTarget(item)),
  );
}

function setCardControlsEditable(
  large: boolean,
  priority: PriorityBadgeHandle,
  assigneeName: HTMLButtonElement,
  eta: HTMLElement,
  children: ChildBadgeHandle | null,
): void {
  assigneeName.disabled = !large;
  assigneeName.style.cursor = large ? "pointer" : "default";
  priority.setEditable(large);
  eta.setAttribute("aria-disabled", String(!large));
  eta.style.cursor = large ? "pointer" : "default";
  children?.setEditable(large);
  children?.setVisible(large);
}

function renderCard(
  context: DataDrivenViewContext,
  entry: SprintBoardItem,
  ordinal: number,
  lane: Lane,
  siblingIds: readonly number[],
  options: SprintBoardOptions,
): HTMLElement {
  const { item } = entry;
  const type = options.types.get(item.type);
  const card = context.doc.createElement("article");
  card.className = "awesomeado-sprint__item awesomeado-sprint-card";
  card.dataset.itemId = String(item.id);
  card.draggable = true;
  card.style.setProperty("--sprint-item-type-color", workItemTypeTextColor(type?.color));
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
  wireCardContextMenu(card, item, options);

  const title = context.doc.createElement("div");
  title.className = "awesomeado-sprint-card__title";
  title.textContent = item.title;
  title.style.cssText = "font-size:12px;font-weight:700;line-height:1.35;overflow-wrap:anywhere";
  const footer = renderCardFooter(context, item, options, (open) => {
    card.draggable = !open;
    card.style.cursor = open ? "default" : "grab";
    if (open) options.openChildPopupIds.add(item.id);
    else options.openChildPopupIds.delete(item.id);
  });
  const details = renderCardDetails(context, entry, options, ordinal !== 3);
  const meta = renderCardMeta(context, item, options);
  const assigneeName = meta.element.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")!;
  const eta = footer.element.querySelector<HTMLElement>(".awesomeado-sprint-card__eta")!;
  card.append(meta.element, title, footer.element, details);

  const setSize = (large: boolean): void => {
    card.dataset.size = large ? "large" : "compact";
    card.style.minHeight = large ? "112px" : "68px";
    details.style.display = large ? "flex" : "none";
    setCardControlsEditable(large, meta.priority, assigneeName, eta, footer.children);
    card.tabIndex = ordinal === 3 ? 0 : -1;
    if (ordinal === 3) card.setAttribute("aria-expanded", String(large));
  };
  setSize(ordinal !== 3 || options.expandedDoneIds.has(item.id));
  if (ordinal === 3) {
    preventCompactFieldEditing(card);
    const toggle = (): void => {
      if (options.expandedDoneIds.has(item.id)) options.expandedDoneIds.delete(item.id);
      else options.expandedDoneIds.add(item.id);
      setSize(options.expandedDoneIds.has(item.id));
    };
    card.addEventListener("click", (event) => {
      const target = event.target as Element | null;
      if (target?.closest("button,a,input") !== null) return;
      toggle();
    });
    card.addEventListener("keydown", (event) => {
      if (event.target !== card) return;
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggle();
    });
  }
  registerCardDrag(card, entry, ordinal, lane, siblingIds, options.cardDrag);
  return card;
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
  const siblingIds = items.map(({ item }) => item.id);
  for (const entry of items) {
    cell.append(renderCard(context, entry, ordinal, lane, siblingIds, options));
  }
  options.cardDrag?.registerCell(cell, lane.areaPath ?? "", ordinal);
  return cell;
}

/** Total Primary work cards routed to each visible board column, across every lane. */
function countPrimaryWorkPerColumn(
  items: readonly SprintBoardItem[],
  options: SprintBoardOptions,
): number[] {
  const counts = Array.from({ length: VISIBLE_COLUMN_COUNT }, () => 0);
  for (const { item } of items) {
    const ordinal = stateOrdinal(item, options.types.get(item.type));
    if (ordinal >= 0 && ordinal < VISIBLE_COLUMN_COUNT) {
      counts[ordinal] = (counts[ordinal] ?? 0) + 1;
    }
  }
  return counts;
}

function totalOf(counts: readonly number[]): number {
  return counts.reduce((total, count) => total + count, 0);
}

function renderColumnCount(doc: Document, ordinal: number, count: number): HTMLElement {
  const badge = doc.createElement("span");
  badge.className = "awesomeado-sprint__column-count";
  badge.dataset.count = String(count);
  badge.textContent = String(count);
  const label = `${count} Primary work item${count === 1 ? "" : "s"}`;
  badge.title = label;
  badge.setAttribute("aria-label", label);
  // The chip is a sibling of the backdrop, not a child, so the header's stuck 90% opacity dims the
  // fill behind the count without ever dimming the count itself.
  badge.style.cssText = [
    "position:relative",
    "flex:none",
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "box-sizing:border-box",
    "min-width:22px",
    "padding:1px 6px",
    "border-radius:9px",
    `background:${COLUMN_COUNT_BACKGROUNDS[ordinal]}`,
    "border-width:1px",
    "border-style:solid",
    `border-color:${COLUMN_FOREGROUNDS[ordinal]}`,
    "font-size:11px",
    "font-weight:700",
    "line-height:1.4",
    `color:${COLUMN_FOREGROUNDS[ordinal]}`,
  ].join(";");
  return badge;
}

function renderColumnHighlight(doc: Document): HTMLElement {
  const highlight = doc.createElement("span");
  highlight.className = "awesomeado-sprint__column-title-highlight";
  highlight.setAttribute("aria-hidden", "true");
  highlight.style.cssText = [
    "position:absolute",
    "inset:0",
    "z-index:2",
    "box-sizing:border-box",
    "border:2px solid transparent",
    "pointer-events:none",
  ].join(";");
  return highlight;
}

function renderColumnTitle(
  doc: Document,
  ordinal: number,
  label: string,
  count: number,
): HTMLElement {
  const heading = doc.createElement("div");
  heading.className = "awesomeado-sprint__column-title";
  heading.dataset.restingBackground = COLUMN_HEADER_BACKGROUNDS[ordinal];
  heading.dataset.stickyBackground = STICKY_COLUMN_HEADER_BACKGROUNDS[ordinal];
  heading.dataset.restingOpacity = "1";
  heading.dataset.stickyOpacity = String(STICKY_HEADER_OPACITY);
  heading.style.cssText = [
    "position:relative",
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
    "gap:8px",
    "padding:9px 10px",
    "font-size:12px",
    "font-weight:800",
    `color:${COLUMN_FOREGROUNDS[ordinal]}`,
    "background:transparent",
    "border-right:1px solid var(--control-border)",
    "border-bottom:1px solid var(--control-border)",
  ].join(";");
  heading.style.setProperty(
    "--sprint-column-header-background",
    COLUMN_HEADER_BACKGROUNDS[ordinal] ?? COLUMN_HEADER_BACKGROUNDS[0],
  );
  heading.style.setProperty("--sprint-column-header-opacity", "1");
  const backdrop = doc.createElement("span");
  backdrop.className = "awesomeado-sprint__column-title-backdrop";
  backdrop.setAttribute("aria-hidden", "true");
  backdrop.style.cssText = [
    "position:absolute",
    "inset:0",
    "pointer-events:none",
    "background:var(--sprint-column-header-background)",
    "opacity:var(--sprint-column-header-opacity)",
  ].join(";");
  const title = doc.createElement("span");
  title.className = "awesomeado-sprint__column-title-label";
  title.textContent = label;
  title.style.cssText = "position:relative;min-width:0;overflow-wrap:anywhere";
  heading.append(
    backdrop,
    title,
    renderColumnCount(doc, ordinal, count),
    renderColumnHighlight(doc),
  );
  return heading;
}

function renderColumnHeader(
  doc: Document,
  boardColumns: readonly string[],
  counts: readonly number[],
): { element: HTMLElement; grid: HTMLElement; titles: HTMLElement[] } {
  const header = doc.createElement("div");
  header.className = "awesomeado-sprint__board-header";
  header.style.cssText = [
    "position:sticky",
    "top:var(--awesomeado-sprint-column-header-top,0px)",
    "z-index:1",
    "display:grid",
    `grid-template-columns:${BOARD_LAYOUT_COLUMNS}`,
    "background:transparent",
  ].join(";");
  const laneHeading = doc.createElement("div");
  laneHeading.className = "awesomeado-sprint__lane-heading";
  laneHeading.setAttribute("aria-hidden", "true");
  laneHeading.style.cssText = `background:${OPAQUE_BOARD_BACKGROUND};border-right:1px solid var(--control-border);border-bottom:1px solid var(--control-border);border-top-left-radius:3px`;
  const viewport = doc.createElement("div");
  viewport.style.cssText = "min-width:0;overflow:hidden";
  const grid = doc.createElement("div");
  grid.className = "awesomeado-sprint__board-header-grid";
  grid.setAttribute("role", "row");
  grid.style.cssText = [
    "display:grid",
    `grid-template-columns:${CARD_GRID_COLUMNS}`,
    `min-width:${CARD_GRID_MIN_WIDTH}`,
    "will-change:transform",
  ].join(";");
  const titles: HTMLElement[] = [];
  for (let ordinal = 0; ordinal < VISIBLE_COLUMN_COUNT; ordinal += 1) {
    const heading = renderColumnTitle(
      doc,
      ordinal,
      boardColumns[ordinal] ?? "",
      counts[ordinal] ?? 0,
    );
    titles.push(heading);
    grid.append(heading);
  }
  viewport.append(grid);
  header.append(laneHeading, viewport);
  return { element: header, grid, titles };
}

function findItem(items: readonly TrackedWorkItem[], id: number): TrackedWorkItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    const child = findItem(item.children, id);
    if (child !== null) return child;
  }
  return null;
}

function applyReportedRanks(
  items: readonly TrackedWorkItem[],
  ranks: readonly { id: number; rank: number; rev?: number }[],
): void {
  for (const { id, rank, rev } of ranks) {
    const item = findItem(items, id);
    if (item === null) continue;
    item.importance = rank;
    // A rank write is a revision too, so an item renumbered here keeps a usable rev; without this
    // the next edit to any sibling the renumber touched is refused as a conflict.
    if (rev !== undefined) item.rev = rev;
  }
}

interface RankMove {
  id: number;
  parentId: number;
  currentParentId: number;
  previousId: number;
  nextId: number;
  siblingIds: readonly number[];
  stateName?: string;
  stateBaseName?: string;
}

function persistRankMove(
  move: RankMove,
  roots: readonly TrackedWorkItem[],
  options: SprintBoardOptions,
  afterSuccess?: () => void,
  onResult?: (result: WorkItemReorderResult) => void,
): void {
  if (options.team === null) return;
  const moved = findItem(roots, move.id);
  if (moved === null) return;
  void options.writes
    .enqueueReorder({
      id: move.id,
      currentRev: () => moved.rev,
      parentId: move.parentId,
      currentParentId: move.currentParentId,
      previousId: move.previousId,
      nextId: move.nextId,
      siblingIds: move.siblingIds,
      team: options.team,
      stateName: move.stateName,
      stateBaseName: move.stateBaseName,
    })
    .then((result) =>
      reconcileRankMove(result, moved, move, roots, options, afterSuccess, onResult),
    );
}

function reconcileRankMove(
  result: WorkItemReorderResult,
  moved: TrackedWorkItem,
  move: RankMove,
  roots: readonly TrackedWorkItem[],
  options: SprintBoardOptions,
  afterSuccess?: () => void,
  onResult?: (result: WorkItemReorderResult) => void,
): void {
  if (result.rev !== undefined) moved.rev = result.rev;
  if (result.ranks !== undefined) applyReportedRanks(roots, result.ranks);
  if (result.order !== undefined) moved.importance = result.order;
  onResult?.(result);
  if (!result.ok) {
    if (reorderPartlyApplied(result)) options.onItemChanged();
    return;
  }
  if (result.ranks === undefined && result.order === undefined) {
    applyReportedRanks(
      roots,
      move.siblingIds.map((id, rank) => ({ id, rank })),
    );
  }
  afterSuccess?.();
  options.onItemChanged();
}

function reorderPartlyApplied(result: WorkItemReorderResult): boolean {
  return result.reparented === true || result.stateChanged === true;
}

function persistChildMove(
  move: PlannedMove,
  roots: readonly TrackedWorkItem[],
  options: SprintBoardOptions,
): void {
  persistRankMove(move, roots, options, () => options.openChildPopupIds.add(move.parentId));
}

function persistCardMove(
  context: DataDrivenViewContext,
  move: SprintCardMove,
  cards: readonly SprintBoardItem[],
  roots: readonly TrackedWorkItem[],
  options: SprintBoardOptions,
): void {
  const source = cards.find(({ item }) => item.id === move.id);
  if (source === undefined) return;
  const nextState = primaryState(source.item, move.destinationOrdinal, options);
  const changesState =
    nextState !== null &&
    stateOrdinal(source.item, options.types.get(source.item.type)) !== move.destinationOrdinal;
  persistRankMove(
    {
      ...move,
      stateName: changesState ? nextState : undefined,
      stateBaseName: changesState ? source.item.state : undefined,
    },
    roots,
    options,
    undefined,
    (result) => {
      if (!changesState || (!result.ok && result.stateChanged !== true)) return;
      source.item.state = nextState;
      source.item.stateChangeDate = context.services.now().toISOString();
    },
  );
}

function renderLane(
  context: DataDrivenViewContext,
  lane: Lane,
  laneItems: readonly SprintBoardItem[],
  options: SprintBoardOptions,
): { element: HTMLElement; grid: HTMLElement } {
  const section = context.doc.createElement("section");
  section.className = "awesomeado-sprint__lane-row";
  section.style.cssText = [
    "display:grid",
    `grid-template-columns:${BOARD_LAYOUT_COLUMNS}`,
    "position:relative",
  ].join(";");
  const rail = context.doc.createElement("div");
  rail.style.cssText = `grid-column:1;grid-row:1;background:${OPAQUE_BOARD_BACKGROUND};border-right:1px solid var(--control-border);border-bottom:1px solid var(--control-border)`;
  const laneLabel = context.doc.createElement("div");
  laneLabel.className = "awesomeado-sprint__lane";
  laneLabel.title = lane.areaPath ?? lane.label;
  laneLabel.style.cssText = [
    "grid-column:1",
    "grid-row:1",
    "position:sticky",
    "top:calc(var(--awesomeado-sprint-column-header-top,0px) + var(--awesomeado-sprint-board-header-height,0px))",
    "z-index:1",
    "align-self:start",
    "margin-bottom:1px",
    "display:flex",
    "flex-direction:column",
    "gap:3px",
    "padding:10px",
    "font-size:11px",
    "font-weight:700",
    "overflow-wrap:anywhere",
    `background:${OPAQUE_BOARD_BACKGROUND}`,
    "border-right:1px solid var(--control-border)",
    "box-sizing:border-box",
  ].join(";");
  const laneName = context.doc.createElement("span");
  laneName.className = "awesomeado-sprint__lane-name";
  laneName.textContent = lane.label;
  laneName.style.fontSize = "13.2px";
  const laneCount = context.doc.createElement("span");
  laneCount.className = "awesomeado-sprint__lane-count";
  // Count the same cards the lane actually renders, so a lane total always equals the sum of the
  // column badges above it — Primary work routed outside the four visible columns is not shown.
  const laneTotal = totalOf(countPrimaryWorkPerColumn(laneItems, options));
  laneCount.textContent = `${laneTotal} item${laneTotal === 1 ? "" : "s"}`;
  laneCount.style.cssText =
    "font-size:10px;font-weight:500;color:var(--text-secondary-color);opacity:0.65";
  laneLabel.append(laneName, laneCount);
  const viewport = context.doc.createElement("div");
  viewport.style.cssText = "grid-column:2;grid-row:1;min-width:0;overflow:hidden";
  const grid = context.doc.createElement("div");
  grid.className = "awesomeado-sprint__lane-grid";
  grid.style.cssText = [
    "display:grid",
    `grid-template-columns:${CARD_GRID_COLUMNS}`,
    `min-width:${CARD_GRID_MIN_WIDTH}`,
    "will-change:transform",
  ].join(";");
  for (let ordinal = 0; ordinal < VISIBLE_COLUMN_COUNT; ordinal += 1) {
    const cellItems = orderTrackedItems(
      laneItems.filter(
        (entry) => stateOrdinal(entry.item, options.types.get(entry.item.type)) === ordinal,
      ),
      ({ item }) => item,
      options.orderingPolicy,
    );
    grid.append(renderCell(context, lane, ordinal, cellItems, options));
  }
  viewport.append(grid);
  section.append(rail, laneLabel, viewport);
  return { element: section, grid };
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
  // Guard on the cards the board would actually paint, not on the matches: lanes and column titles
  // wrapped around zero cards read as a failed load just as much as a bare empty rectangle does.
  const columnCounts = countPrimaryWorkPerColumn(cardItems, options);
  const visibleCardCount = totalOf(columnCounts);
  options.onCardsShown(visibleCardCount);
  if (visibleCardCount === 0) {
    section.append(
      renderEmptyState(context.doc, {
        message: "No items match the current filters.",
        hint: "Clear or widen a filter above to bring items back.",
      }),
    );
    return section;
  }
  section.style.cssText = "border:1px solid var(--control-border);border-radius:4px";
  const rootItems = cardItems.map(({ item }) => item);
  const cardDrag = new SprintCardDragController(
    context.doc,
    options.team !== null && options.orderingPolicy === MANUAL_ORDERING_POLICY,
    (id, ordinal) => {
      const source = cardItems.find(({ item }) => item.id === id);
      if (source !== undefined) applyDrop(context, source, ordinal, source.item.areaPath, options);
    },
    (move) => persistCardMove(context, move, cardItems, rootItems, options),
    context.services.logger,
  );
  const dragReorder =
    options.team === null || options.orderingPolicy !== MANUAL_ORDERING_POLICY
      ? undefined
      : new DragReorderController(
          context.doc,
          (move) => persistChildMove(move, rootItems, options),
          context.services.logger,
        );
  const renderOptions = { ...options, cardDrag, dragReorder };
  const header = renderColumnHeader(context.doc, options.boardColumns, columnCounts);
  header.titles.forEach((title, ordinal) => cardDrag.registerColumnTitle(ordinal, title));
  const laneGrids: HTMLElement[] = [];
  const lanes = context.doc.createElement("div");
  lanes.className = "awesomeado-sprint__lanes";
  for (const lane of lanesOf(cardItems)) {
    const laneItems = cardItems.filter(({ item }) => item.areaPath === lane.areaPath);
    const rendered = renderLane(context, lane, laneItems, renderOptions);
    laneGrids.push(rendered.grid);
    lanes.append(rendered.element);
  }
  const scrollRow = context.doc.createElement("div");
  scrollRow.style.cssText = `display:grid;grid-template-columns:${BOARD_LAYOUT_COLUMNS}`;
  const scroller = context.doc.createElement("div");
  scroller.className = "awesomeado-sprint__board-scroller";
  scroller.style.cssText = "grid-column:2;min-width:0;overflow-x:auto";
  const scrollTrack = context.doc.createElement("div");
  scrollTrack.style.cssText = `width:max(100%,${CARD_GRID_MIN_WIDTH});height:1px`;
  scroller.addEventListener("scroll", () => {
    const transform = `translateX(-${scroller.scrollLeft}px)`;
    header.grid.style.transform = transform;
    for (const grid of laneGrids) grid.style.transform = transform;
  });
  scroller.append(scrollTrack);
  scrollRow.append(scroller);
  section.append(header.element, lanes, scrollRow);
  return section;
}
