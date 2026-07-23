import { afterEach, describe, expect, it } from "vitest";

import type { AdoWorkItemType } from "../common/ado/AdoMetadata";
import type { StorageObservation } from "../common/browser/observeSyncKeys";
import {
  DEFAULT_SETTINGS,
  MAX_BOARD_COLUMNS,
  type ExtensionSettings,
  type WorkItemType,
} from "../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../common/settings/ISettingsStore";

import { WorkItemTypesController, type WorkItemTypesElements } from "./WorkItemTypesController";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

class FakeSettingsStore implements ISettingsStore {
  writeCalls: Partial<ExtensionSettings>[] = [];
  private writeError: unknown = null;

  setWriteError(error: unknown): void {
    this.writeError = error;
  }

  observe(): StorageObservation {
    return { ready: Promise.resolve(), unsubscribe: () => {} };
  }

  read(): Promise<ExtensionSettings> {
    return Promise.resolve({ ...DEFAULT_SETTINGS });
  }

  write(update: Partial<ExtensionSettings>): Promise<void> {
    this.writeCalls.push({ ...update });
    return this.writeError !== null ? Promise.reject(this.writeError) : Promise.resolve();
  }
}

const TYPES: AdoWorkItemType[] = [
  { name: "Bug", color: "CC293D", icon: "https://ado/bug", states: ["New", "Active", "Resolved"] },
  { name: "Task", color: "F2CB1D", icon: "", states: ["To Do", "Doing", "Done"] },
];

function makeElements(): WorkItemTypesElements {
  const table = document.createElement("table");
  const thead = document.createElement("thead");
  const columnsRow = document.createElement("tr");
  thead.append(columnsRow);
  const body = document.createElement("tbody");
  table.append(thead, body);
  const empty = document.createElement("p");
  const addTypeButton = document.createElement("button");
  const addColumnButton = document.createElement("button");
  document.body.append(table, empty, addTypeButton, addColumnButton);
  return { columnsRow, body, empty, addTypeButton, addColumnButton };
}

function rows(elements: WorkItemTypesElements): HTMLElement[] {
  return [...elements.body.querySelectorAll<HTMLElement>(".wit-row")];
}

function rowAt(elements: WorkItemTypesElements, index: number): HTMLElement {
  const row = rows(elements)[index];
  if (row === undefined) {
    throw new Error(`no work-item-type row at index ${index}`);
  }
  return row;
}

function typeInput(row: HTMLElement): HTMLInputElement {
  return row.querySelector<HTMLInputElement>('[data-role="type"]')!;
}

/** The row's mapping cells, one per board column, in column order (excludes the leading type cell). */
function cells(row: HTMLElement): HTMLElement[] {
  return [...row.querySelectorAll<HTMLElement>(".wit-cell")];
}

function cellAt(row: HTMLElement, index: number): HTMLElement {
  const cell = cells(row)[index];
  if (cell === undefined) {
    throw new Error(`no mapping cell at index ${index}`);
  }
  return cell;
}

function stateInput(cell: HTMLElement): HTMLInputElement {
  return cell.querySelector<HTMLInputElement>('[data-role="state"]')!;
}

function chips(scope: HTMLElement): string[] {
  return [...scope.querySelectorAll<HTMLElement>(".wit-state")].map(
    (chip) => chip.dataset.state ?? "",
  );
}

function primaryChips(scope: HTMLElement): string[] {
  return [...scope.querySelectorAll<HTMLElement>(".wit-state--primary")].map(
    (chip) => chip.dataset.state ?? "",
  );
}

/** The add-state field wrapper for a cell (hidden when the row has nothing left to place). */
function stateComboboxRoot(cell: HTMLElement): HTMLElement {
  return stateInput(cell).closest<HTMLElement>(".combobox")!;
}

function chipEl(cell: HTMLElement, state: string): HTMLElement {
  const chip = [...cell.querySelectorAll<HTMLElement>(".wit-state")].find(
    (candidate) => candidate.dataset.state === state,
  );
  if (chip === undefined) {
    throw new Error(`no state chip "${state}"`);
  }
  return chip;
}

