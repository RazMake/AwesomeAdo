import { describe, expect, it } from "vitest";

import { buildAdoIterationsUrl, parseTeamIterations } from "./TeamIteration";

const PROJECT_HREF = "https://dev.azure.com/contoso/web/_queries/query/abc";

describe("buildAdoIterationsUrl", () => {
  it("builds the team-scoped iterations URL for a dev.azure.com project", () => {
    expect(buildAdoIterationsUrl(PROJECT_HREF, "Web Team")).toBe(
      "https://dev.azure.com/contoso/web/Web%20Team/_apis/work/teamsettings/iterations?api-version=7.1",
    );
  });

  it("uses the origin as the base for a visualstudio.com project", () => {
    expect(
      buildAdoIterationsUrl("https://contoso.visualstudio.com/web/_queries/query/abc", "Web"),
    ).toBe(
      "https://contoso.visualstudio.com/web/Web/_apis/work/teamsettings/iterations?api-version=7.1",
    );
  });

  it("returns null when the team is blank", () => {
    expect(buildAdoIterationsUrl(PROJECT_HREF, "   ")).toBeNull();
  });

  it("returns null for a non-project-scoped ADO URL", () => {
    expect(buildAdoIterationsUrl("https://dev.azure.com/contoso", "Web Team")).toBeNull();
  });
});

describe("parseTeamIterations", () => {
  it("maps name, path, and timeFrame in order", () => {
    const body = {
      value: [
        {
          name: "Sprint 1",
          path: "Project\\Sprint 1",
          attributes: { timeFrame: "past" },
        },
        {
          name: "Sprint 2",
          path: "Project\\Sprint 2",
          attributes: { timeFrame: "current" },
        },
        {
          name: "Sprint 3",
          path: "Project\\Sprint 3",
          attributes: { timeFrame: "future" },
        },
      ],
    };

    expect(parseTeamIterations(body)).toEqual([
      { name: "Sprint 1", path: "Project\\Sprint 1", timeFrame: "past" },
      { name: "Sprint 2", path: "Project\\Sprint 2", timeFrame: "current" },
      { name: "Sprint 3", path: "Project\\Sprint 3", timeFrame: "future" },
    ]);
  });

  it("falls back to the name as the path when no path is present", () => {
    const body = { value: [{ name: "Sprint 1", attributes: { timeFrame: "current" } }] };
    expect(parseTeamIterations(body)).toEqual([
      { name: "Sprint 1", path: "Sprint 1", timeFrame: "current" },
    ]);
  });

  it("treats an unknown or missing timeFrame as past", () => {
    const body = {
      value: [
        { name: "A", path: "P\\A", attributes: { timeFrame: "weird" } },
        { name: "B", path: "P\\B" },
      ],
    };
    expect(parseTeamIterations(body)).toEqual([
      { name: "A", path: "P\\A", timeFrame: "past" },
      { name: "B", path: "P\\B", timeFrame: "past" },
    ]);
  });

  it("drops entries without a usable name and tolerates a malformed body", () => {
    const body = { value: [{ path: "P\\A", attributes: {} }, null, 42, { name: "" }] };
    expect(parseTeamIterations(body)).toEqual([]);
    expect(parseTeamIterations(null)).toEqual([]);
    expect(parseTeamIterations({ value: "nope" })).toEqual([]);
  });
});
