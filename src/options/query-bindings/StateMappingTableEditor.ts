import type { AdoWorkItemType } from "../../common/ado/AdoMetadata";
import {
  parseStateMapping,
  serializeStateMapping,
  type StateMappingRow,
} from "../../common/view-common/StateMapping";
import type { ViewTypeOption } from "../../common/view-common/ViewType";
import { AutocompleteInput } from "../ado-config/AutocompleteInput";
import { createTypeLabel } from "../ado-config/typeLabel";

/** Where a cell sits: its row index and its status column id. */
interface CellAddress {
  row: number;
  column: string;
}

interface DraggedChip extends CellAddress {
  state: string;
}

/** What the table maps: its fixed status columns and fixed work item type rows. */
export interface StateMappingTableShape {
  columns: readonly ViewTypeOption[];
  rowTypes: readonly string[];
}

/**
 * Edits a `state-mapping` view property as the same table the Azure DevOps tab uses for board
 * columns: one row per work item type the view maps, one column per fixed view status, and each
 * cell holding that type's ADO states as chips. The first chip in a cell is the state written back
 * when the status is picked; chips reorder by drag within their cell, and a state can sit in only
 * one cell of its row.
 *
 * The rows are fixed by the view: the user maps states, never chooses types. Stored rows for any
 * other type are dropped on the next save.
 *
 * The editor is model-driven and repaints from its rows, because its value flows through the binding
 * form (`value` + `onChange`) rather than straight into a settings store.
 */
export class StateMappingTableEditor {
  readonly root: HTMLElement;

  private readonly rows: StateMappingRow[];
  private readonly columns: readonly ViewTypeOption[];
  private types: readonly AdoWorkItemType[] = [];
  private readonly body: HTMLElement;
  private comboboxes: AutocompleteInput[] = [];
  private openPicker: CellAddress | null = null;
  private dragging: DraggedChip | null = null;

  constructor(
    doc: Document,
    stored: string,
    shape: StateMappingTableShape,
    description: string,
    private readonly onChange: () => void,
  ) {
    this.columns = shape.columns;
    const storedRows = parseStateMapping(stored);
    const unclaimed = storedRows.filter(
      (row) => !shape.rowTypes.some((type) => sameName(row.type, type)),
    );
    // A row saved under a type the view no longer lists (its fixed type was renamed) carries over
    // into a fixed row that has none, so changing the row type never silently drops a mapping.
    this.rows = shape.rowTypes.map((type) => ({
      type,
      states: {
        ...(storedRows.find((row) => sameName(row.type, type)) ?? unclaimed.shift())?.states,
      },
    }));
    this.root = element(doc, "div", "work-item-types state-mapping-editor");
    const hint = element(doc, "p", "field__hint");
    hint.textContent = description;
    const wrap = element(doc, "div", "wit-table-wrap");
    const table = element(doc, "table", "wit-table");
    const head = doc.createElement("thead");
    head.append(this.createHeader(doc));
    this.body = doc.createElement("tbody");
    table.append(head, this.body);
    wrap.append(table);
    this.root.append(hint, wrap);
    this.paint();
  }

  get value(): string {
    return serializeStateMapping(this.rows);
  }

  /** Provide the project's work item types, which supply each row's icon, color, and states. */
  setWorkItemTypes(types: readonly AdoWorkItemType[]): void {
    this.types = types;
    this.paint();
  }

  dispose(): void {
    this.disposeComboboxes();
  }

  // ── Model edits ─────────────────────────────────────────────────────────────

  private commitState(address: CellAddress, typed: string): void {
    const row = this.rows[address.row];
    const match = this.pool(address.row).find((state) => sameName(state, typed));
    if (row === undefined || match === undefined) return;
    row.states[address.column] = [...(row.states[address.column] ?? []), match];
    this.openPicker = this.pool(address.row).length > 0 ? address : null;
    this.changed();
    // A pick keeps focus in the field, so reopen the list for the next state explicitly.
    this.focusOpenPicker();
  }

