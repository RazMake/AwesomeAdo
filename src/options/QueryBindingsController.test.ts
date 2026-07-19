import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IQueryBindingStore } from "../common/bindings/IQueryBindingStore";
import type { QueryBinding, QueryBindings } from "../common/bindings/QueryBinding";
import type { ViewType } from "../common/bindings/ViewType";
import type { IAdoQueryTabsReader } from "../common/browser/IAdoQueryTabsReader";
import type { AdoQueryTab } from "../common/navigation/AdoContext";

import { QueryBindingsController, type QueryBindingsElements } from "./QueryBindingsController";

const GUID_A = "12345678-1234-1234-1234-123456789abc";
const GUID_B = "abcdef00-0000-0000-0000-000000000000";

// A catalog with one property-free view and one that has a required + optional property, so the
// tests can exercise property rendering and the required-field save gate.
const VIEWS: readonly ViewType[] = [
  { id: "sprint", label: "Sprint View", properties: [] },
  {
    id: "tracking",
    label: "Project Tracking",
    properties: [
      { key: "team", label: "Team", required: true },
      { key: "note", label: "Note", required: false },
    ],
  },
];

interface FakeStore {
  read: ReturnType<typeof vi.fn>;
  bind: ReturnType<typeof vi.fn>;
  unbind: ReturnType<typeof vi.fn>;
  observe: ReturnType<typeof vi.fn>;
}

function makeStore(initial: QueryBindings = {}): FakeStore {
  const state: QueryBindings = structuredClone(initial);
  return {
    read: vi.fn(async () => structuredClone(state)),
    bind: vi.fn(async (id: string, binding: QueryBinding) => {
      state[id] = binding;
    }),
    unbind: vi.fn(async (id: string) => {
      delete state[id];
    }),
    observe: vi.fn(() => ({ ready: Promise.resolve(), unsubscribe: vi.fn() })),
  };
}

interface FakeTabsReader {
  readQueryTabs: ReturnType<typeof vi.fn>;
}

function makeTabsReader(tabs: AdoQueryTab[] = []): FakeTabsReader {
  return { readQueryTabs: vi.fn(async () => tabs) };
}

function makeElements(): QueryBindingsElements {
  const create = <T extends HTMLElement>(tag: string): T =>
    document.createElement(tag) as unknown as T;
  const pickerField = create<HTMLElement>("div");
  const querySelect = create<HTMLSelectElement>("select");
  pickerField.append(querySelect);
  const nameField = create<HTMLElement>("div");
  const queryName = create<HTMLElement>("output");
  nameField.append(queryName);
  const emptyState = create<HTMLElement>("p");
  const form = create<HTMLElement>("div");
  const queryId = create<HTMLElement>("output");
  const viewSelect = create<HTMLSelectElement>("select");
  const properties = create<HTMLElement>("div");
  const saveButton = create<HTMLButtonElement>("button");
  const deleteButton = create<HTMLButtonElement>("button");
  const status = create<HTMLElement>("span");
  form.append(queryId, viewSelect, properties, saveButton, deleteButton);
  const root = create<HTMLElement>("div");
  root.append(pickerField, nameField, emptyState, form, status);
  document.body.append(root);
  return {
    pickerField,
    querySelect,
    nameField,
    queryName,
    emptyState,
    form,
    queryId,
    viewSelect,
    properties,
    saveButton,
    deleteButton,
    status,
  };
}

