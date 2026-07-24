import type { AdoWorkItemType } from "../../common/ado/AdoMetadata";
import {
  MAX_BOARD_COLUMNS,
  type WorkItemColumn,
  type WorkItemType,
} from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";

import { AutocompleteInput } from "./AutocompleteInput";

/** The mapping-table elements, injected so the controller stays DOM-agnostic and testable. */
export interface WorkItemTypesElements {
  /** The table-head `<tr>` the controller fills with the corner cell and one header per column. */
  columnsRow: HTMLElement;
  /** The table body the controller fills with one row per work item type. */
  body: HTMLElement;
  /** Notice shown only while no work-item-type rows exist. */
  empty: HTMLElement;
  /** Button that appends a new, empty work-item-type row. */
  addTypeButton: HTMLButtonElement;
  /** Button that appends a new board column; disabled once the column cap is reached. */
  addColumnButton: HTMLButtonElement;
}

type ReportError = (error: unknown) => void;

/** A board column tracked by the controller: a stable id (so renames never lose cell links) + name. */
interface ColumnModel {
  id: string;
  name: string;
}

const ROLE_ATTRIBUTE = "data-role";
const TYPE_ROLE = "type";
const TYPE_DELETE_ROLE = "type-delete";
const COLUMN_NAME_ROLE = "column-name";
const COLUMN_DELETE_ROLE = "column-delete";
const STATE_ROLE = "state";
const STATE_REMOVE_ROLE = "state-remove";

const ROW_SELECTOR = ".wit-row";
const CELL_SELECTOR = ".wit-cell";
const STATE_SELECTOR = ".wit-state";
const TYPE_INPUT_SELECTOR = `[${ROLE_ATTRIBUTE}="${TYPE_ROLE}"]`;
const STATE_INPUT_SELECTOR = `[${ROLE_ATTRIBUTE}="${STATE_ROLE}"]`;
const COLUMN_ID_ATTRIBUTE = "data-column-id";

const NEW_COLUMN_BASE_NAME = "New state";

/**
 * Drives the "Work item types" mapping table on the Azure DevOps tab.
 *
 * The table's columns are the team's own board columns (their "application states"), shared by every
 * row and user-defined (add / rename / remove, capped at `MAX_BOARD_COLUMNS`). Each row is one work
 * item type; each cell holds the ADO states of that type routed to that column, shown as removable
 * chips where the first chip is the column's *primary* state. A state sits in at most one column per
 * row; any state left unplaced falls back to the first column at runtime.
 *
 * It owns only this section's DOM and its persistence; the parent `AzureDevOpsController` performs
 * the single metadata read and settings load and feeds them in (`render`, `setAvailableTypes`), so
 * the two share one credentialed fetch. Both the store and the available-types metadata are provided
 * by the caller (Dependency Inversion), so this controller is fully testable without a browser.
 */
export class WorkItemTypesController {
  private availableTypes: readonly AdoWorkItemType[] = [];
  private columns: ColumnModel[] = [];
  private nextColumnId = 0;
  private enabled = false;
  // Each row's type input and each cell's state input own a searchable dropdown; keyed by the input
  // so a removed row/cell drops its combobox out with the input (no manual bookkeeping).
  private readonly typeComboboxes = new WeakMap<HTMLInputElement, AutocompleteInput>();
  private readonly stateComboboxes = new WeakMap<HTMLInputElement, AutocompleteInput>();
  // The chip currently being dragged to reorder within its column; null when no drag is active.
  private draggingChip: HTMLElement | null = null;

  constructor(
    private readonly store: ISettingsStore,
    private readonly elements: WorkItemTypesElements,
    private readonly reportError: ReportError,
  ) {
    elements.addTypeButton.disabled = true;
    elements.addColumnButton.disabled = true;
  }