  private removeState(address: CellAddress, state: string): void {
    const row = this.rows[address.row];
    if (row === undefined) return;
    row.states[address.column] = (row.states[address.column] ?? []).filter(
      (candidate) => candidate !== state,
    );
    this.changed();
  }

  private moveState(target: CellAddress, beforeState: string | null): void {
    const dragged = this.dragging;
    this.dragging = null;
    const row = this.rows[target.row];
    if (dragged === null || row === undefined || !sameCell(dragged, target)) return;
    if (dragged.state === beforeState) return;
    const remaining = (row.states[target.column] ?? []).filter((state) => state !== dragged.state);
    const at = beforeState === null ? remaining.length : remaining.indexOf(beforeState);
    remaining.splice(at < 0 ? remaining.length : at, 0, dragged.state);
    row.states[target.column] = remaining;
    this.changed();
  }

  private changed(): void {
    this.paint();
    this.onChange();
  }

  // ── Painting ────────────────────────────────────────────────────────────────

  private createHeader(doc: Document): HTMLElement {
    const header = doc.createElement("tr");
    const corner = element(doc, "th", "wit-corner");
    corner.textContent = "Work item type";
    header.append(corner);
    for (const column of this.columns) {
      const cell = element(doc, "th", "wit-col");
      cell.textContent = column.label;
      header.append(cell);
    }
    return header;
  }

  private paint(): void {
    this.disposeComboboxes();
    this.body.replaceChildren(...this.rows.map((_, index) => this.createRow(index)));
  }

  private createRow(index: number): HTMLElement {
    const doc = this.body.ownerDocument;
    const row = element(doc, "tr", "wit-row");
    row.append(this.createTypeCell(doc, this.rows[index]!.type));
    for (const column of this.columns) {
      row.append(this.createCell(doc, { row: index, column: column.value }));
    }
    return row;
  }

  private createTypeCell(doc: Document, name: string): HTMLElement {
    const cell = element(doc, "td", "wit-row__type");
    const inner = element(doc, "div", "wit-row__type-inner");
    // Until the project's types are read, the name alone still says which type the row maps.
    inner.append(createTypeLabel(doc, this.findType(name) ?? { name, color: "", icon: "" }));
    cell.append(inner);
    return cell;
  }

  private createCell(doc: Document, address: CellAddress): HTMLElement {
    const cell = element(doc, "td", "wit-cell");
    const states = element(doc, "div", "wit-cell__states");
    const placed = this.rows[address.row]?.states[address.column] ?? [];
    placed.forEach((state, position) => {
      states.append(this.createChip(doc, address, state, position === 0));
    });
    const offered = this.pool(address.row).length > 0;
    const picking = offered && this.openPicker !== null && sameCell(this.openPicker, address);
    const add = button(doc, "wit-chip-add", "+", "Add a state to this column");
    add.title = "Add a state to this column";
    add.hidden = !offered || picking;
    const picker = this.createStatePicker(doc, address);
    picker.root.hidden = !picking;
    add.addEventListener("click", () => {
      this.openPicker = address;
      add.hidden = true;
      picker.root.hidden = false;
      picker.root.querySelector("input")?.focus();
    });
    states.append(add, picker.root);
    cell.append(states);
    this.wireDropTarget(cell, address);
    return cell;
  }

  private createStatePicker(doc: Document, address: CellAddress): AutocompleteInput {
    const input = doc.createElement("input");
    input.type = "text";
    input.placeholder = "State…";
    input.setAttribute("aria-label", "Add a state to this column");
    input.dataset.cell = cellKey(address);
    input.addEventListener("change", () => this.commitState(address, input.value));
    const combobox = this.track(new AutocompleteInput(input));
    combobox.setOptions(this.pool(address.row));
    // A picker folds back to its "+" once it loses focus, exactly like the Azure DevOps tab's.
    input.addEventListener("focusout", () => {
      // A repaint detaches the focused field; that is not the user leaving the picker.
      if (!input.isConnected) return;
      if (this.openPicker === null || !sameCell(this.openPicker, address)) return;
      this.openPicker = null;
      input.value = "";
      combobox.root.hidden = true;
      const add = combobox.root.previousElementSibling as HTMLElement | null;
      if (add !== null) add.hidden = this.pool(address.row).length === 0;
    });
    return combobox;
  }

