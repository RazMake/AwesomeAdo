import { ALL_WORK_ITEM_NOTES_SINCE } from "../../../common/ado/IWorkItemNoteLoader";
import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { orderTrackedItems, workItemTypeColor } from "../../../common/ado/workItemTypes";
import type { OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import type { EnhancedViewServices } from "../../../common/view-common/EnhancedView";
import type { DragReorderController } from "../../../common/view-common/control/DragReorder/DragReorderController";
import { renderItemDetailsPanel } from "../../../common/view-common/control/ItemDetails/ItemDetails";
import { renderTagPill } from "../../../common/view-common/control/TagPill/TagPill";
import {
  renderTreeChildren,
  renderTreeItemWrapper,
  renderTreeRowLine,
  renderTreeTitle,
  renderTreeTwisty,
} from "../../../common/view-common/control/TreeRow/TreeRow";
import { renderRowEtaBadge } from "../item-eta/renderRowEtaBadge";
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
  /**
   * Consumers the reader opened. Every consumer starts closed, its request count standing in for the
   * list, so a long consumer roster reads as a roster first.
   */
  expandedIds: Set<number>;
  expandedDescriptionIds: Set<number>;
  expandedNoteIds: Set<number>;
  notePanelStates: Map<number, NotesPanelState>;
  mentionNames: ReadonlyMap<string, string>;
  /**
   * The hidden grouping item every consumer is a child of. The requests-only list registers every
   * request under it, so the whole list reads as ONE level to the drag controller; the board maps
   * a drop back onto the request's real consumer before persisting it.
   */
  groupingId: number;
  /**
   * Every request of every consumer in backlog-rank order, including any the filters hide. A drop is
   * ranked against the full list rather than what is on screen: ranking against only the visible
   * requests would place one relative to whatever the filters happened to leave, so clearing them
   * afterwards would reveal it somewhere nobody dropped it.
   */
  requestSiblingIds: readonly number[];
  /**
   * Present only while a manual drag can be honoured: the requests-only list, ordered by hand, with
   * a configured team. The consumer cards never offer it — their order is fixed.
   */
  dragReorder: DragReorderController | null;
  /**
   * Whether the requests-only list leaves out the consumer pill: once the reader filtered to the
   * consumers they care about, naming them on every row is noise.
   */
  hideConsumerTags: boolean;
  /** Writes a card's contact edits back into the consumer's description. */
  contactEditor: ConsumerContactEditor;
  /** Every role already given to a contact on this board, offered when a role is picked. */
  contactRoles: readonly string[];
  onContextMenu(item: TrackedWorkItem, event: MouseEvent): void;
  /** Whether the area filters (binding and header) keep a request; consumers are never filtered. */
  keepsRequest(request: TrackedWorkItem): boolean;
  /** Rebuild the list after an expand/collapse, so open/closed state lives outside the DOM. */
  repaint(): void;
}

const PREFIX = "awesomeado-consumers";

/**
 * The requests of a consumer the area filters keep, in the board's ordering policy. Area paths
 * describe where the work is filed, which says nothing about who asked for it, so only requests
 * are narrowed and the consumer stays on the board.
 */
