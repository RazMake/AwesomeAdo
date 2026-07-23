import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AutocompleteInput } from "./AutocompleteInput";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeInput(id?: string): HTMLInputElement {
  const field = document.createElement("div");
  const input = document.createElement("input");
  input.type = "text";
  if (id !== undefined) {
    input.id = id;
  }
  const hint = document.createElement("p");
  field.append(input, hint);
  document.body.append(field);
  return input;
}

function fire(target: EventTarget, type: string): void {
  target.dispatchEvent(new Event(type, { bubbles: true }));
}

function key(input: HTMLInputElement, name: string): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  input.dispatchEvent(event);
  return event;
}

function listbox(input: HTMLInputElement): HTMLUListElement {
  const list = input.parentElement?.querySelector<HTMLUListElement>(".combobox__list");
  if (!list) {
    throw new Error("combobox listbox not found");
  }
  return list;
}

function optionValues(input: HTMLInputElement): string[] {
  return [...listbox(input).querySelectorAll("li")].map((li) => li.textContent ?? "");
}

afterEach(() => {
  document.body.innerHTML = "";
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("AutocompleteInput — structure", () => {
  it("wraps the input in place and keeps its position and label wiring", () => {
    const input = makeInput("team");
    const field = input.parentElement!;
    new AutocompleteInput(input);
    const wrapper = field.querySelector(".combobox");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.contains(input)).toBe(true);
    // The wrapper takes the input's original slot: it stays the first child, hint stays after it.
    expect(field.firstElementChild).toBe(wrapper);
    expect(input.id).toBe("team");
  });

  it("sets combobox ARIA on the input and points it at the listbox", () => {
    const input = makeInput("team");
    new AutocompleteInput(input);
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-autocomplete")).toBe("list");
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.getAttribute("aria-controls")).toBe("team-listbox");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(listbox(input).id).toBe("team-listbox");
    expect(listbox(input).hidden).toBe(true);
  });

  it("generates a unique listbox id when the input has none", () => {
    const first = makeInput();
    const second = makeInput();
    new AutocompleteInput(first);
    new AutocompleteInput(second);
    expect(listbox(first).id).not.toBe("");
    expect(listbox(second).id).not.toBe(listbox(first).id);
  });

  it("exposes the wrapper as `root` for a detached input", () => {
    const input = document.createElement("input");
    const combobox = new AutocompleteInput(input);
    expect(combobox.root.contains(input)).toBe(true);
    expect(combobox.root.classList.contains("combobox")).toBe(true);
  });
});

describe("AutocompleteInput — filtering", () => {
  let input: HTMLInputElement;
  let combobox: AutocompleteInput;

  beforeEach(() => {
    input = makeInput("team");
    combobox = new AutocompleteInput(input);
    combobox.setOptions(["Alpha", "Beta", "Gamma team"]);
  });

  it("opens the full list on focus with an empty query", () => {
    fire(input, "focus");
    expect(listbox(input).hidden).toBe(false);
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(optionValues(input)).toEqual(["Alpha", "Beta", "Gamma team"]);
  });

  it("matches any part of an option, case-insensitively", () => {
    input.value = "team";
    fire(input, "input");
    expect(optionValues(input)).toEqual(["Gamma team"]);
  });

  it("closes the list when nothing matches", () => {
    input.value = "zzz";
    fire(input, "input");
    expect(listbox(input).hidden).toBe(true);
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("refreshes the open list when options change", () => {
    fire(input, "focus");
    combobox.setOptions(["Delta"]);
    expect(optionValues(input)).toEqual(["Delta"]);
  });

  it("leaves a closed list closed when options change", () => {
    combobox.setOptions(["Delta"]);
    expect(listbox(input).hidden).toBe(true);
  });
});

describe("AutocompleteInput — keyboard", () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    input = makeInput("team");
    const combobox = new AutocompleteInput(input);
    combobox.setOptions(["Alpha", "Beta", "Gamma"]);
  });

  it("opens and highlights the first option on ArrowDown", () => {
    key(input, "ArrowDown");
    expect(listbox(input).hidden).toBe(false);
    const active = listbox(input).querySelector(".combobox__option--active");
    expect(active?.textContent).toBe("Alpha");
    expect(input.getAttribute("aria-activedescendant")).toBe("team-listbox-option-0");
  });

  it("wraps highlight from the last option back to the first", () => {
    fire(input, "focus");
    key(input, "ArrowUp"); // from none -> last
    expect(listbox(input).querySelector(".combobox__option--active")?.textContent).toBe("Gamma");
    key(input, "ArrowDown"); // last -> first (wrap)
    expect(listbox(input).querySelector(".combobox__option--active")?.textContent).toBe("Alpha");
  });

  it("commits the highlighted option on Enter and re-emits change", () => {
    const changes: string[] = [];
    input.addEventListener("change", () => changes.push(input.value));
    key(input, "ArrowDown");
    const event = key(input, "Enter");
    expect(event.defaultPrevented).toBe(true);
    expect(input.value).toBe("Alpha");
    expect(changes).toEqual(["Alpha"]);
    expect(listbox(input).hidden).toBe(true);
  });

  it("does not intercept Enter when no option is highlighted", () => {
    fire(input, "focus");
    const event = key(input, "Enter");
    expect(event.defaultPrevented).toBe(false);
  });

  it("closes the list on Escape", () => {
    fire(input, "focus");
    key(input, "Escape");
    expect(listbox(input).hidden).toBe(true);
  });

  it("ignores unrelated keys", () => {
    fire(input, "focus");
    const event = key(input, "a");
    expect(event.defaultPrevented).toBe(false);
    expect(listbox(input).hidden).toBe(false);
  });
});

describe("AutocompleteInput — selection", () => {
  let input: HTMLInputElement;

  beforeEach(() => {
    input = makeInput("team");
    const combobox = new AutocompleteInput(input);
    combobox.setOptions(["Alpha", "Beta"]);
  });

  it("commits the clicked option and re-emits input and change once", () => {
    const events: string[] = [];
    input.addEventListener("input", () => events.push(`input:${input.value}`));
    input.addEventListener("change", () => events.push(`change:${input.value}`));
    fire(input, "focus");
    const option = listbox(input).querySelectorAll("li")[1]!;
    option.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(input.value).toBe("Beta");
    // The synthetic input event must not re-open the list it just closed.
    expect(listbox(input).hidden).toBe(true);
    expect(events).toEqual(["input:Beta", "change:Beta"]);
  });

  it("prevents default on option mousedown so focus is not lost before the click", () => {
    fire(input, "focus");
    const option = listbox(input).querySelector("li")!;
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    option.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores clicks that miss an option", () => {
    fire(input, "focus");
    const before = input.value;
    listbox(input).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(input.value).toBe(before);
  });
});

describe("AutocompleteInput — blur and disposal", () => {
  it("closes the list on blur", () => {
    const input = makeInput("team");
    const combobox = new AutocompleteInput(input);
    combobox.setOptions(["Alpha"]);
    fire(input, "focus");
    expect(listbox(input).hidden).toBe(false);
    fire(input, "blur");
    expect(listbox(input).hidden).toBe(true);
  });

  it("stops responding to events after dispose", () => {
    const input = makeInput("team");
    const combobox = new AutocompleteInput(input);
    combobox.setOptions(["Alpha"]);
    combobox.dispose();
    fire(input, "focus");
    expect(listbox(input).hidden).toBe(true);
  });
});