/** Simulate dragging one chip onto another via the controller's delegated drag-and-drop events. */
function dragChip(from: HTMLElement, to: HTMLElement): void {
  from.dispatchEvent(new Event("dragstart", { bubbles: true }));
  to.dispatchEvent(new Event("dragover", { bubbles: true }));
  to.dispatchEvent(new Event("drop", { bubbles: true }));
  from.dispatchEvent(new Event("dragend", { bubbles: true }));
}

function columnHeaders(elements: WorkItemTypesElements): HTMLElement[] {
  return [...elements.columnsRow.querySelectorAll<HTMLElement>(".wit-col")];
}

function columnHeaderAt(elements: WorkItemTypesElements, index: number): HTMLElement {
  const header = columnHeaders(elements)[index];
  if (header === undefined) {
    throw new Error(`no column header at index ${index}`);
  }
  return header;
}

function columnNames(elements: WorkItemTypesElements): string[] {
  return columnHeaders(elements).map(
    (header) => header.querySelector<HTMLInputElement>('[data-role="column-name"]')!.value,
  );
}

function columnNameInput(header: HTMLElement): HTMLInputElement {
  return header.querySelector<HTMLInputElement>('[data-role="column-name"]')!;
}

function commit(control: HTMLInputElement | HTMLSelectElement, value: string): void {
  control.value = value;
  control.dispatchEvent(new Event("change", { bubbles: true }));
}