export function requestsOf(
  consumer: TrackedWorkItem,
  context: Pick<ConsumerRowContext, "policy" | "keepsRequest">,
): TrackedWorkItem[] {
  return orderTrackedItems(
    consumer.children.filter((request) => context.keepsRequest(request)),
    (request) => request,
    context.policy,
  );
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

/** The pill's frame, shared by the live count and the inert zero so every card's column lines up. */
const REQUEST_COUNT_STYLE = [
  "box-sizing:border-box",
  "justify-self:center",
  "min-width:22px",
  "height:20px",
  "padding:0 6px",
  "border-radius:10px",
  "font:inherit",
  "font-size:11px",
  "font-weight:600",
  "line-height:18px",
  "text-align:center",
].join(";");

/**
 * How many feature requests the consumer made, in the card's first column, where a twisty would
 * otherwise sit: the number answers "how much does this consumer want?" before anything is opened,
 * and pressing it opens or closes exactly those requests. Filled while open, so an open card is
 * recognisable from the column alone.
 */
function renderRequestCount(
  consumer: TrackedWorkItem,
  count: number,
  context: ConsumerRowContext,
  expanded: boolean,
): HTMLElement {
  const { doc } = context;
  if (count === 0) {
    const none = doc.createElement("span");
    none.className = `${PREFIX}__request-count is-empty`;
    none.textContent = "0";
    none.title = "No feature requests";
    none.style.cssText = `${REQUEST_COUNT_STYLE};border:1px solid transparent;color:var(--text-secondary-color)`;
    return none;
  }
  const button = doc.createElement("button");
  button.type = "button";
  button.className = `${PREFIX}__request-count`;
  button.textContent = String(count);
  button.title = `${expanded ? "Hide" : "Show"} ${count} feature request${count === 1 ? "" : "s"}`;
  button.setAttribute("aria-label", `${button.title} from ${consumer.title}`);
  button.setAttribute("aria-expanded", String(expanded));
  button.style.cssText = [
    REQUEST_COUNT_STYLE,
    "cursor:pointer",
    expanded
      ? "border:1px solid var(--communication-background)"
      : "border:1px solid var(--control-border-strong)",
    expanded ? "background:var(--communication-background)" : "background:transparent",
    expanded ? "color:var(--text-on-communication-background)" : "color:var(--text-primary-color)",
  ].join(";");
  button.addEventListener("click", () => {
    if (expanded) context.expandedIds.delete(consumer.id);
    else context.expandedIds.add(consumer.id);
    context.repaint();
  });
  return button;
}

/**
 * The consumer a request was made by, as a small tag after the request's title — the only place a
 * requests-only list can say whose request it is. Colored per consumer, so one consumer's requests
 * read as a set wherever the ordering scatters them.
 */
function renderConsumerTag(doc: Document, consumer: TrackedWorkItem): HTMLElement {
  const tag = renderTagPill(doc, { tag: consumer.title });
  tag.classList.add(`${PREFIX}__consumer-tag`);
  tag.title = `Requested by ${consumer.title}`;
  // The request's title is what the row is about, so a long consumer name is the one to clip.
  tag.style.display = "inline-block";
  tag.style.maxWidth = "16em";
  tag.style.overflow = "hidden";
  tag.style.textOverflow = "ellipsis";
  tag.style.flex = "0 0 auto";
  return tag;
}

/** A request's line and the panels it opens, before the caller decides where the line sits. */
interface RequestParts {
  line: HTMLElement;
  wrapper: HTMLElement;
  /** The title, which is also the drag handle wherever a request can be dragged. */
  handle: HTMLElement;
}

/**
 * One feature request: Status, the `?` and Discussion toggles, and the title, with its panels
 * unfolding beneath. `lead` and `trail` are what tells the tree's request from the requests-only
 * list's — the tree's indent spacer before, the consumer tag after.
 */
function renderRequestParts(
  request: TrackedWorkItem,
  context: ConsumerRowContext,
  extras: { lead: readonly HTMLElement[]; trail: readonly HTMLElement[] },
): RequestParts {
  const { doc } = context;
  const parts = renderItemParts(request, context);
  const line = renderTreeRowLine(doc, PREFIX, null);
  line.append(
    ...extras.lead,
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
    ...extras.trail,
  );
  bindItemMenu(line, request, context);
  const wrapper = renderTreeItemWrapper(doc, PREFIX, request, line);
  wrapper.classList.add(`${PREFIX}__request`);
  wrapper.append(parts.description, parts.notes);
  return { line, wrapper, handle: parts.title };
}

/** What the date on a request means on this board: when its consumer needs it. */
const NEEDED_BY_WORDING = { prefix: "Needed by", empty: "No needed-by date" };

/**
 * One request in the requests-only list: the same row as in the tree, tagged with the consumer that
 * made it (unless the consumer filter already says whose it is) and the date it is needed by.
 *
 * Draggable as one flat list: backlog rank is a single order across the whole backlog, so ranking a
 * request between two others that belong to different consumers is still a well-defined placement.
 */
export function renderRequestOnlyRow(
  request: TrackedWorkItem,
  consumer: TrackedWorkItem,
  context: ConsumerRowContext,
): HTMLElement {
  const { doc } = context;
  const trail: HTMLElement[] = [];
  if (!context.hideConsumerTags) trail.push(renderConsumerTag(doc, consumer));
  const eta = renderRowEtaBadge({
    doc,
    item: request,
    types: context.types,
    now: context.now(),
    queue: context.queue,
    wording: NEEDED_BY_WORDING,
  });
  if (eta !== null) trail.push(eta);
  const { line, wrapper, handle } = renderRequestParts(request, context, { lead: [], trail });
  context.dragReorder?.register({
    id: request.id,
    depth: 0,
    hasChildren: false,
    parentId: context.groupingId,
    destinationType: null,
    siblingIds: context.requestSiblingIds,
    handle,
    row: line,
    wrapper,
  });
  return wrapper;
}

/** One feature request beneath its consumer; requests are always leaves on this board. */
function renderRequestRow(request: TrackedWorkItem, context: ConsumerRowContext): HTMLElement {
  return renderRequestParts(request, context, {
    lead: [renderTreeTwisty(context.doc, PREFIX, request, null)],
    trail: [],
  }).wrapper;
}

/**
 * The consumer's ONE row surface, laid out as a grid: the request count keeps a column of its own,
 * wide enough for three digits so every card's title starts at the same place, and the title's line
 * and everything the description says about the consumer share the second — so the `?` and the
 * service details start at the same left edge, and the stripe and hover light the whole record at
 * once instead of line by line.
 */
const CARD_LAYOUT: ReadonlyArray<readonly [string, string]> = [
  ["display", "grid"],
  ["grid-template-columns", "32px minmax(0, 1fr)"],
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
 * The consumer's own Azure DevOps tags, as pills after its name. Only a consumer shows them: they
 * are what the header's Tags filter judges consumers by, so seeing them on the card explains why a
 * consumer was kept or hidden, while a request's tags would only crowd the line the reader ranks by.
 */
function renderOwnTags(doc: Document, consumer: TrackedWorkItem): HTMLElement[] {
  return consumer.tags.map((tag) => {
    const pill = renderTagPill(doc, { tag });
    pill.classList.add(`${PREFIX}__consumer-item-tag`);
    pill.style.flex = "0 0 auto";
    return pill;
  });
}

/**
 * The consumer's card: its title line and, directly beneath, the service it is and the people behind
 * it — what the row IS, not something the reader has to open. The panels the `?` and the type icon
 * open are NOT part of it; they unfold below the card rather than stretching it.
 */
function renderConsumerCard(
  consumer: TrackedWorkItem,
  context: ConsumerRowContext,
  requestCount: HTMLElement,
  parts: ItemParts,
): HTMLElement {
  const { doc } = context;
  const card = renderTreeRowLine(doc, PREFIX, "is-consumer");
  card.classList.add(`${PREFIX}__card`);
  for (const [property, value] of CARD_LAYOUT) card.style.setProperty(property, value);
  const head = doc.createElement("div");
  head.className = `${PREFIX}__card-head`;
  head.style.cssText = "display:flex;align-items:center;gap:8px;min-width:0";
  head.append(parts.describe, parts.notesToggle, parts.title, ...renderOwnTags(doc, consumer));
  card.append(requestCount, head);
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
 * One consumer and, while open, every request it asked for. Nothing here is draggable: the cards
 * show who asked for what, in a fixed order; requests are ranked in the requests-only list.
 */
export function renderConsumerRow(
  consumer: TrackedWorkItem,
  context: ConsumerRowContext,
): HTMLElement {
  const requests = requestsOf(consumer, context);
  const expanded = requests.length > 0 && context.expandedIds.has(consumer.id);
  const parts = renderItemParts(consumer, context);
  const card = renderConsumerCard(
    consumer,
    context,
    renderRequestCount(consumer, requests.length, context, expanded),
    parts,
  );
  const wrapper = renderTreeItemWrapper(context.doc, PREFIX, consumer, card);
  wrapper.classList.add(`${PREFIX}__consumer`);
  // The card draws its own outline; the gap below is what tells one consumer's requests from the
  // next consumer's card.
  wrapper.style.marginBottom = "6px";
  wrapper.append(parts.description, parts.notes);
  if (expanded) {
    const children = renderTreeChildren(context.doc, PREFIX);
    for (const request of requests) {
      children.append(renderRequestRow(request, context));
    }
    wrapper.append(children);
  }
  return wrapper;
}
