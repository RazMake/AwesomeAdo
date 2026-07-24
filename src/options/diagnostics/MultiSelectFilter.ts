/** How to label a MultiSelectFilter instance. Separated from behaviour so the same control serves any
 *  "choose one or more of many" field, not just the Diagnostics source filter. */
export interface MultiSelectFilterOptions {
  /** Trigger text when every item is selected (nothing is filtered out). */
  allLabel: string;
  /** Plural noun for the summary, e.g. `sources` → "3 of 8 sources". */
  itemNoun: string;
  /** Placeholder shown in the search box. */
  searchPlaceholder: string;
  /** Notice shown inside the panel when the search text matches no item. */
  noMatchesText: string;
  /** Called whenever the selected set changes, so the host can re-apply the filter. */
  onChange: () => void;
}

/** Whether two already-sorted key lists are identical, so the checkbox list is rebuilt only on change. */
function sameItems(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * A searchable multi-select dropdown: a summary trigger that opens a panel of checkboxes with a type
 * to-filter search box and "Select all" / "Clear all" shortcuts.
 *
 * Replaces an inline row of checkboxes, which does not scale once there are many items to choose
 * from. The control owns only its selection UI — it deliberately does not know what an item means or
 * what filtering it does; the host provides the item list, reads which items are hidden, and reacts
 * to `onChange`. Selection is tracked as the set of *unchecked* (hidden) items keyed by value, so a
 * choice survives a re-render and even survives an item disappearing then reappearing as the host's
 * data changes. New items default to selected (shown).
 */
export class MultiSelectFilter {
  private readonly doc: Document;
  private readonly trigger: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly search: HTMLInputElement;
  private readonly selectAllButton: HTMLButtonElement;
  private readonly clearAllButton: HTMLButtonElement;
  private readonly list: HTMLElement;

  private items: string[] = [];
  // Unchecked items, keyed by value so the choice is stable across re-renders and item churn.
  private readonly hidden = new Set<string>();
  private open = false;
  private searchText = "";

  constructor(
    private readonly root: HTMLElement,
    private readonly options: MultiSelectFilterOptions,
  ) {
    this.doc = root.ownerDocument;
    root.classList.add("multiselect");

    this.trigger = this.doc.createElement("button");
    this.trigger.type = "button";
    this.trigger.className = "multiselect__trigger";
    this.trigger.setAttribute("aria-haspopup", "true");
    this.trigger.setAttribute("aria-expanded", "false");

    this.panel = this.doc.createElement("div");
    this.panel.className = "multiselect__panel";
    this.panel.hidden = true;

    this.search = this.doc.createElement("input");
    this.search.type = "search";
    this.search.className = "multiselect__search";
    this.search.placeholder = options.searchPlaceholder;
    this.search.setAttribute("aria-label", options.searchPlaceholder);

    const actions = this.doc.createElement("div");
    actions.className = "multiselect__actions";
    this.selectAllButton = this.actionButton("Select all");
    this.clearAllButton = this.actionButton("Clear all");
    actions.append(this.selectAllButton, this.clearAllButton);

    this.list = this.doc.createElement("div");
    this.list.className = "multiselect__list";
    this.list.setAttribute("role", "group");

    this.panel.append(this.search, actions, this.list);
    root.append(this.trigger, this.panel);

    this.trigger.addEventListener("click", this.handleTriggerClick);
    this.search.addEventListener("input", this.handleSearchInput);
    this.selectAllButton.addEventListener("click", this.handleSelectAll);
    this.clearAllButton.addEventListener("click", this.handleClearAll);
    // Capture so a scroll/click anywhere outside closes the panel even when it starts in a
    // descendant scroll box that would swallow a bubbling listener.
    this.doc.addEventListener("pointerdown", this.handleOutsidePointerDown, true);
    this.doc.addEventListener("keydown", this.handleKeyDown);

    // No items yet: keep the whole control hidden so an empty log shows nothing to filter.
    this.root.hidden = true;
    this.updateTrigger();
  }

  /**
   * Provide the full set of selectable items (the caller sorts them for a stable order). Rebuilds the
   * checkbox list only when the set actually changes, so a steady stream of host updates never
   * disrupts an open panel or the search text; hides the control entirely when the set is empty.
   */
  setItems(items: readonly string[]): void {
    this.root.hidden = items.length === 0;
    const changed = !sameItems(items, this.items);
    this.items = [...items];
    if (changed) {
      this.renderList();
    }
    this.updateTrigger();
  }

  /** Whether an item is currently unchecked, so the host should hide its rows. */
  isHidden(item: string): boolean {
    return this.hidden.has(item);
  }

  dispose(): void {
    this.trigger.removeEventListener("click", this.handleTriggerClick);
    this.search.removeEventListener("input", this.handleSearchInput);
    this.selectAllButton.removeEventListener("click", this.handleSelectAll);
    this.clearAllButton.removeEventListener("click", this.handleClearAll);
    this.doc.removeEventListener("pointerdown", this.handleOutsidePointerDown, true);
    this.doc.removeEventListener("keydown", this.handleKeyDown);
  }

  private actionButton(label: string): HTMLButtonElement {
    const button = this.doc.createElement("button");
    button.type = "button";
    button.className = "multiselect__action";
    button.textContent = label;
    return button;
  }

  private readonly handleTriggerClick = (): void => {
    if (this.open) {
      this.closePanel();
    } else {
      this.openPanel();
    }
  };

  private readonly handleSearchInput = (): void => {
    this.searchText = this.search.value;
    this.renderList();
  };

  private readonly handleSelectAll = (): void => {
    // "Select all" always shows everything, regardless of the current search filter, so it is a
    // predictable reset rather than a filter-scoped action.
    this.hidden.clear();
    this.renderList();
    this.updateTrigger();
    this.options.onChange();
  };

  private readonly handleClearAll = (): void => {
    for (const item of this.items) {
      this.hidden.add(item);
    }
    this.renderList();
    this.updateTrigger();
    this.options.onChange();
  };

  private readonly handleOutsidePointerDown = (event: Event): void => {
    if (this.open && !this.root.contains(event.target as Node)) {
      this.closePanel();
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (this.open && event.key === "Escape") {
      this.closePanel();
      this.trigger.focus();
    }
  };

  private openPanel(): void {
    this.open = true;
    this.panel.hidden = false;
    this.trigger.setAttribute("aria-expanded", "true");
    this.root.classList.add("multiselect--open");
    this.renderList();
    this.search.focus();
  }

  private closePanel(): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.panel.hidden = true;
    this.trigger.setAttribute("aria-expanded", "false");
    this.root.classList.remove("multiselect--open");
  }

  private renderList(): void {
    const query = this.searchText.trim().toLowerCase();
    const matches = this.items.filter((item) => item.toLowerCase().includes(query));
    if (matches.length === 0) {
      const notice = this.doc.createElement("p");
      notice.className = "multiselect__empty";
      notice.textContent = this.options.noMatchesText;
      this.list.replaceChildren(notice);
      return;
    }
    this.list.replaceChildren(...matches.map((item) => this.renderOption(item)));
  }

  private renderOption(item: string): HTMLElement {
    const label = this.doc.createElement("label");
    label.className = "multiselect__option";
    const checkbox = this.doc.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = !this.hidden.has(item);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        this.hidden.delete(item);
      } else {
        this.hidden.add(item);
      }
      this.updateTrigger();
      this.options.onChange();
    });
    const text = this.doc.createElement("span");
    text.className = "multiselect__option-label";
    text.textContent = item;
    label.append(checkbox, text);
    return label;
  }

  private updateTrigger(): void {
    const total = this.items.length;
    const shown = this.items.filter((item) => !this.hidden.has(item)).length;
    this.trigger.textContent =
      shown === total ? this.options.allLabel : `${shown} of ${total} ${this.options.itemNoun}`;
  }
}
