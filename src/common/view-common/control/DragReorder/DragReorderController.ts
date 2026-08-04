import type { ILogger } from "../../../logging/ILogger";

import { DropIndicator } from "./DropIndicator";
import { resolveMove, type DropSide, type ResolvedMove } from "./movePlacement";

/** One row the user may grab, as its owner describes it for a render pass. */
export interface DraggableRow {
  id: number;
  depth: number;
  hasChildren: boolean;
  parentId: number;
  destinationType: string | null;
  siblingIds: readonly number[];
  handle: HTMLElement;
  row: HTMLElement;
  wrapper: HTMLElement;
  /**
   * The element that accepts the drop; defaults to `row`.
   *
   * An owner whose rows carry trailing space or detail panels OUTSIDE `row` passes the element that
   * covers all of it, so the band between two rows belongs to one of them. Left uncovered, a drop
   * aimed at the boundary — which is exactly where a reader aims to land above or below an item —
   * reaches no registered row at all and is discarded without a word.
   *
   * Only the drop TARGET widens: `row` is still what decides which side of the item the drop lands
   * on, so an insertion never re-anchors itself to a panel the reader happened to have open.
   */
  dropZone?: HTMLElement;
  dragSurface?: HTMLElement;
  onLeaveSurface?: () => void;
}

/** A resolved drop ready for the owning view to persist. */
export interface PlannedMove extends ResolvedMove {
  id: number;
  currentParentId: number;
  type?: string;
}

interface DragSession {
  source: DraggableRow;
  leftSurface: boolean;
}

/** Resolves row drag gestures and delegates the resulting move without mutating application data. */
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

  /** Abandon any drag still in flight before its rendered rows are replaced. */
  reset(): void {
    this.endSession();
  }

  /** Make a title handle draggable and its row a legal drop target. */
  register(row: DraggableRow): void {
    row.handle.draggable = true;
    row.handle.style.cursor = "grab";
    row.handle.addEventListener("dragstart", (event) => this.startDrag(event, row));
    row.handle.addEventListener("dragend", () => this.endSession());
    const zone = row.dropZone ?? row.row;
    zone.addEventListener("dragover", (event) => this.previewDrop(event, row));
    zone.addEventListener("drop", (event) => this.completeDrop(event, row));
  }

  private startDrag(event: Event, row: DraggableRow): void {
    this.session = { source: row, leftSurface: false };
    row.handle.style.cursor = "grabbing";
    row.wrapper.style.opacity = "0.45";
    const transfer = (event as DragEvent).dataTransfer;
    if (transfer) {
      transfer.effectAllowed = "move";
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
    event.stopPropagation();
    event.preventDefault();
    const transfer = (event as DragEvent).dataTransfer;
    if (transfer) transfer.dropEffect = "move";
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
    if (plan === null) return;
    event.stopPropagation();
    event.preventDefault();
    this.logger.info(
      `Drag-reorder: item ${plan.move.id} dropped ${plan.side} item ${target.id} at depth ` +
        `${target.depth}; parent ${plan.move.currentParentId}→${plan.move.parentId}, ` +
        `between ${plan.move.previousId} and ${plan.move.nextId}`,
    );
    this.onMove(plan.move);
  }

  private planDrop(
    event: Event,
    target: DraggableRow,
  ): { move: PlannedMove; side: DropSide } | null {
    const source = this.session?.source;
    if (source === undefined || !allowsDrop(source, target)) return null;
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
    if (placement === null) return null;
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

function allowsDrop(source: DraggableRow, target: DraggableRow): boolean {
  const depthChange = target.depth - source.depth;
  if (source.id === target.id || Math.abs(depthChange) > 1) return false;
  if (depthChange > 0 && source.hasChildren) return false;
  return source.parentId === target.parentId || target.destinationType !== null;
}

function dropSide(event: Event, row: HTMLElement): DropSide {
  const box = row.getBoundingClientRect();
  const pointerY = (event as DragEvent).clientY;
  if (box.height <= 0 || typeof pointerY !== "number") return "before";
  return pointerY < box.top + box.height / 2 ? "before" : "after";
}
