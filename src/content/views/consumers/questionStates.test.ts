import { describe, expect, it } from "vitest";

import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";

import { mappedFixedState } from "./fixedStatuses";
import {
  isOpenQuestion,
  questionStateMapping,
  questionStateMappingProperty,
  widestQuestionStateLabelLength,
} from "./questionStates";

function task(state: string): TrackedWorkItem {
  return {
    id: 1,
    rev: 1,
    type: "Task",
    title: "Question",
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

const MAPPING = questionStateMapping({
  questionStateMapping: JSON.stringify([
    {
      type: "Task",
      states: { open: ["To Do"], inProgress: ["Doing"], answered: ["Done"], removed: ["Cut"] },
    },
  ]),
});

describe("questionStateMappingProperty", () => {
  it("is a Task-row state table with the four fixed question statuses", () => {
    expect(questionStateMappingProperty).toMatchObject({
      key: "questionStateMapping",
      kind: "state-mapping",
      stateRowTypes: ["Task"],
      stateColumns: [
        { value: "open", label: "Open" },
        { value: "inProgress", label: "In Progress" },
        { value: "answered", label: "Answered" },
        { value: "removed", label: "Removed" },
      ],
    });
  });
});

describe("questionStateMapping", () => {
  it("maps ADO states onto gray, blue, green, and red statuses", () => {
    expect(
      ["To Do", "Doing", "Done", "Cut"].map((state) => {
        const mapped = mappedFixedState(task(state), MAPPING);
        return [mapped?.label, mapped?.ordinal];
      }),
    ).toEqual([
      ["Open", 0],
      ["In Progress", 1],
      ["Answered", 3],
      ["Removed", 4],
    ]);
  });

  it("treats only Open and In Progress questions as open", () => {
    expect(isOpenQuestion(task("To Do"), MAPPING)).toBe(true);
    expect(isOpenQuestion(task("Doing"), MAPPING)).toBe(true);
    expect(isOpenQuestion(task("Done"), MAPPING)).toBe(false);
    expect(isOpenQuestion(task("Cut"), MAPPING)).toBe(false);
  });

  it("falls back to the legacy end states for unmapped states", () => {
    const unmapped = questionStateMapping({});
    expect(isOpenQuestion(task("Active"), unmapped)).toBe(true);
    expect(isOpenQuestion(task("Closed"), unmapped)).toBe(false);
    expect(isOpenQuestion(task("Answered"), unmapped)).toBe(false);
  });

  it("sizes badges for the widest label or raw state", () => {
    expect(widestQuestionStateLabelLength([task("To Do")], MAPPING)).toBe("In Progress".length);
    expect(widestQuestionStateLabelLength([task("An unmapped state")], MAPPING)).toBe(
      "An unmapped state".length,
    );
  });
});
