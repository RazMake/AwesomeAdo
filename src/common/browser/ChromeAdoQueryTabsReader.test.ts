import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChromeAdoQueryTabsReader } from "./ChromeAdoQueryTabsReader";

interface MockTabs {
  query: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
}

function installMockChrome(): MockTabs {
  const tabs: MockTabs = {
    query: vi.fn(),
    sendMessage: vi.fn(),
  };
  globalThis.chrome = { tabs } as unknown as typeof chrome;
  return tabs;
}

const GUID_A = "12345678-1234-1234-1234-123456789abc";
const GUID_B = "abcdef00-0000-0000-0000-000000000000";
const queryUrl = (id: string): string => `https://dev.azure.com/org/project/_queries/query/${id}`;
const NAME_REQUEST = { type: "awesomeado:query-name-request" };

describe("ChromeAdoQueryTabsReader", () => {
  let tabs: MockTabs;
  let reader: ChromeAdoQueryTabsReader;

  beforeEach(() => {
    tabs = installMockChrome();
    reader = new ChromeAdoQueryTabsReader();
  });

  it("scopes the tab query to ADO hosts allowed by the manifest", async () => {
    tabs.query.mockResolvedValue([]);
    await reader.readQueryTabs();
    expect(tabs.query).toHaveBeenCalledWith({
      url: ["https://dev.azure.com/*", "https://*.visualstudio.com/*"],
    });
  });

  it("returns each query tab with the name reported by its content script", async () => {
    tabs.query.mockResolvedValue([{ id: 7, url: queryUrl(GUID_A) }]);
    tabs.sendMessage.mockResolvedValue({ name: "My Sprint" });

    expect(await reader.readQueryTabs()).toEqual([{ queryId: GUID_A, queryName: "My Sprint" }]);
    expect(tabs.sendMessage).toHaveBeenCalledWith(7, NAME_REQUEST);
  });

  it("returns multiple distinct queries with their own names", async () => {
    tabs.query.mockResolvedValue([
      { id: 7, url: queryUrl(GUID_A) },
      { id: 8, url: queryUrl(GUID_B) },
    ]);
    tabs.sendMessage.mockImplementation((tabId: number) =>
      Promise.resolve({ name: tabId === 7 ? "A" : "B" }),
    );

    expect(await reader.readQueryTabs()).toEqual([
      { queryId: GUID_A, queryName: "A" },
      { queryId: GUID_B, queryName: "B" },
    ]);
  });

  it("collapses the same query open in several tabs to one, keeping the first", async () => {
    tabs.query.mockResolvedValue([
      { id: 7, url: queryUrl(GUID_A) },
      { id: 8, url: queryUrl(GUID_A) },
    ]);
    tabs.sendMessage.mockResolvedValue({ name: "My Sprint" });

    expect(await reader.readQueryTabs()).toEqual([{ queryId: GUID_A, queryName: "My Sprint" }]);
    expect(tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(tabs.sendMessage).toHaveBeenCalledWith(7, NAME_REQUEST);
  });

  it("skips tabs without a URL, without an id, or that are not single-query routes", async () => {
    tabs.query.mockResolvedValue([
      { id: 7 },
      { url: queryUrl(GUID_A) },
      { id: 9, url: "https://dev.azure.com/org/project/_boards" },
      { id: 10, url: queryUrl(GUID_B) },
    ]);
    tabs.sendMessage.mockResolvedValue({ name: "B" });

    expect(await reader.readQueryTabs()).toEqual([{ queryId: GUID_B, queryName: "B" }]);
    expect(tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(tabs.sendMessage).toHaveBeenCalledWith(10, NAME_REQUEST);
  });

  it("reports a null name when the tab has no content-script receiver", async () => {
    tabs.query.mockResolvedValue([{ id: 7, url: queryUrl(GUID_A) }]);
    tabs.sendMessage.mockRejectedValue(new Error("no receiver"));

    expect(await reader.readQueryTabs()).toEqual([{ queryId: GUID_A, queryName: null }]);
  });

  it.each([[{ name: "" }], [{ name: 5 }], [undefined]])(
    "reports a null name for an unusable response %#",
    async (response) => {
      tabs.query.mockResolvedValue([{ id: 7, url: queryUrl(GUID_A) }]);
      tabs.sendMessage.mockResolvedValue(response);

      expect(await reader.readQueryTabs()).toEqual([{ queryId: GUID_A, queryName: null }]);
    },
  );
});
