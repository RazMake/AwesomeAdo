import type { AdoWorkItemType } from "../../common/ado/AdoMetadata";
import {
  BOARD_COLUMN_MEANINGS,
  DEFAULT_BOARD_COLUMNS,
  type WorkItemColumn,
  type WorkItemType,
} from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";

import { AutocompleteInput } from "./AutocompleteInput";
import {
  WorkItemHierarchyController,
  type WorkItemHierarchyElements,
} from "./WorkItemHierarchyController";
import { createTypeLabel, type LabeledType } from "./typeLabel";

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
  /** Container the controller fills with one ETA-field row per committed type (read-only list). */
  etaBody: HTMLElement;
  /** Notice shown in the ETA section only while no type is committed. */
  etaEmpty: HTMLElement;
  /** The hierarchy section's elements; driven by this controller's committed rows. */
  hierarchy: WorkItemHierarchyElements;
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
const TYPE_DRAG_ROLE = "type-drag";
const COLUMN_NAME_ROLE = "column-name";
const STATE_ROLE = "state";
const STATE_REMOVE_ROLE = "state-remove";
const STATE_ADD_ROLE = "state-add";
const ETA_ROLE = "eta";

const ROW_SELECTOR = ".wit-row";
const CELL_SELECTOR = ".wit-cell";
const STATE_SELECTOR = ".wit-state";
const STATES_SELECTOR = ".wit-cell__states";
const STATE_ADD_SELECTOR = ".wit-chip-add";
const COMBOBOX_SELECTOR = ".combobox";
const ROW_DRAG_SELECTOR = `[${ROLE_ATTRIBUTE}="${TYPE_DRAG_ROLE}"]`;
const TYPE_INPUT_SELECTOR = `[${ROLE_ATTRIBUTE}="${TYPE_ROLE}"]`;
const STATE_INPUT_SELECTOR = `[${ROLE_ATTRIBUTE}="${STATE_ROLE}"]`;
const COLUMN_ID_ATTRIBUTE = "data-column-id";
const TYPE_NAME_ATTRIBUTE = "data-type-name";

// The blank ETA choice: the type has no ETA field until the user picks a date field for it.
const ETA_NONE_LABEL = "— None —";

/**
 * Drives the "Work item types" mapping table on the Azure DevOps tab.
 *
 * The table's columns are the team's own board columns (their "application states"), a fixed,
 * shared set whose titles are user-editable (rename only — columns cannot be added or removed).
 * Each row is one work
 * item type; each cell holds the ADO states of that type routed to that column, shown as removable
 * chips where the first chip is the column's *primary* state. A state sits in at most one column per
 * row; any state left unplaced falls back to the first column at runtime.
 *
 * It owns only this section's DOM and its persistence; the parent `AzureDevOpsController` performs
 * the single metadata read and settings load and feeds them in (`render`, `setAvailableTypes`), so
 * the two share one credentialed fetch. Both the store and the available-types metadata are provided
 * by the caller (Dependency Inversion), so this controller is fully testable without a browser.
 *
 * It also owns two read-only sections driven by this table: the ETA date field per committed type,
 * and the {@link WorkItemHierarchyController} hierarchy (which types can be created under which).
 * Both live here rather than beside the table because both are stored on the same `workItemTypes`
 * setting this controller already writes — a single writer keeps all three in sync and avoids two
 * controllers clobbering each other's slice of the same setting.
 */
