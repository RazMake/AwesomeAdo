/**
 * Format ISO 8601 timestamps in Pacific Standard Time (America/Los_Angeles).
 *
 * These pure functions take ISO 8601 strings and return PST-formatted output using
 * Intl.DateTimeFormat. Invalid/empty input returns "". No state, no side effects.
 */

const PST_TIMEZONE = "America/Los_Angeles";

/**
 * Parse an ISO 8601 string and format it in PST with the given options, or "" when the input is
 * empty/invalid. Centralizing the parse+guard here keeps every formatter's validation identical
 * (and avoids duplicating the boilerplate per format). The locale defaults to en-US; callers that
 * need a specific part order (e.g. the ISO `yyyy-MM-dd` an `<input type="date">` requires) pass one.
 */
function formatPst(iso: string, options: Intl.DateTimeFormatOptions, locale = "en-US"): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale, { timeZone: PST_TIMEZONE, ...options }).format(date);
}

/**
 * Format an ISO 8601 timestamp as MM/DD/YYYY in America/Los_Angeles.
 *
 * Examples:
 * - "2026-07-24T15:30:00Z" → "07/24/2026"
 * - "" → ""
 * - "invalid" → ""
 */
export function formatPstDate(iso: string): string {
  return formatPst(iso, { year: "numeric", month: "2-digit", day: "2-digit" });
}

/**
 * Format an ISO 8601 timestamp as `yyyy-MM-dd` in America/Los_Angeles — the value shape an
 * `<input type="date">` requires. Uses the en-CA locale, which renders the parts in ISO order.
 *
 * Examples:
 * - "2026-07-24T15:30:00Z" → "2026-07-24"
 * - "" → ""
 * - "invalid" → ""
 */
export function formatPstDateInput(iso: string): string {
  return formatPst(iso, { year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA");
}

/**
 * Format an ISO 8601 timestamp as h:mm AM/PM in America/Los_Angeles.
 *
 * Examples:
 * - "2026-07-24T15:30:00Z" → "8:30 AM" (PST)
 * - "" → ""
 * - "invalid" → ""
 */
export function formatPstTime(iso: string): string {
  return formatPst(iso, { hour: "numeric", minute: "2-digit", hour12: true });
}

/**
 * Format an ISO 8601 timestamp as "@ h:mm AM/PM PST" for tooltip hovers.
 *
 * The date is intentionally omitted because the label already shows it; the tooltip only adds the
 * exact time the label cannot fit.
 *
 * Examples:
 * - "2026-07-24T15:30:00Z" → "@ 8:30 AM PST"
 * - "" → ""
 * - "invalid" → ""
 */
export function formatPstTooltip(iso: string): string {
  const time = formatPstTime(iso);
  if (!time) return "";

  return `@ ${time} PST`;
}
