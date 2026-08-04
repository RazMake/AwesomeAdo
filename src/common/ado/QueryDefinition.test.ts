import { describe, expect, it } from "vitest";

import {
  buildAdoQueryDefinitionUrl,
  parseQueryDefinition,
  parseQueryFolder,
  parseQueryTagFilter,
} from "./QueryDefinition";

describe("buildAdoQueryDefinitionUrl", () => {
  it("builds an expanded saved-query URL", () => {
    expect(
      buildAdoQueryDefinitionUrl(
        "https://dev.azure.com/contoso/web/_queries/query/query-1",
        "query-1",
      ),
    ).toBe(
      "https://dev.azure.com/contoso/web/_apis/wit/queries/query-1?$expand=wiql&api-version=7.1",
    );
  });
});

describe("parseQueryDefinition", () => {
  it("returns only a non-empty WIQL body", () => {
    expect(parseQueryDefinition({ wiql: " SELECT [System.Id] FROM WorkItems " })).toBe(
      " SELECT [System.Id] FROM WorkItems ",
    );
    expect(parseQueryDefinition({ wiql: "  " })).toBeNull();
    expect(parseQueryDefinition(null)).toBeNull();
  });
});

describe("parseQueryTagFilter", () => {
  it("reads the tag a query filters its results by", () => {
    expect(
      parseQueryTagFilter(
        "SELECT [System.Id] FROM WorkItems WHERE [System.Tags] CONTAINS 'Catalog'",
      ),
    ).toBe("Catalog");
  });

  it("accepts CONTAINS WORDS and unescapes a quoted tag", () => {
    expect(parseQueryTagFilter("WHERE [System.Tags] CONTAINS WORDS 'Director''s list'")).toBe(
      "Director's list",
    );
  });

  it("does not guess from a query with no tag-membership filter", () => {
    // `=` compares the whole semicolon-separated tag string, so its value is not one tag.
    expect(parseQueryTagFilter("WHERE [System.Tags] = 'Catalog; FY26'")).toBeNull();
    expect(parseQueryTagFilter("WHERE [System.Title] CONTAINS 'Catalog'")).toBeNull();
    expect(parseQueryTagFilter(null)).toBeNull();
  });
});

describe("parseQueryFolder", () => {
  it("drops the query's own name and keeps the built-in root container", () => {
    expect(parseQueryFolder({ path: "Shared Queries/Team A/Catalog" })).toBe(
      "Shared Queries/Team A",
    );
    expect(parseQueryFolder({ path: "Shared Queries/All Bugs" })).toBe("Shared Queries");
  });

  it("normalizes a backslash-separated path to the separator ADO folders use", () => {
    expect(parseQueryFolder({ path: "My Queries\\Reports\\Weekly" })).toBe("My Queries/Reports");
  });

  it("answers null when the body names no folder", () => {
    expect(parseQueryFolder({ path: "Orphan" })).toBeNull();
    expect(parseQueryFolder({ path: "" })).toBeNull();
    expect(parseQueryFolder({ path: 42 })).toBeNull();
    expect(parseQueryFolder(null)).toBeNull();
  });
});