  private createChip(
    doc: Document,
    address: CellAddress,
    state: string,
    primary: boolean,
  ): HTMLElement {
    const chip = element(doc, "span", primary ? "wit-state wit-state--primary" : "wit-state");
    chip.dataset.state = state;
    chip.draggable = true;
    if (primary) chip.title = "Written to Azure DevOps when this status is picked";
    const label = element(doc, "span", "wit-state__label");
    label.textContent = state;
    const remove = button(doc, "wit-state__remove", "×", `Remove state ${state}`);
    remove.addEventListener("click", () => this.removeState(address, state));
    chip.append(label, remove);
    chip.addEventListener("dragstart", (event) => {
      this.dragging = { ...address, state };
      chip.classList.add("wit-state--dragging");
      event.dataTransfer?.setData("text/plain", state);
    });
    chip.addEventListener("dragend", () => {
      this.dragging = null;
      chip.classList.remove("wit-state--dragging");
    });
    return chip;
  }

  /** Chips only reorder inside the cell they came from, so a drop elsewhere is refused. */
  private wireDropTarget(cell: HTMLElement, address: CellAddress): void {
    cell.addEventListener("dragover", (event) => {
      if (this.dragging !== null && sameCell(this.dragging, address)) event.preventDefault();
    });
    cell.addEventListener("drop", (event) => {
      event.preventDefault();
      const over = (event.target as HTMLElement).closest<HTMLElement>(".wit-state");
      this.moveState(address, over?.dataset.state ?? null);
    });
  }

  private focusOpenPicker(): void {
    if (this.openPicker === null) return;
    const key = cellKey(this.openPicker);
    const input = this.body.querySelector<HTMLInputElement>(`input[data-cell="${key}"]`);
    if (input === null) return;
    input.focus();
    this.comboboxes.find((combobox) => combobox.root.contains(input))?.reopen();
  }

  // ── Vocabulary ──────────────────────────────────────────────────────────────

  /** The row type's states not yet placed in any of its cells. */
  private pool(index: number): string[] {
    const row = this.rows[index];
    if (row === undefined) return [];
    const placed = new Set(
      Object.values(row.states)
        .flat()
        .map((state) => state.toLowerCase()),
    );
    const all = this.findType(row.type)?.states ?? [];
    return all.filter((state) => !placed.has(state.toLowerCase()));
  }

  private findType(name: string): AdoWorkItemType | null {
    return this.types.find((type) => sameName(type.name, name)) ?? null;
  }

  private track(combobox: AutocompleteInput): AutocompleteInput {
    combobox.enableFloating();
    this.comboboxes.push(combobox);
    return combobox;
  }

  private disposeComboboxes(): void {
    for (const combobox of this.comboboxes) combobox.dispose();
    this.comboboxes = [];
  }
}

function element(doc: Document, tag: string, className: string): HTMLElement {
  const created = doc.createElement(tag);
  created.className = className;
  return created;
}

function button(doc: Document, className: string, text: string, label: string): HTMLButtonElement {
  const created = doc.createElement("button");
  created.type = "button";
  created.className = className;
  created.textContent = text;
  created.setAttribute("aria-label", label);
  return created;
}

function sameName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function sameCell(left: CellAddress, right: CellAddress): boolean {
  return left.row === right.row && left.column === right.column;
}

function cellKey(address: CellAddress): string {
  return `${address.row}:${address.column}`;
}
