import { describe, expect, it } from "vitest";

import {
  buildAdoTreeUrls,
  buildQueryFolderUrl,
  buildWorkItemUpdateUrl,
  parseQueryFolderPath,
  parseTrackedTree,
  TRACKING_FIELDS,
  type AdoRawTree,
} from "./fetchAdoTree";

describe("TRACKING_FIELDS", () => {
  it("includes the core System fields for tree tracking", () => {
    expect(TRACKING_FIELDS).toContain("System.Id");
    expect(TRACKING_FIELDS).toContain("System.WorkItemType");
    expect(TRACKING_FIELDS).toContain("System.Title");
    expect(TRACKING_FIELDS).toContain("System.State");
    expect(TRACKING_FIELDS).toContain("System.AssignedTo");
    expect(TRACKING_FIELDS).toContain("System.IterationPath");
    expect(TRACKING_FIELDS).toContain("System.CreatedDate");
    expect(TRACKING_FIELDS).toContain("System.CreatedBy");
    expect(TRACKING_FIELDS).toContain("System.ChangedDate");
    expect(TRACKING_FIELDS).toContain("System.ChangedBy");
    expect(TRACKING_FIELDS).toContain("System.Description");
    expect(TRACKING_FIELDS).toContain("System.Rev");
    expect(TRACKING_FIELDS).toContain("System.Parent");
  });
});

describe("buildAdoTreeUrls", () => {
  it("builds both URLs for a dev.azure.com project query", () => {
    const urls = buildAdoTreeUrls(
      "https://dev.azure.com/contoso/web/_queries/query/abc-123",
      "abc-123",
    );
    expect(urls).toEqual({
      wiqlUrl: "https://dev.azure.com/contoso/web/_apis/wit/wiql/abc-123?api-version=7.1",
      batchUrl: "https://dev.azure.com/contoso/web/_apis/wit/workitemsbatch?api-version=7.1",
      queryUrl: "https://dev.azure.com/contoso/web/_apis/wit/queries/abc-123?api-version=7.1",
    });
  });

  it("uses the origin as the base for a visualstudio.com project", () => {
    const urls = buildAdoTreeUrls("https://contoso.visualstudio.com/web/_queries/query/xyz", "xyz");
    expect(urls).toEqual({
      wiqlUrl: "https://contoso.visualstudio.com/web/_apis/wit/wiql/xyz?api-version=7.1",
      batchUrl: "https://contoso.visualstudio.com/web/_apis/wit/workitemsbatch?api-version=7.1",
      queryUrl: "https://contoso.visualstudio.com/web/_apis/wit/queries/xyz?api-version=7.1",
    });
  });

  it("encodes a project name with reserved characters", () => {
    const urls = buildAdoTreeUrls("https://dev.azure.com/contoso/My%20Project/_queries", "query-1");
    expect(urls?.wiqlUrl).toBe(
      "https://dev.azure.com/contoso/My%20Project/_apis/wit/wiql/query-1?api-version=7.1",
    );
    expect(urls?.batchUrl).toBe(
      "https://dev.azure.com/contoso/My%20Project/_apis/wit/workitemsbatch?api-version=7.1",
    );
  });

  it("encodes a queryId with reserved characters", () => {
    const urls = buildAdoTreeUrls("https://dev.azure.com/contoso/web/_queries", "abc def/123");
    expect(urls?.wiqlUrl).toContain("abc%20def%2F123");
  });

  it("returns null for a non-ADO URL", () => {
    expect(buildAdoTreeUrls("https://example.com/", "query-1")).toBeNull();
  });

  it("returns null for an org-level URL with no project", () => {
    expect(buildAdoTreeUrls("https://dev.azure.com/contoso/_queries", "query-1")).toBeNull();
  });
});

