import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../common/settings/ExtensionSettings";
import type { TeamConfigQueryItem } from "../../common/settings-transfer/TeamConfigQuery";

import { TeamConfigQueryController } from "./TeamConfigQueryController";

const QUERY_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_QUERY = "22222222-2222-2222-2222-222222222222";
const candidate: TeamConfigQueryItem = {
  id: 84,
  title: "Team <configuration>",
  changedBy: "Full Name",
  changedDate: "2026-09-12T10:00:00Z",
};

afterEach(() => {
  document.body.replaceChildren();
});

async function setup(initialSource: number | null = 42) {
  let notify: (id: number | null) => void = () => {};
  const unsubscribe = vi.fn();
  const source = {
    observe: vi.fn((listener: (id: number | null) => void) => {
      notify = listener;
      listener(initialSource);
      return { ready: Promise.resolve(), unsubscribe };
    }),
  };
  const reader = {
    readQuery: vi.fn(async (): Promise<readonly TeamConfigQueryItem[]> => [candidate]),
  };
  const elements = {
    queryId: document.createElement("input"),
    loadButton: document.createElement("button"),
    items: document.createElement("tbody"),
    status: document.createElement("p"),
  };
  const table = document.createElement("table");
  table.append(elements.items);
  const switchTo = vi.fn(async (id: number) => {
    notify(id);
  });
  document.body.append(table);
  const logger = { info: vi.fn(), error: vi.fn() };
  let notifySettings: (settings: ExtensionSettings) => void = () => {};
  const settings = {
    publishesBeforeWrite: true as const,
    read: vi.fn(async () => DEFAULT_SETTINGS),
    write: vi.fn(async () => {}),
    observe: vi.fn((listener: (settings: ExtensionSettings) => void) => {
      notifySettings = listener;
      listener(DEFAULT_SETTINGS);
      return { ready: Promise.resolve(), unsubscribe: vi.fn() };
    }),
  };
  const controller = new TeamConfigQueryController(
    reader,
    source,
    settings,
    elements,
    switchTo,
    logger,
  );
  await controller.init();
  controller.setAdoReachable(true);
  elements.queryId.value = QUERY_ID;
  return {
    controller,
    source,
    settings,
    notifySettings: (queryId: string) =>
      notifySettings({ ...DEFAULT_SETTINGS, configurationQueryId: queryId }),
    reader,
    elements,
    table,
    switchTo,
    logger,
    unsubscribe,
    notify: (id: number | null) => notify(id),
  };
}

describe("configuration query picker", () => {
  it("shows an unmistakable busy row instead of the connected fallback while loading", async () => {
    const harness = await setup();
    let finish!: (items: readonly TeamConfigQueryItem[]) => void;
    harness.reader.readQuery.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const loading = harness.controller.load();
    await vi.waitFor(() => expect(harness.reader.readQuery).toHaveBeenCalled());
    expect(harness.table.getAttribute("aria-busy")).toBe("true");
    expect(harness.elements.items.rows).toHaveLength(1);
    expect(harness.elements.items.textContent).toBe("Loading configurations…");
    expect(harness.elements.items.querySelector("strong")?.textContent).not.toBe("Active");
    finish([candidate]);
    await loading;
    expect(harness.table.getAttribute("aria-busy")).toBe("false");
    expect(harness.elements.items.textContent).not.toContain("Loading configurations");
  });

  it("persists the query and renders literal titles and modification details", async () => {
    const harness = await setup();
    await harness.controller.load();
    expect(harness.settings.write).toHaveBeenCalledWith({ configurationQueryId: QUERY_ID });
    expect(harness.reader.readQuery).toHaveBeenCalledWith(QUERY_ID);
    const row = harness.elements.items.querySelector<HTMLTableRowElement>(
      'tr[data-work-item-id="84"]',
    );
    expect(Array.from(row?.cells ?? [], (cell) => cell.textContent)).toEqual([
      "Not active",
      "84",
      "Team <configuration>",
      `${new Date(candidate.changedDate).toLocaleDateString()}${new Date(candidate.changedDate).toLocaleTimeString()}`,
      "Full Name",
    ]);
    expect(harness.elements.items.querySelector("configuration")).toBeNull();
    expect(row?.querySelector("button")?.disabled).toBe(false);
    expect(harness.elements.items.querySelector("strong")?.textContent).toBe("Active");
  });

  it("switches only a different candidate and follows source changes from other browsers", async () => {
    const harness = await setup();
    await harness.controller.load();
    await harness.controller.select(84);
    expect(harness.switchTo).toHaveBeenCalledExactlyOnceWith(84);
    await harness.controller.select(84);
    expect(harness.switchTo).toHaveBeenCalledOnce();
    harness.notify(null);
    expect(harness.elements.items.querySelector("strong")).toBeNull();
    harness.notify(84);
    expect(
      harness.elements.items.querySelector('tr[data-work-item-id="84"] strong')?.textContent,
    ).toBe("Active");
  });

  it("rejects invalid IDs and disables empty results", async () => {
    const harness = await setup();
    harness.elements.queryId.value = "invalid";
    await harness.controller.load();
    expect(harness.reader.readQuery).not.toHaveBeenCalled();
    expect(harness.elements.status.textContent).toContain("valid Azure DevOps query ID");
    harness.elements.queryId.value = QUERY_ID;
    harness.reader.readQuery.mockResolvedValue([]);
    await harness.controller.load();
    expect(harness.elements.status.textContent).toBe("No configuration items found.");
    expect(harness.elements.items.querySelector("button")).toBeNull();
    expect(harness.switchTo).not.toHaveBeenCalled();
  });

  it("logs load failures and never switches on a failed query", async () => {
    const harness = await setup();
    const error = new Error("HTTP 403");
    harness.reader.readQuery.mockRejectedValue(error);
    await harness.controller.load();
    expect(harness.logger.error).toHaveBeenCalledWith("Could not load configuration query", error);
    expect(harness.elements.status.textContent).toContain("HTTP 403");
    expect(harness.elements.items.querySelector("button")).toBeNull();
    expect(harness.switchTo).not.toHaveBeenCalled();
  });
});

