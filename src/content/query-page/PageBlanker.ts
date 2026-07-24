const STYLE_ID = "awesomeado-blank-query-page";

/** Applies a reversible blank surface without destroying Azure DevOps DOM state. */
export class PageBlanker {
  private style: HTMLStyleElement | undefined;

  constructor(private readonly doc: Document) {}

  apply(enhance: boolean): void {
    if (!enhance) {
      this.style?.remove();
      this.style = undefined;
      return;
    }

    if (this.style?.isConnected) {
      return;
    }

    // Hiding the ADO content landmark (not every body child) keeps the top breadcrumb bar visible
    // while blanking the query surface below it. A document-level rule also covers content ADO
    // inserts after initial load, avoiding a timer or MutationObserver, and leaves the original DOM
    // intact for an immediate toggle-off.
    //
    // The blank surface paints ADO's own `--background-color` theme token (the same one ADO's body
    // rule references) so the Enhanced View follows the account's light or dark theme instead of
    // flashing white; the #fff fallback covers an un-themed or still-loading page. Using the CSS
    // token keeps this reactive to theme changes without re-running any JS.
    const style = this.doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      'html, body { background: var(--background-color, #fff) !important; } [role="main"] { display: none !important; }';
    (this.doc.head ?? this.doc.documentElement).append(style);
    this.style = style;
  }
}
