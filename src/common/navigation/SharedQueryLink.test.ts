import { describe, expect, it } from "vitest";

import {
  buildSharedQueryLink,
  parseSharedConfigWorkItemId,
  SHARED_CONFIG_PARAM,
} from "./SharedQueryLink";

const QUERY =
  "https://dev.azure.com/myorg/myproject/_queries/query/2f6a1b4c-0000-4a11-9f00-abcdef012345";

describe("parseSharedConfigWorkItemId", () => {
  it("reads the configuration work item a shared query URL names", () => {
    expect(parseSharedConfigWorkItemId(`${QUERY}?${SHARED_CONFIG_PARAM}=12345`)).toBe(12345);
  });

  it("reads it alongside Azure DevOps' own query parameters", () => {
    expect(parseSharedConfigWorkItemId(`${QUERY}?_a=query&${SHARED_CONFIG_PARAM}=7`)).toBe(7);
  });

  it("reads it from a legacy visualstudio.com host too", () => {
    expect(
      parseSharedConfigWorkItemId(
        `https://myorg.visualstudio.com/myproject/_queries/query/x?${SHARED_CONFIG_PARAM}=9`,
      ),
    ).toBe(9);
  });

  it("reports no link when the URL carries no such parameter", () => {
    expect(parseSharedConfigWorkItemId(QUERY)).toBeNull();
  });

  it("refuses a value that is not a positive whole work item id", () => {
    // A malformed value must be no link at all rather than a partly-trusted one: everything
    // downstream treats a resolved id as a work item this browser is about to read.
    for (const value of ["", " ", "0", "-1", "1.5", "12a", "abc", "1e3", "99999999999999999999"]) {
      expect(parseSharedConfigWorkItemId(`${QUERY}?${SHARED_CONFIG_PARAM}=${value}`)).toBeNull();
    }
  });

  it("reports no link for a location that is not a hosted Azure DevOps page", () => {
    expect(
      parseSharedConfigWorkItemId(`https://example.com/x?${SHARED_CONFIG_PARAM}=5`),
    ).toBeNull();
    expect(parseSharedConfigWorkItemId("not a url")).toBeNull();
  });
});

describe("buildSharedQueryLink", () => {
  const target = {
    organization: "myorg",
    project: "myproject",
    queryId: "2f6a1b4c-0000-4a11-9f00-abcdef012345",
    workItemId: 12345,
  };

  it("builds a link its own parser reads the work item back out of", () => {
    const url = buildSharedQueryLink(target);

    expect(url).toBe(`${QUERY}?${SHARED_CONFIG_PARAM}=12345`);
    expect(parseSharedConfigWorkItemId(url ?? "")).toBe(12345);
  });

  it("encodes organization and project names that contain spaces", () => {
    const url = buildSharedQueryLink({ ...target, organization: "my org", project: "My Project" });

    expect(url).toBe(
      `https://dev.azure.com/my%20org/My%20Project/_queries/query/${target.queryId}` +
        `?${SHARED_CONFIG_PARAM}=12345`,
    );
  });

  it("offers no link while any part of it is missing", () => {
    expect(buildSharedQueryLink({ ...target, organization: "" })).toBeNull();
    expect(buildSharedQueryLink({ ...target, project: "" })).toBeNull();
    expect(buildSharedQueryLink({ ...target, queryId: "" })).toBeNull();
  });

  it("refuses a work item id that is not a positive whole number", () => {
    for (const workItemId of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(buildSharedQueryLink({ ...target, workItemId })).toBeNull();
    }
  });
});
