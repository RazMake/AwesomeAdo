import { describe, expect, it } from "vitest";

import { getViewType, VIEW_TYPES } from "./viewCatalog";

describe("VIEW_TYPES", () => {
  it("offers Sprint View and Project Tracking, in order", () => {
    expect(VIEW_TYPES.map((view) => view.label)).toEqual(["Sprint View", "Project Tracking"]);
  });

  it("uses stable ids for every view", () => {
    expect(VIEW_TYPES.map((view) => view.id)).toEqual(["sprint", "projectTracking"]);
  });

  it("keeps every property optional so any view can still be bound as-is", () => {
    for (const view of VIEW_TYPES) {
      expect(view.properties.every((property) => !property.required)).toBe(true);
    }
  });

  it("gives Project Tracking its ordering, updates, completed, and recent-change fields", () => {
    const tracking = getViewType("projectTracking");
    expect(tracking?.properties.map((property) => property.key)).toEqual([
      "orderingPolicy",
      "weeks",
      "days",
      "hours",
    ]);
    const byKey = new Map(tracking?.properties.map((property) => [property.key, property]));
    expect(byKey.get("orderingPolicy")).toMatchObject({
      kind: "select",
      defaultValue: "importance",
    });
    expect(byKey.get("orderingPolicy")?.options).toEqual([
      { value: "importance", label: "By Importance (most important first)" },
      { value: "title", label: "By Title (a-z)" },
      { value: "eta", label: "By ETA (past/recent - future)" },
    ]);
    expect(byKey.get("weeks")).toMatchObject({
      kind: "number",
      defaultValue: "2",
      min: 1,
      max: 52,
    });
    expect(byKey.get("days")).toMatchObject({
      kind: "number",
      defaultValue: "4",
      min: 0,
      max: 3650,
    });
    expect(byKey.get("hours")).toMatchObject({ kind: "number", defaultValue: "24", min: 1 });
  });

  it("gives Sprint View the shared recent-change window", () => {
    expect(getViewType("sprint")?.properties).toEqual([
      expect.objectContaining({ key: "hours", kind: "number", defaultValue: "24", min: 1 }),
    ]);
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
