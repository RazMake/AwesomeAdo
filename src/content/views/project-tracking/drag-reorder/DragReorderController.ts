import type { ILogger } from "../../../../common/logging/ILogger";

import { DropIndicator } from "./DropIndicator";
import { resolveMove, type DropSide, type ResolvedMove } from "./movePlacement";

/** One row the user may grab, as the tree renderer describes it for a single render pass. */
export interface DraggableRow {
  /** The work item the row shows. */
  id: number;
  /** How deep the row sits (0 = the root's children). */
  depth: number;
  /** Whether this item currently owns children; a parent cannot be demoted with them attached. */
  hasChildren: boolean;
  /** The item's current parent; `0` for the top level. */
  parentId: number;
  /** The default work-item type accepted by this row's parent. */
  destinationType: string | null;
  /**
   * The FULL sibling list of this row's level in board order — every sibling, including those the
   * active filters hide. Rank is computed against this list so a filtered board still places the
   * item where the user aimed once the filter comes off.
   */
  siblingIds: readonly number[];
  /** The element the user grabs; the only part of the row that starts a drag. */
  handle: HTMLElement;
  /** The row's own line box, whose midpoint decides whether a drop lands above or below it. */
  row: HTMLElement;
  /** The row plus its description panel and children, i.e. the element the insertion line slots against. */
  wrapper: HTMLElement;
  /** Popup surface the source belongs to, when leaving it should dismiss that popup. */
  dragSurface?: HTMLElement;
  /** Dismisses the source popup after the drag reaches a legal target outside it. */
  onLeaveSurface?: () => void;
}

/** A resolved drop, ready to be persisted. */
export interface PlannedMove extends ResolvedMove {
  /** The work item that moved. */
  id: number;
  /** The parent it came from, so the persistence layer can skip an unnecessary link patch. */
  currentParentId: number;
  /** The type required by the destination parent, when changing hierarchy level/parent. */
  type?: string;
}

// The drag session's payload. Held in the controller rather than in `dataTransfer` because the drop
// needs the FULL descriptor (level, siblings, elements) and dataTransfer can only carry strings —
// and, on most browsers, cannot even be read during `dragover`, which is exactly when the indicator
// has to decide whether the drop is legal.
interface DragSession {
  source: DraggableRow;
  leftSurface: boolean;
}

/**
 * Turns the tree's rows into a drag-to-reorder surface.
 *
 * Scope is deliberately narrow (Single Responsibility): it decides WHERE a dragged row would land
 * and shows that, then hands the resolved move to its owner. It neither persists anything nor
 * mutates the tree — the view does both, so the "what does a drop mean?" rules stay testable without
 * a network or an ADO model.
 *
 * A row is only draggable if the view registers it, so the caller alone decides when reordering is
 * available (this board only offers it while items are ordered by importance).
 */
export class DragReorderController {
  private readonly indicator: DropIndicator;

  private session: DragSession | null = null;

  constructor(
    doc: Document,
    private readonly onMove: (move: PlannedMove) => void,
    private readonly logger: ILogger,
  ) {
    this.indicator = new DropIndicator(doc);
  }

  /**
   * Abandon any drag still in flight and clear its feedback.
   *
   * Called before a repaint: the rows a drag was resolving against are about to be replaced, so a
   * session that outlived them would resolve a drop against a level that no longer exists. The
   * previous pass's registrations need no undoing — its elements are discarded with the repaint, and
   * a detached element can never receive another drag.
   */
  reset(): void {
    this.endSession();
  }

  /** Make `row` draggable and a legal drop target for rows at its own level. */
  register(row: DraggableRow): void {
    row.handle.draggable = true;
    // The affordance itself: the pointer says "grab me" over the title and nowhere else, so the row's
    // buttons and badges keep their own cursors.
    row.handle.style.cursor = "grab";
    row.handle.addEventListener("dragstart", (event) => this.startDrag(event, row));
    row.handle.addEventListener("dragend", () => this.endSession());

    row.row.addEventListener("dragover", (event) => this.previewDrop(event, row));
    row.row.addEventListener("drop", (event) => this.completeDrop(event, row));
  }

  private startDrag(event: Event, row: DraggableRow): void {
    this.session = { source: row, leftSurface: false };
    row.handle.style.cursor = "grabbing";
    // Dim the row being moved so the insertion line reads as "the new home" rather than as a second
    // copy of a row that still looks settled where it was.
    row.wrapper.style.opacity = "0.45";
    const transfer = (event as DragEvent).dataTransfer;
    if (transfer) {
      transfer.effectAllowed = "move";
      // Some browsers refuse to start a drag with an empty payload; the id is also the least the
      // drop could need if the session were ever lost.
      transfer.setData("text/plain", String(row.id));
    }
  }

