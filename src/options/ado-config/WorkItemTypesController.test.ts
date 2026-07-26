import { afterEach, describe, expect, it } from "vitest";

import type { AdoWorkItemType } from "../../common/ado/AdoMetadata";
import type { StorageObservation } from "../../common/browser/observeSyncKeys";
import {
  DEFAULT_SETTINGS,
  type ExtensionSettings,
  type WorkItemType,
} from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";

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
  {
    name: "Bug",
    color: "CC293D",
    icon: "https://ado/bug",
    states: ["New", "Active", "Resolved"],
    dateFields: [
      { referenceName: "Microsoft.VSTS.Common.ResolvedDate", name: "Resolved Date" },
      { referenceName: "Microsoft.VSTS.Scheduling.TargetDate", name: "Target Date" },
    ],
  },
  {
    name: "Task",
    color: "F2CB1D",
    icon: "",
    states: ["To Do", "Doing", "Done"],
    dateFields: [{ referenceName: "Microsoft.VSTS.Scheduling.FinishDate", name: "Finish Date" }],
  },
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
  const etaBody = document.createElement("div");
  const etaEmpty = document.createElement("p");
  document.body.append(table, empty, addTypeButton, etaBody, etaEmpty);
  return { columnsRow, body, empty, addTypeButton, etaBody, etaEmpty };
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

/** The grip handle a row is dragged by to reorder the work-item-type table. */
function dragHandle(row: HTMLElement): HTMLElement {
  return row.querySelector<HTMLElement>('[data-role="type-drag"]')!;
}

/** Simulate dragging one type row onto another, starting the drag from its grip handle. */
function dragRow(fromRow: HTMLElement, toRow: HTMLElement): void {
  dragHandle(fromRow).dispatchEvent(new Event("dragstart", { bubbles: true }));
  toRow.dispatchEvent(new Event("dragover", { bubbles: true }));
  toRow.dispatchEvent(new Event("drop", { bubbles: true }));
  dragHandle(fromRow).dispatchEvent(new Event("dragend", { bubbles: true }));
}

/** The work-item-type names in the table, top-to-bottom (the persisted parent → child order). */
function rowTypeOrder(elements: WorkItemTypesElements): (string | undefined)[] {
  return rows(elements).map((row) => row.dataset.typeName);
}

