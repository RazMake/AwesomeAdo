import type { DropSide } from "./movePlacement";

/**
 * The live "this is where it will land" feedback shown while a row is being dragged.
 *
 * Two signals, because a move in this tree can change two different things:
 * - an **insertion line** slotted between rows shows the position within a level;
 * - a **re-parent wash** on the destination's children container shows that the item is also
 *   changing parent, which the line alone cannot convey (a line above the first child of another
 *   parent looks identical to a line below the last child of the previous one).
 *
 * Every color is a themed CSS custom property, so the indicator reads on light, dark, blue, and
 * "Follow ADO" alike rather than being a light-theme-only accent.
 */
export class DropIndicator {
  private readonly line: HTMLElement;

  // The container currently wearing the re-parent wash. Held so it can be cleared even after the
  // pointer has moved on to a different parent — restoring styles by re-reading the DOM would
  // otherwise miss the container the user just left.
  private washed: HTMLElement | null = null;

  constructor(doc: Document) {
    this.line = doc.createElement("div");
    this.line.className = "awesomeado-tracking__drop-line";
    this.line.setAttribute("aria-hidden", "true");
    this.line.style.cssText = [
      "height:2px",
      "margin:1px 0",
      "border-radius:1px",
      "pointer-events:none",
      "background:var(--communication-background)",
      // A soft halo so the 2px line stays visible against a dark surface, where a hairline of the
      // accent color alone can disappear into the background.
      "box-shadow:0 0 0 1px var(--palette-neutral-8)",
    ].join(";");
  }

  /**
   * Show the insertion line at `side` of `rowWrapper`, and wash `parentContainer` when the drop also
   * re-parents the item. Moving the same element rather than creating one per dragover keeps the
   * feedback flicker-free as the pointer travels.
   */
  show(
    rowWrapper: HTMLElement,
    side: DropSide,
    options: { reparenting: boolean; parentContainer: HTMLElement | null },
  ): void {
    const container = rowWrapper.parentElement;
    if (container === null) {
      return;
    }
    if (side === "before") {
      container.insertBefore(this.line, rowWrapper);
    } else {
      container.insertBefore(this.line, rowWrapper.nextSibling);
    }
    this.line.dataset.dropKind = options.reparenting ? "reparent" : "reorder";
    this.line.style.background = options.reparenting
      ? "var(--success-foreground)"
      : "var(--communication-background)";
    this.applyWash(options.reparenting ? options.parentContainer : null);
  }

  /** Remove every trace of the feedback. Safe to call when nothing is shown. */
  clear(): void {
    this.line.remove();
    this.applyWash(null);
  }

  private applyWash(container: HTMLElement | null): void {
    if (this.washed === container) {
      return;
    }
    if (this.washed !== null) {
      this.washed.style.removeProperty("background");
      this.washed.style.removeProperty("outline");
      this.washed.style.removeProperty("border-radius");
    }
    if (container !== null) {
      // A discrete tint plus a dashed accent edge: enough to name the destination without competing
      // with the insertion line for attention.
      container.style.setProperty("background", "var(--palette-neutral-4)");
      container.style.setProperty("outline", "1px dashed var(--success-foreground)");
      container.style.setProperty("border-radius", "3px");
    }
    this.washed = container;
  }
}
