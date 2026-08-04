import { describe, expect, it } from "vitest";

import {
  isProjectQueryMessage,
  PROJECT_QUERY_MESSAGE,
  projectQueryMessageProblem,
} from "./ProjectQueryRequest";

const QUERY_ID = "11111111-2222-3333-4444-555555555555";

function readLinks(overrides: Record<string, unknown> = {}): unknown {
  return { type: PROJECT_QUERY_MESSAGE, operation: "read-links", ids: [1, 2], ...overrides };
}

function create(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: PROJECT_QUERY_MESSAGE,
    operation: "create",
    projectId: 7,
    projectTitle: "Payments",
    rev: 4,
    folderPath: "Shared Queries",
    ...overrides,
  };
}

function remove(overrides: Record<string, unknown> = {}): unknown {
  return {
    type: PROJECT_QUERY_MESSAGE,
    operation: "remove",
    projectId: 7,
    queryId: QUERY_ID,
    rev: 4,
    ...overrides,
  };
}

describe("isProjectQueryMessage", () => {
  it("claims only this extension's own project-query messages", () => {
    expect(isProjectQueryMessage(readLinks())).toBe(true);
    expect(isProjectQueryMessage({ type: "other" })).toBe(false);
    expect(isProjectQueryMessage(null)).toBe(false);
  });
});

describe("projectQueryMessageProblem", () => {
  it("accepts each well-formed operation", () => {
    expect(projectQueryMessageProblem(readLinks())).toBeNull();
    expect(projectQueryMessageProblem(create())).toBeNull();
    expect(projectQueryMessageProblem(remove())).toBeNull();
  });

  it("refuses a message this handler never claimed", () => {
    expect(projectQueryMessageProblem({ type: "other" })).toBe("not a project-query request");
  });

  it("names an operation it does not implement instead of failing silently", () => {
    expect(projectQueryMessageProblem(readLinks({ operation: "purge" }))).toContain("purge");
  });

  it("keeps the link read bounded and made of real work item ids", () => {
    expect(projectQueryMessageProblem(readLinks({ ids: [] }))).toContain("link read");
    expect(projectQueryMessageProblem(readLinks({ ids: [0] }))).toContain("link read");
    expect(projectQueryMessageProblem(readLinks({ ids: ["1"] }))).toContain("link read");
    expect(projectQueryMessageProblem(readLinks({ ids: Array(1001).fill(1) }))).toContain(
      "link read",
    );
    expect(projectQueryMessageProblem(readLinks({ ids: 1 }))).toContain("link read");
  });

  it("refuses a create with no project, no title, or no folder to create in", () => {
    expect(projectQueryMessageProblem(create({ projectId: -1 }))).toContain("create");
    expect(projectQueryMessageProblem(create({ projectTitle: "  " }))).toContain("create");
    expect(projectQueryMessageProblem(create({ folderPath: "" }))).toContain("create");
    expect(projectQueryMessageProblem(create({ rev: 1.5 }))).toContain("create");
  });

  it("refuses a remove whose query id is not a query id", () => {
    expect(projectQueryMessageProblem(remove({ queryId: "not-a-guid" }))).toContain("remove");
    expect(projectQueryMessageProblem(remove({ queryId: 7 }))).toContain("remove");
    expect(projectQueryMessageProblem(remove({ rev: -1 }))).toContain("remove");
  });
});
