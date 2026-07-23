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
const AREAS_URL =
  "https://dev.azure.com/O365Exchange/O365%20Core/_apis/wit/classificationnodes/areas?$depth=10&api-version=7.1";

describe("ChromeAdoMetadataReader", () => {
  let chromeMock: MockChrome;
  let reader: ChromeAdoMetadataReader;

  beforeEach(() => {
    chromeMock = installMockChrome();
    reader = new ChromeAdoMetadataReader();
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

  it("injects a MAIN-world fetch and parses the teams and area tree it returns", async () => {
    chromeMock.query.mockResolvedValue([{ id: 1, url: "https://example.com" }, ADO_TAB]);
    chromeMock.executeScript.mockResolvedValue([
      {
        result: {
          teams: {
            value: [
              { id: "2", name: "Beta" },
              { id: "1", name: "Alpha" },
            ],
          },
          areaTree: { name: "Web", children: [{ name: "Api" }] },
        },
      },
    ]);

    expect(await reader.read()).toEqual({
      organization: "O365Exchange",
      project: "O365 Core",
      teams: [
        { id: "1", name: "Alpha" },
        { id: "2", name: "Beta" },
      ],
      areaPaths: ["Web", "Web\\Api"],
    });
    expect(chromeMock.executeScript).toHaveBeenCalledWith({
      target: { tabId: ADO_TAB.id },
      world: "MAIN",
      func: expect.any(Function),
      args: [TEAMS_URL, AREAS_URL],
    });
  });

  it("returns empty metadata (still with org/project) when the injection fails", async () => {
    chromeMock.query.mockResolvedValue([ADO_TAB]);
    chromeMock.executeScript.mockRejectedValue(new Error("no target"));

    expect(await reader.read()).toEqual({
      organization: "O365Exchange",
      project: "O365 Core",
      teams: [],
      areaPaths: [],
    });
  });

  it("guards against a missing injection result", async () => {
    chromeMock.query.mockResolvedValue([ADO_TAB]);
    chromeMock.executeScript.mockResolvedValue([]);

    expect(await reader.read()).toEqual({
      organization: "O365Exchange",
      project: "O365 Core",
      teams: [],
      areaPaths: [],
    });
  });

  it("skips injection for an org-level tab that names no project", async () => {
    chromeMock.query.mockResolvedValue([
      { id: 5, url: "https://o365exchange.visualstudio.com/_queries" },
    ]);

    expect(await reader.read()).toEqual({
      organization: "o365exchange",
      project: null,
      teams: [],
      areaPaths: [],
    });
    expect(chromeMock.executeScript).not.toHaveBeenCalled();
  });
});
