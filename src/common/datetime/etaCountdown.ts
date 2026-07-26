/**
 * ETA countdown calculation: how far away (or overdue) a target date is, bucketed by severity.
 *
 * Compares the target's PST midnight to now's PST midnight to determine whole-day delta, then maps
 * that to a human text + severity bucket + color. Used by Project Tracking views to show ETA urgency.
 */

export type EtaSeverity = "overdue" | "soon" | "upcoming" | "distant";

export interface EtaCountdown {
  /** Human-readable countdown text: "overdue by 3 days", "due today", "in 2 weeks 3 days", etc. */
  text: string;
  /** The severity bucket this ETA falls into, based on the day delta. */
  severity: EtaSeverity;
  /** The hex color for this severity (no # prefix). */
  color: string;
}

// Severity thresholds (whole days from now's PST midnight to target's PST midnight):
// overdue: delta < 0
// soon: 0 <= delta <= 6
// upcoming: 7 <= delta <= 27
// distant: delta >= 28
const SEVERITY_COLORS: Record<EtaSeverity, string> = {
  overdue: "#d13438",
  soon: "#ca5010",
  upcoming: "#c19c00",
  distant: "#8a8886",
};

/**
 * Describe how far away (or overdue) a target date is.
 *
 * Compares whole PST calendar days (ignoring time-of-day): floor((targetMidnight - nowMidnight) / 86400000).
 * Returns a human text, severity bucket, and color. Deterministic: same inputs always yield the same result.
 *
 * Examples (assume now = 2026-07-24T10:00:00-07:00 PST):
 * - targetIso = "2026-07-21" (3 days ago) → { text: "overdue by 3 days", severity: "overdue", color: "#d13438" }
 * - targetIso = "2026-07-24" (today) → { text: "due today", severity: "soon", color: "#ca5010" }
 * - targetIso = "2026-07-26" (2 days) → { text: "in 2 days", severity: "soon", color: "#ca5010" }
 * - targetIso = "2026-08-10" (17 days) → { text: "in 2 weeks 3 days", severity: "upcoming", color: "#c19c00" }
 * - targetIso = "invalid" → { text: "", severity: "distant", color: "#8a8886" }
 *
 * @param targetIso The target date (ISO 8601); its PST midnight is compared to now's PST midnight.
 * @param now The reference point (current time); injected so tests control the baseline.
 */
export function describeEtaCountdown(targetIso: string, now: Date): EtaCountdown {
  if (!targetIso) {
    return { text: "", severity: "distant", color: SEVERITY_COLORS.distant };
  }

  const target = new Date(targetIso);
  if (Number.isNaN(target.getTime())) {
    return { text: "", severity: "distant", color: SEVERITY_COLORS.distant };
  }

  const targetMidnight = resolveTargetMidnight(target);
  const nowMidnight = getPstMidnight(now);

  // Whole-day delta (floor to ignore partial days).
  const delta = Math.floor((targetMidnight - nowMidnight) / 86400000);

  if (delta < 0) {
    const daysOverdue = Math.abs(delta);
    const text = `overdue by ${daysOverdue} ${daysOverdue === 1 ? "day" : "days"}`;
    return { text, severity: "overdue", color: SEVERITY_COLORS.overdue };
  }

  if (delta === 0) {
    return { text: "due today", severity: "soon", color: SEVERITY_COLORS.soon };
  }

  // delta > 0: future
  const text = formatFutureDelta(delta);
  const severity = delta <= 6 ? "soon" : delta <= 27 ? "upcoming" : "distant";
  return { text, severity, color: SEVERITY_COLORS[severity] };
}

/**
 * Resolve the target's PST midnight timestamp, normalizing how ADO serializes a calendar date.
 *
 * ADO ETA fields are calendar dates (no time-of-day) but are serialized as ISO timestamps. A
 * "date-only" ISO like "2026-07-24T00:00:00Z" (midnight UTC) must be read as its UTC calendar date
 * treated as PST; a full timestamp like "2026-07-25T06:59:00Z" (11:59 PM PST July 24) must be read
 * as its PST date. Both then resolve to "July 24" when that is the intended calendar date.
 */
function resolveTargetMidnight(target: Date): number {
  const isMidnightUtc =
    target.getUTCHours() === 0 && target.getUTCMinutes() === 0 && target.getUTCSeconds() === 0;
  if (isMidnightUtc) {
    return computePstMidnight(
      target.getUTCFullYear(),
      target.getUTCMonth() + 1,
      target.getUTCDate(),
    );
  }
  return getPstMidnight(target);
}

/**
 * Get the PST midnight (00:00:00.000) for a given date.
 *
 * Extracts the PST calendar date (year/month/day) for the input, then returns the UTC timestamp
 * for 00:00:00 PST on that date. Deterministic: same input always yields the same result.
 */
function getPstMidnight(date: Date): number {
  // Get the PST calendar date components (year, month, day) for the input date.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parseInt(parts.find((p) => p.type === "year")?.value ?? "1970", 10);
  const month = parseInt(parts.find((p) => p.type === "month")?.value ?? "1", 10);
  const day = parseInt(parts.find((p) => p.type === "day")?.value ?? "1", 10);

  return computePstMidnight(year, month, day);
}

/**
 * Compute the UTC timestamp for midnight PST on a given calendar date.
 */
function computePstMidnight(year: number, month: number, day: number): number {
  // Start with the UTC timestamp for midnight UTC on this date.
  const utcMidnight = Date.UTC(year, month - 1, day, 0, 0, 0, 0);

  // Create a Date from this UTC timestamp and format it in PST to see what PST time it represents.
  const utcMidnightDate = new Date(utcMidnight);
  const pstParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(utcMidnightDate);

  const pstHour = parseInt(pstParts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const pstMinute = parseInt(pstParts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const pstSecond = parseInt(pstParts.find((p) => p.type === "second")?.value ?? "0", 10);

  // Convert the PST time back to hours/minutes/seconds offset from midnight.
  const pstOffsetMs = pstHour * 3600000 + pstMinute * 60000 + pstSecond * 1000;

  // The UTC timestamp for midnight PST is UTC midnight plus the time to reach PST midnight.
  // If UTC midnight is 16:00 PST (4PM previous day), we need to add 8 hours to get to midnight PST.
  const adjustment = pstOffsetMs > 0 ? 86400000 - pstOffsetMs : 0;
  return utcMidnight + adjustment;
}

/**
 * Format a future delta (days > 0) as "in X weeks Y days" or "in X days".
 *
 * Omits zero weeks or zero days. Uses singular/plural correctly.
 * Examples: 1 → "in 1 day", 7 → "in 1 week", 8 → "in 1 week 1 day", 17 → "in 2 weeks 3 days".
 */
function formatFutureDelta(delta: number): string {
  const weeks = Math.floor(delta / 7);
  const days = delta % 7;

  const parts: string[] = [];
  if (weeks > 0) {
    parts.push(`${weeks} ${weeks === 1 ? "week" : "weeks"}`);
  }
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  }

  return `in ${parts.join(" ")}`;
}