  /** Wire the delegated events; the parent drives data in through `render`/`setAvailableTypes`. */
  init(): void {
    this.elements.addTypeButton.addEventListener("click", this.handleAddType);
    this.elements.addColumnButton.addEventListener("click", this.handleAddColumn);
    // Delegated on the containers so dynamically added rows/columns need no per-node bookkeeping.
    this.elements.body.addEventListener("change", this.handleBodyChange);
    this.elements.body.addEventListener("click", this.handleBodyClick);
    this.elements.body.addEventListener("dragstart", this.handleDragStart);
    this.elements.body.addEventListener("dragover", this.handleDragOver);
    this.elements.body.addEventListener("drop", this.handleDrop);
    this.elements.body.addEventListener("dragend", this.handleDragEnd);
    this.elements.columnsRow.addEventListener("change", this.handleColumnChange);
    this.elements.columnsRow.addEventListener("click", this.handleColumnClick);
  }

  dispose(): void {
    this.disposeComboboxes();
    this.elements.addTypeButton.removeEventListener("click", this.handleAddType);
    this.elements.addColumnButton.removeEventListener("click", this.handleAddColumn);
    this.elements.body.removeEventListener("change", this.handleBodyChange);
    this.elements.body.removeEventListener("click", this.handleBodyClick);
    this.elements.body.removeEventListener("dragstart", this.handleDragStart);
    this.elements.body.removeEventListener("dragover", this.handleDragOver);
    this.elements.body.removeEventListener("drop", this.handleDrop);
    this.elements.body.removeEventListener("dragend", this.handleDragEnd);
    this.elements.columnsRow.removeEventListener("change", this.handleColumnChange);
    this.elements.columnsRow.removeEventListener("click", this.handleColumnClick);
  }

  /** Seed the table header and rows from stored settings. Rows render even without live metadata. */
  render(entries: readonly WorkItemType[], boardColumns: readonly string[]): void {
    this.disposeComboboxes();
    this.columns = boardColumns.map((name) => ({ id: `c${this.nextColumnId++}`, name }));
    this.renderHeader();
    this.elements.body.replaceChildren();
    for (const entry of entries) {
      const row = this.createTypeRow();
      this.elements.body.append(row);
      this.applyType(row, entry.name, entry.color, entry.icon);
      this.fillCellsFromEntry(row, entry.columns);
      this.refreshRow(row);
    }
    this.updateEmpty();
  }

  /** Provide the org/project's work item types; refreshes every row's picker and state pools. */
  setAvailableTypes(types: readonly AdoWorkItemType[]): void {
    this.availableTypes = types;
    for (const row of this.rows()) {
      // A stored row may predate the live metadata; adopt the freshest icon/color ADO now reports.
      const live = this.findType(row.dataset.typeName);
      if (live) {
        this.applyType(row, live.name, live.color, live.icon);
      }
      this.refreshRow(row);
    }
    this.refreshTypeOptions();
  }

  enable(): void {
    this.enabled = true;
    this.elements.addTypeButton.disabled = false;
    this.refreshAddColumn();
  }

  // ── Column-level events ─────────────────────────────────────────────────────

  private readonly handleAddColumn = (): void => {
    if (this.columns.length >= MAX_BOARD_COLUMNS) {
      return;
    }
    const column: ColumnModel = { id: `c${this.nextColumnId++}`, name: this.defaultColumnName() };
    this.columns.push(column);
    this.renderHeader();
    for (const row of this.rows()) {
      row.append(this.createCell(column.id));
      this.refreshRow(row);
    }
    this.persistColumns();
    // Land the user in the new header so they can immediately rename it to the column they use.
    const input = this.columnInput(column.id);
    input?.focus();
    input?.select();
  };