function clickRole(scope: HTMLElement, role: string): void {
  const button = scope.querySelector<HTMLButtonElement>(`[data-role="${role}"]`);
  if (button === null) {
    throw new Error(`no button with role ${role}`);
  }
  button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

/** Add a committed type row through the UI. Returns the new row. */
function addTypeRow(elements: WorkItemTypesElements, typeName: string): HTMLElement {
  elements.addTypeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const row = rowAt(elements, rows(elements).length - 1);
  commit(typeInput(row), typeName);
  return row;
}

/**
 * Wire and enable a controller seeded with the given board columns and stored types. Returns the
 * store and elements so tests can assert persistence and inspect the table.
 */
function setup(options?: {
  boardColumns?: string[];
  entries?: WorkItemType[];
  reportError?: (error: unknown) => void;
}): {
  store: FakeSettingsStore;
  elements: WorkItemTypesElements;
  controller: WorkItemTypesController;
} {
  const store = new FakeSettingsStore();
  const elements = makeElements();
  const controller = new WorkItemTypesController(
    store,
    elements,
    options?.reportError ?? (() => {}),
  );
  controller.init();
  controller.setAvailableTypes(TYPES);
  controller.render(options?.entries ?? [], options?.boardColumns ?? []);
  controller.enable();
  return { store, elements, controller };
}

afterEach(() => {
  document.body.innerHTML = "";
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("WorkItemTypesController — enablement", () => {
  it("disables both add buttons until enabled", () => {
    const elements = makeElements();
    const controller = new WorkItemTypesController(new FakeSettingsStore(), elements, () => {});
    expect(elements.addTypeButton.disabled).toBe(true);
    expect(elements.addColumnButton.disabled).toBe(true);

    controller.render([], ["Active"]);
    controller.enable();

    expect(elements.addTypeButton.disabled).toBe(false);
    expect(elements.addColumnButton.disabled).toBe(false);
  });

  it("keeps the add-column button disabled once the column cap is reached", () => {
    const columns = Array.from({ length: MAX_BOARD_COLUMNS }, (_, index) => `Col ${index + 1}`);
    const { elements } = setup({ boardColumns: columns });
    expect(elements.addColumnButton.disabled).toBe(true);
  });
});

describe("WorkItemTypesController — header", () => {
  it("renders a corner cell plus one header per board column, flagging the first as fallback", () => {
    const { elements } = setup({ boardColumns: ["Queue", "Active", "Done"] });

    expect(elements.columnsRow.querySelector(".wit-corner")?.textContent).toBe("Work item type");
    expect(columnNames(elements)).toEqual(["Queue", "Active", "Done"]);
    expect(columnHeaderAt(elements, 0).classList.contains("wit-col--fallback")).toBe(true);
    expect(columnHeaderAt(elements, 1).classList.contains("wit-col--fallback")).toBe(false);
  });
});

describe("WorkItemTypesController — render", () => {
  it("seeds a row per stored type, routing states to the matching column cell", () => {
    const { elements } = setup({
      boardColumns: ["Active", "Resolved"],
      entries: [
        {
          name: "Bug",
          color: "CC293D",
          icon: "https://ado/bug",
          columns: [{ column: "Active", states: ["New", "Active"] }],
        },
      ],
    });

    const row = rowAt(elements, 0);
    expect(typeInput(row).value).toBe("Bug");
    expect(chips(cellAt(row, 0))).toEqual(["New", "Active"]);
    expect(chips(cellAt(row, 1))).toEqual([]);
    const icon = row.querySelector<HTMLImageElement>(".wit-type__icon")!;
    expect(icon.hidden).toBe(false);
    expect(icon.getAttribute("src")).toBe("https://ado/bug");
    expect(elements.empty.hidden).toBe(true);
  });

  it("marks only the first chip in a cell as the column's primary state", () => {
    const { elements } = setup({
      boardColumns: ["Active"],
      entries: [
        {
          name: "Bug",
          color: "CC293D",
          icon: "https://ado/bug",
          columns: [{ column: "Active", states: ["New", "Active"] }],
        },
      ],
    });

    expect(primaryChips(cellAt(rowAt(elements, 0), 0))).toEqual(["New"]);
  });

  it("shows the empty notice when there are no rows", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    expect(rows(elements)).toHaveLength(0);
    expect(elements.empty.hidden).toBe(false);
  });

  it("hides the icon for a stored type without one", () => {
    const { elements } = setup({
      boardColumns: ["Active"],
      entries: [{ name: "Task", color: "", icon: "", columns: [] }],
    });
    const icon = rowAt(elements, 0).querySelector<HTMLImageElement>(".wit-type__icon")!;
    expect(icon.hidden).toBe(true);
    expect(icon.hasAttribute("src")).toBe(false);
  });
});

describe("WorkItemTypesController — type selection", () => {
  it("commits a known type and persists it", () => {
    const { store, elements } = setup({ boardColumns: ["Active"] });

    const row = addTypeRow(elements, "bug");

    expect(row.dataset.typeName).toBe("Bug");
    expect(typeInput(row).value).toBe("Bug");
    expect(store.writeCalls.at(-1)).toEqual({
      workItemTypes: [{ name: "Bug", color: "CC293D", icon: "https://ado/bug", columns: [] }],
    });
  });

  it("rejects unknown text and restores the last committed type", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    const row = addTypeRow(elements, "Bug");

    commit(typeInput(row), "Nonexistent");

    expect(typeInput(row).value).toBe("Bug");
    expect(row.dataset.typeName).toBe("Bug");
  });

  it("rejects a type already used by another row", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    addTypeRow(elements, "Bug");
    const second = addTypeRow(elements, "Task");

    commit(typeInput(second), "Bug");

    expect(second.dataset.typeName).toBe("Task");
    expect(typeInput(second).value).toBe("Task");
  });

  it("clears the committed type when the field is emptied", () => {
    const { store, elements } = setup({ boardColumns: ["Active"] });
    const row = addTypeRow(elements, "Bug");

    commit(typeInput(row), "");

    expect(row.dataset.typeName).toBeUndefined();
    expect(store.writeCalls.at(-1)).toEqual({ workItemTypes: [] });
  });

  it("adopts the freshest icon and color when metadata arrives after render", () => {
    const elements = makeElements();
    const controller = new WorkItemTypesController(new FakeSettingsStore(), elements, () => {});
    controller.render(
      [{ name: "Bug", color: "stale", icon: "stale-icon", columns: [] }],
      ["Active"],
    );

    controller.setAvailableTypes(TYPES);

    const row = rowAt(elements, 0);
    expect(row.dataset.typeColor).toBe("CC293D");
    expect(row.dataset.typeIcon).toBe("https://ado/bug");
  });
});