/** The type names in the read-only ETA list, top-to-bottom — must mirror the table order. */
function etaTypeOrder(elements: WorkItemTypesElements): (string | null)[] {
  return [...elements.etaBody.querySelectorAll<HTMLSelectElement>('[data-role="eta"]')].map(
    (select) => select.getAttribute("data-type-name"),
  );
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

// ETA-section helpers shared by the ETA field describe. Kept at module scope so that group's
// callback stays under the executable-line ceiling without dropping any assertion.
const etaRows = (elements: WorkItemTypesElements): HTMLElement[] => [
  ...elements.etaBody.querySelectorAll<HTMLElement>(".wit-eta-row"),
];

const etaRowFor = (elements: WorkItemTypesElements, typeName: string): HTMLElement => {
  const select = elements.etaBody.querySelector<HTMLSelectElement>(
    `[data-role="eta"][data-type-name="${typeName}"]`,
  );
  if (select === null) {
    throw new Error(`no ETA row for ${typeName}`);
  }
  return select.closest<HTMLElement>(".wit-eta-row")!;
};

const etaSelect = (row: HTMLElement): HTMLSelectElement =>
  row.querySelector<HTMLSelectElement>('[data-role="eta"]')!;

const etaOptionValues = (select: HTMLSelectElement): string[] =>
  [...select.options].map((option) => option.value);

const bugWithEta: WorkItemType = {
  name: "Bug",
  color: "CC293D",
  icon: "https://ado/bug",
  columns: [],
  etaField: "Microsoft.VSTS.Scheduling.TargetDate",
};

afterEach(() => {
  document.body.innerHTML = "";
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("WorkItemTypesController — enablement", () => {
  it("disables the add-type button until enabled", () => {
    const elements = makeElements();
    const controller = new WorkItemTypesController(new FakeSettingsStore(), elements, () => {});
    expect(elements.addTypeButton.disabled).toBe(true);

    controller.render([], ["Active"]);
    controller.enable();

    expect(elements.addTypeButton.disabled).toBe(false);
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
  it("renders no per-column delete button (columns are a fixed set)", () => {
    const { elements } = setup({ boardColumns: ["Active", "Resolved"] });

    expect(elements.columnsRow.querySelector('[data-role="column-delete"]')).toBeNull();
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

describe("WorkItemTypesController — reordering types (parent → child)", () => {
  it("moves a row above its target via the grip handle and persists the new order", () => {
    const { store, elements } = setup({ boardColumns: ["Active"] });
    const bug = addTypeRow(elements, "Bug");
    const task = addTypeRow(elements, "Task");
    expect(rowTypeOrder(elements)).toEqual(["Bug", "Task"]);

    // Drag Task's grip up onto Bug so Task becomes the parent (top-most) type.
    dragRow(task, bug);

    expect(rowTypeOrder(elements)).toEqual(["Task", "Bug"]);
    expect(store.writeCalls.at(-1)).toEqual({
      workItemTypes: [
        { name: "Task", color: "F2CB1D", icon: "", columns: [] },
        { name: "Bug", color: "CC293D", icon: "https://ado/bug", columns: [] },
      ],
    });
  });

  it("keeps the ETA list in the same order as the table after a reorder", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    const bug = addTypeRow(elements, "Bug");
    const task = addTypeRow(elements, "Task");
    expect(etaTypeOrder(elements)).toEqual(["Bug", "Task"]);

    dragRow(task, bug);

    expect(rowTypeOrder(elements)).toEqual(["Task", "Bug"]);
    expect(etaTypeOrder(elements)).toEqual(["Task", "Bug"]);
  });

  it("ignores a row dropped onto itself and does not persist", () => {
    const { store, elements } = setup({ boardColumns: ["Active"] });
    const bug = addTypeRow(elements, "Bug");
    const writesBefore = store.writeCalls.length;

    dragRow(bug, bug);

    expect(rowTypeOrder(elements)).toEqual(["Bug"]);
    expect(store.writeCalls).toHaveLength(writesBefore);
  });

  it("preserves the stored order across render and mirrors it in the ETA list (import path)", () => {
    // Rendered from settings/import in a deliberate parent → child order; both lists must keep it.
    const { elements } = setup({
      boardColumns: ["Active"],
      entries: [
        { name: "Task", color: "F2CB1D", icon: "", columns: [] },
        { name: "Bug", color: "CC293D", icon: "https://ado/bug", columns: [] },
      ],
    });

    expect(rowTypeOrder(elements)).toEqual(["Task", "Bug"]);
    expect(etaTypeOrder(elements)).toEqual(["Task", "Bug"]);
  });
});

describe("WorkItemTypesController — reordering drop preview", () => {
  it("previews the drop above the hovered row when dragging a row up", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    const bug = addTypeRow(elements, "Bug");
    const task = addTypeRow(elements, "Task");

    dragHandle(task).dispatchEvent(new Event("dragstart", { bubbles: true }));
    bug.dispatchEvent(new Event("dragover", { bubbles: true }));

    // Dragging Task up onto Bug lands Task above Bug, so the line sits above the hovered row.
    expect(bug.classList.contains("wit-row--drop-before")).toBe(true);
    expect(bug.classList.contains("wit-row--drop-after")).toBe(false);
  });

  it("previews the drop below the hovered row when dragging a row down", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    const bug = addTypeRow(elements, "Bug");
    const task = addTypeRow(elements, "Task");

    dragHandle(bug).dispatchEvent(new Event("dragstart", { bubbles: true }));
    task.dispatchEvent(new Event("dragover", { bubbles: true }));

    // Dragging Bug down onto Task lands Bug below Task, so the line sits below the hovered row.
    expect(task.classList.contains("wit-row--drop-after")).toBe(true);
    expect(task.classList.contains("wit-row--drop-before")).toBe(false);
  });

  it("shows no drop line while hovering the row being dragged", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    const bug = addTypeRow(elements, "Bug");
    addTypeRow(elements, "Task");

    dragHandle(bug).dispatchEvent(new Event("dragstart", { bubbles: true }));
    bug.dispatchEvent(new Event("dragover", { bubbles: true }));

    expect(bug.classList.contains("wit-row--drop-before")).toBe(false);
    expect(bug.classList.contains("wit-row--drop-after")).toBe(false);
  });

  it("clears the drop indicator once the drag ends", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    const bug = addTypeRow(elements, "Bug");
    const task = addTypeRow(elements, "Task");

    dragRow(task, bug);

    for (const row of [bug, task]) {
      expect(row.classList.contains("wit-row--drop-before")).toBe(false);
      expect(row.classList.contains("wit-row--drop-after")).toBe(false);
    }
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
  it("stops responding to the add-type button after dispose", () => {
    const { elements, controller } = setup({ boardColumns: ["Active"] });
    controller.dispose();

    elements.addTypeButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(rows(elements)).toHaveLength(0);
  });
});

describe("WorkItemTypesController — ETA field", () => {
  it("lists one ETA row per committed type, offering that type's date fields", () => {
    const { elements } = setup({
      boardColumns: ["Active"],
      entries: [{ name: "Bug", color: "CC293D", icon: "https://ado/bug", columns: [] }],
    });

    expect(etaRows(elements)).toHaveLength(1);
    const select = etaSelect(etaRowFor(elements, "Bug"));
    // A leading blank ("None") plus the type's two date fields, in the metadata's sorted order.
    expect(etaOptionValues(select)).toEqual([
      "",
      "Microsoft.VSTS.Common.ResolvedDate",
      "Microsoft.VSTS.Scheduling.TargetDate",
    ]);
    expect(elements.etaEmpty.hidden).toBe(true);
  });

  it("shows the empty notice and no rows until a type is committed", () => {
    const { elements } = setup({ boardColumns: ["Active"] });
    expect(etaRows(elements)).toHaveLength(0);
    expect(elements.etaEmpty.hidden).toBe(false);

    addTypeRow(elements, "Bug");
    expect(etaRows(elements)).toHaveLength(1);
    expect(elements.etaEmpty.hidden).toBe(true);
  });

  it("preselects the stored ETA date field", () => {
    const { elements } = setup({ boardColumns: ["Active"], entries: [bugWithEta] });
    expect(etaSelect(etaRowFor(elements, "Bug")).value).toBe(
      "Microsoft.VSTS.Scheduling.TargetDate",
    );
  });

  it("persists the chosen ETA date field for its type", () => {
    const { store, elements } = setup({ boardColumns: ["Active"] });
    addTypeRow(elements, "Bug");

    commit(etaSelect(etaRowFor(elements, "Bug")), "Microsoft.VSTS.Scheduling.TargetDate");

    expect(store.writeCalls.at(-1)).toEqual({ workItemTypes: [bugWithEta] });
  });

  it("drops the ETA field from the persisted type when set back to none", () => {
    const { store, elements } = setup({ boardColumns: ["Active"], entries: [bugWithEta] });

    commit(etaSelect(etaRowFor(elements, "Bug")), "");

    expect(store.writeCalls.at(-1)).toEqual({
      workItemTypes: [{ name: "Bug", color: "CC293D", icon: "https://ado/bug", columns: [] }],
    });
  });

  it("removes the type's ETA row when the type is emptied", () => {
    const { elements } = setup({ boardColumns: ["Active"], entries: [bugWithEta] });
    expect(etaRows(elements)).toHaveLength(1);

    commit(typeInput(rowAt(elements, 0)), "");

    expect(etaRows(elements)).toHaveLength(0);
    expect(elements.etaEmpty.hidden).toBe(false);
  });

  it("keeps a stored ETA field selectable even when metadata lists no date fields yet", () => {
    const store = new FakeSettingsStore();
    const elements = makeElements();
    const controller = new WorkItemTypesController(store, elements, () => {});
    controller.init();
    // Render before metadata arrives: the type's date fields are unknown, but the stored ETA must
    // still be shown so it is neither hidden nor silently dropped on the next save.
    controller.render([bugWithEta], ["Active"]);

    const select = etaSelect(etaRowFor(elements, "Bug"));
    expect(select.value).toBe("Microsoft.VSTS.Scheduling.TargetDate");
    expect(etaOptionValues(select)).toEqual(["", "Microsoft.VSTS.Scheduling.TargetDate"]);
  });
});
