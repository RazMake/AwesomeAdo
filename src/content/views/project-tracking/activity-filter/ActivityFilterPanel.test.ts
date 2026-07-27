import { describe, expect, it } from "vitest";

import { renderActivityFilterPills } from "./ActivityFilterPanel";
import type { RecentActivityKind } from "./recentActivity";

/** Renders the pills with the defaults these tests do not vary. */
function renderPills(overrides: {
  selected?: Set<RecentActivityKind>;
  windowHours?: number;
  notesPending?: boolean;
  onChange?: (selected: Set<RecentActivityKind>) => void;
}): HTMLElement[] {
  return renderActivityFilterPills(document, {
    selected: overrides.selected ?? new Set<RecentActivityKind>(),
    windowHours: overrides.windowHours ?? 24,
    notesPending: overrides.notesPending ?? false,
    onChange: overrides.onChange ?? (() => {}),
  });
}

describe("renderActivityFilterPills", () => {
  it("renders one loose pill per activity kind, in reading order", () => {
    const pills = renderPills({});

    // Loose, not wrapped in a panel: they share the board's one wrapping filter row.
    expect(pills.map((pill) => pill.className)).toEqual([
      "awesomeado-activity-pill",
      "awesomeado-activity-pill",
      "awesomeado-activity-pill",
    ]);
    expect(pills.map((pill) => pill.textContent)).toEqual([
      "Newly created",
      "Newly updated",
      "New notes",
    ]);
  });

  it("reflects which pills are lit", () => {
    const [created, updated] = renderPills({
      selected: new Set<RecentActivityKind>(["updated"]),
    });

    expect(created?.getAttribute("aria-pressed")).toBe("false");
    expect(updated?.getAttribute("aria-pressed")).toBe("true");
    expect(updated?.classList.contains("awesomeado-activity-pill--selected")).toBe(true);
  });

  it("lights an unlit pill and reports the caller's own set back", () => {
    const selected = new Set<RecentActivityKind>();
    let reported: Set<RecentActivityKind> | null = null;
    const pills = renderPills({ selected, onChange: (next) => (reported = next) });

    (pills[0] as HTMLButtonElement).click();

    expect(selected.has("created")).toBe(true);
    expect(reported).toBe(selected);
  });

  it("puts out a lit pill when it is clicked again", () => {
    const selected = new Set<RecentActivityKind>(["notes"]);
    const pills = renderPills({ selected });

    (pills[2] as HTMLButtonElement).click();

    expect(selected.has("notes")).toBe(false);
  });

  it("marks only the notes pill as busy while the discussions are being read", () => {
    const [created, , notes] = renderPills({
      selected: new Set<RecentActivityKind>(["notes"]),
      notesPending: true,
    });

    expect(notes?.textContent).toBe("New notes\u2026");
    expect(notes?.getAttribute("aria-busy")).toBe("true");
    expect(created?.getAttribute("aria-busy")).toBe("false");
    expect(created?.textContent).toBe("Newly created");
  });

  it("names the window in each pill's tooltip, since no label carries it", () => {
    const pills = renderPills({ windowHours: 8 });

    expect(pills[0]?.title).toBe("Items created in the last 8 hours.");
    expect(pills[2]?.title).toBe("Items that gained a discussion note in the last 8 hours.");
  });

  it("says '1 hour' rather than '1 hours' for the smallest window", () => {
    expect(renderPills({ windowHours: 1 })[1]?.title).toBe("Items changed in the last 1 hour.");
  });
});
