import { describe, expect, it } from "vitest";

import { getViewType, VIEW_TYPES } from "./ViewType";

describe("VIEW_TYPES", () => {
  it("offers Sprint View and Project Tracking, in order", () => {
    expect(VIEW_TYPES.map((view) => view.label)).toEqual(["Sprint View", "Project Tracking"]);
  });

  it("uses stable ids for every view", () => {
    expect(VIEW_TYPES.map((view) => view.id)).toEqual(["sprint", "projectTracking"]);
  });

  it("declares no required properties yet, so views can be bound as-is", () => {
    for (const view of VIEW_TYPES) {
      expect(view.properties).toEqual([]);
    }
  });
});

describe("getViewType", () => {
  it("returns the matching view by id", () => {
    expect(getViewType("sprint")?.label).toBe("Sprint View");
  });

  it("returns undefined for an unknown id", () => {
    expect(getViewType("does-not-exist")).toBeUndefined();
  });
});