describe("WorkItemTypesController — type picker visibility", () => {
  it("shows the searchable picker only on a new row and swaps it for a read-only label once committed", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    elements.addTypeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const row = rowAt(elements, 0);
    const picker = row.querySelector<HTMLElement>(".wit-row__type-inner .combobox")!;
    const label = row.querySelector<HTMLElement>(".wit-type__label")!;
    expect(picker.hidden).toBe(false);
    expect(label.hidden).toBe(true);

    commit(typeInput(row), "Bug");

    expect(picker.hidden).toBe(true);
    expect(label.hidden).toBe(false);
    expect(label.textContent).toBe("Bug");
  });

  it("renders a stored type as a read-only label with the picker hidden", () => {
    const { elements } = setup({
      boardColumns: ["Active"],
      entries: [{ name: "Bug", color: "CC293D", icon: "https://ado/bug", columns: [] }],
    });
    const row = rowAt(elements, 0);
    expect(row.querySelector<HTMLElement>(".wit-row__type-inner .combobox")!.hidden).toBe(true);
    expect(row.querySelector<HTMLElement>(".wit-type__label")!.textContent).toBe("Bug");
  });

  it("restores the picker when a committed type is cleared", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    const row = addTypeRow(elements, "Bug");

    commit(typeInput(row), "");

    expect(row.querySelector<HTMLElement>(".wit-row__type-inner .combobox")!.hidden).toBe(false);
    expect(row.querySelector<HTMLElement>(".wit-type__label")!.hidden).toBe(true);
  });
});

describe("WorkItemTypesController — columns", () => {
  it("adds a board column with a generated name and a cell in every row, and persists it", () => {
    const { store, elements } = setup({ boardColumns: ["Active"] });
    const row = addTypeRow(elements, "Bug");

    elements.addColumnButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(columnNames(elements)).toEqual(["Active", "New state"]);
    expect(cells(row)).toHaveLength(2);
    expect(store.writeCalls.at(-1)).toEqual({ boardColumns: ["Active", "New state"] });
  });

  it("generates a unique default name when adding repeated columns", () => {
    const { elements } = setup({ boardColumns: [] });

    elements.addColumnButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    elements.addColumnButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(columnNames(elements)).toEqual(["New state", "New state 2"]);
  });

  it("does not add a column beyond the cap", () => {
    const columns = Array.from({ length: MAX_BOARD_COLUMNS }, (_, index) => `Col ${index + 1}`);
    const { elements } = setup({ boardColumns: columns });

    elements.addColumnButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(columnHeaders(elements)).toHaveLength(MAX_BOARD_COLUMNS);
  });

  it("renames a column and persists both the columns and the type mappings", () => {
    const { store, elements } = setup({ boardColumns: ["Active"] });
    const row = addTypeRow(elements, "Bug");
    commit(stateInput(cellAt(row, 0)), "New");

    commit(columnNameInput(columnHeaderAt(elements, 0)), "Doing");

    expect(columnNames(elements)).toEqual(["Doing"]);
    expect(store.writeCalls.at(-1)).toEqual({
      boardColumns: ["Doing"],
      workItemTypes: [
        {
          name: "Bug",
          color: "CC293D",
          icon: "https://ado/bug",
          columns: [{ column: "Doing", states: ["New"] }],
        },
      ],
    });
  });

  it("rejects a blank column name and restores the previous one", () => {
    const { elements } = setup({ boardColumns: ["Active"] });

    commit(columnNameInput(columnHeaderAt(elements, 0)), "   ");

    expect(columnNames(elements)).toEqual(["Active"]);
  });

  it("rejects a duplicate column name and restores the previous one", () => {
    const { elements } = setup({ boardColumns: ["Active", "Resolved"] });

    commit(columnNameInput(columnHeaderAt(elements, 1)), "active");

    expect(columnNames(elements)).toEqual(["Active", "Resolved"]);
  });

  it("removes a column, drops its cells, and frees its states back into the pool", () => {
    const { store, elements } = setup({ boardColumns: ["Active", "Resolved"] });
    const row = addTypeRow(elements, "Bug");
    commit(stateInput(cellAt(row, 0)), "New");

    clickRole(columnHeaderAt(elements, 0), "column-delete");

    expect(columnNames(elements)).toEqual(["Resolved"]);
    expect(cells(row)).toHaveLength(1);
    expect(store.writeCalls.at(-1)).toEqual({
      boardColumns: ["Resolved"],
      workItemTypes: [{ name: "Bug", color: "CC293D", icon: "https://ado/bug", columns: [] }],
    });
    // "New" is free again: it can be placed in the remaining column.
    commit(stateInput(cellAt(row, 0)), "New");
    expect(chips(cellAt(row, 0))).toEqual(["New"]);
  });
});

