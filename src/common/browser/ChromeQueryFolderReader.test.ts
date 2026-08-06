import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChromeQueryFolderReader } from "./ChromeQueryFolderReader";

const ADO_TAB = { id: 7, url: "https://dev.azure.com/Contoso/Web/_queries" };

let query: ReturnType<typeof vi.fn>;
let executeScript: ReturnType<typeof vi.fn>;
let reader: ChromeQueryFolderReader;

beforeEach(() => {
  query = vi.fn().mockResolvedValue([ADO_TAB]);
  executeScript = vi.fn();
  globalThis.chrome = {
    tabs: { query },
    scripting: { executeScript },
  } as unknown as typeof chrome;
  reader = new ChromeQueryFolderReader();
});

describe("ChromeQueryFolderReader", () => {
  it("lists the folders nested inside the one it was asked about", async () => {
    executeScript.mockResolvedValue([
      {
        result: {
          raw: {
            path: "Shared Queries/Team A",
            isFolder: true,
            hasChildren: true,
            children: [
              { path: "Shared Queries/Team A/Reports", isFolder: true, hasChildren: true },
              { path: "Shared Queries/Team A/Open bugs", isFolder: false },
              {
                path: "Shared Queries/Team A/Reports/Weekly",
                isFolder: true,
                hasChildren: false,
              },
            ],
          },
          status: 200,
        },
      },
    ]);

    // The folder itself is included: it is a folder the user can pick, and re-offering it costs
    // nothing because the caller merges case-insensitively. `Reports` came back at the depth
    // boundary, so it is the one still worth another read.
    expect(await reader.readChildFolders("Shared Queries/Team A")).toEqual([
      { path: "Shared Queries/Team A", hasUnreadChildren: false },
      { path: "Shared Queries/Team A/Reports", hasUnreadChildren: true },
      { path: "Shared Queries/Team A/Reports/Weekly", hasUnreadChildren: false },
    ]);
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: ADO_TAB.id },
        world: "MAIN",
        args: [
          {
            operation: "read",
            url: "https://dev.azure.com/Contoso/Web/_apis/wit/queries/Shared%20Queries/Team%20A?$depth=2&api-version=7.1",
          },
        ],
      }),
    );
  });

  it("answers nothing when no ADO tab is open", async () => {
    query.mockResolvedValue([]);

    expect(await reader.readChildFolders("Shared Queries")).toEqual([]);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("answers nothing when the folder read is refused", async () => {
    executeScript.mockResolvedValue([{ result: { raw: null, status: 404 } }]);

    expect(await reader.readChildFolders("Shared Queries/Gone")).toEqual([]);
  });

  it("answers nothing when the injection itself fails", async () => {
    executeScript.mockRejectedValue(new Error("cannot access tab"));

    expect(await reader.readChildFolders("Shared Queries")).toEqual([]);
  });
});
