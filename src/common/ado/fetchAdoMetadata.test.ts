import { describe, expect, it } from "vitest";

import {
  adoCollectionBaseUrl,
  buildAdoMetadataUrls,
  flattenAreaPaths,
  parseTeams,
} from "./fetchAdoMetadata";

describe("adoCollectionBaseUrl", () => {
  it("appends the org as a path segment on dev.azure.com", () => {
    expect(adoCollectionBaseUrl("https://dev.azure.com", "dev.azure.com", "contoso")).toBe(
      "https://dev.azure.com/contoso",
    );
  });

  it("encodes an org name with reserved characters", () => {
    expect(adoCollectionBaseUrl("https://dev.azure.com", "dev.azure.com", "a b")).toBe(
      "https://dev.azure.com/a%20b",
    );
  });

  it("uses the origin as-is for a visualstudio.com host", () => {
    expect(
      adoCollectionBaseUrl(
        "https://contoso.visualstudio.com",
        "contoso.visualstudio.com",
        "contoso",
      ),
    ).toBe("https://contoso.visualstudio.com");
  });
});

describe("buildAdoMetadataUrls", () => {
  it("builds the teams and area-tree URLs for a dev.azure.com project", () => {
    expect(buildAdoMetadataUrls("https://dev.azure.com/contoso/web/_queries/query/abc")).toEqual({
      teamsUrl: "https://dev.azure.com/contoso/_apis/projects/web/teams?$top=1000&api-version=7.1",
      areaPathsUrl:
        "https://dev.azure.com/contoso/web/_apis/wit/classificationnodes/areas?$depth=10&api-version=7.1",
    });
  });

  it("uses the origin as the base for a visualstudio.com project", () => {
    expect(buildAdoMetadataUrls("https://contoso.visualstudio.com/web/_queries/query/abc")).toEqual(
      {
        teamsUrl:
          "https://contoso.visualstudio.com/_apis/projects/web/teams?$top=1000&api-version=7.1",
        areaPathsUrl:
          "https://contoso.visualstudio.com/web/_apis/wit/classificationnodes/areas?$depth=10&api-version=7.1",
      },
    );
  });

  it("encodes a project name with reserved characters", () => {
    const urls = buildAdoMetadataUrls("https://dev.azure.com/contoso/O365%20Core/_queries");
    expect(urls?.teamsUrl).toBe(
      "https://dev.azure.com/contoso/_apis/projects/O365%20Core/teams?$top=1000&api-version=7.1",
    );
    expect(urls?.areaPathsUrl).toBe(
      "https://dev.azure.com/contoso/O365%20Core/_apis/wit/classificationnodes/areas?$depth=10&api-version=7.1",
    );
  });

  it("returns null for a non-ADO URL", () => {
    expect(buildAdoMetadataUrls("https://example.com/")).toBeNull();
  });

  it("returns null for an org-level URL with no project", () => {
    expect(buildAdoMetadataUrls("https://dev.azure.com/contoso/_queries")).toBeNull();
  });
});

describe("parseTeams", () => {
  it("returns teams sorted by name", () => {
    expect(
      parseTeams({
        value: [
          { id: "2", name: "Beta" },
          { id: "1", name: "Alpha" },
        ],
      }),
    ).toEqual([
      { id: "1", name: "Alpha" },
      { id: "2", name: "Beta" },
    ]);
  });

  it("drops malformed entries", () => {
    expect(
      parseTeams({
        value: [{ id: "1", name: "Alpha" }, { id: 2, name: "NoId" }, { name: "Nameless" }, null],
      }),
    ).toEqual([{ id: "1", name: "Alpha" }]);
  });

  it("returns an empty list when the body has no team array", () => {
    expect(parseTeams({})).toEqual([]);
  });

  it("returns an empty list for a null or non-object body", () => {
    expect(parseTeams(null)).toEqual([]);
    expect(parseTeams("nope")).toEqual([]);
  });
});

describe("flattenAreaPaths", () => {
  it("builds Parent\\Child paths from node names depth-first", () => {
    const tree = {
      name: "Web",
      children: [{ name: "Api", children: [{ name: "Auth" }] }, { name: "Ui" }],
    };
    expect(flattenAreaPaths(tree)).toEqual(["Web", "Web\\Api", "Web\\Api\\Auth", "Web\\Ui"]);
  });

  it("returns an empty list for a non-object or nameless root", () => {
    expect(flattenAreaPaths(null)).toEqual([]);
    expect(flattenAreaPaths({ children: [] })).toEqual([]);
  });

  it("skips a child that is not a named node", () => {
    const tree = { name: "Web", children: [null, { name: "" }, { name: "Ok" }] };
    expect(flattenAreaPaths(tree)).toEqual(["Web", "Web\\Ok"]);
  });
});
