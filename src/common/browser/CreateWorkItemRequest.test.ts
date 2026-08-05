import { describe, expect, it } from "vitest";

import {
  CREATE_WORK_ITEM_MESSAGE,
  createWorkItemMessageProblem,
  isCreateWorkItemMessage,
} from "./CreateWorkItemRequest";

function message(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: CREATE_WORK_ITEM_MESSAGE,
    itemType: "Epic",
    title: "Payments",
    tags: ["Catalog"],
    areaPath: "Fabrikam\\Core",
    iterationPath: "Fabrikam\\Backlog",
    ...overrides,
  };
}

describe("isCreateWorkItemMessage", () => {
  it("accepts a well-formed request", () => {
    expect(isCreateWorkItemMessage(message())).toBe(true);
    expect(createWorkItemMessageProblem(message())).toBeNull();
  });

  it("accepts a project with no tags or classification paths of its own", () => {
    expect(
      isCreateWorkItemMessage(message({ tags: [], areaPath: null, iterationPath: null })),
    ).toBe(true);
  });

  it("accepts a parent id, and treats an absent or null one as unparented", () => {
    expect(isCreateWorkItemMessage(message({ parentId: 42 }))).toBe(true);
    expect(isCreateWorkItemMessage(message({ parentId: null }))).toBe(true);
    expect(isCreateWorkItemMessage(message())).toBe(true);
  });

  it("refuses a parent that is not a real work item id", () => {
    expect(isCreateWorkItemMessage(message({ parentId: 0 }))).toBe(false);
    expect(isCreateWorkItemMessage(message({ parentId: -1 }))).toBe(false);
    expect(isCreateWorkItemMessage(message({ parentId: 1.5 }))).toBe(false);
    expect(isCreateWorkItemMessage(message({ parentId: "42" }))).toBe(false);
  });

  it("leaves another extension's message alone", () => {
    expect(isCreateWorkItemMessage({ type: "other" })).toBe(false);
    expect(isCreateWorkItemMessage(null)).toBe(false);
    expect(isCreateWorkItemMessage("create")).toBe(false);
  });

  it("refuses a blank type or title, which ADO would reject anyway", () => {
    expect(isCreateWorkItemMessage(message({ itemType: "  " }))).toBe(false);
    expect(isCreateWorkItemMessage(message({ title: "" }))).toBe(false);
  });

  it("refuses a title past the field's own limit", () => {
    expect(isCreateWorkItemMessage(message({ title: "x".repeat(256) }))).toBe(false);
  });

  it("keeps the credentialed operation bounded: too many tags, or one too long", () => {
    expect(isCreateWorkItemMessage(message({ tags: Array(21).fill("t") }))).toBe(false);
    expect(isCreateWorkItemMessage(message({ tags: ["x".repeat(401)] }))).toBe(false);
  });

  it("refuses tags that are not text, and an area path that is neither text nor absent", () => {
    expect(isCreateWorkItemMessage(message({ tags: [7] }))).toBe(false);
    expect(isCreateWorkItemMessage(message({ tags: "Catalog" }))).toBe(false);
    expect(isCreateWorkItemMessage(message({ areaPath: 7 }))).toBe(false);
    expect(isCreateWorkItemMessage(message({ areaPath: "x".repeat(1025) }))).toBe(false);
    expect(isCreateWorkItemMessage(message({ iterationPath: 7 }))).toBe(false);
    expect(isCreateWorkItemMessage(message({ iterationPath: "x".repeat(1025) }))).toBe(false);
  });

  it("names the problem so a refusal is a diagnosis rather than silence", () => {
    expect(createWorkItemMessageProblem(message({ title: "" }))).toBe(
      "malformed create-work-item request",
    );
  });

  it("accepts an assignee, a description and a reason, absent or filled in", () => {
    expect(
      isCreateWorkItemMessage(
        message({
          assignedTo: "ada@example.com",
          description: "Retry fails.",
          comment: "[Accepted] Escalation.",
        }),
      ),
    ).toBe(true);
    expect(
      isCreateWorkItemMessage(message({ assignedTo: null, description: null, comment: null })),
    ).toBe(true);
  });

  it("keeps the assignee and the prose bounded, and refuses values that are not text", () => {
    expect(isCreateWorkItemMessage(message({ assignedTo: "x".repeat(257) }))).toBe(false);
    expect(isCreateWorkItemMessage(message({ assignedTo: 7 }))).toBe(false);
    expect(isCreateWorkItemMessage(message({ description: "x".repeat(32769) }))).toBe(false);
    expect(isCreateWorkItemMessage(message({ comment: "x".repeat(32769) }))).toBe(false);
    expect(isCreateWorkItemMessage(message({ comment: 7 }))).toBe(false);
  });
});
