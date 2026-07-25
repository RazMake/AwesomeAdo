/**
 * The placeholder surface every enhanced view starts from.
 *
 * A brand-new view is just a title and one line of body text; the delightful, view-specific UI grows
 * in later and replaces the body. Keeping the DOM plumbing here (rather than in each view) means
 * adding a view is a title plus a line of text, and every view's shell stays visually consistent.
 * This is the first of the shared, per-view-customizable building blocks that future components
 * (context menu, sprint selector, queued writes back to ADO) will join under `src/common/view-common/control`.
 */
export interface ViewScaffoldContent {
  /** The view's title, shown as the heading. */
  title: string;
  /** One line describing what the view shows (a "hello world" placeholder for a new view). */
  message: string;
}

/** Build the standard centered title + message shell for a view, in the given document. */
export function renderViewScaffold(doc: Document, content: ViewScaffoldContent): HTMLElement {
  const root = doc.createElement("section");
  root.className = "awesomeado-view";
  // Self-contained styling so ADO's own stylesheet can neither restyle nor hide the surface, and
  // nothing the extension injects leaks back into the ADO page.
  root.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "gap:8px",
    // Fill the surface host (a full-window overlay) so the content stays centred in the whole window
    // below the breadcrumb bar; border-box keeps the padding inside that height so it never scrolls.
    "min-height:100%",
    "box-sizing:border-box",
    "padding:32px",
    "text-align:center",
    "font-family:inherit",
    "color:var(--text-primary-color, inherit)",
  ].join(";");

  const heading = doc.createElement("h1");
  heading.className = "awesomeado-view__title";
  heading.textContent = content.title;
  heading.style.cssText = "margin:0;font-size:24px;font-weight:600";

  const body = doc.createElement("p");
  body.className = "awesomeado-view__message";
  body.textContent = content.message;
  body.style.cssText = "margin:0;font-size:14px;opacity:0.8";

  root.append(heading, body);
  return root;
}
