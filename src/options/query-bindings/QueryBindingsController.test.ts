import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IQueryBindingStore } from "../../common/bindings/IQueryBindingStore";
import type { QueryBinding, QueryBindings } from "../../common/bindings/QueryBinding";
import type { ViewType } from "../../common/view-common/ViewType";

import { QueryBindingsController, type QueryBindingsElements } from "./QueryBindingsController";

const GUID_A = "12345678-1234-1234-1234-123456789abc";
const GUID_B = "abcdef00-0000-0000-0000-000000000000";
const GUID_C = "fedcba98-7654-3210-fedc-ba9876543210";

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

// A catalog whose second view declares defaulted text, range-bounded number, and select properties,
// used by the add-mode default-save and the edit-mode property-rendering tests.
const CONFIG_VIEWS: readonly ViewType[] = [
  { id: "sprint", label: "Sprint View", properties: [] },
  {
    id: "config",
    label: "Configured",
    properties: [
      {
        key: "orderField",
        label: "Ordering field",
        required: false,
        kind: "text",
        defaultValue: "Microsoft.VSTS.Common.StackRank",
        hint: "Sort order field.",
      },
      {
        key: "weeks",
        label: "Updates window (weeks)",
        required: false,
        kind: "number",
        defaultValue: "2",
        min: 1,
        max: 52,
      },
      {
        key: "ordering",
        label: "Ordering policy",
        required: false,
        kind: "select",
        options: [
          { value: "importance", label: "By importance" },
          { value: "title", label: "By title" },
        ],
        defaultValue: "importance",
      },
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

function makeElements(): QueryBindingsElements {
  const create = <T extends HTMLElement>(tag: string): T =>
    document.createElement(tag) as unknown as T;
  const emptyState = create<HTMLElement>("p");

  // Add card: a single read-only query line, a view picker, and Save.
  const addCard = create<HTMLElement>("div");
  const addQuery = create<HTMLElement>("output");
  const addViewSelect = create<HTMLSelectElement>("select");
  const addSaveButton = create<HTMLButtonElement>("button");
  addCard.append(addQuery, addViewSelect, addSaveButton);

  // Edit card: the bound-query picker plus Delete.
  const editCard = create<HTMLElement>("div");
  const querySelect = create<HTMLSelectElement>("select");
  const deleteButton = create<HTMLButtonElement>("button");
  editCard.append(querySelect, deleteButton);

  // View-configuration card: the view type, its settings, and Save.
  const viewConfigCard = create<HTMLElement>("div");
  const viewSelect = create<HTMLSelectElement>("select");
  const properties = create<HTMLElement>("div");
  const saveButton = create<HTMLButtonElement>("button");
  viewConfigCard.append(viewSelect, properties, saveButton);

  const status = create<HTMLElement>("span");
  const root = create<HTMLElement>("div");
  root.append(emptyState, addCard, editCard, viewConfigCard, status);
  document.body.append(root);
  return {
    emptyState,
    addCard,
    addQuery,
    addViewSelect,
    addSaveButton,
    editCard,
    querySelect,
    deleteButton,
    viewConfigCard,
    viewSelect,
    properties,
    saveButton,
    status,
  };
}

/** Flush the microtask queue so a store write's `.then`/`.catch` continuation has run. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

// Shared across the sibling describes below so each split group reuses one setup with zero
// duplication (jscpd threshold is 0).
let elements: QueryBindingsElements;
let reportError: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.body.innerHTML = "";
  elements = makeElements();
  reportError = vi.fn();
});

const controllerFor = (
  store: FakeStore,
  views: readonly ViewType[] = VIEWS,
  resolveCurrentQueryId?: () => Promise<string | null>,
) =>
  new QueryBindingsController(
    store as unknown as IQueryBindingStore,
    elements,
    reportError as unknown as (error: unknown) => void,
    { viewTypes: views, resolveCurrentQueryId },
  );

const propInput = (key: string): HTMLInputElement | null =>
  elements.properties.querySelector<HTMLInputElement>(`input[data-property-key="${key}"]`);

const propSelect = (key: string): HTMLSelectElement | null =>
  elements.properties.querySelector<HTMLSelectElement>(`select[data-property-key="${key}"]`);

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

// Selects the CONFIG_VIEWS "config" view; shared by the split property-kind describes.
const selectConfig = (): void => {
  elements.viewSelect.value = "config";
  elements.viewSelect.dispatchEvent(new Event("change"));
};

describe("add mode (opened from an unbound query's button)", () => {
  it("shows only the add card with the read-only query line", async () => {
    await controllerFor(makeStore()).init(GUID_A, "Sprint 42");

    expect(elements.addCard.hidden).toBe(false);
    expect(elements.editCard.hidden).toBe(true);
    expect(elements.viewConfigCard.hidden).toBe(true);
    expect(elements.emptyState.hidden).toBe(true);
    expect(elements.addQuery.textContent).toBe(`Sprint 42  QueryId:${GUID_A}`);
    expect(elements.addQuery.querySelector("i")?.textContent).toBe(GUID_A);
  });

  it("shows a placeholder name when the query name is unknown", async () => {
    await controllerFor(makeStore()).init(GUID_A, null);
    expect(elements.addQuery.textContent).toBe(`Unnamed query  QueryId:${GUID_A}`);
  });

  it("defaults the view picker to the first view with Save enabled", async () => {
    await controllerFor(makeStore()).init(GUID_A, "Sprint 42");

    expect(elements.addViewSelect.value).toBe("sprint");
    expect(elements.addSaveButton.disabled).toBe(false);
  });

  it("saves the selected view with only its name and no active override, then edits it", async () => {
    const store = makeStore();
    await controllerFor(store).init(GUID_A, "Sprint 42");

    elements.addSaveButton.click();
    await settle();

    expect(store.bind).toHaveBeenCalledWith(GUID_A, {
      view: "sprint",
      properties: {},
      name: "Sprint 42",
    });
    expect(elements.status.textContent).toBe("Saved.");
    // The tab switches to the edit layout with the just-added query selected.
    expect(elements.addCard.hidden).toBe(true);
    expect(elements.editCard.hidden).toBe(false);
    expect(elements.viewConfigCard.hidden).toBe(false);
    expect(elements.querySelect.value).toBe(GUID_A);
    expect(elements.deleteButton.disabled).toBe(false);
  });

  it("persists the chosen view's default settings so the choice survives navigation", async () => {
    const store = makeStore();
    await controllerFor(store, CONFIG_VIEWS).init(GUID_A, "Alpha");

    elements.addViewSelect.value = "config";
    elements.addSaveButton.click();
    await settle();

    expect(store.bind).toHaveBeenCalledWith(GUID_A, {
      view: "config",
      properties: {
        orderField: "Microsoft.VSTS.Common.StackRank",
        weeks: "2",
        ordering: "importance",
      },
      name: "Alpha",
    });
  });

  it("reports a save failure and re-enables the add Save", async () => {
    const store = makeStore();
    store.bind.mockRejectedValueOnce(new Error("nope"));
    await controllerFor(store).init(GUID_A, "Sprint 42");

    elements.addSaveButton.click();
    await settle();

    expect(reportError).toHaveBeenCalled();
    expect(elements.addSaveButton.disabled).toBe(false);
    expect(elements.addCard.hidden).toBe(false);
  });

  it("reports a read failure and treats the query as unbound", async () => {
    const store = makeStore();
    store.read.mockRejectedValueOnce(new Error("nope"));
    await controllerFor(store).init(GUID_A, "Sprint 42");

    expect(reportError).toHaveBeenCalled();
    expect(elements.addCard.hidden).toBe(false);
    expect(elements.editCard.hidden).toBe(true);
  });
});

describe("edit mode (opened from an already-bound query's button)", () => {
  it("opens straight into edit mode with that query selected", async () => {
    const store = makeStore({
      [GUID_A]: { view: "tracking", properties: { team: "Blue" }, name: "Alpha" },
    });
    await controllerFor(store).init(GUID_A, "Alpha");

    expect(elements.addCard.hidden).toBe(true);
    expect(elements.editCard.hidden).toBe(false);
    expect(elements.viewConfigCard.hidden).toBe(false);
    expect(elements.querySelect.value).toBe(GUID_A);
    expect(elements.viewSelect.value).toBe("tracking");
    expect(propInput("team")?.value).toBe("Blue");
    expect(elements.deleteButton.disabled).toBe(false);
  });

  it("falls back to the first view when the stored view is unknown to this build", async () => {
    const store = makeStore({ [GUID_A]: { view: "future-view", properties: {}, name: "Alpha" } });
    await controllerFor(store).init(GUID_A, "Alpha");
    expect(elements.viewSelect.value).toBe("sprint");
  });

  it("labels the picker option with the freshly scraped name when the binding has none", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {} } });
    await controllerFor(store).init(GUID_A, "Sprint 42");

    const label = [...elements.querySelect.options].find((o) => o.value === GUID_A)?.textContent;
    expect(label).toBe(`Sprint 42 (${GUID_A})`);
  });

  it("keeps Save disabled until every required property has a value", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Sprint 42" } });
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

  it("deletes the only binding and shows the empty state", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    await controllerFor(store).init(GUID_A, "Alpha");

    elements.deleteButton.click();
    await settle();

    expect(store.unbind).toHaveBeenCalledWith(GUID_A);
    expect(elements.emptyState.hidden).toBe(false);
    expect(elements.editCard.hidden).toBe(true);
    expect(elements.viewConfigCard.hidden).toBe(true);
    expect(elements.status.textContent).toBe("Deleted.");
  });

  it("reports a save failure and re-enables Save", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    store.bind.mockRejectedValueOnce(new Error("nope"));
    await controllerFor(store).init(GUID_A, "Alpha");

    elements.saveButton.click();
    await settle();

    expect(reportError).toHaveBeenCalled();
    expect(elements.saveButton.disabled).toBe(false);
  });

  it("reports a delete failure and re-enables Delete", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    store.unbind.mockRejectedValueOnce(new Error("nope"));
    await controllerFor(store).init(GUID_A, "Alpha");

    elements.deleteButton.click();
    await settle();

    expect(reportError).toHaveBeenCalled();
    expect(elements.deleteButton.disabled).toBe(false);
  });
});

describe("edit mode (opened from the options menu)", () => {
  it("lists bound queries labelled name and id, selecting the first", async () => {
    const store = makeStore({
      [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" },
      [GUID_B]: { view: "tracking", properties: { team: "Red" }, name: "Beta" },
    });
    await controllerFor(store).init(null, null);

    expect(elements.addCard.hidden).toBe(true);
    expect(elements.editCard.hidden).toBe(false);
    expect(elements.viewConfigCard.hidden).toBe(false);
    expect([...elements.querySelect.options].map((o) => [o.value, o.textContent])).toEqual([
      [GUID_A, `Alpha (${GUID_A})`],
      [GUID_B, `Beta (${GUID_B})`],
    ]);
    expect(elements.querySelect.value).toBe(GUID_A);
    expect(elements.viewSelect.value).toBe("sprint");
    expect(elements.deleteButton.disabled).toBe(false);
  });

  it("preselects the query the current ADO tab is on when it is bound", async () => {
    const store = makeStore({
      [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" },
      [GUID_B]: { view: "tracking", properties: { team: "Red" }, name: "Beta" },
    });
    await controllerFor(store, VIEWS, async () => GUID_B).init(null, null);

    expect(elements.querySelect.value).toBe(GUID_B);
    expect(elements.viewSelect.value).toBe("tracking");
    expect(propInput("team")?.value).toBe("Red");
  });

  it("falls back to the first binding when the current tab's query is not bound", async () => {
    const store = makeStore({
      [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" },
      [GUID_B]: { view: "tracking", properties: { team: "Red" }, name: "Beta" },
    });
    await controllerFor(store, VIEWS, async () => "00000000-0000-0000-0000-000000000000").init(
      null,
      null,
    );

    expect(elements.querySelect.value).toBe(GUID_A);
  });

  it("reports a resolver failure and still edits the first binding", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    await controllerFor(store, VIEWS, async () => {
      throw new Error("no tabs");
    }).init(null, null);

    expect(reportError).toHaveBeenCalled();
    expect(elements.querySelect.value).toBe(GUID_A);
  });

  it("labels a bound query without a saved name as Unnamed query", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {} } });
    await controllerFor(store).init(null, null);

    const label = [...elements.querySelect.options].find((o) => o.value === GUID_A)?.textContent;
    expect(label).toBe(`Unnamed query (${GUID_A})`);
  });

  it("shows the empty state and hides both cards when nothing is bound", async () => {
    await controllerFor(makeStore()).init(null, null);

    expect(elements.emptyState.hidden).toBe(false);
    expect(elements.addCard.hidden).toBe(true);
    expect(elements.editCard.hidden).toBe(true);
    expect(elements.viewConfigCard.hidden).toBe(true);
  });
});

describe("edit mode (options menu) — save & delete", () => {
  it("loads the selected query's binding when the picker changes", async () => {
    const store = makeStore({
      [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" },
      [GUID_B]: { view: "tracking", properties: { team: "Red" }, name: "Beta" },
    });
    await controllerFor(store).init(null, null);

    elements.querySelect.value = GUID_B;
    elements.querySelect.dispatchEvent(new Event("change"));

    expect(elements.viewSelect.value).toBe("tracking");
    expect(propInput("team")?.value).toBe("Red");
    expect(elements.deleteButton.disabled).toBe(false);
  });

  it("re-saves the selected binding keeping its saved name", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    await controllerFor(store).init(null, null);

    elements.saveButton.click();
    await settle();

    expect(store.bind).toHaveBeenCalledWith(GUID_A, {
      view: "sprint",
      properties: {},
      name: "Alpha",
    });
  });

  it("keeps the picker label as name and id after changing the view type", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    await controllerFor(store).init(null, null);

    setView("tracking");
    fillProp("team", "Blue");
    elements.saveButton.click();
    await settle();

    const label = [...elements.querySelect.options].find((o) => o.value === GUID_A)?.textContent;
    expect(label).toBe(`Alpha (${GUID_A})`);
  });

  it("deletes the selected binding and selects the next one in order", async () => {
    const store = makeStore({
      [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" },
      [GUID_B]: { view: "sprint", properties: {}, name: "Beta" },
      [GUID_C]: { view: "sprint", properties: {}, name: "Gamma" },
    });
    await controllerFor(store).init(null, null);

    elements.querySelect.value = GUID_B;
    elements.querySelect.dispatchEvent(new Event("change"));
    elements.deleteButton.click();
    await settle();

    expect(store.unbind).toHaveBeenCalledWith(GUID_B);
    // The query that shifted into the deleted slot is selected.
    expect(elements.querySelect.value).toBe(GUID_C);
    expect(elements.status.textContent).toBe("Deleted.");
  });

  it("selects the previous binding when the last one is deleted", async () => {
    const store = makeStore({
      [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" },
      [GUID_B]: { view: "sprint", properties: {}, name: "Beta" },
    });
    await controllerFor(store).init(null, null);

    elements.querySelect.value = GUID_B;
    elements.querySelect.dispatchEvent(new Event("change"));
    elements.deleteButton.click();
    await settle();

    expect(elements.querySelect.value).toBe(GUID_A);
  });

  it("deletes the last remaining binding and shows the empty state", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    await controllerFor(store).init(null, null);

    elements.deleteButton.click();
    await settle();

    expect(store.unbind).toHaveBeenCalledWith(GUID_A);
    expect(elements.emptyState.hidden).toBe(false);
    expect(elements.editCard.hidden).toBe(true);
    expect(elements.viewConfigCard.hidden).toBe(true);
    expect(elements.status.textContent).toBe("Deleted.");
  });
});

describe("two-card layout", () => {
  it("shows only the add card while binding a new query", async () => {
    await controllerFor(makeStore()).init(GUID_A, "Sprint 42");

    expect(elements.addCard.hidden).toBe(false);
    expect(elements.editCard.hidden).toBe(true);
    expect(elements.viewConfigCard.hidden).toBe(true);
  });

  it("shows the edit and config cards when the query is already bound", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    await controllerFor(store).init(GUID_A, "Alpha");

    expect(elements.addCard.hidden).toBe(true);
    expect(elements.editCard.hidden).toBe(false);
    expect(elements.viewConfigCard.hidden).toBe(false);
  });

  it("swaps from the add card to the edit and config cards after the first save", async () => {
    const store = makeStore();
    await controllerFor(store).init(GUID_A, "Sprint 42");

    elements.addSaveButton.click();
    await settle();

    expect(elements.addCard.hidden).toBe(true);
    expect(elements.editCard.hidden).toBe(false);
    expect(elements.viewConfigCard.hidden).toBe(false);
  });

  it("hides every card but the empty state when nothing is bound", async () => {
    await controllerFor(makeStore()).init(null, null);

    expect(elements.emptyState.hidden).toBe(false);
    expect(elements.addCard.hidden).toBe(true);
    expect(elements.editCard.hidden).toBe(true);
    expect(elements.viewConfigCard.hidden).toBe(true);
  });
});

describe("revealFixedQuery (options tab already open)", () => {
  it("re-opens add mode for a different unbound query without re-init", async () => {
    const store = makeStore();
    const controller = controllerFor(store);
    await controller.init(GUID_A, "Sprint 42");

    await controller.revealFixedQuery(GUID_B, "Release Plan");

    expect(elements.addQuery.textContent).toBe(`Release Plan  QueryId:${GUID_B}`);
    expect(elements.addQuery.querySelector("i")?.textContent).toBe(GUID_B);
    expect(elements.addCard.hidden).toBe(false);
    expect(elements.editCard.hidden).toBe(true);
  });

  it("opens edit mode for a binding saved after the tab opened by re-reading the store", async () => {
    const store = makeStore();
    const controller = controllerFor(store);
    await controller.init(null, null);
    // The query gets bound elsewhere after this tab finished loading; the next read reflects it.
    store.read.mockResolvedValueOnce({
      [GUID_A]: { view: "tracking", properties: { team: "Blue" }, name: "Alpha" },
    });

    await controller.revealFixedQuery(GUID_A, "Alpha");

    expect(elements.querySelect.value).toBe(GUID_A);
    expect(elements.viewSelect.value).toBe("tracking");
    expect(propInput("team")?.value).toBe("Blue");
    expect(elements.deleteButton.disabled).toBe(false);
  });

  it("reports a read failure and treats the query as unbound", async () => {
    const store = makeStore();
    const controller = controllerFor(store);
    await controller.init(GUID_A, "Sprint 42");
    store.read.mockRejectedValueOnce(new Error("nope"));

    await controller.revealFixedQuery(GUID_B, "Release Plan");

    expect(reportError).toHaveBeenCalled();
    expect(elements.addQuery.textContent).toBe(`Release Plan  QueryId:${GUID_B}`);
    expect(elements.addCard.hidden).toBe(false);
    expect(elements.editCard.hidden).toBe(true);
  });
});

describe("reload (bindings replaced from outside the page)", () => {
  it("re-reads the bindings and re-populates the picker", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    const controller = controllerFor(store);
    await controller.init(null, null);
    expect(elements.querySelect.value).toBe(GUID_A);

    // Stands in for a configuration file import, which replaces the bindings wholesale.
    store.read.mockResolvedValue({
      [GUID_B]: { view: "tracking", properties: { team: "Red" }, name: "Imported" },
    });
    await controller.reload();

    expect([...elements.querySelect.options].map((o) => o.value)).toEqual([GUID_B]);
    expect(elements.querySelect.value).toBe(GUID_B);
    expect(elements.viewSelect.value).toBe("tracking");
  });

  it("shows the guidance again when the imported file bound nothing", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    const controller = controllerFor(store);
    await controller.init(null, null);

    store.read.mockResolvedValue({});
    await controller.reload();

    expect(elements.emptyState.hidden).toBe(false);
    expect(elements.editCard.hidden).toBe(true);
  });
});

describe("edge cases (empty catalog, dispose)", () => {
  it("disables add Save for an empty view catalog without crashing", async () => {
    const store = makeStore();
    await controllerFor(store, []).init(GUID_A, "Alpha");

    expect(elements.addSaveButton.disabled).toBe(true);
    expect(elements.properties.children.length).toBe(0);
  });

  it("stops reacting to form events after dispose", async () => {
    const store = makeStore({
      [GUID_A]: { view: "tracking", properties: { team: "Blue" }, name: "Alpha" },
    });
    const controller = controllerFor(store);
    await controller.init(GUID_A, "Alpha");
    expect(elements.properties.children.length).toBeGreaterThan(0);

    controller.dispose();
    expect(elements.properties.children.length).toBe(0);

    setView("tracking");
    // The change listener is gone, so no property inputs are rendered for the view.
    expect(elements.properties.children.length).toBe(0);
  });
});

describe("view property kinds — defaults & numbers", () => {
  it("seeds each property with its default when the binding has none", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    await controllerFor(store, CONFIG_VIEWS).init(GUID_A, "Alpha");
    selectConfig();

    expect(propInput("orderField")?.value).toBe("Microsoft.VSTS.Common.StackRank");
    expect(propInput("weeks")?.value).toBe("2");
  });

  it("renders a number property as a numeric input carrying its range and hint", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    await controllerFor(store, CONFIG_VIEWS).init(GUID_A, "Alpha");
    selectConfig();

    const weeks = propInput("weeks");
    expect(weeks?.type).toBe("number");
    expect(weeks?.min).toBe("1");
    expect(weeks?.max).toBe("52");
    const hint = elements.properties.querySelector(".field__hint");
    expect(hint?.textContent).toBe("Sort order field.");
  });

  it("prefers a stored value over the default", async () => {
    const store = makeStore({
      [GUID_A]: { view: "config", properties: { orderField: "Custom.Field", weeks: "6" } },
    });
    await controllerFor(store, CONFIG_VIEWS).init(GUID_A, "Alpha");

    expect(propInput("orderField")?.value).toBe("Custom.Field");
    expect(propInput("weeks")?.value).toBe("6");
  });

  it("forces an out-of-range number back into its bounds on blur", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    await controllerFor(store, CONFIG_VIEWS).init(GUID_A, "Alpha");
    selectConfig();

    const weeks = propInput("weeks");
    if (weeks === null) {
      throw new Error("no weeks input");
    }
    weeks.value = "999";
    weeks.dispatchEvent(new Event("change"));
    expect(weeks.value).toBe("52");
  });
});

describe("view property kinds — clamping & selects", () => {
  it("saves the defaulted, clamped values", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    await controllerFor(store, CONFIG_VIEWS).init(GUID_A, "Alpha");
    selectConfig();

    const weeks = propInput("weeks");
    if (weeks === null) {
      throw new Error("no weeks input");
    }
    weeks.value = "0";
    weeks.dispatchEvent(new Event("change"));

    elements.saveButton.click();
    await settle();

    expect(store.bind).toHaveBeenCalledWith(GUID_A, {
      view: "config",
      properties: {
        orderField: "Microsoft.VSTS.Common.StackRank",
        weeks: "1",
        ordering: "importance",
      },
      name: "Alpha",
    });
  });

  it("renders a select property as a dropdown of its options seeded from the default", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    await controllerFor(store, CONFIG_VIEWS).init(GUID_A, "Alpha");
    selectConfig();

    const ordering = propSelect("ordering");
    expect(ordering?.value).toBe("importance");
    expect(
      [...(ordering?.options ?? [])].map((option) => [option.value, option.textContent]),
    ).toEqual([
      ["importance", "By importance"],
      ["title", "By title"],
    ]);
  });

  it("saves the chosen select value", async () => {
    const store = makeStore({
      [GUID_A]: { view: "config", properties: {}, name: "Alpha" },
    });
    await controllerFor(store, CONFIG_VIEWS).init(GUID_A, "Alpha");

    const ordering = propSelect("ordering");
    if (ordering === null) {
      throw new Error("no ordering select");
    }
    ordering.value = "title";
    ordering.dispatchEvent(new Event("change"));

    elements.saveButton.click();
    await settle();

    expect(store.bind).toHaveBeenCalledWith(
      GUID_A,
      expect.objectContaining({ properties: expect.objectContaining({ ordering: "title" }) }),
    );
  });

  it("starts a different view's inputs from their own defaults", async () => {
    const store = makeStore({ [GUID_A]: { view: "sprint", properties: {}, name: "Alpha" } });
    await controllerFor(store, CONFIG_VIEWS).init(GUID_A, "Alpha");
    selectConfig();

    expect(propInput("orderField")?.value).toBe("Microsoft.VSTS.Common.StackRank");
    expect(propInput("weeks")?.value).toBe("2");
  });
});
