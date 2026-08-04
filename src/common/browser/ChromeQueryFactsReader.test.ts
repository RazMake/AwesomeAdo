import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChromeQueryFactsReader } from "./ChromeQueryFactsReader";

const ADO_TAB = { id: 7, url: "https://dev.azure.com/Contoso/Web/_queries" };
const QUERY_ID = "query-1";
const NO_FACTS = { tag: null, folder: null };

let query: ReturnType<typeof vi.fn>;
let executeScript: ReturnType<typeof vi.fn>;
let reader: ChromeQueryFactsReader;

beforeEach(() => {
  query = vi.fn().mockResolvedValue([ADO_TAB]);
  executeScript = vi.fn();
  globalThis.chrome = {
    tabs: { query },
    scripting: { executeScript },
  } as unknown as typeof chrome;
  reader = new ChromeQueryFactsReader();
});

describe("ChromeQueryFactsReader", () => {
  it("reads the tag and the folder from one injected query read", async () => {
    executeScript.mockResolvedValue([
      {
        result: {
          raw: {
            path: "Shared Queries/Team A/Catalog",
            wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.Tags] CONTAINS 'Catalog'",
          },
          status: 200,
        },
      },
    ]);

    expect(await reader.read(QUERY_ID)).toEqual({
      tag: "Catalog",
      folder: "Shared Queries/Team A",
    });
    expect(executeScript).toHaveBeenCalledWith(
      expect.objectContaining({
        target: { tabId: ADO_TAB.id },
        world: "MAIN",
        args: [
          {
            operation: "read",
            url: "https://dev.azure.com/Contoso/Web/_apis/wit/queries/query-1?$expand=wiql&api-version=7.1",
          },
        ],
      }),
    );
  });

  it("answers nothing when the query says nothing this form can use", async () => {
    executeScript.mockResolvedValue([{ result: { raw: null, status: 404 } }]);

    expect(await reader.read(QUERY_ID)).toEqual(NO_FACTS);
  });

  it("answers nothing when no ADO tab is open", async () => {
    query.mockResolvedValue([]);

    expect(await reader.read(QUERY_ID)).toEqual(NO_FACTS);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("answers nothing when the tab is not project-scoped", async () => {
    query.mockResolvedValue([{ id: 9, url: "https://dev.azure.com/Contoso" }]);

    expect(await reader.read(QUERY_ID)).toEqual(NO_FACTS);
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("answers nothing when the injection itself is refused", async () => {
    executeScript.mockRejectedValue(new Error("cannot access tab"));

    expect(await reader.read(QUERY_ID)).toEqual(NO_FACTS);
  });
});
