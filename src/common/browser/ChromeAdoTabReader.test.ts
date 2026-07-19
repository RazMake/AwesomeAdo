import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChromeAdoTabReader } from "./ChromeAdoTabReader";

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

const ADO_TAB = { id: 7, url: "https://dev.azure.com/O365Exchange/O365%20Core/_queries" };

describe("ChromeAdoTabReader", () => {
  let tabs: MockTabs;
  let reader: ChromeAdoTabReader;

  beforeEach(() => {
    tabs = installMockChrome();
    reader = new ChromeAdoTabReader();
  });

  it("returns null when no active tab is an ADO Query page", async () => {
    tabs.query.mockResolvedValue([{ id: 1, url: "https://example.com" }, { id: 2 }]);
    expect(await reader.read()).toBeNull();
    expect(tabs.sendMessage).not.toHaveBeenCalled();
  });

  it("parses org/project and includes the theme reported by the content script", async () => {
    tabs.query.mockResolvedValue([{ id: 1, url: "https://example.com" }, ADO_TAB]);
    tabs.sendMessage.mockResolvedValue({ theme: "dark" });

    expect(await reader.read()).toEqual({
      organization: "O365Exchange",
      project: "O365 Core",
      theme: "dark",
    });
    expect(tabs.sendMessage).toHaveBeenCalledWith(ADO_TAB.id, { type: "awesomeado:theme-request" });
  });

  it("reports a null theme when the content script does not respond", async () => {
    tabs.query.mockResolvedValue([ADO_TAB]);
    tabs.sendMessage.mockRejectedValue(new Error("no receiver"));

    expect((await reader.read())?.theme).toBeNull();
  });

  it("reports a null theme when the response theme is not a known value", async () => {
    tabs.query.mockResolvedValue([ADO_TAB]);
    tabs.sendMessage.mockResolvedValue({ theme: "chartreuse" });

    expect((await reader.read())?.theme).toBeNull();
  });

  it("returns null when the active ADO URL carries no organization", async () => {
    // Passes the Query-route check (has a _queries segment) but has no org to parse.
    tabs.query.mockResolvedValue([{ id: 9, url: "https://dev.azure.com/_queries" }]);
    expect(await reader.read()).toBeNull();
  });

  it("finds a background ADO Query tab (opening options makes options the active tab)", async () => {
    // Regression: reading must not be restricted to active tabs. The options page opens in a tab,
    // so the ADO Query tab the user came from is no longer active in its window.
    tabs.query.mockResolvedValue([
      { id: 1, url: "chrome-extension://abc/options/options.html", active: true },
      { ...ADO_TAB, active: false },
    ]);
    tabs.sendMessage.mockResolvedValue({ theme: "light" });

    expect(await reader.read()).toEqual({
      organization: "O365Exchange",
      project: "O365 Core",
      theme: "light",
    });
  });

  it("prefers an active ADO Query tab over a stale background one", async () => {
    tabs.query.mockResolvedValue([
      { id: 3, url: "https://dev.azure.com/OtherOrg/OtherProject/_queries", active: false },
      { ...ADO_TAB, active: true },
    ]);
    tabs.sendMessage.mockResolvedValue({ theme: "dark" });

    expect(await reader.read()).toMatchObject({ organization: "O365Exchange" });
    expect(tabs.sendMessage).toHaveBeenCalledWith(ADO_TAB.id, { type: "awesomeado:theme-request" });
  });

  it("falls back to the most recently accessed Query tab when none is active", async () => {
    tabs.query.mockResolvedValue([
      { id: 4, url: "https://dev.azure.com/Older/Proj/_queries", active: false, lastAccessed: 10 },
      { id: 5, url: "https://dev.azure.com/Newer/Proj/_queries", active: false, lastAccessed: 20 },
    ]);
    tabs.sendMessage.mockResolvedValue({ theme: "dark" });

    expect(await reader.read()).toMatchObject({ organization: "Newer", project: "Proj" });
  });
});
