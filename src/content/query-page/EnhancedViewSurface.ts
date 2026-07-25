import { getEnhancedView } from "../views/enhancedViewRegistry";

const STYLE_ID = "awesomeado-enhanced-view-style";
const HOST_ID = "awesomeado-enhanced-view";

// A fixed overlay pinned to ADO's own content region is what gives every view the whole area below
// the breadcrumb bar and to the right of the left navigation rail, independent of ADO's flex layout.
// It paints its own themed background so it is fully opaque over whatever ADO left behind, and
// scrolls its own content rather than the underlying page. `top`/`left` default to the window corner
// (full-window fallback) and are re-synced to the live content region as it moves — the left rail is
// collapsible, so its width changes at runtime and the overlay must follow it. `right`/`bottom` reach
// the window edges. z-index is one below the top-bar button's max so that button (which lives in the
// bar above) always stays clickable.
const HOST_OVERLAY_CSS = [
  "position:fixed",
  "top:0",
  "left:0",
  "right:0",
  "bottom:0",
  "z-index:2147483646",
  "overflow:auto",
  "background:var(--background-color, #fff)",
].join(";");

/** What to paint: which view, for which query, with which resolved per-query property values. */
export interface EnhancedViewRequest {
  /** The bound view's id — resolved to a renderer through the enhanced-view registry. */
  viewId: string;
  /** The bound query's id, handed to the view so it can scope what it shows. */
  queryId: string;
  /** The binding's resolved per-query property values, keyed by `ViewTypeProperty.key`. */
  properties: Record<string, string>;
}

/**
 * Reversibly replaces Azure DevOps' own query content with the bound view's enhanced surface.
 *
 * It hides ADO's `[role="main"]` landmark (leaving the breadcrumb bar) via a single document-level
 * style — using `visibility:hidden` (not `display:none`) so the landmark still occupies its box and
 * can be measured — then mounts the resolved view's DOM in a fixed host overlay kept aligned to that
 * landmark's box: below the breadcrumb bar and to the right of the left navigation rail, so both of
 * those survive the swap. A `ResizeObserver` (plus the re-attach observer below) keeps the overlay
 * following the content region as it moves — the left rail is collapsible, so its width changes at
 * runtime. Anchoring the overlay to that region (not ADO's flex layout) is what makes every view fill
 * it, so per-view code never has to solve page coverage itself. The original ADO DOM is left intact
 * so a toggle-off restores it instantly. ADO re-renders its page after load and drops foreign nodes,
 * so a MutationObserver re-attaches the style and host whenever that render pass removes them (the
 * same pattern the top-bar button uses). It only mutates the DOM; the decision of *when* and *which*
 * view to show belongs to the controller.
 */
export class EnhancedViewSurface {
  private style: HTMLStyleElement | undefined;
  private host: HTMLElement | undefined;
  private observer: MutationObserver | undefined;
  // Watches ADO's content landmark so the overlay follows it live (e.g. when the collapsible left
  // rail changes width). Undefined when unsupported (older engines / jsdom) — the re-attach observer
  // then drives the sync instead.
  private resizeObserver: ResizeObserver | undefined;
  // The landmark currently observed, so we only re-attach the ResizeObserver when ADO swaps it out.
  private observedMain: Element | undefined;
  // The overlay's last-applied top/left (viewport px). Cached so a re-sync only writes on a real
  // change — the re-attach observer fires on many unrelated mutations. 0/0 = the full-window fallback.
  private overlayTop = 0;
  private overlayLeft = 0;
  // The signature of what is currently painted, so an unchanged request skips a rebuild while a
  // changed view id, query, or property value re-renders — refresh() runs on every settings,
  // bindings, and navigation event and must not rebuild the DOM each time.
  private signature: string | undefined;

  constructor(private readonly doc: Document) {}

  /** Show `request`'s view, or restore ADO's own page when `request` is null or its view is unknown. */
  apply(request: EnhancedViewRequest | null): void {
    const view = request ? getEnhancedView(request.viewId) : undefined;
    // A binding to a view this build does not know (e.g. written by a newer version) leaves ADO's
    // own page in place rather than blanking to nothing — the safest forward-compatible fallback.
    if (!request || !view) {
      this.restore();
      return;
    }

    const signature = `${request.viewId}\u0000${request.queryId}\u0000${JSON.stringify(request.properties)}`;
    this.mount();
    if (signature !== this.signature || (this.host && this.host.childElementCount === 0)) {
      this.renderView(request);
      this.signature = signature;
    }
    this.keepMounted();
  }

