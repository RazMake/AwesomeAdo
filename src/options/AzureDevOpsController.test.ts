import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AdoMetadataContext, IAdoMetadataReader } from "../common/browser/IAdoMetadataReader";
import type { StorageObservation } from "../common/browser/observeSyncKeys";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../common/settings/ISettingsStore";

import { AzureDevOpsController, type AzureDevOpsElements } from "./AzureDevOpsController";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

class FakeSettingsStore implements ISettingsStore {
  writeCalls: Partial<ExtensionSettings>[] = [];
  private readValue: ExtensionSettings;
  private readError: unknown = null;
  private writeError: unknown = null;

  constructor(initial: Partial<ExtensionSettings> = {}) {
    this.readValue = { ...DEFAULT_SETTINGS, ...initial };
  }

  setReadError(error: unknown): void {
    this.readError = error;
  }

  setWriteError(error: unknown): void {
    this.writeError = error;
  }

  observe(): StorageObservation {
    return { ready: Promise.resolve(), unsubscribe: () => {} };
  }

  read(): Promise<ExtensionSettings> {
    if (this.readError !== null) {
      return Promise.reject(this.readError);
    }
    return Promise.resolve(this.readValue);
  }

  write(update: Partial<ExtensionSettings>): Promise<void> {
    this.writeCalls.push({ ...update });
    if (this.writeError !== null) {
      return Promise.reject(this.writeError);
    }
    return Promise.resolve();
  }
}

class FakeMetadataReader implements IAdoMetadataReader {
  private error: unknown = null;

  constructor(private value: AdoMetadataContext | null = null) {}

  setError(error: unknown): void {
    this.error = error;
  }

  read(): Promise<AdoMetadataContext | null> {
    if (this.error !== null) {
      return Promise.reject(this.error);
    }
    return Promise.resolve(this.value);
  }
}

function makeElements(): AzureDevOpsElements {
  const organization = document.createElement("dd");
  const project = document.createElement("dd");
  const teamField = document.createElement("div");
  const teamInput = document.createElement("input");
  teamInput.id = "ado-team-input";
  teamField.append(teamInput);
  const futureSprintsInput = document.createElement("input");
  futureSprintsInput.type = "number";
  const areaPathsList = document.createElement("div");
  const areaPathsEmpty = document.createElement("p");
  const areaPathAddButton = document.createElement("button");
  const witTable = document.createElement("table");
  const witHead = document.createElement("thead");
  const witColumnsRow = document.createElement("tr");
  witHead.append(witColumnsRow);
  const witBody = document.createElement("tbody");
  witTable.append(witHead, witBody);
  const workItemTypesEmpty = document.createElement("p");
  const workItemTypeAddButton = document.createElement("button");
  const boardColumnAddButton = document.createElement("button");
  document.body.append(
    organization,
    project,
    teamField,
    futureSprintsInput,
    areaPathsList,
    areaPathsEmpty,
    areaPathAddButton,
    witTable,
    workItemTypesEmpty,
    workItemTypeAddButton,
    boardColumnAddButton,
  );
  return {
    organization,
    project,
    teamInput,
    futureSprintsInput,
    areaPathsList,
    areaPathsEmpty,
    areaPathAddButton,
    workItemTypes: {
      columnsRow: witColumnsRow,
      body: witBody,
      empty: workItemTypesEmpty,
      addTypeButton: workItemTypeAddButton,
      addColumnButton: boardColumnAddButton,
    },
  };
}

const CONTEXT: AdoMetadataContext = {
  organization: "contoso",
  project: "web",
  teams: [
    { id: "1", name: "Alpha" },
    { id: "2", name: "Beta" },
  ],
  areaPaths: ["Web", "Web\\Api"],
  workItemTypes: [],
};

function pathRows(elements: AzureDevOpsElements): HTMLElement[] {
  return [...elements.areaPathsList.querySelectorAll<HTMLElement>(".area-path-row")];
}

function rowAt(elements: AzureDevOpsElements, index: number): HTMLElement {
  const row = pathRows(elements)[index];
  if (row === undefined) {
    throw new Error(`no area-path row at index ${index}`);
  }
  return row;
}

function input(row: HTMLElement, role: string): HTMLInputElement {
  return row.querySelector<HTMLInputElement>(`[data-role="${role}"]`)!;
}

