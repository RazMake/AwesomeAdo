import { describe, expect, it } from "vitest";

import {
  ADO_THEME_REQUEST,
  isAdoThemeRequest,
  parseAdoContext,
  type AdoContext,
} from "./AdoContext";

describe("parseAdoContext", () => {
  it("reads org and project from a dev.azure.com Query URL", () => {
    expect(
      parseAdoContext("https://dev.azure.com/O365Exchange/O365%20Core/_queries/query/x"),
    ).toEqual<AdoContext>({
      organization: "O365Exchange",
      project: "O365 Core",
    });
  });

  it("returns a null project for an org-level dev.azure.com URL", () => {
    expect(parseAdoContext("https://dev.azure.com/O365Exchange/_queries")).toEqual<AdoContext>({
      organization: "O365Exchange",
      project: null,
    });
  });

  it("reads org from the subdomain and project from the path on visualstudio.com", () => {
    expect(
      parseAdoContext("https://contoso.visualstudio.com/MyProject/_queries"),
    ).toEqual<AdoContext>({
      organization: "contoso",
      project: "MyProject",
    });
  });

  it("returns a null project for a project-less visualstudio.com URL", () => {
    expect(parseAdoContext("https://contoso.visualstudio.com/_queries")).toEqual<AdoContext>({
      organization: "contoso",
      project: null,
    });
  });

  it("decodes percent-encoded project names", () => {
    expect(parseAdoContext("https://dev.azure.com/org/A%20B%26C/_queries")?.project).toBe("A B&C");
  });

  it.each([
    ["not a url", "://nope"],
    ["a non-ADO host", "https://example.com/org/project"],
    ["an http (non-https) ADO URL", "http://dev.azure.com/org/project"],
    ["a dev.azure.com URL whose first segment is an area token", "https://dev.azure.com/_queries"],
    ["a bare visualstudio.com host", "https://visualstudio.com/project"],
  ])("returns null for %s", (_label, url) => {
    expect(parseAdoContext(url)).toBeNull();
  });
});

describe("isAdoThemeRequest", () => {
  it("accepts a well-formed theme request", () => {
    expect(isAdoThemeRequest({ type: ADO_THEME_REQUEST })).toBe(true);
  });

  it.each([null, undefined, 42, "theme", {}, { type: "other" }])(
    "rejects a malformed message %#",
    (value) => {
      expect(isAdoThemeRequest(value)).toBe(false);
    },
  );
});