/** Flush the microtask queue so a store write's `.then`/`.catch` continuation has run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe("QueryBindingsController", () => {
  let elements: QueryBindingsElements;
  let tabsReader: FakeTabsReader;
  let reportError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = "";
    elements = makeElements();
    tabsReader = makeTabsReader();
    reportError = vi.fn();
  });

  const controllerFor = (store: FakeStore, views: readonly ViewType[] = VIEWS) =>
    new QueryBindingsController(
      store as unknown as IQueryBindingStore,
      tabsReader as unknown as IAdoQueryTabsReader,
      elements,
      views,
      reportError as unknown as (error: unknown) => void,
    );

  const propInput = (key: string): HTMLInputElement | null =>
    elements.properties.querySelector<HTMLInputElement>(`input[data-property-key="${key}"]`);

  const setView = (id: string): void => {
    elements.viewSelect.value = id;
    elements.viewSelect.dispatchEvent(new Event("change"));
  };

  const fillProp = (key: string, value: string): void => {
    const input = propInput(key);
    if (input === null) {
      throw new Error(`no property input for ${key}`);
    }
    input.value = value;
    input.dispatchEvent(new Event("input"));
  };

  describe("fixed-query mode (opened from a query's button)", () => {
    it("shows the read-only name and hides the picker", async () => {
      await controllerFor(makeStore()).init(GUID_A, "Sprint 42");

      expect(elements.pickerField.hidden).toBe(true);
      expect(elements.nameField.hidden).toBe(false);
      expect(elements.queryName.textContent).toBe("Sprint 42");
      expect(elements.form.hidden).toBe(false);
      expect(elements.queryId.textContent).toBe(GUID_A);
    });

    it("shows a placeholder name when the query name is unknown", async () => {
      await controllerFor(makeStore()).init(GUID_A, null);
      expect(elements.queryName.textContent).toBe("Unnamed query");
    });

    it("loads an existing binding into the form and enables Delete", async () => {
      const store = makeStore({ [GUID_A]: { view: "tracking", properties: { team: "Blue" } } });
      await controllerFor(store).init(GUID_A, "Sprint 42");

      expect(elements.viewSelect.value).toBe("tracking");
      expect(propInput("team")?.value).toBe("Blue");
      expect(elements.deleteButton.disabled).toBe(false);
    });

    it("defaults a new query to the first view with Delete disabled", async () => {
      await controllerFor(makeStore()).init(GUID_A, "Sprint 42");

      expect(elements.viewSelect.value).toBe("sprint");
      expect(elements.deleteButton.disabled).toBe(true);
    });

    it("falls back to the first view when the stored view is unknown to this build", async () => {
      const store = makeStore({ [GUID_A]: { view: "future-view", properties: {} } });
      await controllerFor(store).init(GUID_A, "Sprint 42");
      expect(elements.viewSelect.value).toBe("sprint");
    });

    it("saves a new binding carrying the query name and no active override", async () => {
      const store = makeStore();
      await controllerFor(store).init(GUID_A, "Sprint 42");

      elements.saveButton.click();
      await settle();

      expect(store.bind).toHaveBeenCalledWith(GUID_A, {
        view: "sprint",
        properties: {},
        name: "Sprint 42",
      });
      expect(elements.deleteButton.disabled).toBe(false);
      expect(elements.status.textContent).toBe("Saved.");
    });

    it("preserves an existing active override when re-saving", async () => {
      const store = makeStore({
        [GUID_A]: { view: "sprint", properties: {}, active: "standard" },
      });
      await controllerFor(store).init(GUID_A, "Sprint 42");

      elements.saveButton.click();
      await settle();

      expect(store.bind).toHaveBeenCalledWith(GUID_A, {
        view: "sprint",
        properties: {},
        name: "Sprint 42",
        active: "standard",
      });
    });

    it("keeps Save disabled until every required property has a value", async () => {
      const store = makeStore();
      await controllerFor(store).init(GUID_A, "Sprint 42");

      setView("tracking");
      expect(elements.saveButton.disabled).toBe(true);

      fillProp("team", "Blue");
      expect(elements.saveButton.disabled).toBe(false);

      elements.saveButton.click();
      await settle();

      expect(store.bind).toHaveBeenCalledWith(GUID_A, {
        view: "tracking",
        properties: { team: "Blue", note: "" },
        name: "Sprint 42",
      });
    });

    it("deletes an existing binding and disables Delete", async () => {
      const store = makeStore({ [GUID_A]: { view: "sprint", properties: {} } });
      await controllerFor(store).init(GUID_A, "Sprint 42");

      elements.deleteButton.click();
      await settle();

      expect(store.unbind).toHaveBeenCalledWith(GUID_A);
      expect(elements.deleteButton.disabled).toBe(true);
      expect(elements.status.textContent).toBe("Deleted.");
    });

    it("reports a save failure and re-enables Save", async () => {
      const store = makeStore();
      store.bind.mockRejectedValueOnce(new Error("nope"));
      await controllerFor(store).init(GUID_A, "Sprint 42");

      elements.saveButton.click();
      await settle();

      expect(reportError).toHaveBeenCalled();
      expect(elements.saveButton.disabled).toBe(false);
    });

    it("reports a delete failure and re-enables Delete", async () => {
      const store = makeStore({ [GUID_A]: { view: "sprint", properties: {} } });
      store.unbind.mockRejectedValueOnce(new Error("nope"));
      await controllerFor(store).init(GUID_A, "Sprint 42");

      elements.deleteButton.click();
      await settle();

      expect(reportError).toHaveBeenCalled();
      expect(elements.deleteButton.disabled).toBe(false);
    });

    it("reports a read failure and treats the query as unbound", async () => {
      const store = makeStore();
      store.read.mockRejectedValueOnce(new Error("nope"));
      await controllerFor(store).init(GUID_A, "Sprint 42");

      expect(reportError).toHaveBeenCalled();
      expect(elements.deleteButton.disabled).toBe(true);
    });
  });

  describe("scan mode (opened from the options menu)", () => {
    it("lists open query tabs, selecting the first", async () => {
      tabsReader = makeTabsReader([
        { queryId: GUID_A, queryName: "Alpha" },
        { queryId: GUID_B, queryName: "Beta" },
      ]);
      await controllerFor(makeStore()).init(null, null);

      expect(elements.pickerField.hidden).toBe(false);
      expect(elements.nameField.hidden).toBe(true);
      expect([...elements.querySelect.options].map((o) => [o.value, o.textContent])).toEqual([
        [GUID_A, "Alpha"],
        [GUID_B, "Beta"],
      ]);
      expect(elements.querySelect.value).toBe(GUID_A);
      expect(elements.form.hidden).toBe(false);
      expect(elements.queryId.textContent).toBe(GUID_A);
    });

    it("includes already-bound queries whose tab is closed", async () => {
      tabsReader = makeTabsReader([{ queryId: GUID_A, queryName: "Alpha" }]);
      const store = makeStore({
        [GUID_B]: { view: "sprint", properties: {}, name: "Beta (saved)" },
      });
      await controllerFor(store).init(null, null);

      expect([...elements.querySelect.options].map((o) => o.value)).toEqual([GUID_A, GUID_B]);
      const betaLabel = [...elements.querySelect.options].find(
        (o) => o.value === GUID_B,
      )?.textContent;
      expect(betaLabel).toBe("Beta (saved)");
    });

    it("shows the empty state and hides the form when nothing is available", async () => {
      await controllerFor(makeStore()).init(null, null);

      expect(elements.emptyState.hidden).toBe(false);
      expect(elements.form.hidden).toBe(true);
    });

    it("loads the selected query's binding when the dropdown changes", async () => {
      tabsReader = makeTabsReader([
        { queryId: GUID_A, queryName: "Alpha" },
        { queryId: GUID_B, queryName: "Beta" },
      ]);
      const store = makeStore({ [GUID_B]: { view: "tracking", properties: { team: "Red" } } });
      await controllerFor(store).init(null, null);

      expect(elements.deleteButton.disabled).toBe(true);

      elements.querySelect.value = GUID_B;
      elements.querySelect.dispatchEvent(new Event("change"));

      expect(elements.queryId.textContent).toBe(GUID_B);
      expect(elements.viewSelect.value).toBe("tracking");
      expect(propInput("team")?.value).toBe("Red");
      expect(elements.deleteButton.disabled).toBe(false);
    });

    it("saves with the selected query's scanned name", async () => {
      tabsReader = makeTabsReader([{ queryId: GUID_A, queryName: "Alpha" }]);
      const store = makeStore();
      await controllerFor(store).init(null, null);

      elements.saveButton.click();
      await settle();

      expect(store.bind).toHaveBeenCalledWith(GUID_A, {
        view: "sprint",
        properties: {},
        name: "Alpha",
      });
    });

    it("falls back to bound queries when scanning tabs fails", async () => {
      tabsReader.readQueryTabs.mockRejectedValueOnce(new Error("boom"));
      const store = makeStore({
        [GUID_B]: { view: "sprint", properties: {}, name: "Beta" },
      });
      await controllerFor(store).init(null, null);

      expect(reportError).toHaveBeenCalled();
      expect([...elements.querySelect.options].map((o) => o.value)).toEqual([GUID_B]);
      expect(elements.form.hidden).toBe(false);
    });
  });

  it("handles an empty view catalog without crashing", async () => {
    const store = makeStore();
    await controllerFor(store, []).init(GUID_A, "Alpha");

    expect(elements.saveButton.disabled).toBe(true);
    expect(elements.properties.children.length).toBe(0);
  });

  it("stops reacting to form events after dispose", async () => {
    const store = makeStore();
    const controller = controllerFor(store);
    await controller.init(GUID_A, "Sprint 42");

    controller.dispose();
    expect(elements.properties.children.length).toBe(0);

    setView("tracking");
    // The change listener is gone, so no property inputs are rendered for the new view.
    expect(elements.properties.children.length).toBe(0);
  });
});
