import { describe, expect, it } from "vitest";

import {
  buildWorkItemTypeUrl,
  parseWorkItemStateTransitions,
  stateTransitionRoute,
} from "./WorkItemStateTransitions";

describe("buildWorkItemTypeUrl", () => {
  it("builds the project-scoped type URL from the tab", () => {
    expect(
      buildWorkItemTypeUrl("https://dev.azure.com/contoso/My%20Web/_queries", "User Story"),
    ).toBe(
      "https://dev.azure.com/contoso/My%20Web/_apis/wit/workitemtypes/User%20Story?api-version=7.1",
    );
  });

  it("refuses a non-project tab or a blank type", () => {
    expect(buildWorkItemTypeUrl("https://dev.azure.com/contoso", "Bug")).toBeNull();
    expect(buildWorkItemTypeUrl("https://dev.azure.com/contoso/web/_queries", " ")).toBeNull();
  });
});

describe("parseWorkItemStateTransitions", () => {
  it("keys each from-state case-insensitively and skips the creation entry", () => {
    const parsed = parseWorkItemStateTransitions({
      transitions: {
        "": [{ to: "New" }],
        New: [{ to: "Active", actions: null }, { to: " " }, null, { to: 3 }],
        new: [{ to: "Removed" }],
        Active: "not a list",
      },
    });

    expect(parsed).toEqual(new Map([["new", ["Active", "Removed"]]]));
  });

  it("is null when the body carries no usable transitions", () => {
    expect(parseWorkItemStateTransitions(null)).toBeNull();
    expect(parseWorkItemStateTransitions({ transitions: [] })).toBeNull();
    expect(parseWorkItemStateTransitions({ transitions: { "": [{ to: "New" }] } })).toBeNull();
  });
});

describe("stateTransitionRoute", () => {
  const process = new Map([
    ["new", ["Active", "Needs Info"]],
    ["active", ["Closed"]],
    ["needs info", ["Closed", "Active"]],
    ["closed", ["Active"]],
  ]);

  it("returns the fewest writes, taking ADO's order to break ties", () => {
    expect(stateTransitionRoute(process, "New", "closed")).toEqual(["Active", "Closed"]);
    expect(stateTransitionRoute(process, "New", "Needs Info")).toEqual(["Needs Info"]);
    expect(stateTransitionRoute(process, "Closed", "Needs Info")).toBeNull();
  });

  it("needs no write for the current state", () => {
    expect(stateTransitionRoute(process, " active ", "Active")).toEqual([]);
  });
});
