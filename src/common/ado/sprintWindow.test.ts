import { describe, expect, it } from "vitest";

import type { TeamIteration } from "./TeamIteration";
import { buildSprintWindow } from "./sprintWindow";

function iteration(name: string, timeFrame: TeamIteration["timeFrame"]): TeamIteration {
  return { name, path: `Project\\${name}`, timeFrame };
}

// Seven sprints: three past, one current, three future — enough to exercise clamping on both sides.
function sevenSprints(): TeamIteration[] {
  return [
    iteration("S1", "past"),
    iteration("S2", "past"),
    iteration("S3", "past"),
    iteration("S4", "current"),
    iteration("S5", "future"),
    iteration("S6", "future"),
    iteration("S7", "future"),
  ];
}

describe("buildSprintWindow", () => {
  it("returns an empty window for no iterations", () => {
    expect(buildSprintWindow([], { pastCount: 2, futureCount: 2 })).toEqual({
      entries: [],
      currentName: null,
    });
  });

  it("labels the window around the current sprint by relative offset", () => {
    const window = buildSprintWindow(sevenSprints(), { pastCount: 2, futureCount: 2 });

    expect(window.currentName).toBe("S4");
    expect(window.entries).toEqual([
      { path: "Project\\S2", name: "S2", label: "2 sprints ago - S2" },
      { path: "Project\\S3", name: "S3", label: "Previous - S3" },
      { path: "Project\\S4", name: "S4", label: "Current - S4" },
      { path: "Project\\S5", name: "S5", label: "Next sprint - S5" },
      { path: "Project\\S6", name: "S6", label: "2 sprints ahead - S6" },
    ]);
  });

  it("uses '3 sprints ahead/ago' wording beyond two", () => {
    const window = buildSprintWindow(sevenSprints(), { pastCount: 3, futureCount: 3 });
    const labels = window.entries.map((entry) => entry.label);
    expect(labels[0]).toBe("3 sprints ago - S1");
    expect(labels.at(-1)).toBe("3 sprints ahead - S7");
  });

  it("clamps the window to the available sprints", () => {
    const window = buildSprintWindow(sevenSprints(), { pastCount: 10, futureCount: 10 });
    expect(window.entries).toHaveLength(7);
    expect(window.entries[0]?.name).toBe("S1");
    expect(window.entries.at(-1)?.name).toBe("S7");
  });

  it("shows only the current sprint when both counts are zero", () => {
    const window = buildSprintWindow(sevenSprints(), { pastCount: 0, futureCount: 0 });
    expect(window.entries).toEqual([{ path: "Project\\S4", name: "S4", label: "Current - S4" }]);
  });

  it("anchors on the first future sprint when none is marked current", () => {
    const iterations = [
      iteration("S1", "past"),
      iteration("S2", "past"),
      iteration("S3", "future"),
      iteration("S4", "future"),
    ];
    const window = buildSprintWindow(iterations, { pastCount: 1, futureCount: 1 });

    // S3 (first future) becomes the anchor and is labelled "Current".
    expect(window.currentName).toBe("S3");
    expect(window.entries).toEqual([
      { path: "Project\\S2", name: "S2", label: "Previous - S2" },
      { path: "Project\\S3", name: "S3", label: "Current - S3" },
      { path: "Project\\S4", name: "S4", label: "Next sprint - S4" },
    ]);
  });

  it("anchors on the last sprint when everything is in the past", () => {
    const iterations = [iteration("S1", "past"), iteration("S2", "past")];
    const window = buildSprintWindow(iterations, { pastCount: 2, futureCount: 2 });

    expect(window.currentName).toBe("S2");
    expect(window.entries).toEqual([
      { path: "Project\\S1", name: "S1", label: "Previous - S1" },
      { path: "Project\\S2", name: "S2", label: "Current - S2" },
    ]);
  });
});
