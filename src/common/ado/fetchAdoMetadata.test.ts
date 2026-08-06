import { describe, expect, it } from "vitest";

import {
  adoCollectionBaseUrl,
  buildAdoMetadataUrls,
  buildQueryFolderChildrenUrl,
  parseAreaPaths,
  parseDateFieldReferenceNames,
  parseTeams,
  parseWorkItemTypes,
  resolveAdoOrganizationBase,
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

describe("resolveAdoOrganizationBase", () => {
  it("resolves the collection base, which is the only host the page session can read", () => {
    // Org-scoped reads must stay same-origin: the separate `vssps` host answers a credentialed
    // cross-origin fetch with a wildcard allow-origin, which the browser rejects outright.
    expect(
      resolveAdoOrganizationBase("https://dev.azure.com/contoso/Fabrikam/_queries/query/abc"),
    ).toBe("https://dev.azure.com/contoso");
  });

  it("uses the origin as the base on the legacy visualstudio.com shape", () => {
    expect(resolveAdoOrganizationBase("https://contoso.visualstudio.com/Fabrikam")).toBe(
      "https://contoso.visualstudio.com",
    );
  });

  it("resolves an org-level URL, since identities are org-scoped and need no project", () => {
    expect(resolveAdoOrganizationBase("https://dev.azure.com/contoso/_queries")).toBe(
      "https://dev.azure.com/contoso",
    );
  });

  it("returns null for a URL that is not a recognized ADO location", () => {
    expect(resolveAdoOrganizationBase("https://example.com/contoso")).toBeNull();
  });
});

describe("buildAdoMetadataUrls", () => {
  it("builds the metadata URLs for a dev.azure.com project", () => {
    expect(buildAdoMetadataUrls("https://dev.azure.com/contoso/web/_queries/query/abc")).toEqual({
      teamsUrl: "https://dev.azure.com/contoso/_apis/projects/web/teams?$top=1000&api-version=7.1",
      workItemTypesUrl: "https://dev.azure.com/contoso/web/_apis/wit/workitemtypes?api-version=7.1",
      fieldsUrl: "https://dev.azure.com/contoso/web/_apis/wit/fields?api-version=7.1",
      areaPathsUrl:
        "https://dev.azure.com/contoso/web/_apis/wit/classificationnodes/areas?$depth=100&api-version=7.1",
      iterationPathsUrl:
        "https://dev.azure.com/contoso/web/_apis/wit/classificationnodes/iterations?$depth=100&api-version=7.1",
      queryFoldersUrl:
        "https://dev.azure.com/contoso/web/_apis/wit/queries?$depth=2&api-version=7.1",
    });
  });

  it("uses the origin as the base for a visualstudio.com project", () => {
    expect(buildAdoMetadataUrls("https://contoso.visualstudio.com/web/_queries/query/abc")).toEqual(
      {
        teamsUrl:
          "https://contoso.visualstudio.com/_apis/projects/web/teams?$top=1000&api-version=7.1",
        workItemTypesUrl:
          "https://contoso.visualstudio.com/web/_apis/wit/workitemtypes?api-version=7.1",
        fieldsUrl: "https://contoso.visualstudio.com/web/_apis/wit/fields?api-version=7.1",
        areaPathsUrl:
          "https://contoso.visualstudio.com/web/_apis/wit/classificationnodes/areas?$depth=100&api-version=7.1",
        iterationPathsUrl:
          "https://contoso.visualstudio.com/web/_apis/wit/classificationnodes/iterations?$depth=100&api-version=7.1",
        queryFoldersUrl:
          "https://contoso.visualstudio.com/web/_apis/wit/queries?$depth=2&api-version=7.1",
      },
    );
  });

  it("encodes a project name with reserved characters", () => {
    const urls = buildAdoMetadataUrls("https://dev.azure.com/contoso/O365%20Core/_queries");
    expect(urls?.teamsUrl).toBe(
      "https://dev.azure.com/contoso/_apis/projects/O365%20Core/teams?$top=1000&api-version=7.1",
    );
    expect(urls?.workItemTypesUrl).toBe(
      "https://dev.azure.com/contoso/O365%20Core/_apis/wit/workitemtypes?api-version=7.1",
    );
    expect(urls?.fieldsUrl).toBe(
      "https://dev.azure.com/contoso/O365%20Core/_apis/wit/fields?api-version=7.1",
    );
    expect(urls?.areaPathsUrl).toBe(
      "https://dev.azure.com/contoso/O365%20Core/_apis/wit/classificationnodes/areas?$depth=100&api-version=7.1",
    );
  });

  it("returns null for a non-ADO URL", () => {
    expect(buildAdoMetadataUrls("https://example.com/")).toBeNull();
  });

  it("returns null for an org-level URL with no project", () => {
    expect(buildAdoMetadataUrls("https://dev.azure.com/contoso/_queries")).toBeNull();
  });
});

describe("buildQueryFolderChildrenUrl", () => {
  const href = "https://dev.azure.com/contoso/O365%20Core/_queries";

  it("addresses one folder, encoding each segment but keeping the separators literal", () => {
    expect(buildQueryFolderChildrenUrl(href, "Shared Queries/Team A")).toBe(
      "https://dev.azure.com/contoso/O365%20Core/_apis/wit/queries/Shared%20Queries/Team%20A?$depth=2&api-version=7.1",
    );
  });

  it("accepts either separator, since ADO surfaces folder paths both ways", () => {
    expect(buildQueryFolderChildrenUrl(href, "Shared Queries\\Team A")).toBe(
      buildQueryFolderChildrenUrl(href, "Shared Queries/Team A"),
    );
  });

  it("returns null without a project-scoped URL or a folder to ask about", () => {
    expect(buildQueryFolderChildrenUrl("https://example.com/", "Shared Queries")).toBeNull();
    expect(buildQueryFolderChildrenUrl(href, "   ")).toBeNull();
  });
});

describe("parseAreaPaths", () => {
  it("returns every full area path from a nested classification tree", () => {
    expect(
      parseAreaPaths({
        name: "Project",
        path: "\\Project\\Area",
        children: [
          { name: "Platform", path: "\\Project\\Area\\Platform" },
          {
            name: "Apps",
            children: [{ name: "Web" }, { name: "Mobile", path: "\\Project\\Area\\Apps\\Mobile" }],
          },
        ],
      }),
    ).toEqual([
      "Project",
      "Project\\Apps",
      "Project\\Apps\\Mobile",
      "Project\\Apps\\Web",
      "Project\\Platform",
    ]);
  });

  it("drops malformed and duplicate paths", () => {
    expect(
      parseAreaPaths({
        name: "Project",
        children: [
          { name: "API", path: "\\Project\\API" },
          { name: "api", path: "\\project\\api" },
          null,
          { children: [{ name: "Services" }] },
        ],
      }),
    ).toEqual(["Project", "Project\\API", "Project\\Services"]);
    expect(parseAreaPaths(null)).toEqual([]);
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

describe("parseWorkItemTypes", () => {
  it("maps enabled types (name, color, icon url, state names) sorted by name", () => {
    expect(
      parseWorkItemTypes({
        value: [
          {
            name: "User Story",
            color: "009CCC",
            icon: { id: "icon_book", url: "https://ado/icon_book" },
            states: [
              { name: "New", color: "b2b2b2", category: "Proposed" },
              { name: "Active", color: "007acc", category: "InProgress" },
            ],
          },
          {
            name: "Bug",
            color: "CC293D",
            icon: { id: "icon_insect", url: "https://ado/icon_insect" },
            states: [{ name: "New" }],
          },
        ],
      }),
    ).toEqual([
      {
        name: "Bug",
        color: "CC293D",
        icon: "https://ado/icon_insect",
        states: ["New"],
        dateFields: [],
      },
      {
        name: "User Story",
        color: "009CCC",
        icon: "https://ado/icon_book",
        states: ["New", "Active"],
        dateFields: [],
      },
    ]);
  });

  it("skips disabled types and drops malformed state entries", () => {
    expect(
      parseWorkItemTypes({
        value: [
          { name: "Hidden", isDisabled: true, states: [{ name: "New" }] },
          {
            name: "Task",
            states: [{ name: "To Do" }, { name: "" }, { color: "x" }, null],
          },
        ],
      }),
    ).toEqual([{ name: "Task", color: "", icon: "", states: ["To Do"], dateFields: [] }]);
  });

  it("drops nameless types and defaults missing icon/color/states", () => {
    expect(
      parseWorkItemTypes({
        value: [{ states: [{ name: "New" }] }, { name: "Epic" }],
      }),
    ).toEqual([{ name: "Epic", color: "", icon: "", states: [], dateFields: [] }]);
  });
});

describe("parseWorkItemTypes - date fields and guards", () => {
  it("attaches only date-typed fields, deduped and sorted by name", () => {
    const dateFieldRefs = new Set([
      "Microsoft.VSTS.Scheduling.TargetDate",
      "Microsoft.VSTS.Scheduling.StartDate",
      "System.CreatedDate",
    ]);
    expect(
      parseWorkItemTypes(
        {
          value: [
            {
              name: "Feature",
              states: [{ name: "New" }],
              fields: [
                { referenceName: "System.Title", name: "Title" },
                { referenceName: "Microsoft.VSTS.Scheduling.TargetDate", name: "Target Date" },
                { referenceName: "System.CreatedDate", name: "Created Date" },
                // A repeat of a date field is dropped so an option never appears twice.
                { referenceName: "System.CreatedDate", name: "Created Date" },
                // A date-typed field with no display name falls back to its reference name.
                { referenceName: "Microsoft.VSTS.Scheduling.StartDate" },
                null,
              ],
            },
          ],
        },
        dateFieldRefs,
      ),
    ).toEqual([
      {
        name: "Feature",
        color: "",
        icon: "",
        states: ["New"],
        dateFields: [
          { referenceName: "System.CreatedDate", name: "Created Date" },
          {
            referenceName: "Microsoft.VSTS.Scheduling.StartDate",
            name: "Microsoft.VSTS.Scheduling.StartDate",
          },
          { referenceName: "Microsoft.VSTS.Scheduling.TargetDate", name: "Target Date" },
        ],
      },
    ]);
  });

  it("returns an empty list for a null or non-object body", () => {
    expect(parseWorkItemTypes(null)).toEqual([]);
    expect(parseWorkItemTypes("nope")).toEqual([]);
    expect(parseWorkItemTypes({})).toEqual([]);
  });
});

describe("parseDateFieldReferenceNames", () => {
  it("keeps only the reference names of dateTime fields", () => {
    const refs = parseDateFieldReferenceNames({
      value: [
        {
          referenceName: "Microsoft.VSTS.Scheduling.TargetDate",
          name: "Target Date",
          type: "dateTime",
        },
        { referenceName: "System.Title", name: "Title", type: "string" },
        {
          referenceName: "Microsoft.VSTS.Scheduling.FinishDate",
          name: "Finish Date",
          type: "dateTime",
        },
        { referenceName: "", type: "dateTime" },
        { type: "dateTime" },
        null,
      ],
    });
    expect([...refs].sort()).toEqual([
      "Microsoft.VSTS.Scheduling.FinishDate",
      "Microsoft.VSTS.Scheduling.TargetDate",
    ]);
  });

  it("excludes well-known lifecycle date fields that are not user-chosen targets", () => {
    const refs = parseDateFieldReferenceNames({
      value: [
        { referenceName: "Microsoft.VSTS.Scheduling.DueDate", type: "dateTime" },
        { referenceName: "System.CreatedDate", type: "dateTime" },
        { referenceName: "System.ChangedDate", type: "dateTime" },
        { referenceName: "System.AuthorizedDate", type: "dateTime" },
        { referenceName: "System.RevisedDate", type: "dateTime" },
        { referenceName: "Microsoft.VSTS.Common.StateChangeDate", type: "dateTime" },
        { referenceName: "Microsoft.VSTS.Common.ActivatedDate", type: "dateTime" },
        { referenceName: "Microsoft.VSTS.Common.ResolvedDate", type: "dateTime" },
        { referenceName: "Microsoft.VSTS.Common.ClosedDate", type: "dateTime" },
      ],
    });
    expect([...refs]).toEqual(["Microsoft.VSTS.Scheduling.DueDate"]);
  });

  it("returns an empty set for a null or non-object body", () => {
    expect(parseDateFieldReferenceNames(null).size).toBe(0);
    expect(parseDateFieldReferenceNames("nope").size).toBe(0);
    expect(parseDateFieldReferenceNames({}).size).toBe(0);
  });
});