describe("buildWorkItemUpdateUrl", () => {
  it("builds the org-scoped update URL for a dev.azure.com project", () => {
    const url = buildWorkItemUpdateUrl(
      "https://dev.azure.com/contoso/web/_workitems/edit/123",
      123,
    );
    expect(url).toBe("https://dev.azure.com/contoso/_apis/wit/workitems/123?api-version=7.1");
  });

  it("builds the org-scoped update URL for a visualstudio.com project", () => {
    const url = buildWorkItemUpdateUrl(
      "https://contoso.visualstudio.com/web/_workitems/edit/456",
      456,
    );
    expect(url).toBe("https://contoso.visualstudio.com/_apis/wit/workitems/456?api-version=7.1");
  });

  it("omits the project from the URL because work items are org-scoped", () => {
    const url = buildWorkItemUpdateUrl("https://dev.azure.com/contoso/My%20Project/_queries", 789);
    // The project "My%20Project" does not appear in the update URL.
    expect(url).toBe("https://dev.azure.com/contoso/_apis/wit/workitems/789?api-version=7.1");
  });

  it("returns null for a non-ADO URL", () => {
    expect(buildWorkItemUpdateUrl("https://example.com/", 123)).toBeNull();
  });

  it("returns null for an org-level URL with no project", () => {
    expect(buildWorkItemUpdateUrl("https://dev.azure.com/contoso/_queries", 123)).toBeNull();
  });
});