/** The visible suggestion texts of the combobox wrapping `field`, which must be open. */
function comboboxOptions(field: HTMLInputElement): string[] {
  const list = field.parentElement?.querySelector<HTMLUListElement>(".combobox__list");
  if (!list) {
    throw new Error("combobox listbox not found");
  }
  return [...list.querySelectorAll("li")].map((li) => li.textContent ?? "");
}

function fire(target: EventTarget, type: string): void {
  target.dispatchEvent(new Event(type, { bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = "";
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("AzureDevOpsController — initialization", () => {
  let store: FakeSettingsStore;
  let reader: FakeMetadataReader;
  let elements: AzureDevOpsElements;

  beforeEach(() => {
    store = new FakeSettingsStore();
    reader = new FakeMetadataReader(CONTEXT);
    elements = makeElements();
  });

  it("disables the controls at construction", () => {
    new AzureDevOpsController(store, reader, elements);
    expect(elements.teamInput.disabled).toBe(true);
    expect(elements.futureSprintsInput.disabled).toBe(true);
    expect(elements.areaPathAddButton.disabled).toBe(true);
  });

  it("enables the controls after init resolves", async () => {
    const controller = new AzureDevOpsController(store, reader, elements);
    await controller.init();
    expect(elements.teamInput.disabled).toBe(false);
    expect(elements.futureSprintsInput.disabled).toBe(false);
    expect(elements.areaPathAddButton.disabled).toBe(false);
    controller.dispose();
  });

  it("fills the detected organization and project", async () => {
    const controller = new AzureDevOpsController(store, reader, elements);
    await controller.init();
    expect(elements.organization.textContent).toBe("contoso");
    expect(elements.organization.dataset.empty).toBe("false");
    expect(elements.project.textContent).toBe("web");
    expect(elements.project.dataset.empty).toBe("false");
    controller.dispose();
  });

  it("marks the config fields empty when there is no active ADO tab", async () => {
    const controller = new AzureDevOpsController(store, new FakeMetadataReader(null), elements);
    await controller.init();
    expect(elements.organization.dataset.empty).toBe("true");
    expect(elements.project.dataset.empty).toBe("true");
    controller.dispose();
  });

  it("populates the team dropdown from metadata", async () => {
    const controller = new AzureDevOpsController(store, reader, elements);
    await controller.init();
    elements.teamInput.dispatchEvent(new Event("focus"));
    expect(comboboxOptions(elements.teamInput)).toEqual(["Alpha", "Beta"]);
    controller.dispose();
  });

  it("populates a newly added area-path row's dropdown from metadata", async () => {
    const controller = new AzureDevOpsController(store, reader, elements);
    await controller.init();
    elements.areaPathAddButton.click();
    const path = input(rowAt(elements, 0), "path");
    path.dispatchEvent(new Event("focus"));
    expect(comboboxOptions(path)).toEqual(["Web", "Web\\Api"]);
    controller.dispose();
  });

  it("pushes metadata suggestions into rows seeded from stored settings", async () => {
    store = new FakeSettingsStore({ areaPaths: [{ path: "Web\\Api", label: "Api" }] });
    const controller = new AzureDevOpsController(store, reader, elements);
    await controller.init();
    const path = input(rowAt(elements, 0), "path");
    // Clear the seeded value so focus shows the full suggestion set rather than a filtered subset.
    path.value = "";
    path.dispatchEvent(new Event("input", { bubbles: true }));
    expect(comboboxOptions(path)).toEqual(["Web", "Web\\Api"]);
    controller.dispose();
  });

  it("seeds the controls from stored settings", async () => {
    store = new FakeSettingsStore({
      currentTeam: { id: "2", name: "Beta" },
      futureSprintsCount: 5,
      areaPaths: [{ path: "Web\\Api", label: "Api" }],
    });
    const controller = new AzureDevOpsController(store, reader, elements);
    await controller.init();
    expect(elements.teamInput.value).toBe("Beta");
    expect(elements.futureSprintsInput.value).toBe("5");
    expect(pathRows(elements)).toHaveLength(1);
    expect(input(rowAt(elements, 0), "path").value).toBe("Web\\Api");
    expect(input(rowAt(elements, 0), "label").value).toBe("Api");
    controller.dispose();
  });

  it("still enables controls when the store read fails", async () => {
    const errors: unknown[] = [];
    store.setReadError(new Error("storage down"));
    const controller = new AzureDevOpsController(store, reader, elements, (e) => errors.push(e));
    await controller.init();
    expect(errors).toHaveLength(1);
    expect(elements.teamInput.disabled).toBe(false);
    controller.dispose();
  });

  it("keeps the settings controls usable when metadata read fails", async () => {
    const errors: unknown[] = [];
    reader.setError(new Error("no tabs permission"));
    const controller = new AzureDevOpsController(store, reader, elements, (e) => errors.push(e));
    await controller.init();
    expect(errors).toHaveLength(1);
    expect(elements.teamInput.disabled).toBe(false);
    expect(elements.organization.dataset.empty).toBe("true");
    controller.dispose();
  });

  it("marks a customized stored label as edited so path edits keep it", async () => {
    store = new FakeSettingsStore({ areaPaths: [{ path: "Web\\Api", label: "Custom" }] });
    const controller = new AzureDevOpsController(store, reader, elements);
    await controller.init();
    const label = input(rowAt(elements, 0), "label");
    expect(label.getAttribute("data-edited")).toBe("true");
    controller.dispose();
  });
});

describe("AzureDevOpsController — current team", () => {
  let store: FakeSettingsStore;
  let elements: AzureDevOpsElements;
  let controller: AzureDevOpsController;

  beforeEach(async () => {
    store = new FakeSettingsStore();
    elements = makeElements();
    controller = new AzureDevOpsController(store, new FakeMetadataReader(CONTEXT), elements);
    await controller.init();
  });

  afterEach(() => controller.dispose());

  it("persists a known team by id and name", async () => {
    elements.teamInput.value = "Alpha";
    fire(elements.teamInput, "change");
    await flush();
    expect(store.writeCalls).toContainEqual({ currentTeam: { id: "1", name: "Alpha" } });
  });

  it("persists null when the field is cleared", async () => {
    elements.teamInput.value = "";
    fire(elements.teamInput, "change");
    await flush();
    expect(store.writeCalls).toContainEqual({ currentTeam: null });
  });

  it("reverts unknown free text to the last confirmed team without writing", async () => {
    elements.teamInput.value = "Alpha";
    fire(elements.teamInput, "change");
    await flush();
    store.writeCalls.length = 0;

    elements.teamInput.value = "Gamma";
    fire(elements.teamInput, "change");
    await flush();
    expect(elements.teamInput.value).toBe("Alpha");
    expect(store.writeCalls).toHaveLength(0);
  });

  it("restores the previous team when the write is rejected", async () => {
    store.setWriteError(new Error("write failed"));
    elements.teamInput.value = "Alpha";
    fire(elements.teamInput, "change");
    await flush();
    expect(elements.teamInput.value).toBe("");
  });
});

describe("AzureDevOpsController — future sprints", () => {
  let store: FakeSettingsStore;
  let elements: AzureDevOpsElements;
  let controller: AzureDevOpsController;

  beforeEach(async () => {
    store = new FakeSettingsStore();
    elements = makeElements();
    controller = new AzureDevOpsController(store, new FakeMetadataReader(CONTEXT), elements);
    await controller.init();
  });

  afterEach(() => controller.dispose());

  it("persists an in-range value", async () => {
    elements.futureSprintsInput.value = "6";
    fire(elements.futureSprintsInput, "change");
    await flush();
    expect(store.writeCalls).toContainEqual({ futureSprintsCount: 6 });
  });

  it("clamps an over-range value and reflects the clamp in the field", async () => {
    elements.futureSprintsInput.value = "99";
    fire(elements.futureSprintsInput, "change");
    await flush();
    expect(elements.futureSprintsInput.value).toBe("12");
    expect(store.writeCalls).toContainEqual({ futureSprintsCount: 12 });
  });

  it("restores the previous count when the write is rejected", async () => {
    store.setWriteError(new Error("nope"));
    elements.futureSprintsInput.value = "8";
    fire(elements.futureSprintsInput, "change");
    await flush();
    expect(elements.futureSprintsInput.value).toBe(String(DEFAULT_SETTINGS.futureSprintsCount));
  });
});

describe("AzureDevOpsController — area paths", () => {
  let store: FakeSettingsStore;
  let elements: AzureDevOpsElements;
  let controller: AzureDevOpsController;

  beforeEach(async () => {
    store = new FakeSettingsStore();
    elements = makeElements();
    controller = new AzureDevOpsController(store, new FakeMetadataReader(CONTEXT), elements);
    await controller.init();
  });

  afterEach(() => controller.dispose());

  it("shows the empty notice until a row exists", () => {
    expect(elements.areaPathsEmpty.hidden).toBe(false);
    elements.areaPathAddButton.click();
    expect(elements.areaPathsEmpty.hidden).toBe(true);
  });

  it("adds an empty editable row", () => {
    elements.areaPathAddButton.click();
    const rows = pathRows(elements);
    expect(rows).toHaveLength(1);
    expect(input(rowAt(elements, 0), "path").value).toBe("");
    expect(input(rowAt(elements, 0), "label").value).toBe("");
  });

  it("defaults a row's label to the last path segment as the path is typed", () => {
    elements.areaPathAddButton.click();
    const path = input(rowAt(elements, 0), "path");
    path.value = "Web\\Api\\Auth";
    fire(path, "input");
    expect(input(rowAt(elements, 0), "label").value).toBe("Auth");
  });

  it("stops overwriting a label once the user edits it", () => {
    elements.areaPathAddButton.click();
    const row = rowAt(elements, 0);
    const label = input(row, "label");
    label.value = "Mine";
    fire(label, "input");
    const path = input(row, "path");
    path.value = "Web\\Api";
    fire(path, "input");
    expect(label.value).toBe("Mine");
  });

  it("persists committed rows on change, defaulting a blank label", async () => {
    elements.areaPathAddButton.click();
    const path = input(rowAt(elements, 0), "path");
    path.value = "Web\\Api";
    fire(path, "change");
    await flush();
    expect(store.writeCalls).toContainEqual({ areaPaths: [{ path: "Web\\Api", label: "Api" }] });
  });

  it("skips empty rows and de-duplicates by path when collecting", async () => {
    elements.areaPathAddButton.click();
    elements.areaPathAddButton.click();
    elements.areaPathAddButton.click();
    input(rowAt(elements, 0), "path").value = "Web\\Api";
    input(rowAt(elements, 1), "path").value = "Web\\Api";
    // rowAt(elements, 2) left blank
    fire(input(rowAt(elements, 0), "path"), "change");
    await flush();
    expect(store.writeCalls.at(-1)).toEqual({
      areaPaths: [{ path: "Web\\Api", label: "Api" }],
    });
  });

  it("removes a row and persists on delete", async () => {
    store = new FakeSettingsStore({
      areaPaths: [
        { path: "Web\\Api", label: "Api" },
        { path: "Web\\Ui", label: "Ui" },
      ],
    });
    controller.dispose();
    controller = new AzureDevOpsController(store, new FakeMetadataReader(CONTEXT), elements);
    await controller.init();

    const deleteButton = rowAt(elements, 0).querySelector<HTMLButtonElement>(
      '[data-role="delete"]',
    )!;
    deleteButton.click();
    await flush();
    expect(pathRows(elements)).toHaveLength(1);
    expect(store.writeCalls.at(-1)).toEqual({ areaPaths: [{ path: "Web\\Ui", label: "Ui" }] });
  });

  it("reports a write failure while persisting area paths", async () => {
    const errors: unknown[] = [];
    controller.dispose();
    store = new FakeSettingsStore();
    store.setWriteError(new Error("boom"));
    controller = new AzureDevOpsController(store, new FakeMetadataReader(CONTEXT), elements, (e) =>
      errors.push(e),
    );
    await controller.init();
    elements.areaPathAddButton.click();
    const path = input(rowAt(elements, 0), "path");
    path.value = "Web\\Api";
    fire(path, "change");
    await flush();
    expect(errors).toHaveLength(1);
  });
});

describe("AzureDevOpsController — disposal", () => {
  it("ignores events after disposal", async () => {
    const store = new FakeSettingsStore();
    const elements = makeElements();
    const controller = new AzureDevOpsController(store, new FakeMetadataReader(CONTEXT), elements);
    await controller.init();
    controller.dispose();

    elements.teamInput.value = "Alpha";
    fire(elements.teamInput, "change");
    await flush();
    expect(store.writeCalls).toHaveLength(0);
  });

  it("does not touch the DOM when disposed before the store read resolves", async () => {
    const store = new FakeSettingsStore({ currentTeam: { id: "1", name: "Alpha" } });
    const elements = makeElements();
    const controller = new AzureDevOpsController(store, new FakeMetadataReader(CONTEXT), elements);
    const init = controller.init();
    controller.dispose();
    await init;
    expect(elements.teamInput.value).toBe("");
  });
});
