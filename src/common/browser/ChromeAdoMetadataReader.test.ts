import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChromeAdoMetadataReader } from "./ChromeAdoMetadataReader";

interface MockChrome {
  query: ReturnType<typeof vi.fn>;
  executeScript: ReturnType<typeof vi.fn>;
}

function installMockChrome(): MockChrome {
  const query = vi.fn();
  const executeScript = vi.fn();
  globalThis.chrome = {
    tabs: { query },
    scripting: { executeScript },
  } as unknown as typeof chrome;
  return { query, executeScript };
}

const ADO_TAB = { id: 7, url: "https://dev.azure.com/O365Exchange/O365%20Core/_queries" };
const TEAMS_URL =
  "https://dev.azure.com/O365Exchange/_apis/projects/O365%20Core/teams?$top=1000&api-version=7.1";
const WORK_ITEM_TYPES_URL =
  "https://dev.azure.com/O365Exchange/O365%20Core/_apis/wit/workitemtypes?api-version=7.1";
const FIELDS_URL =
  "https://dev.azure.com/O365Exchange/O365%20Core/_apis/wit/fields?api-version=7.1";
const AREA_PATHS_URL =
  "https://dev.azure.com/O365Exchange/O365%20Core/_apis/wit/classificationnodes/areas?$depth=100&api-version=7.1";
const ITERATION_PATHS_URL =
  "https://dev.azure.com/O365Exchange/O365%20Core/_apis/wit/classificationnodes/iterations?$depth=100&api-version=7.1";
const QUERY_FOLDERS_URL =
  "https://dev.azure.com/O365Exchange/O365%20Core/_apis/wit/queries?$depth=5&api-version=7.1";

/** Every list a reader reports when nothing could be fetched. */
const NO_METADATA = {
  teams: [],
  areaPaths: [],
  iterationPaths: [],
  queryFolders: [],
  workItemTypes: [],
};

/** One realistic MAIN-world payload, shaped exactly as the six ADO endpoints answer. */
const INJECTED_METADATA = {
  teams: {
    value: [
      { id: "2", name: "Beta" },
      { id: "1", name: "Alpha" },
    ],
  },
  workItemTypes: {
    value: [
      {
        name: "Bug",
        color: "CC293D",
        icon: { url: "https://ado/icon_insect" },
        states: [{ name: "New" }, { name: "Active" }],
        fields: [
          { referenceName: "System.Title", name: "Title" },
          { referenceName: "Microsoft.VSTS.Scheduling.TargetDate", name: "Target Date" },
          { referenceName: "Microsoft.VSTS.Common.ResolvedDate", name: "Resolved Date" },
        ],
      },
    ],
  },
  fields: {
    value: [
      { referenceName: "System.Title", type: "string" },
      { referenceName: "Microsoft.VSTS.Scheduling.TargetDate", type: "dateTime" },
      { referenceName: "Microsoft.VSTS.Common.ResolvedDate", type: "dateTime" },
    ],
  },
  areaPaths: {
    name: "O365 Core",
    path: "\\O365 Core",
    children: [{ name: "Platform", path: "\\O365 Core\\Platform" }],
  },
  iterationPaths: {
    name: "O365 Core",
    path: "\\O365 Core",
    children: [{ name: "Sprint 1", path: "\\O365 Core\\Iteration\\Sprint 1" }],
  },
  queryFolders: {
    value: [
      {
        path: "Shared Queries",
        isFolder: true,
        children: [
          { path: "Shared Queries/Team A", isFolder: true },
          { path: "Shared Queries/Open bugs" },
        ],
      },
    ],
  },
};

/** What `INJECTED_METADATA` must parse to: sorted teams, work-item paths, folders only. */
const PARSED_METADATA = {
  organization: "O365Exchange",
  project: "O365 Core",
  teams: [
    { id: "1", name: "Alpha" },
    { id: "2", name: "Beta" },
  ],
  areaPaths: ["O365 Core", "O365 Core\\Platform"],
  iterationPaths: ["O365 Core", "O365 Core\\Sprint 1"],
  // Only folders: a saved query's own path would be refused as a place to create one.
  queryFolders: ["Shared Queries", "Shared Queries/Team A"],
  workItemTypes: [
    {
      name: "Bug",
      color: "CC293D",
      icon: "https://ado/icon_insect",
      states: ["New", "Active"],
      dateFields: [{ referenceName: "Microsoft.VSTS.Scheduling.TargetDate", name: "Target Date" }],
    },
  ],
};

interface MetadataContext {
  chromeMock: MockChrome;
  reader: ChromeAdoMetadataReader;
}

// Shared arrange for every ChromeAdoMetadataReader group: a fresh mock chrome + reader per test.
function setupReader(): MetadataContext {
  return { chromeMock: installMockChrome(), reader: new ChromeAdoMetadataReader() };
}

