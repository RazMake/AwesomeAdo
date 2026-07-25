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
 * (and avoids duplicating the boilerplate per format).
 */
function formatPst(iso: string, options: Intl.DateTimeFormatOptions): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: PST_TIMEZONE, ...options }).format(date);
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
 * Format an ISO 8601 timestamp as "MM/DD/YYYY @ h:mm AM/PM PST" for tooltip hovers.
 *
 * Examples:
 * - "2026-07-24T15:30:00Z" → "07/24/2026 @ 8:30 AM PST"
 * - "" → ""
 * - "invalid" → ""
 */
export function formatPstTooltip(iso: string): string {
  if (!iso) return "";
  const date = formatPstDate(iso);
  const time = formatPstTime(iso);
  if (!date || !time) return "";

  return `${date} @ ${time} PST`;
}
