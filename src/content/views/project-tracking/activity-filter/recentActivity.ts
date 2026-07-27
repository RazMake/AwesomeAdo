/**
 * What the board's "recent activity" pills mean, kept apart from the DOM that draws them so the
 * predicate the tree filters by and the pills the reader clicks can never disagree about which
 * items count as new.
 */

import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";

/** The three kinds of recent activity a reader can narrow the board to. */
export type RecentActivityKind = "created" | "updated" | "notes";

/** One offered pill: what it is called, what it promises, and the color it wears. */
export interface RecentActivityFilter {
  kind: RecentActivityKind;
  label: string;
  /**
   * The pill's fill. Fixed colors rather than theme tokens for the same reason the untagged tag pill
   * uses one: under "Follow ADO" a surface token can collapse into the page color and erase the pill
   * — and these three have to stay distinguishable from each other on every theme.
   */
  background: string;
  /** Completed with the window ("… in the last 24 hours") to explain what the pill narrows to. */
  describes: string;
}

/**
 * The pills, in reading order: born, touched, talked about. Declared once here so the panel, the
 * predicate and the tests all enumerate the same three kinds — adding a fourth is a single edit.
 */
export const RECENT_ACTIVITY_FILTERS: readonly RecentActivityFilter[] = [
  {
    kind: "created",
    label: "Newly created",
    background: "hsl(140, 55%, 34%)",
    describes: "Items created",
  },
  {
    kind: "updated",
    label: "Newly updated",
    background: "hsl(210, 60%, 40%)",
    describes: "Items changed",
  },
  {
    kind: "notes",
    label: "New notes",
    background: "hsl(280, 45%, 44%)",
    describes: "Items that gained a discussion note",
  },
];

/** Milliseconds in an hour, the unit the recent-changes window is configured in. */
const MS_PER_HOUR = 60 * 60 * 1000;

/**
 * The instant the rolling window opens, as epoch milliseconds.
 *
 * Computed from an injected `now` rather than read from the clock here, so a board that has been
 * left open ages items out on its next repaint instead of pinning itself to the hour it loaded on.
 */
export function recentWindowStart(now: Date, hours: number): number {
  return now.getTime() - hours * MS_PER_HOUR;
}

/** Whether an ADO timestamp falls inside the window. An unparseable date is never counted as new. */
export function isWithinRecentWindow(iso: string, sinceMs: number): boolean {
  const at = Date.parse(iso);
  return !Number.isNaN(at) && at >= sinceMs;
}

/** Everything one render pass needs to answer "is this item newly anything?". */
export interface RecentActivityCriteria {
  /** The pills in force. An EMPTY set means the board is not narrowed by activity at all. */
  selected: ReadonlySet<RecentActivityKind>;
  /** Epoch milliseconds the rolling window opens at (see `recentWindowStart`). */
  sinceMs: number;
  /**
   * Whether the item gained a discussion note inside the window. Injected because the answer is not
   * in the tree — ADO reports only a TOTAL comment count, so the board has to read the discussions
   * to know — and this predicate must stay a pure function of what it is handed.
   */
  hasRecentNote: (item: TrackedWorkItem) => boolean;
}

/**
 * Does this item match the active pills? Multiple selected pills form an **OR**, exactly like the
 * tag filter beside them: a reader who wants "anything that moved" should not have to click one pill
 * at a time. An empty selection matches everything, which is what makes "no pills lit" mean "no
 * activity filter" rather than "hide the whole board".
 */
export function matchesRecentActivity(
  item: TrackedWorkItem,
  criteria: RecentActivityCriteria,
): boolean {
  const { selected, sinceMs } = criteria;
  if (selected.size === 0) {
    return true;
  }
  if (selected.has("created") && isWithinRecentWindow(item.createdDate, sinceMs)) {
    return true;
  }
  if (selected.has("updated") && isWithinRecentWindow(item.changedDate, sinceMs)) {
    return true;
  }
  return selected.has("notes") && criteria.hasRecentNote(item);
}

/**
 * The pills that may actually narrow the board right now.
 *
 * "New notes" is dropped while the board is still reading discussions, because the answer for every
 * item is "unknown" until it lands. Applying it early would empty the board and then repopulate it —
 * two visible jumps for a question nobody has answered yet — so the board stays wide until it can
 * narrow correctly, once.
 */
export function activityFilterInForce(
  selected: ReadonlySet<RecentActivityKind>,
  notesPending: boolean,
): ReadonlySet<RecentActivityKind> {
  if (!notesPending || !selected.has("notes")) {
    return selected;
  }
  const inForce = new Set(selected);
  inForce.delete("notes");
  return inForce;
}