export class WorkItemTypesController {
  private availableTypes: readonly AdoWorkItemType[] = [];
  private columns: ColumnModel[] = [];
  private nextColumnId = 0;
  private enabled = false;
  // The chosen ETA date field per committed type, keyed by lowercased type name. Kept here (not in
  // the DOM) so the read-only ETA section can re-render from the current types without losing a
  // pick, and so a stored ETA for a custom/not-yet-loaded field survives until metadata arrives.
  private readonly etaByType = new Map<string, string>();
  // Each row's type input and each cell's state input own a searchable dropdown; keyed by the input
  // so a removed row/cell drops its combobox out with the input (no manual bookkeeping).
  private readonly typeComboboxes = new WeakMap<HTMLInputElement, AutocompleteInput>();
  private readonly stateComboboxes = new WeakMap<HTMLInputElement, AutocompleteInput>();
  // The chip currently being dragged to reorder within its column; null when no drag is active.
  private draggingChip: HTMLElement | null = null;
  // The work-item-type row currently being dragged to reorder the table; null when none is active.
  // Row order encodes the parent→child hierarchy, so reordering is a real settings change.
  private draggingRow: HTMLElement | null = null;
  // The row currently showing the "drop here" insertion line during a row drag; null when none is
  // marked. Tracked so the indicator can be moved and cleared without re-querying every dragover.
  private dropIndicatorRow: HTMLElement | null = null;
  // The hierarchy section is driven by this table's committed rows and stored on the same setting,
  // so it is owned here and reports its edits back through the same persistence path.
  private readonly hierarchy: WorkItemHierarchyController;

  constructor(
    private readonly store: ISettingsStore,
    private readonly elements: WorkItemTypesElements,
    private readonly reportError: ReportError,
  ) {
    elements.addTypeButton.disabled = true;
    this.hierarchy = new WorkItemHierarchyController(elements.hierarchy, () => this.persistTypes());
  }

  /** Wire the delegated events; the parent drives data in through `render`/`setAvailableTypes`. */
  init(): void {
    this.elements.addTypeButton.addEventListener("click", this.handleAddType);
    // Delegated on the containers so dynamically added rows/columns need no per-node bookkeeping.
    this.elements.body.addEventListener("change", this.handleBodyChange);
    this.elements.body.addEventListener("click", this.handleBodyClick);
    this.elements.body.addEventListener("focusout", this.handleBodyFocusOut);
    this.elements.body.addEventListener("dragstart", this.handleDragStart);
    this.elements.body.addEventListener("dragover", this.handleDragOver);
    this.elements.body.addEventListener("drop", this.handleDrop);
    this.elements.body.addEventListener("dragend", this.handleDragEnd);
    this.elements.columnsRow.addEventListener("change", this.handleColumnChange);
    // The ETA section's date-field pickers are delegated the same way its list is rebuilt in place.
    this.elements.etaBody.addEventListener("change", this.handleEtaChange);
    this.hierarchy.init();
  }

  dispose(): void {
    this.disposeComboboxes();
    this.elements.addTypeButton.removeEventListener("click", this.handleAddType);
    this.elements.body.removeEventListener("change", this.handleBodyChange);
    this.elements.body.removeEventListener("click", this.handleBodyClick);
    this.elements.body.removeEventListener("focusout", this.handleBodyFocusOut);
    this.elements.body.removeEventListener("dragstart", this.handleDragStart);
    this.elements.body.removeEventListener("dragover", this.handleDragOver);
    this.elements.body.removeEventListener("drop", this.handleDrop);
    this.elements.body.removeEventListener("dragend", this.handleDragEnd);
    this.elements.columnsRow.removeEventListener("change", this.handleColumnChange);
    this.elements.etaBody.removeEventListener("change", this.handleEtaChange);
    this.hierarchy.dispose();
  }

  /** Seed the table header and rows from stored settings. Rows render even without live metadata. */
  render(entries: readonly WorkItemType[], boardColumns: readonly string[]): void {
    this.disposeComboboxes();
    this.columns = boardColumns.map((name) => ({ id: `c${this.nextColumnId++}`, name }));
    this.renderHeader();
    this.elements.body.replaceChildren();
    // The store is the source of truth for the ETA picks and the hierarchy, so reset both before
    // re-seeding them.
    this.etaByType.clear();
    this.hierarchy.reset();
    for (const entry of entries) {
      const row = this.createTypeRow();
      this.elements.body.append(row);
      this.applyType(row, entry.name, entry.color, entry.icon);
      if (entry.etaField) {
        this.etaByType.set(entry.name.toLowerCase(), entry.etaField);
      }
      if (entry.children) {
        this.hierarchy.setChildren(entry.name, entry.children);
      }
      this.fillCellsFromEntry(row, entry.columns);
      this.refreshRow(row);
    }
    this.updateEmpty();
    this.renderDerivedSections();
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
    // Live metadata carries each type's date fields, so the ETA pickers can only fill in now.
    this.renderDerivedSections();
  }

