import { describe, expect, it } from "vitest";

import { buildAdoQueryDefinitionUrl, parseQueryDefinition } from "./QueryDefinition";

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
