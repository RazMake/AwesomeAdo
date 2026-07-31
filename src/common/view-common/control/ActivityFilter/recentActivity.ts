import type { TrackedWorkItem } from "../../../ado/TrackedWorkItem";

/** The three kinds of recent activity a reader can narrow a view to. */
export type RecentActivityKind = "created" | "updated" | "notes";

/** One offered pill: what it is called, what it promises, and the color it wears. */
export interface RecentActivityFilter {
  kind: RecentActivityKind;
  label: string;
  background: string;
  describes: string;
}

/** Shared definitions keep every activity-filtering view aligned on labels and semantics. */
export const RECENT_ACTIVITY_FILTERS: readonly RecentActivityFilter[] = [
  {
    kind: "created",
    label: "Newly created",
    background: "var(--activity-created-background)",
    describes: "Items created",
  },
  {
    kind: "updated",
    label: "Newly updated",
    background: "var(--activity-updated-background)",
    describes: "Items changed",
  },
  {
    kind: "notes",
    label: "New notes",
    background: "var(--activity-notes-background)",
    describes: "Items that gained a discussion note",
  },
];

const MS_PER_HOUR = 60 * 60 * 1000;

/** Return the start of a rolling recent-activity window as epoch milliseconds. */
export function recentWindowStart(now: Date, hours: number): number {
  return now.getTime() - hours * MS_PER_HOUR;
}

/** Whether an ADO timestamp falls inside the window. An unparseable date is never recent. */
export function isWithinRecentWindow(iso: string, sinceMs: number): boolean {
  const at = Date.parse(iso);
  return !Number.isNaN(at) && at >= sinceMs;
}

/** Everything one render pass needs to answer whether an item has recent activity. */
export interface RecentActivityCriteria {
  selected: ReadonlySet<RecentActivityKind>;
  sinceMs: number;
  hasRecentNote: (item: TrackedWorkItem) => boolean;
}

/** Multiple selected activity kinds form an OR; an empty selection matches every item. */
export function matchesRecentActivity(
  item: TrackedWorkItem,
  criteria: RecentActivityCriteria,
): boolean {
  const { selected, sinceMs } = criteria;
  if (selected.size === 0) return true;
  if (selected.has("created") && isWithinRecentWindow(item.createdDate, sinceMs)) return true;
  if (selected.has("updated") && isWithinRecentWindow(item.changedDate, sinceMs)) return true;
  return selected.has("notes") && criteria.hasRecentNote(item);
}

/** Defer the notes filter while discussion dates are still unknown to avoid a false empty state. */
export function activityFilterInForce(
  selected: ReadonlySet<RecentActivityKind>,
  notesPending: boolean,
): ReadonlySet<RecentActivityKind> {
  if (!notesPending || !selected.has("notes")) return selected;
  const inForce = new Set(selected);
  inForce.delete("notes");
  return inForce;
}