describe("WorkItemTypesController — states", () => {
  it("places a state as a chip and persists the mapping", () => {
    const { store, elements } = setup({ boardColumns: ["Active"] });
    const row = addTypeRow(elements, "Bug");

    commit(stateInput(cellAt(row, 0)), "New");

    expect(chips(cellAt(row, 0))).toEqual(["New"]);
    expect(stateInput(cellAt(row, 0)).value).toBe("");
    expect(store.writeCalls.at(-1)).toEqual({
      workItemTypes: [
        {
          name: "Bug",
          color: "CC293D",
          icon: "https://ado/bug",
          columns: [{ column: "Active", states: ["New"] }],
        },
      ],
    });
  });

  it("marks the first placed chip as primary and promotes the next when it is removed", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    const row = addTypeRow(elements, "Bug");
    commit(stateInput(cellAt(row, 0)), "New");
    commit(stateInput(cellAt(row, 0)), "Active");

    expect(primaryChips(cellAt(row, 0))).toEqual(["New"]);

    clickRole(cellAt(row, 0), "state-remove");

    expect(chips(cellAt(row, 0))).toEqual(["Active"]);
    expect(primaryChips(cellAt(row, 0))).toEqual(["Active"]);
  });

  it("rejects a state that is not in the remaining pool", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    const row = addTypeRow(elements, "Bug");

    commit(stateInput(cellAt(row, 0)), "Made Up");

    expect(chips(cellAt(row, 0))).toEqual([]);
  });

  it("prevents the same state landing in two columns", () => {
    const { elements } = setup({ boardColumns: ["Active", "Resolved"] });
    const row = addTypeRow(elements, "Bug");
    commit(stateInput(cellAt(row, 0)), "New");

    commit(stateInput(cellAt(row, 1)), "New");

    expect(chips(cellAt(row, 1))).toEqual([]);
  });

  it("returns a removed state to the pool so it can be reassigned to another column", () => {
    const { elements } = setup({ boardColumns: ["Active", "Resolved"] });
    const row = addTypeRow(elements, "Bug");
    commit(stateInput(cellAt(row, 0)), "New");

    clickRole(cellAt(row, 0), "state-remove");
    commit(stateInput(cellAt(row, 1)), "New");

    expect(chips(cellAt(row, 0))).toEqual([]);
    expect(chips(cellAt(row, 1))).toEqual(["New"]);
  });

  it("reopens the state dropdown after a placed state while the field keeps focus", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    const row = addTypeRow(elements, "Bug");
    const input = stateInput(cellAt(row, 0));
    input.focus();

    commit(input, "New");

    const list = cellAt(row, 0).querySelector<HTMLElement>(".combobox__list")!;
    expect(list.hidden).toBe(false);
  });
});

describe("WorkItemTypesController — add-state field visibility", () => {
  it("shows no add-state field until a type is chosen for the row", () => {
    const { elements } = setup({ boardColumns: ["Active", "Resolved"] });
    elements.addTypeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const row = rowAt(elements, 0);

    for (const cell of cells(row)) {
      expect(stateComboboxRoot(cell).hidden).toBe(true);
    }

    commit(typeInput(row), "Bug");

    for (const cell of cells(row)) {
      expect(stateComboboxRoot(cell).hidden).toBe(false);
    }
  });

  it("hides every add-state field once all of the type's states are mapped", () => {
    const { elements } = setup({ boardColumns: ["Active", "Resolved"] });
    const row = addTypeRow(elements, "Bug");

    commit(stateInput(cellAt(row, 0)), "New");
    commit(stateInput(cellAt(row, 0)), "Active");
    commit(stateInput(cellAt(row, 1)), "Resolved");

    for (const cell of cells(row)) {
      expect(stateComboboxRoot(cell).hidden).toBe(true);
    }
  });
});

