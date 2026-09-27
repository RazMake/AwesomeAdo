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
   * Every consumer in the board's order. The full level is always complete — consumers are never
   * filtered — so a dropped consumer is ranked against exactly the list on screen.
   */
  consumerSiblingIds: readonly number[];
  /** Whether a request passes both the binding's area paths and the header filter. */
  showsRequest(request: TrackedWorkItem): boolean;
  /** Present only while a manual drag can be honoured (importance ordering, a configured team). */
  dragReorder: DragReorderController | null;
  onContextMenu(item: TrackedWorkItem, event: MouseEvent): void;
  /** Rebuild the list after an expand/collapse, so open/closed state lives outside the DOM. */
  repaint(): void;
}

const PREFIX = "awesomeado-consumers";

/** A consumer's requests that survive the area-path filters, in the board's ordering policy. */
export function visibleRequestsOf(
  consumer: TrackedWorkItem,
  context: ConsumerRowContext,
): TrackedWorkItem[] {
  return orderTrackedItems(
    consumer.children.filter((request) => context.showsRequest(request)),
    (request) => request,
    context.policy,
  );
}

/**
 * The FULL ordered request level under a consumer, hidden requests included.
 *
 * A drop is ranked against this rather than what is on screen: ranking against only the visible
 * requests would place a request relative to whatever the filter happened to leave, so clearing
 * the filter afterwards would reveal it somewhere nobody dropped it.
 */
function requestSiblingIds(consumer: TrackedWorkItem, policy: OrderingPolicy): number[] {
  return orderTrackedItems(consumer.children, (request) => request, policy).map(
    (request) => request.id,
  );
}

/** The line every row draws: twisty, optional Status, type icon, and title. */
function renderItemLine(
  item: TrackedWorkItem,
  context: ConsumerRowContext,
  twisty: HTMLElement,
  isConsumer: boolean,
): {
  line: HTMLElement;
  title: HTMLElement;
  description: HTMLElement;
  notes: HTMLElement;
} {
  const { doc } = context;
  const entry = context.types.get(item.type);
  const line = renderTreeRowLine(doc, PREFIX, isConsumer ? "is-consumer" : null);
  const title = renderTreeTitle(doc, PREFIX, item, entry);
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
  line.append(twisty);
  if (!isConsumer) {
    line.append(
      renderItemStatusBadge({
        doc,
        item,
        entry,
        boardColumns: context.boardColumns,
        queue: context.queue,
        minWidthCh: context.statusWidthCh,
        now: () => context.now(),
      }),
    );
  }
  line.append(details.toggle, noteToggle.toggle, title);
  // Bound on the line rather than the list so the INNERMOST row under the pointer wins; the shared
  // menu stops the event itself, so the consumer around a request never also opens.
  line.addEventListener("contextmenu", (event) => context.onContextMenu(item, event));
  return { line, title, description: details.element, notes: noteToggle.panel };
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
  const { line, title, description, notes } = renderItemLine(
    request,
    context,
    renderTreeTwisty(context.doc, PREFIX, request, null),
    false,
  );
  const wrapper = renderTreeItemWrapper(context.doc, PREFIX, request, line);
  wrapper.append(description, notes);
  context.dragReorder?.register({
    id: request.id,
    depth: 1,
    // Anything below a request is not part of this board, so nothing is carried along visibly.
    hasChildren: false,
    parentId: consumer.id,
    destinationType: null,
    siblingIds,
    handle: title,
    row: line,
    wrapper,
  });
  return wrapper;
}

/**
 * One consumer and, while open, the requests it asked for.
 *
 * Every consumer is drawn, even one whose requests the filters all hid: the board answers "who is
 * waiting on us?", and dropping a consumer because nothing of theirs is in scope would also remove
 * the row a request has to be dragged onto to be handed to them.
 */
export function renderConsumerRow(
  consumer: TrackedWorkItem,
  context: ConsumerRowContext,
): HTMLElement {
  const requests = visibleRequestsOf(consumer, context);
  const expanded = requests.length > 0 && !context.collapsedIds.has(consumer.id);
  const { line, title, description, notes } = renderItemLine(
    consumer,
    context,
    renderConsumerTwisty(consumer, context, requests.length > 0),
    true,
  );
  const wrapper = renderTreeItemWrapper(context.doc, PREFIX, consumer, line);
  wrapper.append(description, notes);
  const siblingIds = requestSiblingIds(consumer, context.policy);
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
    handle: title,
    row: line,
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
