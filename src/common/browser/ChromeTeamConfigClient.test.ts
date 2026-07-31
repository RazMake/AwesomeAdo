import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChromeTeamConfigClient } from "./ChromeTeamConfigClient";
import { fetchTeamConfigInPage } from "./fetchTeamConfigInPage";
import { writeTeamConfigInPage } from "./writeTeamConfigInPage";

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

const ADO_TAB = {
  id: 7,
  url: "https://dev.azure.com/Contoso/Project/_queries/query/11111111-1111-1111-1111-111111111111",
};
const ITEM_URL = "https://dev.azure.com/Contoso/_apis/wit/workitems/42?api-version=7.1";

describe("ChromeTeamConfigClient", () => {
  let chromeMock: MockChrome;
  let client: ChromeTeamConfigClient;

  beforeEach(() => {
    chromeMock = installMockChrome();
    client = new ChromeTeamConfigClient();
  });

  it("requires an open ADO query tab", async () => {
    chromeMock.query.mockResolvedValue([]);

    await expect(client.read(42)).resolves.toEqual({
      ok: false,
      error: "Open an Azure DevOps query in this organization first.",
    });
    expect(chromeMock.executeScript).not.toHaveBeenCalled();
  });

  it("reads Description through the query tab's MAIN world", async () => {
    chromeMock.query.mockResolvedValue([ADO_TAB]);
    chromeMock.executeScript.mockResolvedValue([{ result: { ok: true, text: "config" } }]);

    await expect(client.read(42)).resolves.toEqual({ ok: true, text: "config" });
    expect(chromeMock.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      world: "MAIN",
      func: fetchTeamConfigInPage,
      args: [ITEM_URL],
    });
  });

  it("publishes with one serializable config argument", async () => {
    chromeMock.query.mockResolvedValue([ADO_TAB]);
    chromeMock.executeScript.mockResolvedValue([{ result: { ok: true } }]);

    await expect(client.write(42, "config")).resolves.toEqual({ ok: true });
    expect(chromeMock.executeScript).toHaveBeenCalledWith({
      target: { tabId: 7 },
      world: "MAIN",
      func: writeTeamConfigInPage,
      args: [{ url: ITEM_URL, text: "config" }],
    });
  });

  it("reports missing results and injection failures", async () => {
    chromeMock.query.mockResolvedValue([ADO_TAB]);
    chromeMock.executeScript.mockResolvedValue([]);
    await expect(client.read(42)).resolves.toEqual({
      ok: false,
      error: "Azure DevOps returned no valid read response.",
    });

    chromeMock.executeScript.mockRejectedValueOnce(new Error("tab closed"));
    const result = await client.write(42, "config");
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: expect.stringContaining("tab closed") });
  });
});