describe("parseTrackedTree", () => {
  it("parses a tree query with a single root Epic and nested children", () => {
    const etaFieldByType = new Map([
      ["Epic", "Microsoft.VSTS.Scheduling.TargetDate"],
      ["Feature", "Microsoft.VSTS.Scheduling.TargetDate"],
      ["User Story", "Microsoft.VSTS.Scheduling.TargetDate"],
    ]);

    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [
          { source: null, target: { id: 1 } },
          { source: { id: 1 }, target: { id: 2 } },
          { source: { id: 2 }, target: { id: 3 } },
        ],
      },
      items: [
        {
          id: 1,
          rev: 5,
          fields: {
            "System.WorkItemType": "Epic",
            "System.Title": "Quarterly Goal",
            "System.State": "In Progress",
            "System.AssignedTo": {
              displayName: "Alice",
              uniqueName: "alice@contoso.com",
              imageUrl: "https://ado/alice.jpg",
            },
            "System.IterationPath": "Project\\Team\\Sprint 1",
            "System.CreatedDate": "2024-01-01T10:00:00Z",
            "System.CreatedBy": { displayName: "Bob", uniqueName: "bob@contoso.com" },
            "System.ChangedDate": "2024-01-15T14:30:00Z",
            "System.ChangedBy": { displayName: "Charlie" },
            "System.Description": "<p>Epic <b>description</b> with &amp; entities.</p>",
            "Microsoft.VSTS.Scheduling.TargetDate": "2024-03-31T00:00:00Z",
          },
        },
        {
          id: 2,
          rev: 3,
          fields: {
            "System.WorkItemType": "Feature",
            "System.Title": "Feature Alpha",
            "System.State": "Active",
            "System.AssignedTo": "Dan",
            "System.IterationPath": "Project\\Team\\Sprint 2",
            "System.CreatedDate": "2024-01-05T09:00:00Z",
            "System.CreatedBy": "Eve",
            "System.ChangedDate": "2024-01-20T11:00:00Z",
            "System.ChangedBy": { displayName: "Frank", imageUrl: "https://ado/frank.jpg" },
            "System.Description": "",
            "Microsoft.VSTS.Scheduling.TargetDate": "2024-02-28T00:00:00Z",
          },
        },
        {
          id: 3,
          rev: 1,
          fields: {
            "System.WorkItemType": "User Story",
            "System.Title": "Story One",
            "System.State": "New",
            "System.IterationPath": "Project\\Team\\Sprint 2",
            "System.CreatedDate": "2024-01-10T08:00:00Z",
            "System.ChangedDate": "2024-01-10T08:00:00Z",
            "System.Description": "<div>Story notes</div>",
          },
        },
      ],
    };

    const result = parseTrackedTree(raw, etaFieldByType);

    expect(result.isTreeQuery).toBe(true);
    expect(result.error).toBeNull();
    expect(result.roots).toHaveLength(1);

    const epic = result.roots[0];
    if (!epic) {
      throw new Error("Expected epic to be defined");
    }
    expect(epic.id).toBe(1);
    expect(epic.rev).toBe(5);
    expect(epic.type).toBe("Epic");
    expect(epic.title).toBe("Quarterly Goal");
    expect(epic.state).toBe("In Progress");
    expect(epic.assignedTo).toEqual({
      displayName: "Alice",
      uniqueName: "alice@contoso.com",
      imageUrl: "https://ado/alice.jpg",
    });
    expect(epic.iterationPath).toBe("Project\\Team\\Sprint 1");
    expect(epic.sprintName).toBe("Sprint 1");
    expect(epic.createdDate).toBe("2024-01-01T10:00:00Z");
    expect(epic.createdBy).toEqual({
      displayName: "Bob",
      uniqueName: "bob@contoso.com",
      imageUrl: null,
    });
    expect(epic.changedDate).toBe("2024-01-15T14:30:00Z");
    expect(epic.changedBy).toEqual({ displayName: "Charlie", uniqueName: null, imageUrl: null });
    expect(epic.description).toBe("Epic description with & entities.");
    expect(epic.eta).toBe("2024-03-31T00:00:00Z");
    expect(epic.children).toHaveLength(1);

    const feature = epic.children[0];
    if (!feature) {
      throw new Error("Expected feature to be defined");
    }
    expect(feature.id).toBe(2);
    expect(feature.type).toBe("Feature");
    expect(feature.title).toBe("Feature Alpha");
    expect(feature.assignedTo).toEqual({ displayName: "Dan", uniqueName: null, imageUrl: null });
    expect(feature.sprintName).toBe("Sprint 2");
    expect(feature.description).toBe("");
    expect(feature.eta).toBe("2024-02-28T00:00:00Z");
    expect(feature.children).toHaveLength(1);

    const story = feature.children[0];
    if (!story) {
      throw new Error("Expected story to be defined");
    }
    expect(story.id).toBe(3);
    expect(story.type).toBe("User Story");
    expect(story.title).toBe("Story One");
    expect(story.assignedTo).toBeNull();
    expect(story.createdBy).toBeNull();
    expect(story.changedBy).toBeNull();
    expect(story.description).toBe("Story notes");
    expect(story.eta).toBeNull();
    expect(story.children).toHaveLength(0);
  });

  it("returns isTreeQuery:false for a flat query", () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "flat",
        workItems: [{ id: 1 }, { id: 2 }],
      },
      items: [],
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result).toEqual({ isTreeQuery: false, roots: [], error: null, folderPath: [] });
  });

  it("returns isTreeQuery:false with error for missing wiql", () => {
    const raw: AdoRawTree = {
      wiql: null,
      items: [],
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result).toEqual({
      isTreeQuery: false,
      roots: [],
      error: "Could not load this query from Azure DevOps.",
      folderPath: [],
    });
  });

  it("returns isTreeQuery:false with error for empty workItemRelations", () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
      },
      items: [],
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result).toEqual({
      isTreeQuery: false,
      roots: [],
      error: "Could not load this query from Azure DevOps.",
      folderPath: [],
    });
  });

  it("parses multiple roots from multiple source-null relations", () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [
          { source: null, target: { id: 1 } },
          { source: null, target: { id: 2 } },
        ],
      },
      items: [
        { id: 1, rev: 1, fields: { "System.WorkItemType": "Epic", "System.Title": "Epic 1" } },
        { id: 2, rev: 2, fields: { "System.WorkItemType": "Epic", "System.Title": "Epic 2" } },
      ],
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result.isTreeQuery).toBe(true);
    expect(result.roots).toHaveLength(2);
    expect(result.roots[0]?.id).toBe(1);
    expect(result.roots[1]?.id).toBe(2);
  });

  it("guards against cyclic relations without infinite loop", () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [
          { source: null, target: { id: 1 } },
          { source: { id: 1 }, target: { id: 2 } },
          { source: { id: 2 }, target: { id: 1 } }, // Cycle
        ],
      },
      items: [
        { id: 1, rev: 1, fields: { "System.WorkItemType": "Epic", "System.Title": "Item 1" } },
        { id: 2, rev: 2, fields: { "System.WorkItemType": "Feature", "System.Title": "Item 2" } },
      ],
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result.isTreeQuery).toBe(true);
    expect(result.roots).toHaveLength(1);
    // Item 1 has Item 2 as a child, but Item 2 cannot have Item 1 again (visited guard).
    expect(result.roots[0]?.children).toHaveLength(1);
    expect(result.roots[0]?.children[0]?.children).toHaveLength(0);
  });

  it("accepts batch items as a bare array", () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [{ source: null, target: { id: 1 } }],
      },
      items: [
        { id: 1, rev: 1, fields: { "System.WorkItemType": "Epic", "System.Title": "Epic 1" } },
      ],
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result.isTreeQuery).toBe(true);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]?.title).toBe("Epic 1");
  });

  it("accepts batch items as { value: [...] }", () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [{ source: null, target: { id: 1 } }],
      },
      items: {
        value: [
          { id: 1, rev: 1, fields: { "System.WorkItemType": "Epic", "System.Title": "Epic 1" } },
        ],
      },
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result.isTreeQuery).toBe(true);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]?.title).toBe("Epic 1");
  });

  it("sets assignedTo/createdBy/changedBy to null when absent", () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [{ source: null, target: { id: 1 } }],
      },
      items: [
        {
          id: 1,
          rev: 1,
          fields: {
            "System.WorkItemType": "Epic",
            "System.Title": "Epic 1",
            "System.CreatedDate": "2024-01-01T10:00:00Z",
            "System.ChangedDate": "2024-01-01T10:00:00Z",
          },
        },
      ],
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result.roots[0]?.assignedTo).toBeNull();
    expect(result.roots[0]?.createdBy).toBeNull();
    expect(result.roots[0]?.changedBy).toBeNull();
  });

  it("sets description to empty string when absent", () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [{ source: null, target: { id: 1 } }],
      },
      items: [
        {
          id: 1,
          rev: 1,
          fields: { "System.WorkItemType": "Epic", "System.Title": "Epic 1" },
        },
      ],
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result.roots[0]?.description).toBe("");
  });

  it("sets eta to null when the type has no configured ETA field", () => {
    const etaFieldByType = new Map([["Epic", "Microsoft.VSTS.Scheduling.TargetDate"]]);
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [{ source: null, target: { id: 1 } }],
      },
      items: [
        {
          id: 1,
          rev: 1,
          fields: {
            "System.WorkItemType": "Bug",
            "System.Title": "Bug 1",
            "Microsoft.VSTS.Scheduling.TargetDate": "2024-12-31T00:00:00Z",
          },
        },
      ],
    };
    const result = parseTrackedTree(raw, etaFieldByType);
    expect(result.roots[0]?.eta).toBeNull();
  });

  it("sets eta to null when the ETA field is missing or empty", () => {
    const etaFieldByType = new Map([["Epic", "Microsoft.VSTS.Scheduling.TargetDate"]]);
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [{ source: null, target: { id: 1 } }],
      },
      items: [
        {
          id: 1,
          rev: 1,
          fields: {
            "System.WorkItemType": "Epic",
            "System.Title": "Epic 1",
          },
        },
      ],
    };
    const result = parseTrackedTree(raw, etaFieldByType);
    expect(result.roots[0]?.eta).toBeNull();
  });

  it("handles missing iterationPath by setting sprintName to null", () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [{ source: null, target: { id: 1 } }],
      },
      items: [
        {
          id: 1,
          rev: 1,
          fields: { "System.WorkItemType": "Epic", "System.Title": "Epic 1" },
        },
      ],
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result.roots[0]?.iterationPath).toBeNull();
    expect(result.roots[0]?.sprintName).toBeNull();
  });

  it("decodes HTML entities in description", () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [{ source: null, target: { id: 1 } }],
      },
      items: [
        {
          id: 1,
          rev: 1,
          fields: {
            "System.WorkItemType": "Epic",
            "System.Title": "Epic 1",
            "System.Description":
              "&lt;p&gt;Less than &amp; greater &gt; and &quot;quotes&quot; &#39;apos&#39; &nbsp;space&lt;/p&gt;",
          },
        },
      ],
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result.roots[0]?.description).toBe("Less than & greater > and \"quotes\" 'apos'  space");
  });

  it("skips malformed relations gracefully", () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [
          null,
          { source: null },
          { target: { id: "not a number" } },
          { source: null, target: { id: 1 } },
        ],
      },
      items: [
        { id: 1, rev: 1, fields: { "System.WorkItemType": "Epic", "System.Title": "Epic 1" } },
      ],
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result.isTreeQuery).toBe(true);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]?.id).toBe(1);
  });

  it("skips children with no batch item", () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [
          { source: null, target: { id: 1 } },
          { source: { id: 1 }, target: { id: 999 } }, // Missing from batch
        ],
      },
      items: [
        { id: 1, rev: 1, fields: { "System.WorkItemType": "Epic", "System.Title": "Epic 1" } },
      ],
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result.roots[0]?.children).toHaveLength(0);
  });
});