describe("WorkItemTypesController — type picker excludes used types", () => {
  it("removes types already committed on another row from the picker", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    addTypeRow(elements, "Bug");
    elements.addTypeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const newRow = rowAt(elements, 1);

    typeInput(newRow).dispatchEvent(new Event("focus"));

    const options = [
      ...newRow.querySelectorAll<HTMLElement>(
        ".wit-row__type-inner .combobox__list .wit-option__name",
      ),
    ].map((name) => name.textContent);
    expect(options).toEqual(["Task"]);
  });

  it("returns a type to the picker once the row using it is removed", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    const bugRow = addTypeRow(elements, "Bug");
    elements.addTypeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const newRow = rowAt(elements, 1);

    clickRole(bugRow, "type-delete");
    typeInput(newRow).dispatchEvent(new Event("focus"));

    const options = [
      ...newRow.querySelectorAll<HTMLElement>(
        ".wit-row__type-inner .combobox__list .wit-option__name",
      ),
    ].map((name) => name.textContent);
    expect(options).toEqual(["Bug", "Task"]);
  });
});

describe("WorkItemTypesController — reordering states", () => {
  it("reorders chips within a column via drag and re-marks the primary", () => {
    const { store, elements } = setup({ boardColumns: ["Active"] });
    const row = addTypeRow(elements, "Bug");
    commit(stateInput(cellAt(row, 0)), "New");
    commit(stateInput(cellAt(row, 0)), "Active");
    commit(stateInput(cellAt(row, 0)), "Resolved");
    expect(chips(cellAt(row, 0))).toEqual(["New", "Active", "Resolved"]);
    expect(primaryChips(cellAt(row, 0))).toEqual(["New"]);

    dragChip(chipEl(cellAt(row, 0), "Resolved"), chipEl(cellAt(row, 0), "New"));

    expect(chips(cellAt(row, 0))).toEqual(["Resolved", "New", "Active"]);
    expect(primaryChips(cellAt(row, 0))).toEqual(["Resolved"]);
    expect(store.writeCalls.at(-1)).toEqual({
      workItemTypes: [
        {
          name: "Bug",
          color: "CC293D",
          icon: "https://ado/bug",
          columns: [{ column: "Active", states: ["Resolved", "New", "Active"] }],
        },
      ],
    });
  });

  it("moves a chip to the end when dropped past the last chip", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    const row = addTypeRow(elements, "Bug");
    commit(stateInput(cellAt(row, 0)), "New");
    commit(stateInput(cellAt(row, 0)), "Active");

    // Dropping onto the cell's add-state field (not a chip) sends the dragged chip to the end.
    const dragged = chipEl(cellAt(row, 0), "New");
    dragged.dispatchEvent(new Event("dragstart", { bubbles: true }));
    stateInput(cellAt(row, 0)).dispatchEvent(new Event("drop", { bubbles: true }));
    dragged.dispatchEvent(new Event("dragend", { bubbles: true }));

    expect(chips(cellAt(row, 0))).toEqual(["Active", "New"]);
    expect(primaryChips(cellAt(row, 0))).toEqual(["Active"]);
  });

  it("does not move a chip between columns", () => {
    const { elements } = setup({ boardColumns: ["Active", "Resolved"] });
    const row = addTypeRow(elements, "Bug");
    commit(stateInput(cellAt(row, 0)), "New");
    commit(stateInput(cellAt(row, 1)), "Active");

    const from = chipEl(cellAt(row, 0), "New");
    from.dispatchEvent(new Event("dragstart", { bubbles: true }));
    // dragover on the other column must not enable the drop, and the drop itself is ignored.
    chipEl(cellAt(row, 1), "Active").dispatchEvent(new Event("dragover", { bubbles: true }));
    chipEl(cellAt(row, 1), "Active").dispatchEvent(new Event("drop", { bubbles: true }));
    from.dispatchEvent(new Event("dragend", { bubbles: true }));

    expect(chips(cellAt(row, 0))).toEqual(["New"]);
    expect(chips(cellAt(row, 1))).toEqual(["Active"]);
  });
});

