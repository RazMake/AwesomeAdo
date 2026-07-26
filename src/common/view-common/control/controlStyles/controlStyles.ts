/**
 * Injects a control's stylesheet into a document exactly once.
 *
 * Shared view controls style themselves inline so Azure DevOps' own stylesheet cannot restyle or
 * hide them. Inline styles cannot express `:hover` or a shadow pseudo-element
 * (`::-webkit-calendar-picker-indicator`), which is the only reason a control ever needs a real
 * rule. Routing those few rules through one id-guarded injector keeps the exception in a single
 * place: a control asks for its sheet on every render, and only the first ask actually adds it, so
 * re-rendering a board with hundreds of rows never grows the document head.
 */
export function ensureControlStyles(doc: Document, id: string, css: string): void {
  if (doc.getElementById(id)) {
    return;
  }
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = css;
  // A document fragment may have no head; the body (or the root element) is an equally valid host
  // for a <style>, so fall back rather than dropping the rules.
  (doc.head ?? doc.body ?? doc.documentElement).append(style);
}