describe("parseQueryFolderPath", () => {
  it("drops the query leaf and the well-known root, keeping ancestor folders with full paths", () => {
    expect(
      parseQueryFolderPath({ path: "Shared Queries/Razvan's Team/Project Views/QueryMesh" }),
    ).toEqual([
      { label: "Razvan's Team", path: "Shared Queries/Razvan's Team" },
      { label: "Project Views", path: "Shared Queries/Razvan's Team/Project Views" },
    ]);
  });

  it("handles a backslash-separated path (ADO also surfaces backslash paths)", () => {
    expect(
      parseQueryFolderPath({ path: "Shared Queries\\Razvan's Team\\Project Views\\QueryMesh" }),
    ).toEqual([
      { label: "Razvan's Team", path: "Shared Queries/Razvan's Team" },
      { label: "Project Views", path: "Shared Queries/Razvan's Team/Project Views" },
    ]);
  });

  it("handles a path that mixes both separators", () => {
    expect(parseQueryFolderPath({ path: "My Queries\\Folder/Sub\\Report" })).toEqual([
      { label: "Folder", path: "My Queries/Folder" },
      { label: "Sub", path: "My Queries/Folder/Sub" },
    ]);
  });

  it("drops a My Queries root case-insensitively", () => {
    expect(parseQueryFolderPath({ path: "My Queries/Folder/Sub/Report" })).toEqual([
      { label: "Folder", path: "My Queries/Folder" },
      { label: "Sub", path: "My Queries/Folder/Sub" },
    ]);
  });

  it("keeps only the two nearest folders (parent + grandparent) when the trail is deeper", () => {
    expect(parseQueryFolderPath({ path: "Shared Queries/A/B/C/D/QueryMesh" })).toEqual([
      { label: "C", path: "Shared Queries/A/B/C" },
      { label: "D", path: "Shared Queries/A/B/C/D" },
    ]);
  });

  it("returns an empty trail when the query lives directly under a root", () => {
    expect(parseQueryFolderPath({ path: "Shared Queries/All Bugs" })).toEqual([]);
  });

  it("returns an empty trail for missing, malformed, or non-string paths", () => {
    expect(parseQueryFolderPath(undefined)).toEqual([]);
    expect(parseQueryFolderPath(null)).toEqual([]);
    expect(parseQueryFolderPath({})).toEqual([]);
    expect(parseQueryFolderPath({ path: 42 })).toEqual([]);
    expect(parseQueryFolderPath({ path: "" })).toEqual([]);
  });
});

