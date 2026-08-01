import type { ILogger } from "../../../common/logging/ILogger";
import { DropIndicator } from "../../../common/view-common/control/DragReorder/DropIndicator";
import {
  placementOf,
  type DropSide,
  type ResolvedMove,
} from "../../../common/view-common/control/DragReorder/movePlacement";

const SOURCE_CARD_OPACITY = "0.9";
const DRAG_IMAGE_OPACITY = "0.9";

export interface SprintCardMove extends ResolvedMove {
  id: number;
  currentParentId: number;
  destinationOrdinal: number;
}

export interface SprintDraggableCard {
  id: number;
  lane: string;
  ordinal: number;
  parentId: number;
  siblingIds: readonly number[];
  element: HTMLElement;
}

interface DragSession {
  source: SprintDraggableCard;
}

interface CellDropPlan {
  move: SprintCardMove;
  changesColumn: boolean;
  target: SprintDraggableCard | null;
  side: DropSide;
  before: HTMLElement | null;
}

/** Controls Sprint card gestures and previews without owning ADO persistence. */
export class SprintCardDragController {
  private readonly indicator: DropIndicator;

  private session: DragSession | null = null;

  private shadow: HTMLElement | null = null;

  private dragImage: HTMLElement | null = null;

  private dragOffset = { x: 0, y: 0 };

  private readonly cardsByCell = new Map<string, SprintDraggableCard[]>();

  private readonly columnTitles = new Map<number, HTMLElement>();

  private highlightedTitle: HTMLElement | null = null;

  constructor(
    doc: Document,
    private readonly manualReorder: boolean,
    private readonly onStateMove: (id: number, ordinal: number) => void,
    private readonly onReorder: (move: SprintCardMove) => void,
    private readonly logger: ILogger,
  ) {
    this.indicator = new DropIndicator(doc);
  }

  registerCard(card: SprintDraggableCard): void {
    const key = cellKey(card.lane, card.ordinal);
    const cards = this.cardsByCell.get(key) ?? [];
    cards.push(card);
    this.cardsByCell.set(key, cards);
    card.element.draggable = true;
    card.element.style.cursor = "grab";
    let mayStart = true;
    card.element.addEventListener("pointerdown", (event) => {
      mayStart = !isInteractiveTarget(event.target);
    });
    card.element.addEventListener("dragstart", (event) => {
      if (event.target !== card.element || !card.element.draggable || !mayStart) {
        event.preventDefault();
        return;
      }
      this.start(event, card);
    });
    card.element.addEventListener("drag", (event) => this.moveDragImage(event));
    card.element.addEventListener("dragend", () => this.end());
  }