describe("ChromeAdoMetadataReader - guards", () => {
  let chromeMock: MockChrome;
  let reader: ChromeAdoMetadataReader;

  beforeEach(() => {
    ({ chromeMock, reader } = setupReader());
  });

  it("returns null when no active tab is an ADO Query page", async () => {
    chromeMock.query.mockResolvedValue([{ id: 1, url: "https://example.com" }, { id: 2 }]);
    expect(await reader.read()).toBeNull();
    expect(chromeMock.executeScript).not.toHaveBeenCalled();
  });

  it("returns null when the ADO URL carries no organization", async () => {
    chromeMock.query.mockResolvedValue([{ id: 9, url: "https://dev.azure.com/_queries" }]);
    expect(await reader.read()).toBeNull();
  });

  it("returns empty metadata (still with org/project) when the injection fails", async () => {
    chromeMock.query.mockResolvedValue([ADO_TAB]);
    chromeMock.executeScript.mockRejectedValue(new Error("no target"));

    expect(await reader.read()).toEqual({
      organization: "O365Exchange",
      project: "O365 Core",
      ...NO_METADATA,
    });
  });

  it("guards against a missing injection result", async () => {
    chromeMock.query.mockResolvedValue([ADO_TAB]);
    chromeMock.executeScript.mockResolvedValue([]);

    expect(await reader.read()).toEqual({
      organization: "O365Exchange",
      project: "O365 Core",
      ...NO_METADATA,
    });
  });

  it("skips injection for an org-level tab that names no project", async () => {
    chromeMock.query.mockResolvedValue([
      { id: 5, url: "https://o365exchange.visualstudio.com/_queries" },
    ]);

    expect(await reader.read()).toEqual({
      organization: "o365exchange",
      project: null,
      ...NO_METADATA,
    });
    expect(chromeMock.executeScript).not.toHaveBeenCalled();
  });
});

describe("ChromeAdoMetadataReader - reading away from a query page", () => {
  let chromeMock: MockChrome;

  beforeEach(() => {
    chromeMock = installMockChrome();
    chromeMock.executeScript.mockResolvedValue([{ result: { teams: { value: [] } } }]);
  });

  /** A reader whose stored scope is the O365Exchange project the query-page fixtures use. */
  function readerWithConfiguredScope(): ChromeAdoMetadataReader {
    return new ChromeAdoMetadataReader(() =>
      Promise.resolve({ organization: "O365Exchange", project: "O365 Core" }),
    );
  }

  it("reads through any ADO tab when no query page is open", async () => {
    chromeMock.query.mockResolvedValue([
      { id: 4, url: "https://dev.azure.com/O365Exchange/O365%20Core/_boards/board/t/Alpha" },
    ]);

    expect(await new ChromeAdoMetadataReader().read()).toMatchObject({
      organization: "O365Exchange",
      project: "O365 Core",
    });
    expect(chromeMock.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: 4 },
        args: [expect.objectContaining({ teamsUrl: TEAMS_URL })],
      }),
    );
  });

  it("queries the configured project through a tab that names none", async () => {
    chromeMock.query.mockResolvedValue([{ id: 6, url: "https://dev.azure.com/O365Exchange" }]);

    // The reported project stays null because the TAB named none; only the REST calls are redirected
    // onto the saved project, so the options page can still tell detected from saved.
    expect(await readerWithConfiguredScope().read()).toMatchObject({
      organization: "O365Exchange",
      project: null,
    });
    expect(chromeMock.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ args: [expect.objectContaining({ teamsUrl: TEAMS_URL })] }),
    );
  });

  it("ignores a configured project that belongs to another organization", async () => {
    chromeMock.query.mockResolvedValue([{ id: 8, url: "https://dev.azure.com/Fabrikam" }]);

    expect(await readerWithConfiguredScope().read()).toEqual({
      organization: "Fabrikam",
      project: null,
      ...NO_METADATA,
    });
    expect(chromeMock.executeScript).not.toHaveBeenCalled();
  });

  it("still prefers a query tab when one is open alongside other ADO tabs", async () => {
    chromeMock.query.mockResolvedValue([
      { id: 4, url: "https://dev.azure.com/O365Exchange/O365%20Core/_boards" },
      ADO_TAB,
    ]);

    await readerWithConfiguredScope().read();

    expect(chromeMock.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: ADO_TAB.id } }),
    );
  });
});

describe("ChromeAdoMetadataReader - injection parsing", () => {
  let chromeMock: MockChrome;
  let reader: ChromeAdoMetadataReader;

  beforeEach(() => {
    ({ chromeMock, reader } = setupReader());
  });

  it("injects a MAIN-world fetch and parses the project metadata it returns", async () => {
    chromeMock.query.mockResolvedValue([{ id: 1, url: "https://example.com" }, ADO_TAB]);
    chromeMock.executeScript.mockResolvedValue([{ result: INJECTED_METADATA }]);

    expect(await reader.read()).toEqual(PARSED_METADATA);
    expect(chromeMock.executeScript).toHaveBeenCalledWith({
      target: { tabId: ADO_TAB.id },
      world: "MAIN",
      func: expect.any(Function),
      args: [
        {
          teamsUrl: TEAMS_URL,
          workItemTypesUrl: WORK_ITEM_TYPES_URL,
          fieldsUrl: FIELDS_URL,
          areaPathsUrl: AREA_PATHS_URL,
          iterationPathsUrl: ITERATION_PATHS_URL,
          queryFoldersUrl: QUERY_FOLDERS_URL,
        },
      ],
    });
  });
});
