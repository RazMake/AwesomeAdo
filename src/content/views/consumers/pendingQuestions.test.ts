import { describe, expect, it } from "vitest";

import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";

import {
  PENDING_QUESTIONS_TAG,
  consumerRequests,
  hasActivePendingQuestions,
  isPendingQuestionsStory,
  openConsumerQuestions,
} from "./pendingQuestions";

function item(id: number, overrides: Partial<TrackedWorkItem> = {}): TrackedWorkItem {
  return {
    id,
    rev: 1,
    type: "Request",
    title: `Item ${id}`,
    state: "Active",
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
    importance: id,
    eta: null,
    children: [],
    ...overrides,
  };
}

function pending(id: number, ...questions: TrackedWorkItem[]): TrackedWorkItem {
  return item(id, {
    type: "User Story",
    title: "A renamed question store",
    tags: [PENDING_QUESTIONS_TAG],
    children: questions,
  });
}

describe("Pending Questions identification", () => {
  it("uses the User Story type and PendingQuestions tag rather than the title or tag casing", () => {
    expect(isPendingQuestionsStory(pending(90))).toBe(true);
    expect(
      isPendingQuestionsStory(
        item(91, {
          type: "User Story",
          title: "Renamed",
          tags: [" pendingquestions "],
        }),
      ),
    ).toBe(true);
    expect(
      isPendingQuestionsStory(
        item(92, {
          type: "User Story",
          title: "Pending Questions",
          tags: [],
        }),
      ),
    ).toBe(false);
    expect(
      isPendingQuestionsStory(
        item(93, {
          type: "Task",
          tags: [PENDING_QUESTIONS_TAG],
        }),
      ),
    ).toBe(false);
  });

  it("leaves every tagged story out of the consumer's real requests", () => {
    expect(
      consumerRequests(item(1, { children: [item(2), pending(90), pending(91)] })).map(
        ({ id }) => id,
      ),
    ).toEqual([2]);
  });

  it("aggregates Task children from every story and drops Closed, Resolved, and Removed tasks", () => {
    const consumer = item(1, {
      children: [
        pending(
          90,
          item(2, { type: "Task", state: "Closed" }),
          item(3, { type: "Task", state: "New" }),
        ),
        pending(
          91,
          item(4, { type: "Task", state: " resolved " }),
          item(5, { type: "Task", state: "Removed" }),
          item(6, { type: "Task", state: "Active" }),
          item(7, { type: "Bug", state: "Active" }),
        ),
      ],
    });

    expect(openConsumerQuestions(consumer).map(({ id }) => id)).toEqual([3, 6]);
    expect(hasActivePendingQuestions(consumer)).toBe(true);
  });

  it("reports no active questions when every Task is terminal", () => {
    expect(
      hasActivePendingQuestions(
        item(1, {
          children: [
            pending(
              90,
              item(2, { state: "Closed" }),
              item(3, { type: "Task", state: " resolved " }),
              item(4, { type: "Task", state: "Removed" }),
            ),
          ],
        }),
      ),
    ).toBe(false);
  });
});
