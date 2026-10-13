import { describe, expect, it } from "vitest";

import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";

import {
  describeRequestStateCondition,
  isRequestStateConditionActive,
  mappedRequestState,
  matchesRequestStateCondition,
  NO_REQUEST_STATE_CONDITION,
  requestHasState,
  requestStateMapping,
  requestStateMappingProperty,
  requestStatesFor,
  widestRequestStateLabelLength,
  type RequestStateId,
} from "./requestStates";

function item(state: string, type = "User Story"): TrackedWorkItem {
  return {
    id: 1,
    rev: 1,
    type,
    title: "Request",
    state,
    priority: null,
    assignedTo: null,
    areaPath: null,
    iterationPath: null,
    sprintName: null,
    createdDate: "",
    createdBy: null,
    changedDate: "",
    changedBy: null,
    stateChangeDate: "",
    description: "",
    noteCount: 0,
    tags: [],
    importance: 1,
    eta: null,
    children: [],
  };
}

const TASK_MAPPING = {
  requestStateMapping: JSON.stringify([
    {
      type: "Task",
      states: { new: ["To Do"], accepted: ["Committed", "Doing"], rejected: ["Removed"] },
    },
  ]),
};

function named(id: string, label: string, ordinal: number) {
  return {
    id,
    label,
    ordinal,
    adoStates: [label],
    primaryState: label,
  };
}

describe("requestStateMapping", () => {
  it("maps an unconfigured type by states named like the five statuses", () => {
    expect(requestStatesFor(item("New"), requestStateMapping({}))).toEqual([
      named("new", "New", 0),
      named("needsClarification", "Needs Clarification", 2),
      named("accepted", "Accepted", 1),
      named("rejected", "Rejected", 4),
      named("done", "Done", 3),
    ]);
  });

  it("maps the Task row's states and writes each cell's first state", () => {
    const mapping = requestStateMapping(TASK_MAPPING);
    const accepted = requestStatesFor(item("Doing", "task"), mapping)[2];

    expect(accepted).toMatchObject({
      adoStates: ["Committed", "Doing"],
      primaryState: "Committed",
    });
    expect(mappedRequestState(item(" doing ", "Task"), mapping)?.id).toBe("accepted");
    expect(requestHasState(item("Committed", "Task"), "accepted", mapping)).toBe(true);
  });

  it("falls back to the status's own name for an empty cell", () => {
    const mapping = requestStateMapping(TASK_MAPPING);

    expect(requestStatesFor(item("To Do", "Task"), mapping)[4]).toEqual(named("done", "Done", 3));
    expect(mappedRequestState(item("Done", "Task"), mapping)?.id).toBe("done");
    // A mapped cell replaces the name.
    expect(mappedRequestState(item("Accepted", "Task"), mapping)).toBeNull();
  });

  it("applies the table's row to requests of any other work item type", () => {
    const mapping = requestStateMapping(TASK_MAPPING);

    expect(requestStatesFor(item("To Do", "User Story"), mapping)[2]).toMatchObject({
      adoStates: ["Committed", "Doing"],
      primaryState: "Committed",
    });
    expect(mappedRequestState(item("Doing", "User Story"), mapping)?.id).toBe("accepted");
    expect(mappedRequestState(item("Accepted", "Bug"), mapping)).toBeNull();
  });

  it("prefers a row named after the request's own type", () => {
    const mapping = requestStateMapping({
      requestStateMapping: JSON.stringify([
        { type: "Task", states: { done: ["Closed"] } },
        { type: "User Story", states: { done: ["Resolved"] } },
      ]),
    });

    expect(requestStatesFor(item("New", "User Story"), mapping)[4]?.primaryState).toBe("Resolved");
    expect(requestStatesFor(item("New", "Bug"), mapping)[4]?.primaryState).toBe("Closed");
  });

  it("keeps unmapped raw states visible when calculating the shared width", () => {
    const mapping = requestStateMapping({});

    expect(mappedRequestState(item("Custom review"), mapping)).toBeNull();
    expect(widestRequestStateLabelLength([item("A very long custom state")], mapping)).toBe(
      "A very long custom state".length,
    );
    expect(widestRequestStateLabelLength([item("New")], mapping)).toBe(
      "Needs Clarification".length,
    );
  });
});

describe("matchesRequestStateCondition", () => {
  const mapping = requestStateMapping({});
  const condition = (required: RequestStateId[], excluded: RequestStateId[] = []) => ({
    required: new Set(required),
    excluded: new Set(excluded),
  });
  const passes = (state: string, ...args: Parameters<typeof condition>): boolean =>
    matchesRequestStateCondition(item(state), condition(...args), mapping);

  it("keeps everything when nothing is chosen", () => {
    expect(isRequestStateConditionActive(NO_REQUEST_STATE_CONDITION)).toBe(false);
    expect(passes("Done", [])).toBe(true);
    expect(passes("Custom review", [])).toBe(true);
  });

  it("keeps a request in any one required state", () => {
    expect(passes("New", ["new", "accepted"])).toBe(true);
    expect(passes("Accepted", ["new", "accepted"])).toBe(true);
    expect(passes("Done", ["new", "accepted"])).toBe(false);
  });

  it("drops an excluded state and keeps the rest", () => {
    expect(passes("Rejected", [], ["rejected"])).toBe(false);
    expect(passes("New", [], ["rejected"])).toBe(true);
  });

  it("combines required and excluded states", () => {
    expect(passes("New", ["new", "accepted"], ["accepted"])).toBe(true);
    expect(passes("Accepted", ["new", "accepted"], ["accepted"])).toBe(false);
  });

  it("hides an unmapped state from a required condition but not from an exclusion", () => {
    expect(passes("Custom review", ["new"])).toBe(false);
    expect(passes("Custom review", [], ["new"])).toBe(true);
  });

  it("describes the condition for the diagnostics log", () => {
    expect(describeRequestStateCondition(NO_REQUEST_STATE_CONDITION)).toBe("none");
    expect(describeRequestStateCondition(condition(["new", "done"], ["rejected"]))).toBe(
      "any of [new,done], none of [rejected]",
    );
  });
});

describe("requestStateMappingProperty", () => {
  it("is one fixed User Story row mapped into the five statuses, Done last", () => {
    expect(requestStateMappingProperty).toMatchObject({
      key: "requestStateMapping",
      kind: "state-mapping",
      required: false,
      stateRowTypes: ["User Story"],
      stateColumns: [
        { value: "new", label: "New (Untriaged)" },
        { value: "needsClarification", label: "Needs Clarification" },
        { value: "accepted", label: "Accepted" },
        { value: "rejected", label: "Rejected" },
        { value: "done", label: "Done" },
      ],
    });
  });
});