  enable(): void {
    this.enabled = true;
    this.elements.addTypeButton.disabled = false;
  }

  // ── Column-level events ─────────────────────────────────────────────────────

  private readonly handleColumnChange = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.getAttribute(ROLE_ATTRIBUTE) === COLUMN_NAME_ROLE) {
      this.renameColumn(target as HTMLInputElement);
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
      case STATE_ADD_ROLE:
        this.openStatePicker(target.closest<HTMLElement>(CELL_SELECTOR));
        break;
      default:
        break;
    }
  };

  /** Collapse a state picker back to its "+" as soon as it loses focus. */
  private readonly handleBodyFocusOut = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.getAttribute(ROLE_ATTRIBUTE) !== STATE_ROLE) {
      return;
    }
    (target as HTMLInputElement).value = "";
    this.showStatePicker(target.closest<HTMLElement>(CELL_SELECTOR), false);
  };

  /** Reveal a cell's picker in place of its "+" and open its list by focusing it. */
  private openStatePicker(cell: HTMLElement | null): void {
    this.showStatePicker(cell, true);
    cell?.querySelector<HTMLInputElement>(STATE_INPUT_SELECTOR)?.focus();
  }

  /**
   * Show either the "+" or the open picker — and neither once the row has no unplaced state left,
   * which is also the state a row sits in before its work item type is chosen.
   */
  private showStatePicker(cell: HTMLElement | null, picking: boolean): void {
    const row = cell?.closest<HTMLElement>(ROW_SELECTOR);
    const add = cell?.querySelector<HTMLElement>(STATE_ADD_SELECTOR);
    const combobox = cell?.querySelector<HTMLElement>(COMBOBOX_SELECTOR);
    if (!row || !add || !combobox) {
      return;
    }
    const offered = this.rowPool(row).length > 0;
    combobox.hidden = !(picking && offered);
    add.hidden = !offered || !combobox.hidden;
  }

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
      this.renderDerivedSections();
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
    this.renderDerivedSections();
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
    // reopen the list explicitly so the next state is immediately selectable — unless that was the
    // last unplaced state, in which case `refreshRow` has already folded the picker away.
    if (cell.querySelector<HTMLElement>(COMBOBOX_SELECTOR)?.hidden === false) {
      this.stateComboboxes.get(input)?.reopen();
    }
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
    // The removed type drops out of the read-only ETA list and the hierarchy too.
    this.renderDerivedSections();
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

  // ── Row & state chip reordering (drag & drop) ───────────────────────────────

  private readonly handleDragStart = (event: Event): void => {
    const target = event.target as HTMLElement;
    // A drag started on the row's grip reorders the whole type row; anything else is a chip drag.
    const handle = target.closest<HTMLElement>(ROW_DRAG_SELECTOR);
    if (handle !== null) {
      this.startRowDrag(handle, event as DragEvent);
      return;
    }
    const chip = target.closest<HTMLElement>(STATE_SELECTOR);
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

  private startRowDrag(handle: HTMLElement, event: DragEvent): void {
    const row = handle.closest<HTMLElement>(ROW_SELECTOR);
    if (row === null) {
      return;
    }
    this.draggingRow = row;
    row.classList.add("wit-row--dragging");
    const transfer = event.dataTransfer;
    if (transfer) {
      // Some browsers refuse to start a drag unless data is attached; the payload itself is unused.
      transfer.effectAllowed = "move";
      transfer.setData("text/plain", row.dataset.typeName ?? "");
      // Ghost the whole row (not just the grip) so the user sees which type they are moving.
      if (typeof transfer.setDragImage === "function") {
        transfer.setDragImage(row, 0, 0);
      }
    }
  }

  private readonly handleDragOver = (event: Event): void => {
    if (this.draggingRow !== null) {
      // Any type row is a valid drop target; allowing the drop lets the drop event fire, and the
      // insertion line previews where the row will land.
      const target = (event.target as HTMLElement).closest<HTMLElement>(ROW_SELECTOR);
      if (target !== null) {
        event.preventDefault();
        this.showDropIndicator(target);
      }
      return;
    }
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
    if (this.draggingRow !== null) {
      this.dropRow(event);
      return;
    }
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
      // Dropped past the last chip: move it to the end, just before the add control.
      const container = this.querySelector<HTMLElement>(cell, STATES_SELECTOR);
      container.insertBefore(dragged, this.querySelector(container, STATE_ADD_SELECTOR));
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

  private dropRow(event: Event): void {
    const dragged = this.draggingRow;
    const target = (event.target as HTMLElement).closest<HTMLElement>(ROW_SELECTOR);
    if (dragged === null || target === null || target === dragged) {
      this.endDrag();
      return;
    }
    event.preventDefault();
    const order = this.rows();
    // Insert above or below the hovered row depending on drag direction so the row lands where the
    // pointer released.
    if (order.indexOf(dragged) < order.indexOf(target)) {
      target.after(dragged);
    } else {
      target.before(dragged);
    }
    // The ETA list mirrors the table's order, so re-render it to keep both lists in sync, then
    // persist the new parent→child order.
    this.renderDerivedSections();
    this.persistTypes();
    this.endDrag();
  }

  /**
   * Preview where the dragged row will land by drawing an insertion line on the hovered row: below
   * it when dragging down, above it when dragging up (matching `dropRow`'s before/after choice).
   * Hovering the dragged row itself is a no-op drop, so it clears the indicator.
   */
  private showDropIndicator(target: HTMLElement): void {
    const dragged = this.draggingRow;
    if (dragged === null || target === dragged) {
      this.clearDropIndicator();
      return;
    }
    const order = this.rows();
    const dropClass =
      order.indexOf(dragged) < order.indexOf(target)
        ? "wit-row--drop-after"
        : "wit-row--drop-before";
    if (this.dropIndicatorRow === target && target.classList.contains(dropClass)) {
      return;
    }
    this.clearDropIndicator();
    target.classList.add(dropClass);
    this.dropIndicatorRow = target;
  }

  private clearDropIndicator(): void {
    if (this.dropIndicatorRow !== null) {
      this.dropIndicatorRow.classList.remove("wit-row--drop-before", "wit-row--drop-after");
      this.dropIndicatorRow = null;
    }
  }

  private readonly handleDragEnd = (): void => {
    this.endDrag();
  };

  private endDrag(): void {
    this.clearDropIndicator();
    if (this.draggingChip !== null) {
      this.draggingChip.classList.remove("wit-state--dragging");
      this.draggingChip = null;
    }
    if (this.draggingRow !== null) {
      this.draggingRow.classList.remove("wit-row--dragging");
      this.draggingRow = null;
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
      this.elements.columnsRow.append(this.createColumnHeader(doc, column, index));
    });
  }

  private createColumnHeader(doc: Document, column: ColumnModel, index: number): HTMLElement {
    const cell = doc.createElement("th");
    cell.scope = "col";
    const isFallback = index === 0;
    cell.className = isFallback ? "wit-col wit-col--fallback" : "wit-col";
    cell.setAttribute(COLUMN_ID_ATTRIBUTE, column.id);
    if (isFallback) {
      // The first column doubles as the fallback bucket for any ADO state a type does not map.
      cell.title =
        "States you don't place fall back to this first column (considered not picked up).";
    }
    // The views read a column by its POSITION, never by its title, so each column announces the
    // meaning it carries — otherwise a renamed column gives no hint which behaviour it drives.
    const meaning = BOARD_COLUMN_MEANINGS[index] ?? "";
    const hint = this.createElement(doc, "span", "wit-col__meaning");
    hint.textContent = meaning;
    const input = doc.createElement("input");
    input.type = "text";
    input.className = "wit-col__name";
    input.setAttribute("aria-label", `Board column name — ${meaning}`);
    input.title = meaning;
    input.setAttribute(ROLE_ATTRIBUTE, COLUMN_NAME_ROLE);
    input.value = column.name;
    cell.append(hint, input);
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
    // The icon host is whatever the tenant configured, so do not tell it which page is showing.
    icon.referrerPolicy = "no-referrer";
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
      this.createDragHandle(doc),
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

  /**
   * The grip the user drags to reorder a type row. Row order is meaningful — top-to-bottom is
   * parent → child — so the tooltip states that, and the whole row is `draggable` via this handle.
   */
  private createDragHandle(doc: Document): HTMLElement {
    const handle = this.createElement(doc, "span", "wit-row__drag");
    handle.setAttribute(ROLE_ATTRIBUTE, TYPE_DRAG_ROLE);
    handle.setAttribute("aria-label", "Drag to reorder work item type");
    handle.title = "Drag to reorder — top-to-bottom is parent to child";
    handle.draggable = true;
    // A dotted grip glyph; the accessible name comes from the aria-label above.
    handle.textContent = "\u283F";
    return handle;
  }

  private createCell(columnId: string): HTMLElement {
    const doc = this.elements.body.ownerDocument;
    const cell = doc.createElement("td");
    cell.className = "wit-cell";
    cell.setAttribute(COLUMN_ID_ATTRIBUTE, columnId);
    const states = this.createElement(doc, "div", "wit-cell__states");
    const add = this.createButton(
      doc,
      STATE_ADD_ROLE,
      "Add a state to this column",
      "+",
      "wit-chip-add",
    );
    add.title = "Add a state to this column";
    const input = doc.createElement("input");
    input.type = "text";
    input.setAttribute("aria-label", "Add a state to this column");
    input.setAttribute(ROLE_ATTRIBUTE, STATE_ROLE);
    input.placeholder = "State…";
    const combobox = new AutocompleteInput(input);
    combobox.enableFloating();
    this.stateComboboxes.set(input, combobox);
    // A cell idles as its chips plus the "+"; the picker only unfolds once that button is pressed.
    combobox.root.hidden = true;
    // The add control is the last chip-free element; chips are inserted before it so both the button
    // and the picker it reveals stay at the end of the cell.
    states.append(add, combobox.root);
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
    const statesContainer = this.querySelector<HTMLElement>(cell, STATES_SELECTOR);
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
    statesContainer.insertBefore(chip, this.querySelector(statesContainer, STATE_ADD_SELECTOR));
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
    // The icon host is whatever the tenant configured, so do not tell it which page is showing.
    icon.referrerPolicy = "no-referrer";
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
      this.stateComboboxes.get(input)?.setOptions(pool);
      // Keep an already-unfolded picker unfolded, but let it collapse the moment its last option is
      // taken — and hide the "+" too, since there is then nothing left to place (which is also the
      // state a row sits in before its work item type is chosen).
      const cell = input.closest<HTMLElement>(CELL_SELECTOR);
      this.showStatePicker(
        cell,
        cell?.querySelector<HTMLElement>(COMBOBOX_SELECTOR)?.hidden === false,
      );
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
    // Positional contract: `normalizeBoardColumns` maps stored titles to positions BY INDEX, so this
    // must never change length. Dropping an entry would shift every later column's title one place
    // left and silently rewrite the user's whole board, so a blank falls back to its position's
    // default instead of being filtered out.
    return this.columns.map(
      (column, index) => column.name.trim() || DEFAULT_BOARD_COLUMNS[index] || "",
    );
  }

  private collect(): WorkItemType[] {
    const result: WorkItemType[] = [];
    for (const row of this.committedRows()) {
      const name = row.dataset.typeName ?? "";
      const type: WorkItemType = {
        name,
        color: row.dataset.typeColor ?? "",
        icon: row.dataset.typeIcon ?? "",
        columns: this.collectCells(row),
      };
      // The ETA field is optional and per-type, so persist it only when the user picked one.
      const etaField = this.etaByType.get(name.toLowerCase());
      if (etaField) {
        type.etaField = etaField;
      }
      // A type with no children is a leaf, and a leaf stores nothing.
      const children = this.hierarchy.childrenFor(name);
      if (children.length > 0) {
        type.children = children;
      }
      result.push(type);
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

  // ── Table-driven sections (ETA + hierarchy) ─────────────────────────────────

  /** Re-render both sections the table drives, so all three always show the same set and order. */
  private renderDerivedSections(): void {
    const committed = this.committedTypes();
    this.renderEtaSection(committed);
    this.hierarchy.render(committed);
  }

  /**
   * Rebuild the read-only ETA list: one row per committed type (in table order), each offering that
   * type's date fields. The list is driven by the table, so a type only appears here once committed
   * above, and picking a field just records it — there is nothing to add or remove in this section.
   */
  private renderEtaSection(committed: readonly LabeledType[]): void {
    const doc = this.elements.etaBody.ownerDocument;
    this.elements.etaBody.replaceChildren();
    for (const type of committed) {
      this.elements.etaBody.append(this.createEtaRow(doc, type));
    }
    this.elements.etaEmpty.hidden = committed.length > 0;
  }

  private createEtaRow(doc: Document, type: LabeledType): HTMLElement {
    const row = this.createElement(doc, "div", "wit-eta-row");
    row.append(createTypeLabel(doc, type), this.createEtaSelect(doc, type));
    return row;
  }

  private createEtaSelect(doc: Document, type: LabeledType): HTMLSelectElement {
    const select = doc.createElement("select");
    select.className = "wit-eta-row__field";
    select.setAttribute(ROLE_ATTRIBUTE, ETA_ROLE);
    select.setAttribute(TYPE_NAME_ATTRIBUTE, type.name);
    select.setAttribute("aria-label", `ETA date field for ${type.name}`);
    const stored = this.etaByType.get(type.name.toLowerCase()) ?? "";
    const dateFields = this.findType(type.name)?.dateFields ?? [];
    // No date fields means metadata has not loaded yet; the picker is inert until it does, but any
    // already-stored value is still shown below so it is neither hidden nor silently dropped.
    select.disabled = dateFields.length === 0 && stored === "";
    select.append(this.createEtaOption(doc, "", ETA_NONE_LABEL));
    for (const field of dateFields) {
      select.append(this.createEtaOption(doc, field.referenceName, field.name));
    }
    // Surface a stored value the current metadata does not list (custom field, or not yet loaded) so
    // the user still sees what is saved instead of the select silently resetting to "None".
    if (stored !== "" && !dateFields.some((field) => field.referenceName === stored)) {
      select.append(this.createEtaOption(doc, stored, stored));
    }
    select.value = stored;
    return select;
  }

  private createEtaOption(doc: Document, value: string, label: string): HTMLOptionElement {
    const option = doc.createElement("option");
    option.value = value;
    option.textContent = label;
    return option;
  }

  private readonly handleEtaChange = (event: Event): void => {
    const select = event.target as HTMLElement;
    if (select.getAttribute(ROLE_ATTRIBUTE) !== ETA_ROLE) {
      return;
    }
    const name = select.getAttribute(TYPE_NAME_ATTRIBUTE);
    if (name === null) {
      return;
    }
    const value = (select as HTMLSelectElement).value;
    const key = name.toLowerCase();
    // A blank pick means "no ETA", so drop the entry rather than persist an empty reference name.
    if (value === "") {
      this.etaByType.delete(key);
    } else {
      this.etaByType.set(key, value);
    }
    this.persistTypes();
  };

  /** The committed types in table order, deduped by name (both derived sections mirror the table). */
  private committedTypes(): LabeledType[] {
    return this.committedRows().map((row) => ({
      name: row.dataset.typeName ?? "",
      color: row.dataset.typeColor ?? "",
      icon: row.dataset.typeIcon ?? "",
    }));
  }

  /** Rows whose type is committed, in table order and deduped by name (first row per name wins). */
  private committedRows(): HTMLElement[] {
    const rows: HTMLElement[] = [];
    const seen = new Set<string>();
    for (const row of this.rows()) {
      const name = row.dataset.typeName;
      if (name === undefined || seen.has(name.toLowerCase())) {
        continue;
      }
      seen.add(name.toLowerCase());
      rows.push(row);
    }
    return rows;
  }

  private typeComboboxRoot(row: HTMLElement): HTMLElement {
    const combobox = this.typeComboboxes.get(this.typeInput(row));
    if (combobox === undefined) {
      // The controller builds every row's picker itself, so a missing combobox signals a bug.
      throw new Error("WorkItemTypesController: expected type combobox is missing");
    }
    return combobox.root;
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
