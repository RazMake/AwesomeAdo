import { ALL_WORK_ITEM_NOTES_SINCE } from "../../../common/ado/IWorkItemNoteLoader";
import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { orderTrackedItems, workItemTypeColor } from "../../../common/ado/workItemTypes";
import type { OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import type { EnhancedViewServices } from "../../../common/view-common/EnhancedView";
import type { DragReorderController } from "../../../common/view-common/control/DragReorder/DragReorderController";
import { renderItemDetailsPanel } from "../../../common/view-common/control/ItemDetails/ItemDetails";
import {
  renderTreeChildren,
  renderTreeItemWrapper,
  renderTreeRowLine,
  renderTreeTitle,
  renderTreeTwisty,
} from "../../../common/view-common/control/TreeRow/TreeRow";
import { renderItemStatusBadge } from "../item-status/itemStatusBadge";
import { renderItemNotesToggle } from "../project-tracking/notes/ItemNotesToggle";
import { createNotesPanelState, type NotesPanelState } from "../project-tracking/notes/NotesPanel";

import type { ConsumerContactEditor } from "./profile/ConsumerContactEditor";
import { renderConsumerProfileLines, type ContactEditing } from "./profile/ConsumerProfileLines";
import { readConsumerProfile } from "./profile/consumerProfile";

/** What one paint of the consumer list hands every row it builds. */
export interface ConsumerRowContext {
  doc: Document;
  types: ReadonlyMap<string, TypeCatalogEntry>;
  /** The team's global board-column order, which colors every Status badge. */
  boardColumns: readonly string[];
  /** The board's one serialized write queue, shared by Status edits and drag moves. */
  queue: WorkItemWriteQueue;
  services: EnhancedViewServices;
  /** One badge width for the whole board, so every Status lines up down the list. */
  statusWidthCh: number;
  now(): Date;
  policy: OrderingPolicy;
  /** Consumers the reader closed. Rows start open: the requests are what this board is read for. */
  collapsedIds: Set<number>;
  expandedDescriptionIds: Set<number>;
  expandedNoteIds: Set<number>;
  notePanelStates: Map<number, NotesPanelState>;
  mentionNames: ReadonlyMap<string, string>;
  /** The hidden grouping item every consumer is a child of, and so the parent a consumer drop names. */
  groupingId: number;
  /**
   * Every consumer in the board's order, including any the area filters hide. A drop is ranked
   * against the full level rather than what is on screen: ranking against only the visible
   * consumers would place one relative to whatever the filter happened to leave, so clearing the
   * filter afterwards would reveal it somewhere nobody dropped it.
   */
  consumerSiblingIds: readonly number[];
  /** Present only while a manual drag can be honoured (importance ordering, a configured team). */
  dragReorder: DragReorderController | null;
  /** Writes a card's contact edits back into the consumer's description. */
  contactEditor: ConsumerContactEditor;
  /** Every role already given to a contact on this board, offered when a role is picked. */
  contactRoles: readonly string[];
  onContextMenu(item: TrackedWorkItem, event: MouseEvent): void;
  /** Rebuild the list after an expand/collapse, so open/closed state lives outside the DOM. */
  repaint(): void;
}

const PREFIX = "awesomeado-consumers";

/**
 * Every request a consumer made, in the board's ordering policy. Requests are never filtered: once
 * a consumer is on the board, all of what it asked for is.
 */
export function requestsOf(consumer: TrackedWorkItem, policy: OrderingPolicy): TrackedWorkItem[] {
  return orderTrackedItems(consumer.children, (request) => request, policy);
}

/** What every row draws besides its twisty: the two toggles, the title, and the panels they open. */
interface ItemParts {
  describe: HTMLElement;
  notesToggle: HTMLElement;
  title: HTMLElement;
  description: HTMLElement;
  notes: HTMLElement;
}

/** The `?` details toggle, the notes toggle, and the title, plus the panels the toggles open. */
function renderItemParts(item: TrackedWorkItem, context: ConsumerRowContext): ItemParts {
  const { doc } = context;
  const entry = context.types.get(item.type);
  const details = renderItemDetailsPanel(doc, {
    data: item,
    typeColor: workItemTypeColor(entry?.color),
    mentionNames: context.mentionNames,
    buttonClassName: `${PREFIX}__describe`,
    panelClassName: `${PREFIX}__description`,
  });
  const descriptionExpanded = context.expandedDescriptionIds.has(item.id);
  details.setExpanded(descriptionExpanded);
  details.toggle.addEventListener("click", () => {
    if (details.isExpanded()) context.expandedDescriptionIds.add(item.id);
    else context.expandedDescriptionIds.delete(item.id);
  });
  details.toggle.style.flex = "0 0 auto";

  let noteState = context.notePanelStates.get(item.id);
  if (noteState === undefined) {
    noteState = createNotesPanelState();
    context.notePanelStates.set(item.id, noteState);
  }
  const noteToggle = renderItemNotesToggle({
    doc,
    item,
    entry,
    services: context.services,
    sinceIso: ALL_WORK_ITEM_NOTES_SINCE,
    state: noteState,
    expanded: context.expandedNoteIds.has(item.id),
    toggleClassName: `${PREFIX}__notes-toggle`,
    onExpandedChange: (expanded) => {
      if (expanded) context.expandedNoteIds.add(item.id);
      else context.expandedNoteIds.delete(item.id);
    },
  });
  return {
    describe: details.toggle,
    notesToggle: noteToggle.toggle,
    title: renderTreeTitle(doc, PREFIX, item, entry),
    description: details.element,
    notes: noteToggle.panel,
  };
}

/** Where a right-click belongs to the browser: the reader is editing text, not choosing a command. */
const TEXT_ENTRY = "input, textarea, [contenteditable]";

/**
 * Open the item's menu from anywhere on `surface`.
 *
 * Bound per surface rather than on the list, so the INNERMOST row under the pointer wins; the shared
 * menu stops the event itself, so the consumer around a request never also opens. A text field
 * mounted on the surface (a picker's search box, the role editor) keeps its native menu, where
 * paste and spelling suggestions live.
 */
function bindItemMenu(
  surface: HTMLElement,
  item: TrackedWorkItem,
  context: ConsumerRowContext,
): void {
  surface.addEventListener("contextmenu", (event) => {
    const target = event.target as Element | null;
    if (target?.closest?.(TEXT_ENTRY)) return;
    context.onContextMenu(item, event);
  });
}

/** The consumer's twisty, or a same-width spacer when no request is left to open onto. */
function renderConsumerTwisty(
  consumer: TrackedWorkItem,
  context: ConsumerRowContext,
  expandable: boolean,
): HTMLElement {
  const expanded = !context.collapsedIds.has(consumer.id);
  return renderTreeTwisty(
    context.doc,
    PREFIX,
    consumer,
    expandable
      ? {
          expanded,
          onToggle: () => {
            if (expanded) context.collapsedIds.add(consumer.id);
            else context.collapsedIds.delete(consumer.id);
            context.repaint();
          },
        }
      : null,
  );
}

/** One feature request beneath its consumer; requests are always leaves on this board. */
function renderRequestRow(
  request: TrackedWorkItem,
  consumer: TrackedWorkItem,
  siblingIds: readonly number[],
  context: ConsumerRowContext,
): HTMLElement {
  const { doc } = context;
  const parts = renderItemParts(request, context);
  const line = renderTreeRowLine(doc, PREFIX, null);
  line.append(
    renderTreeTwisty(doc, PREFIX, request, null),
    renderItemStatusBadge({
      doc,
      item: request,
      entry: context.types.get(request.type),
      boardColumns: context.boardColumns,
      queue: context.queue,
      minWidthCh: context.statusWidthCh,
      now: () => context.now(),
    }),
    parts.describe,
    parts.notesToggle,
    parts.title,
  );
  bindItemMenu(line, request, context);
  const wrapper = renderTreeItemWrapper(doc, PREFIX, request, line);
  wrapper.append(parts.description, parts.notes);
  context.dragReorder?.register({
    id: request.id,
    depth: 1,
    // Anything below a request is not part of this board, so nothing is carried along visibly.
    hasChildren: false,
    parentId: consumer.id,
    destinationType: null,
    siblingIds,
    handle: parts.title,
    row: line,
    wrapper,
  });
  return wrapper;
}

/**
 * The consumer's ONE row surface, laid out as a grid: the twisty keeps a column of its own, and the
 * title's line and everything the description says about the consumer share the second — so the
 * `?` and the service details start at the same left edge, and the stripe and hover light the whole
 * record at once instead of line by line.
 */
const CARD_LAYOUT: ReadonlyArray<readonly [string, string]> = [
  ["display", "grid"],
  ["grid-template-columns", "16px minmax(0, 1fr)"],
  ["column-gap", "8px"],
  ["row-gap", "4px"],
  ["align-items", "center"],
  ["padding", "6px 8px 7px 4px"],
  ["border", "1px solid var(--control-border)"],
  ["border-radius", "6px"],
];

/** The contact edits one consumer's card offers, each handed to the board's contact editor. */
function contactEditingFor(consumer: TrackedWorkItem, context: ConsumerRowContext): ContactEditing {
  const editor = context.contactEditor;
  return {
    userDirectory: context.services.userDirectory,
    roles: context.contactRoles,
    onAdd: (person) => editor.add(consumer, person),
    onReplace: (index, person) => editor.replace(consumer, index, person),
    onRoleChange: (index, role) => editor.setRole(consumer, index, role),
    onRemove: (index) => editor.remove(consumer, index),
  };
}

/**
 * The consumer's card: its title line and, directly beneath, the service it is and the people behind
 * it — what the row IS, not something the reader has to open. The panels the `?` and the type icon
 * open are NOT part of it; they unfold below the card rather than stretching it.
 */
function renderConsumerCard(
  consumer: TrackedWorkItem,
  context: ConsumerRowContext,
  twisty: HTMLElement,
  parts: ItemParts,
): HTMLElement {
  const { doc } = context;
  const card = renderTreeRowLine(doc, PREFIX, "is-consumer");
  card.classList.add(`${PREFIX}__card`);
  for (const [property, value] of CARD_LAYOUT) card.style.setProperty(property, value);
  const head = doc.createElement("div");
  head.className = `${PREFIX}__card-head`;
  head.style.cssText = "display:flex;align-items:center;gap:8px;min-width:0";
  head.append(parts.describe, parts.notesToggle, parts.title);
  card.append(twisty, head);
  const profile = renderConsumerProfileLines(
    doc,
    readConsumerProfile(consumer.description, { mentionNames: context.mentionNames }),
    contactEditingFor(consumer, context),
  );
  profile.style.gridColumn = "2";
  card.append(profile);
  bindItemMenu(card, consumer, context);
  return card;
}

/**
 * One consumer and, while open, every request it asked for.
 *
 * A consumer with no request is still drawn: it is the row a request has to be dragged onto to be
 * handed to them.
 */
export function renderConsumerRow(
  consumer: TrackedWorkItem,
  context: ConsumerRowContext,
): HTMLElement {
  const requests = requestsOf(consumer, context.policy);
  const expanded = requests.length > 0 && !context.collapsedIds.has(consumer.id);
  const parts = renderItemParts(consumer, context);
  const card = renderConsumerCard(
    consumer,
    context,
    renderConsumerTwisty(consumer, context, requests.length > 0),
    parts,
  );
  const wrapper = renderTreeItemWrapper(context.doc, PREFIX, consumer, card);
  wrapper.classList.add(`${PREFIX}__consumer`);
  // The card draws its own outline; the gap below is what tells one consumer's requests from the
  // next consumer's card.
  wrapper.style.marginBottom = "6px";
  wrapper.append(parts.description, parts.notes);
  const siblingIds = requests.map((request) => request.id);
  context.dragReorder?.register({
    id: consumer.id,
    depth: 0,
    hasChildren: consumer.children.length > 0,
    parentId: context.groupingId,
    destinationType: null,
    siblingIds: context.consumerSiblingIds,
    // A request dropped onto the middle of a consumer — open, closed, or empty — joins the end of
    // that consumer's requests.
    childDestination: { siblingIds },
    handle: parts.title,
    row: card,
    wrapper,
  });
  if (expanded) {
    const children = renderTreeChildren(context.doc, PREFIX);
    for (const request of requests) {
      children.append(renderRequestRow(request, consumer, siblingIds, context));
    }
    wrapper.append(children);
  }
  return wrapper;
}
