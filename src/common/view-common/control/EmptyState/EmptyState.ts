/**
 * The "nothing to show, and that is an answer" panel a view renders in place of its item list.
 *
 * A view whose filters hide every item would otherwise render a blank rectangle, which reads as a
 * failed load rather than as a narrowed board. Saying so explicitly — and saying how to get the
 * items back — is what separates "empty" from "broken".
 */
export interface EmptyStateContent {
  /** The headline sentence stating that nothing matched. */
  message: string;
  /** The follow-up telling the reader how to bring items back. */
  hint: string;
}

/** Build the shared muted, dashed empty-state panel in the given document. */
export function renderEmptyState(doc: Document, content: EmptyStateContent): HTMLElement {
  const root = doc.createElement("div");
  root.className = "awesomeado-empty-state";
  root.setAttribute("role", "status");
  // Self-contained styling so ADO's stylesheet can neither restyle nor hide the panel. The dashed
  // outline is what makes the space read as deliberately reserved rather than as a rendering gap.
  root.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "gap:6px",
    "box-sizing:border-box",
    "margin:16px 10px",
    "padding:28px 16px",
    "border:1px dashed var(--control-border)",
    "border-radius:6px",
    "text-align:center",
    "font-family:inherit",
  ].join(";");

  const message = doc.createElement("p");
  message.className = "awesomeado-empty-state__message";
  message.textContent = content.message;
  message.style.cssText = "margin:0;font-size:13px;font-weight:600;color:var(--text-primary-color)";

  const hint = doc.createElement("p");
  hint.className = "awesomeado-empty-state__hint";
  hint.textContent = content.hint;
  hint.style.cssText = "margin:0;font-size:12px;color:var(--text-secondary-color)";

  root.append(message, hint);
  return root;
}