  private restore(): void {
    // Stop re-attaching before removing, otherwise the observer would immediately put them back.
    this.observer?.disconnect();
    this.observer = undefined;
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    this.observedMain = undefined;
    this.style?.remove();
    this.style = undefined;
    this.host?.remove();
    this.host = undefined;
    this.signature = undefined;
    // Re-sync from scratch on the next mount (chrome size may have changed while toggled off).
    this.overlayTop = 0;
    this.overlayLeft = 0;
  }

  private mount(): void {
    this.ensureStyle();
    this.ensureHost();
    this.trackContentRegion();
  }

  // Follow ADO's content landmark so the overlay stays aligned to it as it moves (the left rail is
  // collapsible, so the region's left edge shifts at runtime). A ResizeObserver catches size changes
  // from the rail toggling or the window resizing; the re-attach observer re-runs this after ADO
  // re-renders. Re-observe only when ADO swapped the landmark instance, then sync once immediately.
  private trackContentRegion(): void {
    const main = this.doc.querySelector('[role="main"]');
    if (!main) {
      return;
    }
    if (main !== this.observedMain && typeof ResizeObserver !== "undefined") {
      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver(() => this.syncOverlayToContent());
      this.resizeObserver.observe(main);
    }
    this.observedMain = main;
    this.syncOverlayToContent();
  }

  private syncOverlayToContent(): void {
    const main = this.observedMain ?? this.doc.querySelector('[role="main"]');
    if (!main || !this.host) {
      return;
    }
    const rect = main.getBoundingClientRect();
    // A not-yet-laid-out (zero-box) reading would snap the overlay to the corner; keep the last good
    // position instead so it never jumps to cover the bar/rail while ADO is mid-render.
    if (rect.width === 0 && rect.height === 0) {
      return;
    }
    const top = Math.max(0, Math.round(rect.top));
    const left = Math.max(0, Math.round(rect.left));
    if (top === this.overlayTop && left === this.overlayLeft) {
      return;
    }
    this.overlayTop = top;
    this.overlayLeft = left;
    this.host.style.top = `${top}px`;
    this.host.style.left = `${left}px`;
  }

  private ensureStyle(): void {
    if (!this.style) {
      const style = this.doc.createElement("style");
      style.id = STYLE_ID;
      // Hiding the ADO content landmark (not every body child) keeps the top breadcrumb bar visible
      // while replacing the query surface below it. `visibility:hidden` (not `display:none`) leaves
      // the landmark occupying its box so its live position/size stays measurable for the overlay to
      // track. The blank backdrop paints ADO's own `--background-color` token so the enhanced view
      // follows the account's light/dark theme; the #fff fallback covers an un-themed or still-loading
      // page.
      style.textContent =
        'html, body { background: var(--background-color, #fff) !important; } [role="main"] { visibility: hidden !important; }';
      this.style = style;
    }
    if (!this.style.isConnected) {
      (this.doc.head ?? this.doc.documentElement).append(this.style);
    }
  }

  private ensureHost(): void {
    if (!this.host) {
      const host = this.doc.createElement("div");
      host.id = HOST_ID;
      // Self-contained inline styles so ADO's stylesheet can neither restyle nor hide the overlay.
      // Its top/left start at the window corner and are aligned to the content region by
      // syncOverlayToContent(); right/bottom stay pinned to the window edges.
      host.style.cssText = HOST_OVERLAY_CSS;
      this.host = host;
    }
    if (!this.host.isConnected) {
      (this.doc.body ?? this.doc.documentElement).append(this.host);
    }
  }

  private renderView(request: EnhancedViewRequest): void {
    const view = getEnhancedView(request.viewId);
    if (!view || !this.host) {
      return;
    }
    // Replace any previously rendered view wholesale, so swapping the active view never stacks
    // stale DOM. textContent = "" is the cheapest reliable clear.
    this.host.textContent = "";
    this.host.append(
      view.render({ doc: this.doc, queryId: request.queryId, properties: request.properties }),
    );
  }

  // Azure DevOps re-renders its page tree after load and silently drops foreign nodes, so a one-time
  // insertion flickers out on the render pass that follows it. Re-attach whichever of the style or
  // host was removed so the enhanced surface reliably stays.
  private keepMounted(): void {
    this.observer?.disconnect();
    this.observer = new MutationObserver(() => {
      if (this.style && !this.style.isConnected) {
        (this.doc.head ?? this.doc.documentElement).append(this.style);
      }
      if (this.host && !this.host.isConnected) {
        (this.doc.body ?? this.doc.documentElement).append(this.host);
      }
      // ADO may have swapped the content landmark or moved it (e.g. the left rail expanded); re-point
      // the ResizeObserver at the current landmark and re-align the overlay. Cheap: it only writes on
      // a real change.
      this.trackContentRegion();
    });
    this.observer.observe(this.doc.documentElement, { childList: true, subtree: true });
  }
}
