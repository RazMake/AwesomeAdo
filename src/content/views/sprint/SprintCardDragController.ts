import type { ILogger } from "../../../common/logging/ILogger";

const SOURCE_CARD_OPACITY = "0.9";
const DRAG_IMAGE_OPACITY = "0.9";

/** One board cell: the row (area path) and column (application state) a drop moves a card to. */
export interface SprintDropTarget {
  /** The lane's key, compared with a card's own to spot a drop back into the cell it came from. */
  lane: string;
  ordinal: number;
  /** The full area path the lane stands for, which a move into it writes. */
  areaPath: string | null;
}

export interface SprintDraggableCard {
  id: number;
  lane: string;
  ordinal: number;
  element: HTMLElement;
}

interface DragSession {
  source: SprintDraggableCard;
}

/** Controls Sprint card gestures and previews without owning ADO persistence. */
export class SprintCardDragController {
  private session: DragSession | null = null;

  private dragImage: HTMLElement | null = null;

  private dragOffset = { x: 0, y: 0 };

  private readonly columnTitles = new Map<number, HTMLElement>();

  private highlightedTitle: HTMLElement | null = null;

  private highlightedCell: HTMLElement | null = null;

  constructor(
    private readonly onMove: (id: number, target: SprintDropTarget) => void,
    private readonly logger: ILogger,
  ) {}

  registerCard(card: SprintDraggableCard): void {
    card.element.draggable = true;
    card.element.style.cursor = "grab";
    let mayStart = true;
    card.element.addEventListener("pointerdown", (event) => {
      mayStart = !isInteractiveTarget(event.target);
    });
    card.element.addEventListener("dragstart", (event) => {
      if (event.target !== card.element) {
        return;
      }
      if (!card.element.draggable || !mayStart) {
        event.preventDefault();
        return;
      }
      this.start(event, card);
    });
    card.element.addEventListener("drag", (event) => this.moveDragImage(event));
    card.element.addEventListener("dragend", () => this.end());
  }

  registerCell(cell: HTMLElement, target: SprintDropTarget): void {
    cell.addEventListener("dragover", (event) => {
      if (!this.accepts(target)) {
        this.clearPreview();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      this.moveDragImage(event);
      this.highlightColumn(target.ordinal);
      this.highlightCell(cell);
    });
    cell.addEventListener("drop", (event) => {
      if (!this.accepts(target)) return;
      event.preventDefault();
      event.stopPropagation();
      const source = this.session!.source;
      this.end();
      // The lane itself is org structure rather than a signal worth spelling out; whether it changed
      // is what explains the write that follows.
      this.logger.info(
        `Sprint card drag: item ${source.id} moved from column ${source.ordinal} to ` +
          `${target.ordinal}${source.lane === target.lane ? "" : ", into another row"}.`,
      );
      this.onMove(source.id, target);
    });
  }

  /** A drop is offered by any cell other than the one the card already sits in. */
  private accepts(target: SprintDropTarget): boolean {
    const source = this.session?.source;
    if (source === undefined) return false;
    return source.lane !== target.lane || source.ordinal !== target.ordinal;
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

  /** Frame the destination cell, which is what names the ROW a drop would move the card into. */
  private highlightCell(cell: HTMLElement): void {
    if (cell === this.highlightedCell) return;
    this.clearCellHighlight();
    cell.dataset.dropTarget = "true";
    cell.style.boxShadow = "inset 0 0 0 2px var(--communication-background)";
    this.highlightedCell = cell;
  }

  private clearCellHighlight(): void {
    if (this.highlightedCell !== null) {
      delete this.highlightedCell.dataset.dropTarget;
      this.highlightedCell.style.removeProperty("box-shadow");
    }
    this.highlightedCell = null;
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
    this.clearColumnHighlight();
    this.clearCellHighlight();
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

function isInteractiveTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element && target.closest("button,a,input,[role=dialog],[role=menu]") !== null
  );
}
