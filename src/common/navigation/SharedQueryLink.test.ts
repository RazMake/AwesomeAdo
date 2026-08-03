import { describe, expect, it } from "vitest";

import { parseSharedConfigWorkItemId, SHARED_CONFIG_PARAM } from "./SharedQueryLink";

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