  private readonly handleColumnChange = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.getAttribute(ROLE_ATTRIBUTE) === COLUMN_NAME_ROLE) {
      this.renameColumn(target as HTMLInputElement);
    }
  };

  private readonly handleColumnClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.getAttribute(ROLE_ATTRIBUTE) === COLUMN_DELETE_ROLE) {
      this.deleteColumn(target);
    }
  };

  private renameColumn(input: HTMLInputElement): void {
    const id = input.closest(`[${COLUMN_ID_ATTRIBUTE}]`)?.getAttribute(COLUMN_ID_ATTRIBUTE);
    const column = this.columns.find((candidate) => candidate.id === id);
    if (column === undefined) {
      return;
    }
    const typed = input.value.trim();
    // Reject a blank or duplicate name so every column stays uniquely identifiable; restore the last
    // committed name rather than store junk.
    if (typed === "" || this.isColumnNameUsedElsewhere(column.id, typed)) {
      input.value = column.name;
      return;
    }
    column.name = typed;
    input.value = typed;
    // The stored type mappings embed the column name, so both keys change together.
    this.persistAll();
  }

  private deleteColumn(target: HTMLElement): void {
    const header = target.closest(`[${COLUMN_ID_ATTRIBUTE}]`);
    const id = header?.getAttribute(COLUMN_ID_ATTRIBUTE);
    if (id === null || id === undefined) {
      return;
    }
    this.columns = this.columns.filter((column) => column.id !== id);
    this.renderHeader();
    for (const row of this.rows()) {
      const cell = row.querySelector<HTMLElement>(
        `${CELL_SELECTOR}[${COLUMN_ID_ATTRIBUTE}="${id}"]`,
      );
      if (cell !== null) {
        // Removing a column frees its states back into the pool for the remaining columns.
        this.disposeCell(cell);
        cell.remove();
      }
      this.refreshRow(row);
    }
    this.persistAll();
  }

  // ── Row-level events ────────────────────────────────────────────────────────

  private readonly handleAddType = (): void => {
    const row = this.createTypeRow();
    this.elements.body.append(row);
    this.updateEmpty();
    // No type is chosen yet: hide the per-column add-state fields and offer the picker only the
    // types not already used on another row.
    this.refreshRow(row);
    this.refreshTypeOptions();
    // A brand-new row has no committed type yet; persistence happens once the user picks one.
    this.typeInput(row).focus();
  };

  private readonly handleBodyChange = (event: Event): void => {
    const target = event.target as HTMLElement;
    switch (target.getAttribute(ROLE_ATTRIBUTE)) {
      case TYPE_ROLE:
        this.commitType(target as HTMLInputElement);
        break;
      case STATE_ROLE:
        this.commitState(target as HTMLInputElement);
        break;
      default:
        break;
    }
  };

  private readonly handleBodyClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    switch (target.getAttribute(ROLE_ATTRIBUTE)) {
      case TYPE_DELETE_ROLE:
        this.deleteRow(target);
        break;
      case STATE_REMOVE_ROLE:
        this.removeState(target);
        break;
      default:
        break;
    }
  };

  private commitType(input: HTMLInputElement): void {
    const row = input.closest<HTMLElement>(ROW_SELECTOR);
    if (row === null) {
      return;
    }
    const typed = input.value.trim();
    if (typed === "") {
      this.clearRowType(row);
      this.refreshRow(row);
      this.refreshTypeOptions();
      this.persistTypes();
      return;
    }
    const match = this.findType(typed);
    // Unknown text or a type already used by another row is rejected: restore the last committed
    // value so a type maps to exactly one row and only real ADO types are stored.
    if (match === null || this.isTypeUsedElsewhere(row, match.name)) {
      input.value = row.dataset.typeName ?? "";
      return;
    }
    this.applyType(row, match.name, match.color, match.icon);
    this.refreshRow(row);
    this.refreshTypeOptions();
    this.persistTypes();
  }

  private commitState(input: HTMLInputElement): void {
    const row = input.closest<HTMLElement>(ROW_SELECTOR);
    const cell = input.closest<HTMLElement>(CELL_SELECTOR);
    const typed = input.value.trim();
    input.value = "";
    if (row === null || cell === null || typed === "") {
      return;
    }
    // Only a state from the remaining pool is accepted, so a state can never land in two columns.
    const match = this.rowPool(row).find((state) => state.toLowerCase() === typed.toLowerCase());
    if (match === undefined) {
      return;
    }
    this.insertStateChip(cell, match);
    this.refreshRow(row);
    this.persistTypes();
    // The field keeps focus after a pick, so no `focus` event fires to reveal the remaining states;
    // reopen the list explicitly so the next state is immediately selectable.
    this.stateComboboxes.get(input)?.reopen();
  }

  private deleteRow(target: HTMLElement): void {
    const row = target.closest<HTMLElement>(ROW_SELECTOR);
    if (row !== null) {
      this.disposeRow(row);
      row.remove();
    }
    this.updateEmpty();
    // The removed row's type is free again, so offer it back to the remaining pickers.
    this.refreshTypeOptions();
    this.persistTypes();
  }

  private removeState(target: HTMLElement): void {
    const row = target.closest<HTMLElement>(ROW_SELECTOR);
    const cell = target.closest<HTMLElement>(CELL_SELECTOR);
    target.closest<HTMLElement>(STATE_SELECTOR)?.remove();
    if (cell !== null) {
      this.markPrimary(cell);
    }
    if (row !== null) {
      this.refreshRow(row);
    }
    this.persistTypes();
  }

  // ── State chip reordering (drag & drop) ─────────────────────────────────────

  private readonly handleDragStart = (event: Event): void => {
    const chip = (event.target as HTMLElement).closest<HTMLElement>(STATE_SELECTOR);
    if (chip === null) {
      return;
    }
    this.draggingChip = chip;
    chip.classList.add("wit-state--dragging");
    const transfer = (event as DragEvent).dataTransfer;
    if (transfer) {
      // Some browsers refuse to start a drag unless data is attached; the payload itself is unused.
      transfer.effectAllowed = "move";
      transfer.setData("text/plain", chip.dataset.state ?? "");
    }
  };

  private readonly handleDragOver = (event: Event): void => {
    if (this.draggingChip === null) {
      return;
    }
    const cell = (event.target as HTMLElement).closest<HTMLElement>(CELL_SELECTOR);
    // Allow a drop only inside the column the drag started in, so a state cannot jump columns.
    if (cell !== null && cell === this.draggingChip.closest<HTMLElement>(CELL_SELECTOR)) {
      event.preventDefault();
    }
  };

  private readonly handleDrop = (event: Event): void => {
    const dragged = this.draggingChip;
    if (dragged === null) {
      return;
    }
    const cell = dragged.closest<HTMLElement>(CELL_SELECTOR);
    const target = event.target as HTMLElement;
    const overChip = target.closest<HTMLElement>(STATE_SELECTOR);
    if (
      cell === null ||
      target.closest<HTMLElement>(CELL_SELECTOR) !== cell ||
      overChip === dragged
    ) {
      this.endDrag();
      return;
    }
    event.preventDefault();
    if (overChip === null) {
      // Dropped past the last chip: move it to the end, just before the add-state field.
      const container = this.querySelector<HTMLElement>(cell, ".wit-cell__states");
      container.insertBefore(dragged, this.querySelector(container, ".combobox"));
    } else {
      const order = [...cell.querySelectorAll<HTMLElement>(STATE_SELECTOR)];
      if (order.indexOf(dragged) < order.indexOf(overChip)) {
        overChip.after(dragged);
      } else {
        overChip.before(dragged);
      }
    }
    // The first chip is the column's primary/default, so a reorder can change which one that is.
    this.markPrimary(cell);
    this.persistTypes();
    this.endDrag();
  };

  private readonly handleDragEnd = (): void => {
    this.endDrag();
  };

  private endDrag(): void {
    if (this.draggingChip !== null) {
      this.draggingChip.classList.remove("wit-state--dragging");
      this.draggingChip = null;
    }
  }

  // ── Header construction ─────────────────────────────────────────────────────

  private renderHeader(): void {
    const doc = this.elements.columnsRow.ownerDocument;
    this.elements.columnsRow.replaceChildren();
    const corner = doc.createElement("th");
    corner.className = "wit-corner";
    corner.scope = "col";
    corner.textContent = "Work item type";
    this.elements.columnsRow.append(corner);
    this.columns.forEach((column, index) => {
      this.elements.columnsRow.append(this.createColumnHeader(doc, column, index === 0));
    });
    this.refreshAddColumn();
  }

  private createColumnHeader(doc: Document, column: ColumnModel, isFallback: boolean): HTMLElement {
    const cell = doc.createElement("th");
    cell.scope = "col";
    cell.className = isFallback ? "wit-col wit-col--fallback" : "wit-col";
    cell.setAttribute(COLUMN_ID_ATTRIBUTE, column.id);
    if (isFallback) {
      // The first column doubles as the fallback bucket for any ADO state a type does not map.
      cell.title =
        "States you don't place fall back to this first column (considered not picked up).";
    }
    const input = doc.createElement("input");
    input.type = "text";
    input.className = "wit-col__name";
    input.setAttribute("aria-label", "Board column name");
    input.setAttribute(ROLE_ATTRIBUTE, COLUMN_NAME_ROLE);
    input.value = column.name;
    cell.append(
      input,
      this.createButton(
        doc,
        COLUMN_DELETE_ROLE,
        `Remove ${column.name} column`,
        "×",
        "wit-col__delete",
      ),
    );
    return cell;
  }

  // ── Row construction ────────────────────────────────────────────────────────

  private createTypeRow(): HTMLElement {
    const doc = this.elements.body.ownerDocument;
    const row = doc.createElement("tr");
    row.className = "wit-row";
    row.append(this.createTypeCell(doc));
    for (const column of this.columns) {
      row.append(this.createCell(column.id));
    }
    return row;
  }

  private createTypeCell(doc: Document): HTMLElement {
    const cell = doc.createElement("td");
    cell.className = "wit-row__type";
    const inner = this.createElement(doc, "div", "wit-row__type-inner");
    const icon = doc.createElement("img");
    icon.className = "wit-type__icon";
    icon.width = 18;
    icon.height = 18;
    icon.alt = "";
    icon.hidden = true;
    // An ADO icon URL may not load from the extension origin; degrade to the colored name alone.
    icon.addEventListener("error", () => {
      icon.hidden = true;
    });
    const input = doc.createElement("input");
    input.type = "text";
    input.setAttribute("aria-label", "Work item type");
    input.setAttribute(ROLE_ATTRIBUTE, TYPE_ROLE);
    input.placeholder = "Search work item types…";
    const combobox = new AutocompleteInput(input);
    combobox.enableFloating();
    combobox.setOptions(
      this.availableTypes.map((type) => type.name),
      this.renderTypeOption,
    );
    this.typeComboboxes.set(input, combobox);
    // Once a type is committed the picker is replaced by this read-only label — a chosen type is not
    // re-editable (remove the row to change it) — so only brand-new rows show the searchable input.
    const label = this.createElement(doc, "span", "wit-type__label");
    label.hidden = true;
    inner.append(
      icon,
      combobox.root,
      label,
      this.createButton(
        doc,
        TYPE_DELETE_ROLE,
        "Remove work item type",
        "\u00d7",
        "wit-row__delete",
      ),
    );
    cell.append(inner);
    return cell;
  }

  private createCell(columnId: string): HTMLElement {
    const doc = this.elements.body.ownerDocument;
    const cell = doc.createElement("td");
    cell.className = "wit-cell";
    cell.setAttribute(COLUMN_ID_ATTRIBUTE, columnId);
    const states = this.createElement(doc, "div", "wit-cell__states");
    const input = doc.createElement("input");
    input.type = "text";
    input.setAttribute("aria-label", "Add a state to this column");
    input.setAttribute(ROLE_ATTRIBUTE, STATE_ROLE);
    input.placeholder = "Add state…";
    const combobox = new AutocompleteInput(input);
    combobox.enableFloating();
    this.stateComboboxes.set(input, combobox);
    // The picker field is the last child; chips are inserted before it so the input stays at the end.
    states.append(combobox.root);
    cell.append(states);
    return cell;
  }

  private fillCellsFromEntry(row: HTMLElement, columns: readonly WorkItemColumn[]): void {
    for (const model of this.columns) {
      const stored = columns.find(
        (column) => column.column.toLowerCase() === model.name.toLowerCase(),
      );
      if (stored === undefined) {
        continue;
      }
      const cell = row.querySelector<HTMLElement>(
        `${CELL_SELECTOR}[${COLUMN_ID_ATTRIBUTE}="${model.id}"]`,
      );
      if (cell === null) {
        continue;
      }
      for (const state of stored.states) {
        this.insertStateChip(cell, state);
      }
    }
  }

  private insertStateChip(cell: HTMLElement, state: string): void {
    const doc = cell.ownerDocument;
    const statesContainer = this.querySelector<HTMLElement>(cell, ".wit-cell__states");
    const chip = this.createElement(doc, "span", "wit-state");
    chip.dataset.state = state;
    // Chips are drag-reorderable within their column; the first is the column's primary/default.
    chip.draggable = true;
    const label = this.createElement(doc, "span", "wit-state__label");
    label.textContent = state;
    const remove = this.createButton(
      doc,
      STATE_REMOVE_ROLE,
      `Remove state ${state}`,
      "×",
      "wit-state__remove",
    );
    chip.append(label, remove);
    statesContainer.insertBefore(chip, this.querySelector(statesContainer, ".combobox"));
    this.markPrimary(cell);
  }

  /** Mark only the first chip in a cell as the column's primary (the value written back to ADO). */
  private markPrimary(cell: HTMLElement): void {
    cell.querySelectorAll<HTMLElement>(STATE_SELECTOR).forEach((chip, index) => {
      chip.classList.toggle("wit-state--primary", index === 0);
    });
  }

  private createButton(
    doc: Document,
    role: string,
    ariaLabel: string,
    text: string,
    className: string,
  ): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = className;
    button.setAttribute(ROLE_ATTRIBUTE, role);
    button.setAttribute("aria-label", ariaLabel);
    button.textContent = text;
    return button;
  }

  private createElement(doc: Document, tag: string, className: string): HTMLElement {
    const element = doc.createElement(tag);
    element.className = className;
    return element;
  }

  private readonly renderTypeOption = (value: string, element: HTMLLIElement): void => {
    const doc = element.ownerDocument;
    const type = this.findType(value);
    const icon = doc.createElement("img");
    icon.className = "wit-option__icon";
    icon.width = 16;
    icon.height = 16;
    icon.alt = "";
    if (type?.icon) {
      icon.src = type.icon;
      icon.addEventListener("error", () => icon.remove());
    } else {
      icon.hidden = true;
    }
    const name = this.createElement(doc, "span", "wit-option__name");
    name.textContent = value;
    // The list is only as wide as the input, so long type names ellipsize; the tooltip keeps the
    // full name reachable on hover.
    name.title = value;
    if (type?.color) {
      name.style.color = `#${type.color}`;
    }
    element.classList.add("wit-option");
    element.append(icon, name);
  };

  // ── Type selection state ────────────────────────────────────────────────────

  private applyType(row: HTMLElement, name: string, color: string, icon: string): void {
    row.dataset.typeName = name;
    row.dataset.typeColor = color;
    row.dataset.typeIcon = icon;
    const input = this.typeInput(row);
    input.value = name;
    input.style.color = color ? `#${color}` : "";
    // A committed type shows as a read-only, colored label; the searchable picker is only for
    // choosing a type on a new row.
    const label = this.typeLabel(row);
    label.textContent = name;
    label.style.color = color ? `#${color}` : "";
    label.hidden = false;
    this.typeComboboxRoot(row).hidden = true;
    const image = this.typeIcon(row);
    if (icon) {
      image.src = icon;
      image.hidden = false;
    } else {
      image.removeAttribute("src");
      image.hidden = true;
    }
  }

  private clearRowType(row: HTMLElement): void {
    delete row.dataset.typeName;
    delete row.dataset.typeColor;
    delete row.dataset.typeIcon;
    const input = this.typeInput(row);
    input.value = "";
    input.style.color = "";
    // Return the row to its new-row state: hide the label and restore the searchable picker.
    const label = this.typeLabel(row);
    label.hidden = true;
    label.textContent = "";
    label.style.color = "";
    this.typeComboboxRoot(row).hidden = false;
    const image = this.typeIcon(row);
    image.removeAttribute("src");
    image.hidden = true;
  }

  // ── Pools and persistence ────────────────────────────────────────────────────

  private refreshRow(row: HTMLElement): void {
    const pool = this.rowPool(row);
    for (const input of row.querySelectorAll<HTMLInputElement>(STATE_INPUT_SELECTOR)) {
      const combobox = this.stateComboboxes.get(input);
      combobox?.setOptions(pool);
      // Nothing left to place — no type chosen yet, or every state is already mapped — so hide the
      // add-state field; the cell then shows only its chips.
      if (combobox !== undefined) {
        combobox.root.hidden = pool.length === 0;
      }
    }
  }

  /** Offer each row's type picker only the types not already committed on another row. */
  private refreshTypeOptions(): void {
    for (const row of this.rows()) {
      const used = this.usedTypeNames(row);
      const options = this.availableTypes
        .map((type) => type.name)
        .filter((name) => !used.has(name.toLowerCase()));
      this.typeComboboxes.get(this.typeInput(row))?.setOptions(options, this.renderTypeOption);
    }
  }

  private usedTypeNames(exceptRow: HTMLElement): Set<string> {
    const used = new Set<string>();
    for (const row of this.rows()) {
      const name = row.dataset.typeName;
      if (row !== exceptRow && name !== undefined) {
        used.add(name.toLowerCase());
      }
    }
    return used;
  }

  /** The type's states that are not yet assigned to any column in this row. */
  private rowPool(row: HTMLElement): string[] {
    const assigned = this.assignedStates(row);
    return this.fullStates(row).filter((state) => !assigned.has(state.toLowerCase()));
  }

  private fullStates(row: HTMLElement): readonly string[] {
    return this.findType(row.dataset.typeName)?.states ?? [];
  }

  private assignedStates(row: HTMLElement): Set<string> {
    const assigned = new Set<string>();
    for (const chip of row.querySelectorAll<HTMLElement>(STATE_SELECTOR)) {
      if (chip.dataset.state) {
        assigned.add(chip.dataset.state.toLowerCase());
      }
    }
    return assigned;
  }

  private refreshAddColumn(): void {
    this.elements.addColumnButton.disabled =
      !this.enabled || this.columns.length >= MAX_BOARD_COLUMNS;
  }

  private persistColumns(): void {
    void this.store
      .write({ boardColumns: this.collectColumns() })
      .catch((error: unknown) => this.reportError(error));
  }

  private persistTypes(): void {
    void this.store
      .write({ workItemTypes: this.collect() })
      .catch((error: unknown) => this.reportError(error));
  }

  private persistAll(): void {
    void this.store
      .write({ boardColumns: this.collectColumns(), workItemTypes: this.collect() })
      .catch((error: unknown) => this.reportError(error));
  }

  private collectColumns(): string[] {
    return this.columns.map((column) => column.name).filter((name) => name.length > 0);
  }

  private collect(): WorkItemType[] {
    const result: WorkItemType[] = [];
    const seen = new Set<string>();
    for (const row of this.rows()) {
      const name = row.dataset.typeName;
      if (name === undefined || seen.has(name.toLowerCase())) {
        continue;
      }
      seen.add(name.toLowerCase());
      result.push({
        name,
        color: row.dataset.typeColor ?? "",
        icon: row.dataset.typeIcon ?? "",
        columns: this.collectCells(row),
      });
    }
    return result;
  }

  private collectCells(row: HTMLElement): WorkItemColumn[] {
    const columns: WorkItemColumn[] = [];
    for (const model of this.columns) {
      const cell = row.querySelector<HTMLElement>(
        `${CELL_SELECTOR}[${COLUMN_ID_ATTRIBUTE}="${model.id}"]`,
      );
      if (cell === null) {
        continue;
      }
      const states = [...cell.querySelectorAll<HTMLElement>(STATE_SELECTOR)]
        .map((chip) => chip.dataset.state ?? "")
        .filter((state) => state.length > 0);
      // An empty cell carries no routing information, so it is not persisted.
      if (states.length > 0) {
        columns.push({ column: model.name, states });
      }
    }
    return columns;
  }

  // ── Small helpers ───────────────────────────────────────────────────────────

  private defaultColumnName(): string {
    const used = new Set(this.columns.map((column) => column.name.toLowerCase()));
    if (!used.has(NEW_COLUMN_BASE_NAME.toLowerCase())) {
      return NEW_COLUMN_BASE_NAME;
    }
    let index = 2;
    while (used.has(`${NEW_COLUMN_BASE_NAME} ${index}`.toLowerCase())) {
      index += 1;
    }
    return `${NEW_COLUMN_BASE_NAME} ${index}`;
  }

  private findType(name: string | undefined): AdoWorkItemType | null {
    if (name === undefined) {
      return null;
    }
    return (
      this.availableTypes.find((type) => type.name.toLowerCase() === name.toLowerCase()) ?? null
    );
  }

  private isTypeUsedElsewhere(row: HTMLElement, name: string): boolean {
    return this.rows().some(
      (other) => other !== row && other.dataset.typeName?.toLowerCase() === name.toLowerCase(),
    );
  }

  private isColumnNameUsedElsewhere(id: string, name: string): boolean {
    const key = name.toLowerCase();
    return this.columns.some((column) => column.id !== id && column.name.toLowerCase() === key);
  }

  private rows(): HTMLElement[] {
    return [...this.elements.body.querySelectorAll<HTMLElement>(ROW_SELECTOR)];
  }

  private typeInput(row: HTMLElement): HTMLInputElement {
    return this.querySelector<HTMLInputElement>(row, TYPE_INPUT_SELECTOR);
  }

  private typeIcon(row: HTMLElement): HTMLImageElement {
    return this.querySelector<HTMLImageElement>(row, ".wit-type__icon");
  }

  private typeLabel(row: HTMLElement): HTMLElement {
    return this.querySelector<HTMLElement>(row, ".wit-type__label");
  }

  private typeComboboxRoot(row: HTMLElement): HTMLElement {
    const combobox = this.typeComboboxes.get(this.typeInput(row));
    if (combobox === undefined) {
      // The controller builds every row's picker itself, so a missing combobox signals a bug.
      throw new Error("WorkItemTypesController: expected type combobox is missing");
    }
    return combobox.root;
  }

  private columnInput(id: string): HTMLInputElement | null {
    return this.elements.columnsRow.querySelector<HTMLInputElement>(
      `[${COLUMN_ID_ATTRIBUTE}="${id}"] [${ROLE_ATTRIBUTE}="${COLUMN_NAME_ROLE}"]`,
    );
  }

  private querySelector<T extends Element>(scope: Element, selector: string): T {
    const element = scope.querySelector<T>(selector);
    if (element === null) {
      // The controller builds every row itself, so a missing node signals a construction bug.
      throw new Error(`WorkItemTypesController: expected element "${selector}" is missing`);
    }
    return element;
  }

  private updateEmpty(): void {
    this.elements.empty.hidden = this.elements.body.querySelector(ROW_SELECTOR) !== null;
  }

  private disposeComboboxes(): void {
    for (const input of this.elements.body.querySelectorAll<HTMLInputElement>(
      TYPE_INPUT_SELECTOR,
    )) {
      this.typeComboboxes.get(input)?.dispose();
    }
    for (const input of this.elements.body.querySelectorAll<HTMLInputElement>(
      STATE_INPUT_SELECTOR,
    )) {
      this.stateComboboxes.get(input)?.dispose();
    }
  }

  private disposeRow(row: HTMLElement): void {
    this.typeComboboxes.get(this.typeInput(row))?.dispose();
    for (const input of row.querySelectorAll<HTMLInputElement>(STATE_INPUT_SELECTOR)) {
      this.stateComboboxes.get(input)?.dispose();
    }
  }

  private disposeCell(cell: HTMLElement): void {
    for (const input of cell.querySelectorAll<HTMLInputElement>(STATE_INPUT_SELECTOR)) {
      this.stateComboboxes.get(input)?.dispose();
    }
  }
}
