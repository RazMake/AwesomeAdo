import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type {
  AdoMetadataContext,
  IAdoMetadataReader,
} from "../../common/browser/IAdoMetadataReader";
import type { StorageObservation } from "../../common/browser/observeStorageKeys";
import { DEFAULT_SETTINGS, type ExtensionSettings } from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";

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
    this.readValue = { ...structuredClone(DEFAULT_SETTINGS), ...initial };
  }

  setReadError(error: unknown): void {
    this.readError = error;
  }

  /** Replace what a later read returns, standing in for an outside write (a config file import). */
  setSettings(update: Partial<ExtensionSettings>): void {
    this.readValue = { ...this.readValue, ...update };
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
  const organization = document.createElement("input");
  const organizationDetected = document.createElement("p");
  const project = document.createElement("input");
  const projectDetected = document.createElement("p");
  const teamField = document.createElement("div");
  const teamInput = document.createElement("input");
  teamInput.id = "ado-team-input";
  teamField.append(teamInput);
  const futureSprintsInput = document.createElement("input");
  futureSprintsInput.type = "number";
  const pastSprintsInput = document.createElement("input");
  pastSprintsInput.type = "number";
  const witTable = document.createElement("table");
  const witHead = document.createElement("thead");
  const witColumnsRow = document.createElement("tr");
  witHead.append(witColumnsRow);
  const witBody = document.createElement("tbody");
  witTable.append(witHead, witBody);
  const workItemTypesEmpty = document.createElement("p");
  const workItemTypeAddButton = document.createElement("button");
  const witEtaBody = document.createElement("div");
  const witEtaEmpty = document.createElement("p");
  const witHierarchyTable = document.createElement("table");
  const witHierarchyBody = document.createElement("tbody");
  witHierarchyTable.append(witHierarchyBody);
  const witHierarchyEmpty = document.createElement("p");
  const markerTagsList = document.createElement("div");
  document.body.append(
    organization,
    organizationDetected,
    project,
    projectDetected,
    teamField,
    futureSprintsInput,
    pastSprintsInput,
    witTable,
    workItemTypesEmpty,
    workItemTypeAddButton,
    witEtaBody,
    witEtaEmpty,
    witHierarchyTable,
    witHierarchyEmpty,
    markerTagsList,
  );
  return {
    organization: { input: organization, proposal: organizationDetected },
    project: { input: project, proposal: projectDetected },
    teamInput,
    futureSprintsInput,
    pastSprintsInput,
    workItemTypes: {
      columnsRow: witColumnsRow,
      body: witBody,
      empty: workItemTypesEmpty,
      addTypeButton: workItemTypeAddButton,
      etaBody: witEtaBody,
      etaEmpty: witEtaEmpty,
      hierarchy: { body: witHierarchyBody, empty: witHierarchyEmpty },
    },
    markerTags: {
      list: markerTagsList,
    },
  };
}

const CONTEXT: AdoMetadataContext = {
  organization: "contoso",
  project: "web",
  areaPaths: ["web", "web\\Platform"],
  iterationPaths: ["web", "web\\Sprint 1"],
  queryFolders: ["Shared Queries"],
  teams: [
    { id: "1", name: "Alpha" },
    { id: "2", name: "Beta" },
  ],
  workItemTypes: [],
};

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

// One fixture builder shared by every sibling describe below, so splitting a long describe into
// aspect-focused groups never copy-pastes setup (jscpd threshold is 0).
interface AdoFixture {
  store: FakeSettingsStore;
  reader: FakeMetadataReader;
  elements: AzureDevOpsElements;
}

function makeFixture(): AdoFixture {
  return {
    store: new FakeSettingsStore(),
    reader: new FakeMetadataReader(CONTEXT),
    elements: makeElements(),
  };
}

// The persistence-focused describes below all boot a fully initialized controller against a fresh
// store; centralizing that avoids repeating the same async wiring in each group.
async function bootController(fixture: AdoFixture): Promise<AzureDevOpsController> {
  const controller = new AzureDevOpsController(fixture.store, fixture.reader, fixture.elements);
  await controller.init();
  return controller;
}

