import { reachesWorkItemType } from "../../common/settings/workItemHierarchy";

import { AutocompleteInput } from "./AutocompleteInput";
import { createTypeLabel, type LabeledType } from "./typeLabel";

/** The hierarchy-section elements, injected so the controller stays DOM-agnostic and testable. */
export interface WorkItemHierarchyElements {
  /** The table body filled with one row per committed work item type, in the table's own order. */
  body: HTMLElement;
  /** Notice shown only while no work item type is committed in the table above. */
  empty: HTMLElement;
}

const ROLE_ATTRIBUTE = "data-role";
const CHILD_ROLE = "child";
const CHILD_REMOVE_ROLE = "child-remove";
const CHILD_ADD_ROLE = "child-add";
const PRIMARY_WORK_ROLE = "primary-work";

const ROW_SELECTOR = ".wit-child-row";
const CHILDREN_SELECTOR = ".wit-child-row__children";
const CHIP_SELECTOR = ".wit-child";
const ADD_SELECTOR = ".wit-chip-add";
const COMBOBOX_SELECTOR = ".combobox";
const CHILD_INPUT_SELECTOR = `[${ROLE_ATTRIBUTE}="${CHILD_ROLE}"]`;

/**
 * The picker entry standing for "this type has no children". It is never stored — an empty child
 * list *is* a leaf — and exists only so an empty row reads as a deliberate choice rather than as
 * something the user forgot to configure.
 */
const LEAF_LABEL = "Leaf Item";

/**
 * Drives the "Work item type hierarchy" section on the Azure DevOps tab.
 *
 * One row per work item type committed in the mapping table above (the rows are that table's rows,
 * in its order), listing the types that may be created underneath it as removable chips. Order is
 * meaningful: the **first** chip is the type a view creates when the user adds a child, so chips are
 * drag-reorderable within their row.
 *
 * The mapping table above is ordered parent-to-child, so a row may only take a type listed *below*
 * it; that alone keeps the configured hierarchy acyclic — views walk it recursively, so a loop would
 * never terminate — and it makes the last row a leaf by construction. A stored or imported link that
 * runs backwards is still refused explicitly, so a re-offer can never resurrect a loop.
 *
 * It owns only this section's DOM and reports every change through `onChange`; it never writes
 * settings itself. The children live on the same `workItemTypes` setting `WorkItemTypesController`
 * already writes, and a single writer keeps the table, the ETA list, and this section in sync.
 */
export class WorkItemHierarchyController {
  private types: readonly LabeledType[] = [];
  // The child list per type, keyed by lowercased type name and held outside the DOM so a re-render
  // driven by the table above can never lose an order the user arranged.
  private readonly childrenByType = new Map<string, string[]>();
  // Only checked values need state; unchecked means either planning context or implementation detail.
  private readonly primaryWorkTypes = new Set<string>();
  // Each row's picker owns a searchable dropdown, keyed by its input so a removed row drops the
  // combobox out with the input (no manual bookkeeping).
  private readonly comboboxes = new WeakMap<HTMLInputElement, AutocompleteInput>();
  // The chip currently being dragged to reorder within its row; null when no drag is active.
  private draggingChip: HTMLElement | null = null;

  constructor(
    private readonly elements: WorkItemHierarchyElements,
    private readonly onChange: () => void,
  ) {}

  /** Wire the delegated events; the owner drives data in through `reset`/`setChildren`/`render`. */
  init(): void {
    for (const [event, handler] of this.bodyListeners()) {
      this.elements.body.addEventListener(event, handler);
    }
  }

  dispose(): void {
    this.disposeComboboxes();
    for (const [event, handler] of this.bodyListeners()) {
      this.elements.body.removeEventListener(event, handler);
    }
  }

  /**
   * The section's listeners, all delegated on the table body so rebuilt rows need no per-node
   * bookkeeping. Listed once so `init` and `dispose` can never drift apart and leak a listener.
   */
  private bodyListeners(): [string, EventListener][] {
    return [
      ["change", this.handleChange],
      ["click", this.handleClick],
      ["focusout", this.handleFocusOut],
      ["dragstart", this.handleDragStart],
      ["dragover", this.handleDragOver],
      ["drop", this.handleDrop],
      ["dragend", this.handleDragEnd],
    ];
  }

  /** Forget every child list; the stored settings are the source of truth on a fresh load. */
  reset(): void {
    this.childrenByType.clear();
    this.primaryWorkTypes.clear();
  }

  /** Seed one type's stored children. Call before `render` while loading settings. */
  setChildren(name: string, children: readonly string[]): void {
    this.childrenByType.set(name.toLowerCase(), [...children]);
  }

