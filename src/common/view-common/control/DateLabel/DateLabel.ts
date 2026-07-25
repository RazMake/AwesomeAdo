import { formatPstDate, formatPstTooltip } from "../../../datetime/pstDateTime";

/**
 * A formatted date label showing MM/DD/YYYY in PST with a hover tooltip.
 *
 * Displays "—" when the ISO string is empty or invalid. The tooltip (title) shows the full
 * "MM/DD/YYYY @ h:mm AM/PM PST" format so users can see the exact time on hover.
 */
export function renderDateLabel(doc: Document, iso: string): HTMLElement {
  const span = doc.createElement("span");
  span.className = "awesomeado-date";

  // Inline styling so ADO's stylesheet cannot restyle or hide this control.
  span.style.cssText = ["cursor:default", "font:inherit", "color:inherit"].join(";");

  const dateText = formatPstDate(iso);
  if (!dateText) {
    // Invalid or empty ISO → display a placeholder dash and no tooltip.
    span.textContent = "—";
  } else {
    // Valid date → show the date text and set the tooltip.
    span.textContent = dateText;
    span.title = formatPstTooltip(iso);
  }

  return span;
}
