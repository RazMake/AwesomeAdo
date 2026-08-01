import type { DropSide } from "./movePlacement";

/** Theme-aware insertion feedback shared by draggable row surfaces. */
export class DropIndicator {
  private readonly line: HTMLElement;

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
      "box-shadow:0 0 0 1px var(--palette-neutral-8)",
    ].join(";");
  }

  /** Show the insertion line and optional destination-parent wash. */
  show(
    rowWrapper: HTMLElement,
    side: DropSide,
    options: { reparenting: boolean; parentContainer: HTMLElement | null },
  ): void {
    const container = rowWrapper.parentElement;
    if (container === null) return;
    if (side === "before") container.insertBefore(this.line, rowWrapper);
    else container.insertBefore(this.line, rowWrapper.nextSibling);
    this.line.dataset.dropKind = options.reparenting ? "reparent" : "reorder";
    this.line.style.background = options.reparenting
      ? "var(--success-foreground)"
      : "var(--communication-background)";
    this.applyWash(options.reparenting ? options.parentContainer : null);
  }

  /** Remove every trace of the feedback. */
  clear(): void {
    this.line.remove();
    this.applyWash(null);
  }

  private applyWash(container: HTMLElement | null): void {
    if (this.washed === container) return;
    if (this.washed !== null) {
      this.washed.style.removeProperty("background");
      this.washed.style.removeProperty("outline");
      this.washed.style.removeProperty("border-radius");
    }
    if (container !== null) {
      container.style.setProperty("background", "var(--palette-neutral-4)");
      container.style.setProperty("outline", "1px dashed var(--success-foreground)");
      container.style.setProperty("border-radius", "3px");
    }
    this.washed = container;
  }
}