  private previewDrop(event: Event, target: DraggableRow): void {
    if (this.isPopupEventBubblingToTree(event, target)) {
      this.indicator.clear();
      event.stopPropagation();
      return;
    }
    const plan = this.planDrop(event, target);
    if (plan === null) {
      this.indicator.clear();
      return;
    }
    this.leaveSourceSurface(target);
    // A popup row lives inside its owning tree row. Once the inner row claims a legal target, do not
    // let the bubbled event reach that different-depth outer row and immediately clear this preview.
    event.stopPropagation();
    // Without preventDefault the browser treats the element as a non-target and shows the "no drop"
    // cursor, so this is what makes the row droppable at all.
    event.preventDefault();
    const transfer = (event as DragEvent).dataTransfer;
    if (transfer) {
      transfer.dropEffect = "move";
    }
    this.indicator.show(target.wrapper, plan.side, {
      reparenting: plan.move.parentId !== plan.move.currentParentId,
      parentContainer: target.wrapper.parentElement,
    });
  }

  private leaveSourceSurface(target: DraggableRow): void {
    const session = this.session;
    if (
      session === null ||
      session.leftSurface ||
      session.source.dragSurface === undefined ||
      session.source.dragSurface.contains(target.row)
    ) {
      return;
    }
    session.leftSurface = true;
    session.source.onLeaveSurface?.();
  }

  private completeDrop(event: Event, target: DraggableRow): void {
    if (this.isPopupEventBubblingToTree(event, target)) {
      event.stopPropagation();
      return;
    }
    const plan = this.planDrop(event, target);
    this.endSession();
    if (plan === null) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    // One line per completed drop (not per dragover, which fires continuously): the signals that
    // decided the landing plus the outcome, so "why did it end up there?" is answerable from the log.
    this.logger.info(
      `Drag-reorder: item ${plan.move.id} dropped ${plan.side} item ${target.id} at depth ` +
        `${target.depth}; parent ${plan.move.currentParentId}→${plan.move.parentId}, ` +
        `between ${plan.move.previousId} and ${plan.move.nextId}`,
    );
    this.onMove(plan.move);
  }

  /**
   * Work out what dropping on `target` right now would mean, or null when the drop is not allowed.
   *
   * Drops may stay at the same depth or move one level at a time. Demoting a parent that still owns
   * children is refused because moving those descendants implicitly would be a different operation.
   * A drop that reproduces the current placement is also refused.
   */
  private planDrop(
    event: Event,
    target: DraggableRow,
  ): { move: PlannedMove; side: DropSide } | null {
    const source = this.session?.source;
    if (source === undefined || !allowsDrop(source, target)) {
      return null;
    }
    const side = dropSide(event, target.row);
    const placement = resolveMove({
      movedId: source.id,
      currentParentId: source.parentId,
      currentSiblingIds: source.siblingIds,
      targetId: target.id,
      side,
      targetParentId: target.parentId,
      targetSiblingIds: target.siblingIds,
    });
    if (placement === null) {
      return null;
    }
    const move: PlannedMove = {
      ...placement,
      id: source.id,
      currentParentId: source.parentId,
    };
    if (source.parentId !== placement.parentId && target.destinationType !== null) {
      move.type = target.destinationType;
    }
    return { move, side };
  }

  /** Prevents a popup event from bubbling into its owning tree row and becoming a hierarchy move. */
  private isPopupEventBubblingToTree(event: Event, target: DraggableRow): boolean {
    const surface = this.session?.source.dragSurface;
    const eventTarget = event.target as Node | null;
    return (
      surface !== undefined &&
      eventTarget !== null &&
      surface.contains(eventTarget) &&
      !surface.contains(target.row)
    );
  }

  private endSession(): void {
    this.indicator.clear();
    const source = this.session?.source;
    if (source) {
      source.handle.style.cursor = "grab";
      source.wrapper.style.removeProperty("opacity");
    }
    this.session = null;
  }
}

/** Whether a source may enter the target level without implicitly moving a subtree. */
function allowsDrop(source: DraggableRow, target: DraggableRow): boolean {
  const depthChange = target.depth - source.depth;
  if (source.id === target.id || Math.abs(depthChange) > 1) {
    return false;
  }
  if (depthChange > 0 && source.hasChildren) {
    return false;
  }
  return source.parentId === target.parentId || target.destinationType !== null;
}

/**
 * Which half of `row` the pointer is over. Measured against the row's own line box (never the
 * wrapper, which also spans the description panel and every descendant) so the switch happens at the
 * visual middle of the row the user is pointing at. A zero-height box — a row not laid out yet —
 * reads as "before", which matches where an insertion line would appear for it.
 */
function dropSide(event: Event, row: HTMLElement): DropSide {
  const box = row.getBoundingClientRect();
  const pointerY = (event as DragEvent).clientY;
  if (box.height <= 0 || typeof pointerY !== "number") {
    return "before";
  }
  return pointerY < box.top + box.height / 2 ? "before" : "after";
}