afterEach(() => {
  document.body.innerHTML = "";
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("AzureDevOpsController — initialization controls & metadata", () => {
  let store: FakeSettingsStore;
  let reader: FakeMetadataReader;
  let elements: AzureDevOpsElements;

  beforeEach(() => {
    ({ store, reader, elements } = makeFixture());
  });

  it("disables the controls at construction", () => {
    new AzureDevOpsController(store, reader, elements);
    expect(elements.teamInput.disabled).toBe(true);
    expect(elements.futureSprintsInput.disabled).toBe(true);
  });

  it("enables the controls after init resolves", async () => {
    const controller = new AzureDevOpsController(store, reader, elements);
    await controller.init();
    expect(elements.teamInput.disabled).toBe(false);
    expect(elements.futureSprintsInput.disabled).toBe(false);
    controller.dispose();
  });

  it("seeds and stores the organization and project from the open query tab", async () => {
    const controller = new AzureDevOpsController(store, reader, elements);
    await controller.init();
    await flush();
    expect(elements.organization.input.value).toBe("contoso");
    expect(elements.project.input.value).toBe("web");
    expect(store.writeCalls).toEqual([{ organization: "contoso" }, { project: "web" }]);
    controller.dispose();
  });

  it("leaves the scope fields empty when there is no active ADO tab", async () => {
    const controller = new AzureDevOpsController(store, new FakeMetadataReader(null), elements);
    await controller.init();
    expect(elements.organization.input.value).toBe("");
    expect(elements.organization.proposal.hidden).toBe(true);
    expect(elements.project.proposal.hidden).toBe(true);
    expect(store.writeCalls).toEqual([]);
    controller.dispose();
  });

  it("keeps the ADO-backed controls off when ADO is unreachable, but not the rest", async () => {
    const controller = new AzureDevOpsController(store, new FakeMetadataReader(null), elements);
    await controller.init();
    // Nothing can name a team or a work item type without ADO, so those two stay off; the settings
    // that only edit stored values must stay usable.
    expect(elements.teamInput.disabled).toBe(true);
    expect(elements.workItemTypes.addTypeButton.disabled).toBe(true);
    expect(elements.organization.input.disabled).toBe(false);
    expect(elements.futureSprintsInput.disabled).toBe(false);
    expect(elements.pastSprintsInput.disabled).toBe(false);
    controller.dispose();
  });

  it("enables the ADO-backed controls once metadata arrives", async () => {
    const controller = new AzureDevOpsController(store, reader, elements);
    await controller.init();
    expect(elements.teamInput.disabled).toBe(false);
    expect(elements.workItemTypes.addTypeButton.disabled).toBe(false);
    controller.dispose();
  });

  it("populates the team dropdown from metadata", async () => {
    const controller = new AzureDevOpsController(store, reader, elements);
    await controller.init();
    elements.teamInput.dispatchEvent(new Event("focus"));
    expect(comboboxOptions(elements.teamInput)).toEqual(["Alpha", "Beta"]);
    controller.dispose();
  });
});

describe("AzureDevOpsController — initialization seeding & errors", () => {
  let store: FakeSettingsStore;
  let reader: FakeMetadataReader;
  let elements: AzureDevOpsElements;

  beforeEach(() => {
    ({ store, reader, elements } = makeFixture());
  });

  it("seeds the controls from stored settings", async () => {
    store = new FakeSettingsStore({
      currentTeam: { id: "2", name: "Beta" },
      futureSprintsCount: 5,
      pastSprintsCount: 3,
    });
    const controller = new AzureDevOpsController(store, reader, elements);
    await controller.init();
    expect(elements.teamInput.value).toBe("Beta");
    expect(elements.futureSprintsInput.value).toBe("5");
    expect(elements.pastSprintsInput.value).toBe("3");
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
    // The stored settings still load, so everything they alone drive stays editable; only the two
    // controls that need ADO to answer are held back.
    expect(elements.futureSprintsInput.disabled).toBe(false);
    expect(elements.teamInput.disabled).toBe(true);
    expect(elements.organization.proposal.hidden).toBe(true);
    controller.dispose();
  });
});

describe("AzureDevOpsController — organization & project", () => {
  let store: FakeSettingsStore;
  let reader: FakeMetadataReader;
  let elements: AzureDevOpsElements;

  beforeEach(() => {
    ({ store, reader, elements } = makeFixture());
  });

  /** The saved-value fixture every proposal test starts from: a scope the open tab disagrees with. */
  async function bootWithSavedScope(): Promise<AzureDevOpsController> {
    store = new FakeSettingsStore({ organization: "fabrikam", project: "apps" });
    return bootController({ store, reader, elements });
  }

  it("keeps a saved scope and offers the tab's values as proposals instead", async () => {
    const controller = await bootWithSavedScope();
    expect(elements.organization.input.value).toBe("fabrikam");
    expect(elements.organization.proposal.hidden).toBe(false);
    expect(elements.organization.proposal.textContent).toContain("contoso");
    expect(elements.project.proposal.textContent).toContain("web");
    expect(store.writeCalls).toEqual([]);
    controller.dispose();
  });

  it("adopts a proposal on one click and then stops offering it", async () => {
    const controller = await bootWithSavedScope();
    elements.organization.proposal.querySelector("button")?.click();
    await flush();
    expect(elements.organization.input.value).toBe("contoso");
    expect(elements.organization.proposal.hidden).toBe(true);
    expect(store.writeCalls).toEqual([{ organization: "contoso" }]);
    controller.dispose();
  });

  it("persists a hand-typed scope, trimmed, and keeps proposing the tab's own", async () => {
    const controller = await bootWithSavedScope();
    elements.project.input.value = "  billing  ";
    fire(elements.project.input, "change");
    await flush();
    expect(elements.project.input.value).toBe("billing");
    expect(store.writeCalls).toEqual([{ project: "billing" }]);
    expect(elements.project.proposal.hidden).toBe(false);
    controller.dispose();
  });

  it("restores the last saved scope when the write fails", async () => {
    const errors: unknown[] = [];
    store = new FakeSettingsStore({ organization: "fabrikam", project: "apps" });
    store.setWriteError(new Error("quota exceeded"));
    const controller = new AzureDevOpsController(store, reader, elements, (e) => errors.push(e));
    await controller.init();
    elements.organization.input.value = "typo";
    fire(elements.organization.input, "change");
    await flush();
    expect(elements.organization.input.value).toBe("fabrikam");
    expect(elements.organization.proposal.hidden).toBe(false);
    expect(errors).toHaveLength(1);
    controller.dispose();
  });

  it("re-compares the scope against the open tab after a configuration import", async () => {
    const controller = await bootWithSavedScope();
    store.setSettings({ organization: "contoso" });
    await controller.reload();
    expect(elements.organization.input.value).toBe("contoso");
    expect(elements.organization.proposal.hidden).toBe(true);
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

describe("AzureDevOpsController — past sprints", () => {
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
    elements.pastSprintsInput.value = "4";
    fire(elements.pastSprintsInput, "change");
    await flush();
    expect(store.writeCalls).toContainEqual({ pastSprintsCount: 4 });
  });

  it("clamps an over-range value and reflects the clamp in the field", async () => {
    elements.pastSprintsInput.value = "99";
    fire(elements.pastSprintsInput, "change");
    await flush();
    expect(elements.pastSprintsInput.value).toBe("6");
    expect(store.writeCalls).toContainEqual({ pastSprintsCount: 6 });
  });

  it("restores the previous count when the write is rejected", async () => {
    store.setWriteError(new Error("nope"));
    elements.pastSprintsInput.value = "5";
    fire(elements.pastSprintsInput, "change");
    await flush();
    expect(elements.pastSprintsInput.value).toBe(String(DEFAULT_SETTINGS.pastSprintsCount));
  });
});

describe("AzureDevOpsController — disposal", () => {
  it("ignores events after disposal", async () => {
    // Seeded to match the tab so the scope fields have nothing to adopt, leaving `writeCalls` as a
    // clean record of what the disposed controls did (or, as asserted, did not) persist.
    const store = new FakeSettingsStore({ organization: "contoso", project: "web" });
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

describe("AzureDevOpsController — reload", () => {
  it("shows settings that were replaced from outside the page", async () => {
    const fixture = makeFixture();
    const controller = await bootController(fixture);
    expect(fixture.elements.teamInput.value).toBe("");

    fixture.store.setSettings({
      currentTeam: { id: "9", name: "Imported" },
      futureSprintsCount: 4,
    });
    await controller.reload();

    expect(fixture.elements.teamInput.value).toBe("Imported");
    expect(fixture.elements.futureSprintsInput.value).toBe("4");
  });

  it("reports a failed re-read instead of leaving the page silently stale", async () => {
    const fixture = makeFixture();
    const errors: unknown[] = [];
    const controller = new AzureDevOpsController(
      fixture.store,
      fixture.reader,
      fixture.elements,
      (error) => errors.push(error),
    );
    await controller.init();

    fixture.store.setReadError(new Error("storage offline"));
    await controller.reload();

    expect(errors).toHaveLength(1);
  });
});