describe("buildQueryFolderUrl", () => {
  it("builds the query-hub folder link via the path query param, encoding segments but keeping separators literal", () => {
    expect(
      buildQueryFolderUrl(
        "https://dev.azure.com/contoso/My%20Project/_queries/query/abc-123",
        "Shared Queries/Team A",
      ),
    ).toBe(
      "https://dev.azure.com/contoso/My%20Project/_queries/folder/?path=Shared%20Queries/Team%20A",
    );
  });

  it("builds the folder link on the legacy visualstudio.com host", () => {
    expect(
      buildQueryFolderUrl(
        "https://o365exchange.visualstudio.com/O365%20Core/_queries/query/abc-123",
        "Shared Queries/M365 Core/Razvan's Team",
      ),
    ).toBe(
      "https://o365exchange.visualstudio.com/O365%20Core/_queries/folder/?path=Shared%20Queries/M365%20Core/Razvan's%20Team",
    );
  });

  it("returns null when the href is not a project-scoped ADO location", () => {
    expect(buildQueryFolderUrl("https://example.com/", "Shared Queries/Team A")).toBeNull();
  });
});

describe("parseTrackedTree folderPath", () => {
  it("derives folderPath from the query metadata path on a tree result", () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [{ source: null, target: { id: 1 } }],
      },
      items: [
        { id: 1, rev: 1, fields: { "System.WorkItemType": "Epic", "System.Title": "Epic 1" } },
      ],
      query: { path: "Shared Queries/Team A/Reports/Weekly" },
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result.folderPath).toEqual([
      { label: "Team A", path: "Shared Queries/Team A" },
      { label: "Reports", path: "Shared Queries/Team A/Reports" },
    ]);
  });

  it("defaults folderPath to an empty array when query metadata is absent", () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [{ source: null, target: { id: 1 } }],
      },
      items: [
        { id: 1, rev: 1, fields: { "System.WorkItemType": "Epic", "System.Title": "Epic 1" } },
      ],
    };
    const result = parseTrackedTree(raw, new Map());
    expect(result.folderPath).toEqual([]);
  });
});