  registerCell(cell: HTMLElement, lane: string, ordinal: number): void {
    cell.addEventListener("dragover", (event) => {
      const plan = this.planCellDrop(event, lane, ordinal);
      if (plan === null) {
        this.clearPreview();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      this.moveDragImage(event);
      this.previewCellDrop(cell, plan);
    });
    cell.addEventListener("drop", (event) => {
      const plan = this.planCellDrop(event, lane, ordinal);
      if (plan === null) return;
      event.preventDefault();
      event.stopPropagation();
      const source = this.session!.source;
      this.end();
      if (plan.changesColumn && !this.manualReorder) {
        this.logger.info(
          `Sprint card drag: item ${source.id} moved within lane from column ` +
            `${source.ordinal} to ${ordinal}.`,
        );
        this.onStateMove(source.id, ordinal);
        return;
      }
      this.logger.info(
        `Sprint card reorder: item ${source.id} moved to column ${ordinal}, ` +
          `between ${plan.move.previousId} and ${plan.move.nextId}.`,
      );
      this.onReorder(plan.move);
    });
  }

  registerColumnTitle(ordinal: number, title: HTMLElement): void {
    this.columnTitles.set(ordinal, title);
  }

  private start(event: DragEvent, source: SprintDraggableCard): void {
    this.session = { source };
    source.element.dataset.dragging = "true";
    source.element.style.cursor = "grabbing";
    source.element.style.opacity = SOURCE_CARD_OPACITY;
    this.showDragImage(event, source.element);
    event.dataTransfer?.setData("text/plain", String(source.id));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  private planCellDrop(event: DragEvent, lane: string, ordinal: number): CellDropPlan | null {
    const source = this.session?.source;
    if (!allowsCellDrop(source, lane, ordinal, this.manualReorder)) return null;
    const cards = (this.cardsByCell.get(cellKey(lane, ordinal)) ?? []).filter(
      ({ id }) => id !== source!.id,
    );
    return cellDropPlan(event.clientY, source!, cards, ordinal);
  }

  private previewCellDrop(cell: HTMLElement, plan: CellDropPlan): void {
    this.highlightColumn(plan.move.destinationOrdinal);
    if (plan.changesColumn) {
      this.indicator.clear();
      if (plan.target === null || !this.manualReorder) {
        this.clearShadow();
      } else {
        this.showShadow(cell, this.session!.source.element, plan.before);
      }
      return;
    }
    this.clearShadow();
    if (plan.target !== null) {
      this.indicator.show(plan.target.element, plan.side, {
        reparenting: false,
        parentContainer: null,
      });
    }
  }

  private showShadow(cell: HTMLElement, source: HTMLElement, before: HTMLElement | null): void {
    if (this.shadow === null) {
      const shadow = source.cloneNode(true) as HTMLElement;
      shadow.className += " awesomeado-sprint-card__drop-shadow";
      shadow.removeAttribute("data-item-id");
      shadow.removeAttribute("data-dragging");
      shadow.setAttribute("aria-hidden", "true");
      shadow.draggable = false;
      shadow.style.cursor = "default";
      shadow.style.opacity = "0.34";
      shadow.style.pointerEvents = "none";
      shadow.style.boxShadow = "inset 0 0 0 2px var(--communication-background)";
      for (const popup of shadow.querySelectorAll("[role=dialog], [role=menu]")) popup.remove();
      this.shadow = shadow;
    }
    cell.insertBefore(this.shadow, before);
  }

  private clearShadow(): void {
    this.shadow?.remove();
    this.shadow = null;
  }

  private showDragImage(event: DragEvent, source: HTMLElement): void {
    this.clearDragImage();
    const bounds = source.getBoundingClientRect();
    this.dragOffset = {
      x: Math.max(0, event.clientX - bounds.left),
      y: Math.max(0, event.clientY - bounds.top),
    };
    const image = source.cloneNode(true) as HTMLElement;
    image.className += " awesomeado-sprint-card__drag-image";
    image.removeAttribute("data-item-id");
    image.removeAttribute("data-dragging");
    image.setAttribute("aria-hidden", "true");
    image.draggable = false;
    image.style.position = "fixed";
    image.style.zIndex = "2147483647";
    image.style.width = `${bounds.width}px`;
    image.style.height = `${bounds.height}px`;
    image.style.margin = "0";
    image.style.opacity = DRAG_IMAGE_OPACITY;
    image.style.pointerEvents = "none";
    for (const popup of image.querySelectorAll("[role=dialog], [role=menu]")) popup.remove();
    (source.ownerDocument.body ?? source.ownerDocument.documentElement).append(image);
    this.dragImage = image;
    image.style.background = resolvedBackground(source, "--item-row-background");
    this.moveDragImage(event);

    const transparent = source.ownerDocument.createElement("canvas");
    transparent.width = 1;
    transparent.height = 1;
    event.dataTransfer?.setDragImage(transparent, 0, 0);
  }

  private moveDragImage(event: DragEvent): void {
    if (this.dragImage === null || (event.clientX === 0 && event.clientY === 0)) return;
    this.dragImage.style.left = `${event.clientX - this.dragOffset.x}px`;
    this.dragImage.style.top = `${event.clientY - this.dragOffset.y}px`;
  }

  private clearDragImage(): void {
    this.dragImage?.remove();
    this.dragImage = null;
  }

  private highlightColumn(ordinal: number): void {
    const title = this.columnTitles.get(ordinal) ?? null;
    if (title === this.highlightedTitle) return;
    this.clearColumnHighlight();
    if (title !== null) {
      title.dataset.dropTarget = "true";
      columnHighlightOf(title)?.style.setProperty("border-color", title.style.color);
      this.highlightedTitle = title;
    }
  }

  private clearColumnHighlight(): void {
    if (this.highlightedTitle !== null) {
      delete this.highlightedTitle.dataset.dropTarget;
      columnHighlightOf(this.highlightedTitle)?.style.setProperty("border-color", "transparent");
    }
    this.highlightedTitle = null;
  }

  private clearPreview(): void {
    this.indicator.clear();
    this.clearShadow();
    this.clearColumnHighlight();
  }

  private end(): void {
    this.clearPreview();
    this.clearDragImage();
    const source = this.session?.source.element;
    if (source !== undefined) {
      delete source.dataset.dragging;
      source.style.removeProperty("opacity");
      source.style.cursor = "grab";
    }
    this.session = null;
  }
}

function resolvedBackground(element: HTMLElement, fallbackRole?: string): string {
  const styles = element.ownerDocument.defaultView?.getComputedStyle(element);
  const computed = styles?.backgroundColor.trim() ?? "";
  if (!isTransparent(computed)) return computed;
  const role =
    fallbackRole === undefined ? "" : (styles?.getPropertyValue(fallbackRole).trim() ?? "");
  return isTransparent(role) ? element.style.background : role;
}

function isTransparent(color: string): boolean {
  return color === "" || color === "transparent" || color.replaceAll(" ", "") === "rgba(0,0,0,0)";
}

function columnHighlightOf(title: HTMLElement): HTMLElement | null {
  return title.querySelector<HTMLElement>(".awesomeado-sprint__column-title-highlight");
}

function cellKey(lane: string, ordinal: number): string {
  return `${lane}\u0000${ordinal}`;
}

function insertionIndex(pointerY: number, cards: readonly SprintDraggableCard[]): number {
  for (let index = 0; index < cards.length; index += 1) {
    const bounds = cards[index]!.element.getBoundingClientRect();
    if (bounds.height <= 0 || pointerY < bounds.top + bounds.height / 2) return index;
  }
  return cards.length;
}

function allowsCellDrop(
  source: SprintDraggableCard | undefined,
  lane: string,
  ordinal: number,
  manualReorder: boolean,
): source is SprintDraggableCard {
  if (source === undefined || source.lane !== lane) return false;
  return source.ordinal !== ordinal || manualReorder;
}

function cellDropPlan(
  pointerY: number,
  source: SprintDraggableCard,
  cards: readonly SprintDraggableCard[],
  destinationOrdinal: number,
): CellDropPlan | null {
  const insertAt = insertionIndex(pointerY, cards);
  const siblingIds = cards.map(({ id }) => id);
  siblingIds.splice(insertAt, 0, source.id);
  const previous = cards[insertAt - 1];
  const next = cards[insertAt];
  const move: SprintCardMove = {
    id: source.id,
    currentParentId: source.parentId,
    parentId: source.parentId,
    previousId: previous === undefined ? 0 : previous.id,
    nextId: next === undefined ? 0 : next.id,
    siblingIds,
    destinationOrdinal,
  };
  const changesColumn = source.ordinal !== destinationOrdinal;
  if (keepsCurrentPlacement(source, move, changesColumn)) return null;
  return {
    move,
    changesColumn,
    target: next ?? cards.at(-1) ?? null,
    side: next === undefined ? "after" : "before",
    before: next?.element ?? null,
  };
}

function keepsCurrentPlacement(
  source: SprintDraggableCard,
  move: SprintCardMove,
  changesColumn: boolean,
): boolean {
  if (changesColumn) return false;
  const current = placementOf(source.id, source.siblingIds, source.parentId);
  return current !== null && samePlacement(current, move);
}

function samePlacement(
  left: { parentId: number; previousId: number; nextId: number },
  right: { parentId: number; previousId: number; nextId: number },
): boolean {
  return (
    left.parentId === right.parentId &&
    left.previousId === right.previousId &&
    left.nextId === right.nextId
  );
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest("button,a,input,[role=dialog],[role=menu]") !== null
  );
}
