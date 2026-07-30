import { describe, expect, it } from "vitest";

import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";

import {
  RECENT_ACTIVITY_FILTERS,
  activityFilterInForce,
  isWithinRecentWindow,
  matchesRecentActivity,
  recentWindowStart,
  type RecentActivityKind,
} from "./recentActivity";

const NOW = new Date("2026-07-24T12:00:00Z");

/** A tracked item with only the two timestamps these tests vary; everything else is inert. */
function trackedItem(createdDate: string, changedDate: string): TrackedWorkItem {
  return {
    id: 7,
    rev: 1,
    type: "Story",
    title: "Anything",
    state: "New",
    priority: null,
    assignedTo: null,
    areaPath: null,
    iterationPath: null,
    sprintName: null,
    createdDate,
    createdBy: null,
    changedDate,
    changedBy: null,
    stateChangeDate: "",
    description: "",
    tags: [],
    noteCount: 0,
    importance: 100,
    eta: null,
    children: [],
  };
}

/** The criteria a pass builds, with the notes answer supplied by the caller. */
function criteria(kinds: RecentActivityKind[], hasRecentNote = false) {
  return {
    selected: new Set(kinds),
    sinceMs: recentWindowStart(NOW, 24),
    hasRecentNote: () => hasRecentNote,
  };
}

describe("recentWindowStart", () => {
  it("opens the window the configured number of hours before now", () => {
    expect(recentWindowStart(NOW, 24)).toBe(Date.parse("2026-07-23T12:00:00Z"));
    expect(recentWindowStart(NOW, 1)).toBe(Date.parse("2026-07-24T11:00:00Z"));
  });
});

describe("isWithinRecentWindow", () => {
  const sinceMs = recentWindowStart(NOW, 24);

  it("accepts a timestamp inside the window and its exact start", () => {
    expect(isWithinRecentWindow("2026-07-24T09:00:00Z", sinceMs)).toBe(true);
    expect(isWithinRecentWindow("2026-07-23T12:00:00Z", sinceMs)).toBe(true);
  });

  it("rejects a timestamp older than the window", () => {
    expect(isWithinRecentWindow("2026-07-23T11:59:59Z", sinceMs)).toBe(false);
  });

  it("never counts an unparseable timestamp as new", () => {
    expect(isWithinRecentWindow("", sinceMs)).toBe(false);
    expect(isWithinRecentWindow("not-a-date", sinceMs)).toBe(false);
  });
});

describe("matchesRecentActivity", () => {
  const stale = trackedItem("2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z");
  const justCreated = trackedItem("2026-07-24T08:00:00Z", "2026-07-24T08:00:00Z");
  const justChanged = trackedItem("2026-01-01T00:00:00Z", "2026-07-24T08:00:00Z");

  it("matches everything when no pill is lit", () => {
    expect(matchesRecentActivity(stale, criteria([]))).toBe(true);
  });

  it("matches only items created inside the window under the created pill", () => {
    expect(matchesRecentActivity(justCreated, criteria(["created"]))).toBe(true);
    expect(matchesRecentActivity(justChanged, criteria(["created"]))).toBe(false);
  });

  it("matches only items changed inside the window under the updated pill", () => {
    expect(matchesRecentActivity(justChanged, criteria(["updated"]))).toBe(true);
    expect(matchesRecentActivity(stale, criteria(["updated"]))).toBe(false);
  });

  it("defers to the injected answer under the notes pill", () => {
    expect(matchesRecentActivity(stale, criteria(["notes"], true))).toBe(true);
    expect(matchesRecentActivity(stale, criteria(["notes"], false))).toBe(false);
  });

  it("ORs the lit pills together", () => {
    expect(matchesRecentActivity(justCreated, criteria(["created", "updated"]))).toBe(true);
    expect(matchesRecentActivity(stale, criteria(["created", "updated", "notes"], true))).toBe(
      true,
    );
    expect(matchesRecentActivity(stale, criteria(["created", "updated"]))).toBe(false);
  });
});

describe("activityFilterInForce", () => {
  it("drops the notes pill while the discussions are still being read", () => {
    const inForce = activityFilterInForce(new Set<RecentActivityKind>(["created", "notes"]), true);
    expect([...inForce]).toEqual(["created"]);
  });

  it("keeps the selection as-is once the reads have settled", () => {
    const selected = new Set<RecentActivityKind>(["created", "notes"]);
    expect(activityFilterInForce(selected, false)).toBe(selected);
  });

  it("keeps the selection as-is when the notes pill is not lit", () => {
    const selected = new Set<RecentActivityKind>(["updated"]);
    expect(activityFilterInForce(selected, true)).toBe(selected);
  });
});

describe("RECENT_ACTIVITY_FILTERS", () => {
  it("offers exactly the three activity kinds, in reading order", () => {
    expect(RECENT_ACTIVITY_FILTERS.map((filter) => filter.kind)).toEqual([
      "created",
      "updated",
      "notes",
    ]);
    expect(RECENT_ACTIVITY_FILTERS.map((filter) => filter.label)).toEqual([
      "Newly created",
      "Newly updated",
      "New notes",
    ]);
    expect(RECENT_ACTIVITY_FILTERS.map((filter) => filter.background)).toEqual([
      "var(--activity-created-background)",
      "var(--activity-updated-background)",
      "var(--activity-notes-background)",
    ]);
  });
});
