let nextComboboxId = 0;

/**
 * A searchable single-line combobox: a text input paired with a filtered suggestion dropdown.
 *
 * Replaces the native `<datalist>`, whose popup renders inconsistently (often as "just a text box"
 * with no visible list) and offers no control over filtering or keyboard behaviour. This component
 * owns only the dropdown UI — it deliberately does not decide what a committed value means. When the
 * user picks a suggestion it writes the value into the input and re-dispatches bubbling `input` and
 * `change` events, so a host controller reacts to the same plain DOM events whether the value was
 * typed or chosen from the list, and the component stays reusable for any field.
 *
 * Matching is "any part": a suggestion shows when the typed text appears anywhere inside it
 * (case-insensitive), so typing a fragment of an area path or team name surfaces it.
 */
export class AutocompleteInput {
  /** The wrapper inserted around the input. Detached inputs give this to their parent to place. */
  readonly root: HTMLElement;

  private readonly listbox: HTMLUListElement;
  private readonly listboxId: string;
  private options: readonly string[] = [];
  private matches: string[] = [];
  private activeIndex = -1;
  private open = false;
  // Selecting a suggestion sets the input value and re-dispatches `input`; this guards that
  // synthetic event from re-triggering the filter (which would reopen the list we just closed).
  private committing = false;

  constructor(private readonly input: HTMLInputElement) {
    const doc = input.ownerDocument;
    const parent = input.parentNode;
    const anchor = input.nextSibling;

    this.root = doc.createElement("div");
    this.root.className = "combobox";

    this.listboxId = input.id ? `${input.id}-listbox` : `combobox-listbox-${nextComboboxId++}`;
    this.listbox = doc.createElement("ul");
    this.listbox.className = "combobox__list";
    this.listbox.id = this.listboxId;
    this.listbox.setAttribute("role", "listbox");
    this.listbox.hidden = true;

    // `append` moves the input out of its current parent into the wrapper; the wrapper then takes
    // the input's original slot so an in-page input keeps its position and label association.
    this.root.append(input, this.listbox);
    if (parent) {
      parent.insertBefore(this.root, anchor);
    }

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", this.listboxId);
    input.setAttribute("aria-expanded", "false");
    // The native form autofill/datalist popup would fight this custom list, so opt out of it.
    input.setAttribute("autocomplete", "off");

    input.addEventListener("input", this.handleInput);
    input.addEventListener("focus", this.handleFocus);
    input.addEventListener("blur", this.handleBlur);
    input.addEventListener("keydown", this.handleKeyDown);
    this.listbox.addEventListener("mousedown", this.handleOptionMouseDown);
    this.listbox.addEventListener("click", this.handleOptionClick);
  }

  /** Replace the suggestion set; refreshes the visible list when it is currently open. */
  setOptions(values: readonly string[]): void {
    this.options = [...values];
    if (this.open) {
      this.refresh();
    }
  }

  dispose(): void {
    this.input.removeEventListener("input", this.handleInput);
    this.input.removeEventListener("focus", this.handleFocus);
    this.input.removeEventListener("blur", this.handleBlur);
    this.input.removeEventListener("keydown", this.handleKeyDown);
    this.listbox.removeEventListener("mousedown", this.handleOptionMouseDown);
    this.listbox.removeEventListener("click", this.handleOptionClick);
  }

  private readonly handleInput = (): void => {
    if (this.committing) {
      return;
    }
    this.refresh();
  };

  private readonly handleFocus = (): void => {
    // Focusing with no text still opens the full list, giving the field an obvious "search" feel.
    this.refresh();
  };

  private readonly handleBlur = (): void => {
    this.close();
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!this.open) {
          this.refresh();
        }
        this.moveActive(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        this.moveActive(-1);
        break;
      case "Enter":
        if (this.open && this.activeIndex >= 0) {
          // Only intercept Enter when a suggestion is highlighted; otherwise let the field's own
          // change handling commit the typed text.
          event.preventDefault();
          this.commit(this.matches[this.activeIndex]);
        }
        break;
      case "Escape":
        this.close();
        break;
      default:
        break;
    }
  };

  private readonly handleOptionMouseDown = (event: MouseEvent): void => {
    // Keep focus on the input so the click that follows fires before a blur can close the list.
    event.preventDefault();
  };

  private readonly handleOptionClick = (event: MouseEvent): void => {
    const option = (event.target as HTMLElement).closest<HTMLElement>("[data-index]");
    if (option === null) {
      return;
    }
    this.commit(this.matches[Number(option.dataset.index)]);
  };

  private refresh(): void {
    const query = this.input.value.trim().toLowerCase();
    this.matches = this.options.filter((option) => option.toLowerCase().includes(query));
    this.activeIndex = -1;
    this.render();
    if (this.matches.length > 0) {
      this.openList();
    } else {
      this.close();
    }
  }

  private moveActive(delta: number): void {
    const count = this.matches.length;
    if (count === 0) {
      return;
    }
    this.activeIndex =
      this.activeIndex === -1
        ? delta > 0
          ? 0
          : count - 1
        : (this.activeIndex + delta + count) % count;
    this.render();
    this.input.setAttribute("aria-activedescendant", this.optionId(this.activeIndex));
  }

  private commit(value: string | undefined): void {
    if (value === undefined) {
      return;
    }
    this.input.value = value;
    this.close();
    // Re-emit the user-style events a real edit would, so the host's input/change handlers run for
    // a picked value exactly as they do for typed text.
    this.committing = true;
    this.input.dispatchEvent(new Event("input", { bubbles: true }));
    this.input.dispatchEvent(new Event("change", { bubbles: true }));
    this.committing = false;
  }

  private render(): void {
    const doc = this.listbox.ownerDocument;
    this.listbox.replaceChildren();
    this.matches.forEach((match, index) => {
      const item = doc.createElement("li");
      item.className = "combobox__option";
      item.id = this.optionId(index);
      item.dataset.index = String(index);
      item.setAttribute("role", "option");
      const active = index === this.activeIndex;
      item.setAttribute("aria-selected", String(active));
      if (active) {
        item.classList.add("combobox__option--active");
      }
      item.textContent = match;
      this.listbox.append(item);
    });
  }

  private openList(): void {
    this.open = true;
    this.listbox.hidden = false;
    this.input.setAttribute("aria-expanded", "true");
  }

  private close(): void {
    if (!this.open) {
      return;
    }
    this.open = false;
    this.activeIndex = -1;
    this.listbox.hidden = true;
    this.input.setAttribute("aria-expanded", "false");
    this.input.removeAttribute("aria-activedescendant");
  }

  private optionId(index: number): string {
    return `${this.listboxId}-option-${index}`;
  }
}