  /** Seed whether one stored type represents independently trackable delivery. */
  setPrimaryWork(name: string, isPrimaryWork: boolean): void {
    const key = name.toLowerCase();
    if (isPrimaryWork) {
      this.primaryWorkTypes.add(key);
    } else {
      this.primaryWorkTypes.delete(key);
    }
  }

  /** A type's children in priority order (the first is its default child); empty for a leaf. */
  childrenFor(name: string): string[] {
    return [...(this.childrenByType.get(name.toLowerCase()) ?? [])];
  }

  /** Whether a type is classified as independently trackable primary work. */
  isPrimaryWork(name: string): boolean {
    return this.primaryWorkTypes.has(name.toLowerCase());
  }

  /** Rebuild the section from the committed types, dropping links to types that no longer exist. */
  render(types: readonly LabeledType[]): void {
    this.types = types;
    this.dropUnknownChildren();
    this.dropUnknownPrimaryWork();
    // The root represents the project/program context regardless of imported or previously ordered
    // state, so moving a checked type to the top clears its classification before the owner saves.
    const rootKey = types[0]?.name.toLowerCase();
    if (rootKey !== undefined) {
      this.primaryWorkTypes.delete(rootKey);
    }
    const doc = this.elements.body.ownerDocument;
    this.disposeComboboxes();
    this.elements.body.replaceChildren();
    for (const [index, type] of types.entries()) {
      const row = this.createRow(doc, type, index === 0);
      this.elements.body.append(row);
      this.renderChildren(row);
    }
    this.refreshPickers();
    this.elements.empty.hidden = types.length > 0;
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  private readonly handleChange = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.getAttribute(ROLE_ATTRIBUTE) === CHILD_ROLE) {
      this.commitChild(target as HTMLInputElement);
    } else if (target.getAttribute(ROLE_ATTRIBUTE) === PRIMARY_WORK_ROLE) {
      this.commitPrimaryWork(target as HTMLInputElement);
    }
  };

  private commitPrimaryWork(input: HTMLInputElement): void {
    const row = input.closest<HTMLElement>(ROW_SELECTOR);
    if (row === null || input.disabled) {
      return;
    }
    this.setPrimaryWork(this.keyOf(row), input.checked);
    this.onChange();
  }

  private commitChild(input: HTMLInputElement): void {
    const row = input.closest<HTMLElement>(ROW_SELECTOR);
    const typed = input.value.trim();
    input.value = "";
    if (row === null || typed === "") {
      return;
    }
    const parentKey = this.keyOf(row);
    // "Leaf Item" is not a type: picking it is the user declaring this type has no children, so it
    // empties the list rather than adding anything.
    if (typed.toLowerCase() === LEAF_LABEL.toLowerCase()) {
      this.childrenByType.set(parentKey, []);
      this.applyChange(row);
      return;
    }
    // Only a currently offered type is accepted, so typed text can introduce neither an unknown type
    // nor a cycle.
    const match = this.childOptions(parentKey).find(
      (name) => name.toLowerCase() === typed.toLowerCase(),
    );
    if (match === undefined) {
      return;
    }
    this.children(parentKey).push(match);
    this.applyChange(row);
    // The field keeps focus after a pick, so no `focus` event fires to reveal what is left; reopen
    // the list explicitly so the next child is immediately selectable — unless that was the last
    // type on offer, in which case `applyChange` has already folded the picker away.
    if (row.querySelector<HTMLElement>(COMBOBOX_SELECTOR)?.hidden === false) {
      this.comboboxes.get(input)?.reopen();
    }
  }

  private readonly handleClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    const role = target.getAttribute(ROLE_ATTRIBUTE);
    if (role === CHILD_ADD_ROLE) {
      this.openPicker(target.closest<HTMLElement>(ROW_SELECTOR));
      return;
    }
    if (role !== CHILD_REMOVE_ROLE) {
      return;
    }
    const row = target.closest<HTMLElement>(ROW_SELECTOR);
    const chip = target.closest<HTMLElement>(CHIP_SELECTOR);
    if (row === null || chip === null) {
      return;
    }
    const dropped = (chip.dataset.child ?? "").toLowerCase();
    const parentKey = this.keyOf(row);
    this.childrenByType.set(
      parentKey,
      this.children(parentKey).filter((name) => name.toLowerCase() !== dropped),
    );
    this.applyChange(row);
  };

  /** Collapse the picker back to the "+" as soon as it loses focus, so a row idles as its chips. */
  private readonly handleFocusOut = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.getAttribute(ROLE_ATTRIBUTE) !== CHILD_ROLE) {
      return;
    }
    (target as HTMLInputElement).value = "";
    this.showPicker(target.closest<HTMLElement>(ROW_SELECTOR), false);
  };

  // ── Chip reordering (drag & drop) ───────────────────────────────────────────

  private readonly handleDragStart = (event: Event): void => {
    const chip = (event.target as HTMLElement).closest<HTMLElement>(CHIP_SELECTOR);
    // The "Leaf Item" marker carries no child name and is not a real entry, so it never drags.
    if (chip?.dataset.child === undefined) {
      return;
    }
    this.draggingChip = chip;
    chip.classList.add("wit-child--dragging");
    const transfer = (event as DragEvent).dataTransfer;
    if (transfer) {
      // Some browsers refuse to start a drag unless data is attached; the payload itself is unused.
      transfer.effectAllowed = "move";
      transfer.setData("text/plain", chip.dataset.child);
    }
  };

  private readonly handleDragOver = (event: Event): void => {
    const container = this.dragContainer(event);
    // Allowing the drop only inside the row the drag started in keeps a child list to one parent.
    if (container !== null) {
      event.preventDefault();
    }
  };

  private readonly handleDrop = (event: Event): void => {
    const dragged = this.draggingChip;
    const container = this.dragContainer(event);
    if (dragged === null || container === null) {
      this.endDrag();
      return;
    }
    event.preventDefault();
    const over = (event.target as HTMLElement).closest<HTMLElement>(CHIP_SELECTOR);
    if (over !== dragged) {
      this.reorder(container, dragged, over);
    }
    this.endDrag();
  };

  /** The child list the pointer is over, or null when it is not the dragged chip's own row. */
  private dragContainer(event: Event): HTMLElement | null {
    const dragged = this.draggingChip;
    if (dragged === null) {
      return null;
    }
    const container = (event.target as HTMLElement).closest<HTMLElement>(CHILDREN_SELECTOR);
    return container !== null && container === dragged.closest(CHILDREN_SELECTOR)
      ? container
      : null;
  }

  private reorder(container: HTMLElement, dragged: HTMLElement, over: HTMLElement | null): void {
    if (over === null) {
      // Released past the last chip: park it at the end, just before the add control.
      container.insertBefore(dragged, container.querySelector(ADD_SELECTOR));
    } else {
      const order = [...container.querySelectorAll<HTMLElement>(CHIP_SELECTOR)];
      // Land where the pointer released: after the hovered chip when moving down the list, before it
      // when moving back up.
      const forward = order.indexOf(dragged) < order.indexOf(over);
      container.insertBefore(dragged, forward ? over.nextSibling : over);
    }
    const row = container.closest<HTMLElement>(ROW_SELECTOR);
    if (row === null) {
      return;
    }
    this.childrenByType.set(this.keyOf(row), this.readChips(container));
    // The first chip is the type a view creates by default, so a reorder can change which one that is.
    this.applyChange(row);
  }

  private readonly handleDragEnd = (): void => {
    this.endDrag();
  };

  private endDrag(): void {
    this.draggingChip?.classList.remove("wit-child--dragging");
    this.draggingChip = null;
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  private createRow(doc: Document, type: LabeledType, isRoot: boolean): HTMLElement {
    const row = doc.createElement("tr");
    row.className = "wit-child-row";
    row.dataset.typeName = type.name;
    const parent = doc.createElement("td");
    parent.className = "wit-child-row__parent";
    parent.append(createTypeLabel(doc, type));
    row.append(
      parent,
      this.createPrimaryWorkCell(doc, type.name, isRoot),
      this.createChildrenCell(doc),
    );
    return row;
  }

  private createPrimaryWorkCell(doc: Document, typeName: string, isRoot: boolean): HTMLElement {
    const cell = doc.createElement("td");
    cell.className = "wit-child-row__primary-work";
    const checkbox = doc.createElement("input");
    checkbox.type = "checkbox";
    checkbox.setAttribute(ROLE_ATTRIBUTE, PRIMARY_WORK_ROLE);
    checkbox.setAttribute("aria-label", `Treat ${typeName} as primary work`);
    checkbox.checked = !isRoot && this.isPrimaryWork(typeName);
    checkbox.disabled = isRoot;
    checkbox.title = isRoot
      ? "The root provides planning context and cannot be primary work."
      : "Primary work is independently trackable delivery; leave planning context and implementation details unchecked.";
    cell.append(checkbox);
    return cell;
  }

  private createChildrenCell(doc: Document): HTMLElement {
    const cell = doc.createElement("td");
    cell.className = "wit-child-row__cell";
    const container = doc.createElement("div");
    container.className = "wit-child-row__children";
    const add = doc.createElement("button");
    add.type = "button";
    add.className = "wit-chip-add";
    add.setAttribute(ROLE_ATTRIBUTE, CHILD_ADD_ROLE);
    add.setAttribute("aria-label", "Add a child work item type");
    add.title = "Add a child work item type";
    add.textContent = "+";
    const input = doc.createElement("input");
    input.type = "text";
    input.setAttribute("aria-label", "Add a child work item type");
    input.setAttribute(ROLE_ATTRIBUTE, CHILD_ROLE);
    input.placeholder = "Child type…";
    const combobox = new AutocompleteInput(input);
    // The table scrolls horizontally, so the list must escape that clipping box to stay readable.
    combobox.enableFloating();
    this.comboboxes.set(input, combobox);
    // A row idles as its chips plus the "+"; the picker only unfolds once that button is pressed.
    combobox.root.hidden = true;
    // The add control is the last chip-free element; chips are inserted before it so both the
    // button and the picker it reveals stay at the end of the row.
    container.append(add, combobox.root);
    cell.append(container);
    return cell;
  }

  /** Reveal the row's picker in place of its "+" and open its list by focusing it. */
  private openPicker(row: HTMLElement | null): void {
    this.showPicker(row, true);
    row?.querySelector<HTMLInputElement>(CHILD_INPUT_SELECTOR)?.focus();
  }

  /**
   * Show either the "+" or the open picker — and neither once the row has nothing left to offer,
   * which is what leaves the last type in the order permanently a leaf.
   */
  private showPicker(row: HTMLElement | null, picking: boolean): void {
    if (row === null) {
      return;
    }
    const add = row.querySelector<HTMLElement>(ADD_SELECTOR);
    const combobox = row.querySelector<HTMLElement>(COMBOBOX_SELECTOR);
    if (add === null || combobox === null) {
      return;
    }
    const offered = this.childOptions(this.keyOf(row)).length > 0;
    combobox.hidden = !(picking && offered);
    add.hidden = !offered || !combobox.hidden;
  }

  /** Redraw one row's chips from the stored order, marking the first as the default child. */
  private renderChildren(row: HTMLElement): void {
    const doc = row.ownerDocument;
    const container = row.querySelector<HTMLElement>(CHILDREN_SELECTOR);
    if (container === null) {
      return;
    }
    for (const chip of container.querySelectorAll(CHIP_SELECTOR)) {
      chip.remove();
    }
    const anchor = container.querySelector(ADD_SELECTOR);
    const children = this.children(this.keyOf(row));
    const chips =
      children.length === 0
        ? [this.createLeafChip(doc)]
        : children.map((name, index) => this.createChip(doc, name, index === 0));
    for (const chip of chips) {
      container.insertBefore(chip, anchor);
    }
  }

  private createChip(doc: Document, name: string, isDefault: boolean): HTMLElement {
    const chip = doc.createElement("span");
    chip.className = isDefault ? "wit-child wit-child--default" : "wit-child";
    chip.dataset.child = name;
    // Chips are drag-reorderable; the first is what a view creates when the user adds a child.
    chip.draggable = true;
    if (isDefault) {
      chip.title = "Default child type — created when you add a child in a view.";
    }
    const label = doc.createElement("span");
    label.className = "wit-child__label";
    label.textContent = name;
    const remove = doc.createElement("button");
    remove.type = "button";
    remove.className = "wit-child__remove";
    remove.setAttribute(ROLE_ATTRIBUTE, CHILD_REMOVE_ROLE);
    remove.setAttribute("aria-label", `Remove child type ${name}`);
    remove.textContent = "×";
    chip.append(label, remove);
    return chip;
  }

  /** The UX-only marker shown instead of chips when a type has no children. Never stored. */
  private createLeafChip(doc: Document): HTMLElement {
    const chip = doc.createElement("span");
    chip.className = "wit-child wit-child--leaf";
    chip.title = "This type has no child types. Add one to give it children.";
    chip.textContent = LEAF_LABEL;
    return chip;
  }

  private readonly renderOption = (value: string, element: HTMLLIElement): void => {
    element.textContent = value;
    if (value === LEAF_LABEL) {
      element.classList.add("wit-child-option--leaf");
      element.title = "This type has no children. Picking this clears the list.";
    }
  };

  // ── Options, state, and persistence ─────────────────────────────────────────

  /**
   * Re-offer every picker after a change, because one row's edit changes what the others may take:
   * dropping a link frees types that would previously have closed a loop, and adding one forbids
   * more. Then report the new configuration to the owner so it is persisted.
   */
  private applyChange(row: HTMLElement): void {
    this.renderChildren(row);
    this.refreshPickers();
    this.onChange();
  }

  private refreshPickers(): void {
    for (const row of this.rows()) {
      const input = row.querySelector<HTMLInputElement>(CHILD_INPUT_SELECTOR);
      if (input === null) {
        continue;
      }
      this.comboboxes
        .get(input)
        ?.setOptions([LEAF_LABEL, ...this.childOptions(this.keyOf(row))], this.renderOption);
      // Keep an already-unfolded picker unfolded, but let it collapse the moment its last option
      // is taken — there is then nothing left to pick.
      const combobox = row.querySelector<HTMLElement>(COMBOBOX_SELECTOR);
      this.showPicker(row, combobox !== null && !combobox.hidden);
    }
  }

  /**
   * The types this one may take as a child: only those listed *below* it in the mapping table, minus
   * the ones it already has and the ones it is a sibling of. The table is ordered parent-to-child,
   * so anything at or above this row would run the hierarchy backwards — and restricting the offer
   * to what follows is also what keeps it acyclic, since a recursive walk could never leave a loop.
   * A stored or imported link that already points backwards is refused explicitly, so it can never
   * be re-offered into a loop.
   */
  private childOptions(parentKey: string): string[] {
    const taken = new Set(this.children(parentKey).map((name) => name.toLowerCase()));
    const siblings = this.siblingsOf(parentKey);
    const parentIndex = this.types.findIndex((type) => type.name.toLowerCase() === parentKey);
    if (parentIndex < 0) {
      return [];
    }
    return this.types
      .slice(parentIndex + 1)
      .map((type) => type.name)
      .filter((name) => {
        const key = name.toLowerCase();
        return (
          !taken.has(key) &&
          !siblings.has(key) &&
          !reachesWorkItemType(this.links(), key, parentKey)
        );
      });
  }

  /**
   * The types already listed beside this one under a shared parent. Siblings are the alternatives a
   * parent can hold, so nesting one under another would claim it is both an alternative to and a
   * part of the same thing.
   */
  private siblingsOf(typeKey: string): Set<string> {
    const siblings = new Set<string>();
    for (const children of this.childrenByType.values()) {
      const keys = children.map((name) => name.toLowerCase());
      if (keys.includes(typeKey)) {
        for (const key of keys) {
          siblings.add(key);
        }
      }
    }
    return siblings;
  }

  /** The configured parent→child links, lowercased on both sides for case-insensitive matching. */
  private links(): Map<string, string[]> {
    return new Map(
      [...this.childrenByType].map(([parent, children]) => [
        parent,
        children.map((name) => name.toLowerCase()),
      ]),
    );
  }

  /**
   * Forget links to types the table above no longer holds. A removed type must not leave a dangling
   * reference that would quietly come back to life if the type were added again later.
   */
  private dropUnknownChildren(): void {
    const known = new Set(this.types.map((type) => type.name.toLowerCase()));
    for (const key of [...this.childrenByType.keys()]) {
      if (known.has(key)) {
        this.childrenByType.set(
          key,
          this.children(key).filter((name) => known.has(name.toLowerCase())),
        );
      } else {
        this.childrenByType.delete(key);
      }
    }
  }

  private dropUnknownPrimaryWork(): void {
    const known = new Set(this.types.map((type) => type.name.toLowerCase()));
    for (const key of this.primaryWorkTypes) {
      if (!known.has(key)) {
        this.primaryWorkTypes.delete(key);
      }
    }
  }

  /** The mutable child list for a type, created on first use so callers never juggle `undefined`. */
  private children(key: string): string[] {
    const existing = this.childrenByType.get(key);
    if (existing !== undefined) {
      return existing;
    }
    const created: string[] = [];
    this.childrenByType.set(key, created);
    return created;
  }

  private readChips(container: HTMLElement): string[] {
    return [...container.querySelectorAll<HTMLElement>(CHIP_SELECTOR)]
      .map((chip) => chip.dataset.child ?? "")
      .filter((name) => name.length > 0);
  }

  private keyOf(row: HTMLElement): string {
    return (row.dataset.typeName ?? "").toLowerCase();
  }

  private rows(): HTMLElement[] {
    return [...this.elements.body.querySelectorAll<HTMLElement>(ROW_SELECTOR)];
  }

  private disposeComboboxes(): void {
    for (const input of this.elements.body.querySelectorAll<HTMLInputElement>(
      CHILD_INPUT_SELECTOR,
    )) {
      this.comboboxes.get(input)?.dispose();
    }
  }
}
