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

/** The landing the indicator is currently showing, kept so the release commits exactly that. */
interface PreviewedDrop {
  move: PlannedMove;
  side: DropSide;
  target: DraggableRow;
}

interface DragSession {
  source: DraggableRow;
  leftSurface: boolean;
  /** The plan the indicator is showing, or null while it is showing nothing. */
  preview: PreviewedDrop | null;
}

/** Resolves row drag gestures and delegates the resulting move without mutating application data. */
export class DragReorderController {
  private readonly indicator: DropIndicator;

  private session: DragSession | null = null;

  /**
   * The smallest element containing every registered row, or null before the first pass registers
   * one.
   *
   * It is what the drop fallback below is scoped to: a release over the page's own chrome, well away
   * from the board, must not be read as a drop.
   */
  private container: HTMLElement | null = null;

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
    // The rows this was derived from are about to be discarded, so the next pass re-derives it.
    this.container = null;
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
    this.growContainer(row.wrapper);
  }

  /** Widen the tracked container until it holds this row too. */
  private growContainer(wrapper: HTMLElement): void {
    let candidate = this.container ?? wrapper.parentElement;
    while (candidate !== null && !candidate.contains(wrapper)) {
      candidate = candidate.parentElement;
    }
    this.container = candidate;
  }

  private startDrag(event: Event, row: DraggableRow): void {
    this.session = { source: row, leftSurface: false, preview: null };
    row.handle.style.cursor = "grabbing";
    row.wrapper.style.opacity = "0.45";
    const transfer = (event as DragEvent).dataTransfer;
    if (transfer) {
      transfer.effectAllowed = "move";
      transfer.setData("text/plain", String(row.id));
    }
    // Rows do not cover every pixel a reader can release over — the indentation beside a nested
    // branch belongs to no row at all — and a release there fires no `drop` on any zone, so the
    // gesture would end with the insertion line still on screen and nothing moved. The container
    // keeps accepting the drop and commits whatever the line was showing.
    this.container?.addEventListener("dragover", this.acceptShownDrop);
    this.container?.addEventListener("drop", this.commitShownDrop);
  }

  private previewDrop(event: Event, target: DraggableRow): void {
    if (this.isPopupEventBubblingToTree(event, target)) {
      this.clearPreview();
      event.stopPropagation();
      return;
    }
    const plan = this.planDrop(event, target);
    if (plan === null) {
      this.clearPreview();
      return;
    }
    this.leaveSourceSurface(target);
    event.stopPropagation();
    event.preventDefault();
    const transfer = (event as DragEvent).dataTransfer;
    if (transfer) transfer.dropEffect = "move";
    if (this.session !== null) this.session.preview = { ...plan, target };
    this.indicator.show(target.wrapper, plan.side, {
      reparenting: plan.move.parentId !== plan.move.currentParentId,
      parentContainer: target.wrapper.parentElement,
    });
  }

  /** Withdraw the insertion line, and with it the landing a release would commit. */
  private clearPreview(): void {
    this.indicator.clear();
    if (this.session !== null) this.session.preview = null;
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
    const resolved = this.planDrop(event, target);
    // The shown landing is the fallback, not the other way round: the reader aimed at the insertion
    // line, so a release the pointer position no longer resolves must still land where it promised.
    const plan = resolved === null ? (this.session?.preview ?? null) : { ...resolved, target };
    // Deliberately NOT ending the session here: this drop may still be bubbling up to an outer zone
    // that can answer it, and killing the session would leave that one with no source to plan from.
    // `dragend` always follows a drop, so the session is ended either way.
    if (plan === null) return;
    event.stopPropagation();
    event.preventDefault();
    this.commit(plan);
  }

  /** Keep accepting the release while the indicator is promising a landing, wherever it happens. */
  private readonly acceptShownDrop = (event: Event): void => {
    if ((this.session?.preview ?? null) === null) return;
    event.preventDefault();
    const transfer = (event as DragEvent).dataTransfer;
    if (transfer) transfer.dropEffect = "move";
  };

  /** A release no row owned: honour the landing the insertion line was showing. */
  private readonly commitShownDrop = (event: Event): void => {
    const plan = this.session?.preview ?? null;
    if (plan === null) return;
    event.preventDefault();
    this.commit(plan);
  };

  /** Record the landing and hand it to the owner, once and only once. */
  private commit(plan: PreviewedDrop): void {
    this.endSession();
    this.logger.info(
      `Drag-reorder: item ${plan.move.id} dropped ${plan.side} item ${plan.target.id} at depth ` +
        `${plan.target.depth}; parent ${plan.move.currentParentId}→${plan.move.parentId}, ` +
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
    this.container?.removeEventListener("dragover", this.acceptShownDrop);
    this.container?.removeEventListener("drop", this.commitShownDrop);
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
