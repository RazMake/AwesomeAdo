import { describe, expect, it } from "vitest";

import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import {
  DEFAULT_MARKER_TAGS,
  type WorkItemMarkerTags,
} from "../../../../common/settings/ExtensionSettings";

import { collectMarkersInUse, createMarkerFilter, itemHasMarker } from "./markerPresence";

/** A tracked item carrying only what these tests read: its id, its tags, its children. */
function item(id: number, tags: string[], children: TrackedWorkItem[] = []): TrackedWorkItem {
  return {
    id,
    rev: 1,
    type: "Story",
    title: `Item ${id}`,
    state: "New",
    assignedTo: null,
    iterationPath: null,
    sprintName: null,
    createdDate: "2026-01-01T00:00:00Z",
    createdBy: null,
    changedDate: "2026-01-01T00:00:00Z",
    changedBy: null,
    stateChangeDate: "",
    description: "",
    tags,
    noteCount: 0,
    importance: 100,
    eta: null,
    children,
  };
}

/** The shipped vocabulary with one marker deliberately blanked, as a team that skips it would have. */
const noInterrupt: WorkItemMarkerTags = {
  ...DEFAULT_MARKER_TAGS,
  interrupt: { tag: "", commentTag: "" },
};

describe("itemHasMarker", () => {
  it("matches the team's configured tag, whatever its casing on the item", () => {
    expect(itemHasMarker(item(1, ["blocked"]), "blocked", DEFAULT_MARKER_TAGS)).toBe(true);
  });

  it("does not confuse one marker's tag with another's", () => {
    expect(itemHasMarker(item(1, ["Blocked"]), "blockedByOtherTeam", DEFAULT_MARKER_TAGS)).toBe(
      false,
    );
  });

  it("never matches a marker the team left blank, whatever the item is tagged", () => {
    expect(itemHasMarker(item(1, ["Interrupt"]), "interrupt", noInterrupt)).toBe(false);
  });
});

describe("collectMarkersInUse", () => {
  it("finds markers anywhere in the tree, in the settings' presentation order", () => {
    const tree = item(1, [], [item(2, ["Blocked by another team"]), item(3, ["Blocked"])]);

    expect(collectMarkersInUse(tree, DEFAULT_MARKER_TAGS)).toEqual([
      "blocked",
      "blockedByOtherTeam",
    ]);
  });

  it("reports nothing when no item carries a configured tag", () => {
    const tree = item(1, ["Some other tag"], [item(2, [])]);

    expect(collectMarkersInUse(tree, DEFAULT_MARKER_TAGS)).toEqual([]);
  });

  it("skips a marker the team left blank even when an item wears that literal word", () => {
    const tree = item(1, ["Interrupt"]);

    expect(collectMarkersInUse(tree, noInterrupt)).toEqual([]);
  });
});

describe("createMarkerFilter", () => {
  it("passes everything while no pill is lit, so an unlit group narrows nothing", () => {
    const passes = createMarkerFilter(DEFAULT_MARKER_TAGS, new Set());

    expect(passes(item(1, []))).toBe(true);
  });

  it("ORs the lit pills together", () => {
    const passes = createMarkerFilter(
      DEFAULT_MARKER_TAGS,
      new Set(["blocked", "blockedByOtherTeam"] as const),
    );

    expect(passes(item(1, ["Blocked"]))).toBe(true);
    expect(passes(item(2, ["Blocked by another team"]))).toBe(true);
    expect(passes(item(3, []))).toBe(false);
  });
});