describe("WorkItemTypesController — removal and persistence", () => {
  it("removes a row, restores the empty notice, and persists the empty list", () => {
    const { store, elements } = setup({ boardColumns: ["Active"] });
    const row = addTypeRow(elements, "Bug");

    clickRole(row, "type-delete");

    expect(rows(elements)).toHaveLength(0);
    expect(elements.empty.hidden).toBe(false);
    expect(store.writeCalls.at(-1)).toEqual({ workItemTypes: [] });
  });

  it("does not persist an uncommitted row and drops empty cells on collect", () => {
    const { store, elements } = setup({ boardColumns: ["Active"] });
    addTypeRow(elements, "Bug");
    // A bare second row is never committed, so it must not appear in the persisted list.
    elements.addTypeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(store.writeCalls.at(-1)).toEqual({
      workItemTypes: [{ name: "Bug", color: "CC293D", icon: "https://ado/bug", columns: [] }],
    });
  });

  it("reports a persistence failure through the error callback", async () => {
    const store = new FakeSettingsStore();
    store.setWriteError(new Error("quota exceeded"));
    const errors: unknown[] = [];
    const elements = makeElements();
    const controller = new WorkItemTypesController(store, elements, (error) => errors.push(error));
    controller.init();
    controller.setAvailableTypes(TYPES);
    controller.render([], ["Active"]);
    controller.enable();

    addTypeRow(elements, "Bug");
    await flush();

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe("quota exceeded");
  });
});

describe("WorkItemTypesController — type picker dropdown", () => {
  it("decorates each option with the type's icon and colored name", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    elements.addTypeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const row = rowAt(elements, 0);

    typeInput(row).dispatchEvent(new Event("focus"));

    const options = [
      ...row.querySelectorAll<HTMLLIElement>(".wit-row__type-inner .combobox__list li"),
    ];
    expect(options.map((li) => li.classList.contains("wit-option"))).toEqual([true, true]);
    expect(options.map((li) => li.querySelector(".wit-option__name")?.textContent)).toEqual([
      "Bug",
      "Task",
    ]);
    // Long type names ellipsize in the narrow list, so each carries a full-name tooltip.
    expect(options.map((li) => li.querySelector<HTMLElement>(".wit-option__name")?.title)).toEqual([
      "Bug",
      "Task",
    ]);
    const bugName = options[0]!.querySelector<HTMLElement>(".wit-option__name")!;
    expect(bugName.style.color).toBe("rgb(204, 41, 61)");
    const taskIcon = options[1]!.querySelector<HTMLImageElement>(".wit-option__icon")!;
    expect(taskIcon.hidden).toBe(true);
  });

  it("removes a dropdown option's icon when it fails to load", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    elements.addTypeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const row = rowAt(elements, 0);
    typeInput(row).dispatchEvent(new Event("focus"));

    const bugOption = row.querySelector<HTMLLIElement>(".wit-row__type-inner .combobox__list li")!;
    bugOption
      .querySelector<HTMLImageElement>(".wit-option__icon")!
      .dispatchEvent(new Event("error"));

    expect(bugOption.querySelector(".wit-option__icon")).toBeNull();
  });

  it("hides the header icon when the selected type's icon fails to load", () => {
    const elements = makeElements();
    const controller = new WorkItemTypesController(new FakeSettingsStore(), elements, () => {});
    controller.render(
      [{ name: "Bug", color: "CC293D", icon: "https://ado/bug", columns: [] }],
      ["Active"],
    );
    const row = rowAt(elements, 0);
    const icon = row.querySelector<HTMLImageElement>(".wit-type__icon")!;
    expect(icon.hidden).toBe(false);

    icon.dispatchEvent(new Event("error"));

    expect(icon.hidden).toBe(true);
  });
});

describe("WorkItemTypesController — disposal", () => {
  it("stops responding to the add buttons after dispose", () => {
    const { elements, controller } = setup({ boardColumns: ["Active"] });
    controller.dispose();

    elements.addTypeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    elements.addColumnButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(rows(elements)).toHaveLength(0);
    expect(columnHeaders(elements)).toHaveLength(1);
  });
});
