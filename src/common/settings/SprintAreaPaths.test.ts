import { describe, expect, it } from "vitest";

import {
  pruneSprintAreaPaths,
  selectedAreaPathsForSprint,
  type SprintAreaPaths,
} from "./SprintAreaPaths";

describe("selectedAreaPathsForSprint", () => {
  it("materializes new defaults without removing a sprint's existing selections", () => {
    expect(
      selectedAreaPathsForSprint(["Project\\API", "Project\\Web"], {
        areaPaths: ["Project\\API", "Project\\Legacy"],
        startDate: null,
        finishDate: null,
      }),
    ).toEqual(["Project\\API", "Project\\Legacy", "Project\\Web"]);
  });
});

describe("pruneSprintAreaPaths", () => {
  it("keeps the newest ten completed sprints plus current, future, and undated records", () => {
    const selections: SprintAreaPaths = {};
    for (let day = 1; day <= 12; day += 1) {
      selections[`Project\\Sprint ${day}`] = {
        areaPaths: ["Project\\API"],
        startDate: null,
        finishDate: `2026-01-${String(day).padStart(2, "0")}T00:00:00Z`,
      };
    }
    selections["Project\\Current"] = {
      areaPaths: [],
      startDate: null,
      finishDate: "2026-08-14T00:00:00Z",
    };
    selections["Project\\Unknown"] = { areaPaths: [], startDate: null, finishDate: null };

    const pruned = pruneSprintAreaPaths(selections, new Date("2026-08-01T00:00:00Z"));

    expect(Object.keys(pruned)).toHaveLength(12);
    expect(pruned).not.toHaveProperty("Project\\Sprint 1");
    expect(pruned).not.toHaveProperty("Project\\Sprint 2");
    expect(pruned).toHaveProperty("Project\\Sprint 3");
    expect(pruned).toHaveProperty("Project\\Current");
    expect(pruned).toHaveProperty("Project\\Unknown");
  });
});
