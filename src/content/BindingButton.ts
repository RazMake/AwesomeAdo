const BUTTON_ID = "awesomeado-enhance-button";

// Candidate anchors for ADO's global search box, most specific first. ADO's header markup is
// undocumented and shifts between releases, so we probe several stable signals (the search landmark
// role, then the input's accessible name / placeholder) rather than a single brittle class.
const SEARCH_BOX_SELECTORS = [
  '[role="search"]',
  'input[aria-label^="Search" i]',
  'input[placeholder^="Search" i]',
];

// Semi-transparent grey chosen to read as a subtle highlight on both the light and dark ADO themes
// (like ADO's own top-bar icon buttons) without needing to know which theme is active.
const HOVER_BACKGROUND = "rgba(128,128,128,0.2)";

// ADO's top-bar command menubar (the icon-button group on the right of the header). The button
// joins this group so it reads as one of ADO's own command buttons and, crucially, sits inside a
// container that already paints the header's bottom hairline — so it never leaves a gap in that line
// the way a bare header-row child would. The class is the stable signal; the role is a fallback.
const MENUBAR_SELECTORS = [".region-header-menubar", '[role="menubar"]'];

/**
 * Injects and removes a single "enhance this query" button into the Azure DevOps top bar.
 *
 * The button joins ADO's top-bar command menubar (the icon group on the right of the header) so it
 * reads as one of ADO's own command buttons and, because that container paints the header's bottom
 * hairline, it never leaves a gap in that line. If the menubar cannot be found it anchors after the
 * navigation region that ends with the search box, and failing that falls back to a fixed top-right
 * overlay, so the button never disappears entirely. Either way it stays outside the hidden
 * `[role="main"]`, so it survives the Enhanced View blanking. ADO re-renders its header after load
 * and drops foreign nodes, so a MutationObserver re-attaches the button whenever that render pass
 * removes it.
 */
export class BindingButton {
  private button: HTMLButtonElement | undefined;
  private clickHandler: (() => void) | undefined;
  private observer: MutationObserver | undefined;

  constructor(
    private readonly doc: Document,
    // Injected rather than resolved here (via chrome.runtime.getURL) so this class stays free of
    // browser APIs and remains unit-testable; the composition root supplies the packaged icon URL.
    private readonly iconUrl: string,
    private readonly label: string,
  ) {}

  /** Show the button, wiring `onClick` (given the button element to anchor UI to). No-op if shown. */
  show(onClick: (anchor: HTMLElement) => void): void {
    if (this.button?.isConnected) {
      return;
    }
    const button = this.doc.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    // The label is the accessible name / tooltip rather than visible text: the button shows the
    // extension icon so its purpose reads at a glance without competing with ADO's own top bar.
    button.title = this.label;
    button.setAttribute("aria-label", this.label);

    const icon = this.doc.createElement("img");
    icon.src = this.iconUrl;
    // Redundant with the button's aria-label but keeps the image itself meaningful if styles fail.
    icon.alt = this.label;
    icon.style.cssText = "width:100%;height:100%;display:block;pointer-events:none";
    button.append(icon);

    // Wrap so the caller receives the button element (its menu anchor) without reaching for the id.
    this.clickHandler = () => onClick(button);
    button.addEventListener("click", this.clickHandler);
    this.wireHoverEffect(button);
    this.button = button;
    this.place(button);
    this.keepPlaced();
  }

