import { describe, expect, it } from "vitest";

import {
  adoCollectionBaseUrl,
  buildAdoMetadataUrls,
  flattenAreaPaths,
  parseDateFieldReferenceNames,
  parseTeams,
  parseWorkItemTypes,
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
      workItemTypesUrl: "https://dev.azure.com/contoso/web/_apis/wit/workitemtypes?api-version=7.1",
      fieldsUrl: "https://dev.azure.com/contoso/web/_apis/wit/fields?api-version=7.1",
    });
  });

  it("uses the origin as the base for a visualstudio.com project", () => {
    expect(buildAdoMetadataUrls("https://contoso.visualstudio.com/web/_queries/query/abc")).toEqual(
      {
        teamsUrl:
          "https://contoso.visualstudio.com/_apis/projects/web/teams?$top=1000&api-version=7.1",
        areaPathsUrl:
          "https://contoso.visualstudio.com/web/_apis/wit/classificationnodes/areas?$depth=10&api-version=7.1",
        workItemTypesUrl:
          "https://contoso.visualstudio.com/web/_apis/wit/workitemtypes?api-version=7.1",
        fieldsUrl: "https://contoso.visualstudio.com/web/_apis/wit/fields?api-version=7.1",
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
    expect(urls?.workItemTypesUrl).toBe(
      "https://dev.azure.com/contoso/O365%20Core/_apis/wit/workitemtypes?api-version=7.1",
    );
    expect(urls?.fieldsUrl).toBe(
      "https://dev.azure.com/contoso/O365%20Core/_apis/wit/fields?api-version=7.1",
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
