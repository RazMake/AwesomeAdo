/**
 * The one place an ISO 8601 timestamp becomes a comparable number.
 *
 * Every consumer that sorts, windows, or compares timestamps needs the same two decisions — that a
 * missing timestamp and an unparseable one are the same "no answer", and that the answer is epoch
 * milliseconds. Written per call site, those two decisions drift: one comparator treats a bad date
 * as `NaN` (which loses every comparison silently), the next as `0` (which makes it the oldest thing
 * in the list).
 */
export function isoEpoch(iso: string | null | undefined): number | null {
  if (iso === null || iso === undefined || iso.length === 0) {
    return null;
  }
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : parsed;
}