  /** Remove the button and detach its handler. Safe to call when nothing is shown. */
  hide(): void {
    // Stop re-attaching before removing, otherwise the observer would immediately put it back.
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.clickHandler) {
      this.button?.removeEventListener("click", this.clickHandler);
    }
    this.button?.remove();
    this.button = undefined;
    this.clickHandler = undefined;
  }

  // Insert (or re-insert) the button at its preferred anchor. Called both on first show and by the
  // persistence observer, so it always re-reads the live DOM to pick the current anchor.
  private place(button: HTMLButtonElement): void {
    const menubar = this.findMenubar();
    if (menubar) {
      this.styleAsInline(button);
      // Prepend into the command menubar so the button sits just left of ADO's own top-bar icons
      // and shares their container, which keeps the header's bottom hairline unbroken (a bare
      // header-row sibling would leave a gap in that line where the shorter button sits).
      menubar.prepend(button);
      return;
    }
    const searchBox = this.findSearchBox();
    if (searchBox) {
      this.styleAsInline(button);
      // Anchor after the whole top-bar navigation region (which ends with the search box) rather
      // than beside the search box itself: ADO wraps the search in a container sized to the input,
      // so inserting next to it squeezes the button on top of the input, while the header row has
      // room for the button after that region.
      const anchor = searchBox.closest('[role="navigation"]') ?? searchBox;
      anchor.after(button);
      return;
    }
    this.styleAsOverlay(button);
    (this.doc.body ?? this.doc.documentElement).append(button);
  }

  // Azure DevOps re-renders its header (a framework-managed tree) during and shortly after load,
  // which silently drops any foreign node we inserted — so a one-time insertion flickers out on the
  // render pass that follows it. Re-attach the button whenever that happens so it reliably stays.
  private keepPlaced(): void {
    this.observer?.disconnect();
    this.observer = new MutationObserver(() => {
      if (this.button && !this.button.isConnected) {
        this.place(this.button);
      }
    });
    this.observer.observe(this.doc.documentElement, { childList: true, subtree: true });
  }

  // Mirror ADO's own top-bar buttons, which light up with a subtle background on hover. The button
  // keeps a transparent background otherwise so it blends into the top bar. Handlers ride on the
  // button node itself, so they survive the persistence observer re-inserting the same node.
  private wireHoverEffect(button: HTMLButtonElement): void {
    button.addEventListener("mouseenter", () => {
      button.style.backgroundColor = HOVER_BACKGROUND;
    });
    button.addEventListener("mouseleave", () => {
      button.style.backgroundColor = "transparent";
    });
  }

  private findSearchBox(): Element | null {
    for (const selector of SEARCH_BOX_SELECTORS) {
      const match = this.doc.querySelector(selector);
      if (match) {
        return match;
      }
    }
    return null;
  }

  // Locate ADO's top-bar command menubar, preferring the one in the same header as the search box so
  // we never adopt an unrelated menubar rendered elsewhere on the query page.
  private findMenubar(): Element | null {
    const selector = MENUBAR_SELECTORS.join(",");
    const headerRow = this.findSearchBox()?.closest('[role="navigation"]')?.parentElement;
    return headerRow?.querySelector(selector) ?? this.doc.querySelector(selector);
  }

  // Shared self-contained styling so ADO's stylesheet can neither restyle nor hide the button, and
  // nothing the extension injects leaks back into the ADO page. Positioning is layered on top.
  private applyBaseStyle(button: HTMLButtonElement): void {
    button.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "box-sizing:border-box",
      // Match ADO's own top-bar icon buttons: a 32px square hit target around a ~20px glyph.
      "padding:6px",
      "width:32px",
      "height:32px",
      "background:transparent",
      "border:none",
      // ADO's command buttons use a 2px-rounded square rather than a circle.
      "border-radius:2px",
      "cursor:pointer",
      // Ease the hover highlight in and out to match ADO's own top-bar button transitions.
      "transition:background-color 0.15s ease",
    ].join(";");
  }

  // Sits among ADO's command buttons in the top-bar menubar.
  private styleAsInline(button: HTMLButtonElement): void {
    this.applyBaseStyle(button);
    // As a flex item among ADO's command buttons, keep the button at its intrinsic size (never grow
    // or shrink), sit flush with the native buttons (no extra margin), and centre it vertically
    // against the taller header row exactly as they do.
    button.style.flex = "0 0 auto";
    button.style.alignSelf = "center";
    button.style.margin = "0";
  }

  // Fallback used only when no search box is found: float near the top-right above ADO's top bar.
  private styleAsOverlay(button: HTMLButtonElement): void {
    this.applyBaseStyle(button);
    button.style.position = "fixed";
    button.style.top = "6px";
    button.style.right = "12px";
    // Above ADO's own top bar and any overlay it paints.
    button.style.zIndex = "2147483647";
    button.style.boxShadow = "0 1px 4px rgba(0,0,0,0.3)";
  }
}
