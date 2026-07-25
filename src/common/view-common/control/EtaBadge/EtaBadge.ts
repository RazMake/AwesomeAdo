import { describeEtaCountdown } from "../../../datetime/etaCountdown";
import { formatPstDate } from "../../../datetime/pstDateTime";

/**
 * Options for rendering an ETA badge.
 */
export interface EtaBadgeOptions {
  /** The target ETA date (ISO 8601); null or empty means no ETA is set. */
  eta: string | null;
  /** The reference point (current time) for countdown calculation. */
  now: Date;
}

/**
 * An ETA badge showing the target date, countdown text, and severity color.
 *
 * When no ETA is set (null or empty), displays "No ETA" in a muted color. Otherwise shows
 * "ETA MM/DD/YYYY" with a color reflecting urgency (overdue, soon, upcoming, distant) and
 * a hover tooltip carrying the countdown text ("in 2 weeks 3 days" or "overdue by 3 days").
 */
export function renderEtaBadge(doc: Document, options: EtaBadgeOptions): HTMLElement {
  const { eta, now } = options;
  const span = doc.createElement("span");
  span.className = "awesomeado-eta";

  // Inline styling so ADO's stylesheet cannot restyle or hide this control.
  span.style.cssText = ["cursor:default", "font:inherit"].join(";");

  if (!eta) {
    // No ETA set → display a muted placeholder.
    span.textContent = "No ETA";
    span.style.color = "var(--text-secondary-color, #8a8886)";
  } else {
    // Calculate countdown and apply severity color.
    const countdown = describeEtaCountdown(eta, now);
    span.textContent = `ETA ${formatPstDate(eta)}`;
    span.style.color = countdown.color;
    span.title = countdown.text;
    span.dataset.severity = countdown.severity;
  }

  return span;
}