describe("configuration picker ordering", () => {
  it("orders rows by last modified date with the newest first and unknown dates last", async () => {
    const harness = await setup(84);
    harness.reader.readQuery.mockResolvedValue([
      { ...candidate, id: 7, changedDate: "2026-09-11T10:00:00Z" },
      { ...candidate, id: 8, changedDate: "" },
      candidate,
      { ...candidate, id: 9, changedDate: "2026-09-13T10:00:00Z" },
    ]);
    await harness.controller.load();
    expect(Array.from(harness.elements.items.rows, (row) => row.dataset.workItemId)).toEqual([
      "9",
      "84",
      "7",
      "8",
    ]);
  });
});

describe("configuration picker connected default", () => {
  it("shows no active row while disconnected", async () => {
    const harness = await setup(null);
    await harness.controller.load();
    expect(harness.elements.items.querySelector("strong")).toBeNull();
    harness.notify(84);
    expect(harness.elements.items.querySelector("strong")?.textContent).toBe("Active");
    expect(harness.elements.items.rows).toHaveLength(1);
    harness.notify(null);
    expect(harness.elements.items.querySelector("strong")).toBeNull();
  });

  it("retains the connected default when it is absent from query results", async () => {
    const harness = await setup();
    await harness.controller.load();
    const active = harness.elements.items.querySelector('tr[data-work-item-id="42"]');
    expect(active?.textContent).toContain("Connected item");
    expect(active?.querySelector("strong")?.textContent).toBe("Active");
    expect(harness.switchTo).not.toHaveBeenCalled();
  });

  it("selects the full connected result without a duplicate", async () => {
    const harness = await setup(84);
    await harness.controller.load();
    expect(harness.elements.items.rows).toHaveLength(1);
    const active = harness.elements.items.querySelector('tr[data-work-item-id="84"]');
    expect(active?.querySelector("strong")?.textContent).toBe("Active");
    expect(active?.textContent).toContain("Full Name");
  });

  it("switches when an inactive marker is clicked", async () => {
    const harness = await setup();
    await harness.controller.load();
    harness.elements.items
      .querySelector<HTMLButtonElement>('button[data-work-item-id="84"]')
      ?.click();
    await vi.waitFor(() => expect(harness.switchTo).toHaveBeenCalledExactlyOnceWith(84));
  });
});

describe("configuration picker lifecycle", () => {
  it("follows a pulled query setting without publishing it again", async () => {
    const harness = await setup();
    harness.notifySettings(OTHER_QUERY);
    await Promise.resolve();
    expect(harness.elements.queryId.value).toBe(OTHER_QUERY);
    expect(harness.reader.readQuery).toHaveBeenCalledWith(OTHER_QUERY);
    expect(harness.settings.write).not.toHaveBeenCalled();
  });

  it("ignores a slow result after a newer query has loaded", async () => {
    const harness = await setup();
    let finish!: (items: readonly TeamConfigQueryItem[]) => void;
    harness.reader.readQuery.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const old = harness.controller.load();
    await Promise.resolve();
    harness.elements.queryId.value = OTHER_QUERY;
    await harness.controller.load();
    finish([{ ...candidate, id: 999 }]);
    await old;
    expect(Array.from(harness.elements.items.rows, (row) => row.dataset.workItemId)).toEqual([
      "84",
      "42",
    ]);
  });

  it("disables network actions without ADO and releases observation on disposal", async () => {
    const harness = await setup();
    harness.controller.setAdoReachable(false);
    await harness.controller.load();
    expect(harness.reader.readQuery).not.toHaveBeenCalled();
    expect(harness.elements.loadButton.disabled).toBe(true);
    harness.controller.dispose();
    harness.elements.loadButton.dispatchEvent(new Event("click"));
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(harness.reader.readQuery).not.toHaveBeenCalled();
  });

  it("reports a failed switch and restores the current selection", async () => {
    const harness = await setup();
    await harness.controller.load();
    const error = new Error("Storage unavailable");
    harness.switchTo.mockRejectedValue(error);
    await harness.controller.select(84);
    expect(harness.logger.error).toHaveBeenCalledWith("Could not switch configuration item", error);
    expect(
      harness.elements.items.querySelector('tr[data-work-item-id="42"] strong'),
    ).not.toBeNull();
    expect(harness.elements.items.querySelector("button")?.disabled).toBe(false);
  });
});
