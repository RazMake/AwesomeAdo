import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdoWorkItemType } from "../../common/ado/AdoMetadata";

import { StateMappingTableEditor } from "./StateMappingTableEditor";

const COLUMNS = [
  { value: "new", label: "New" },
  { value: "done", label: "Done" },
];

const TYPES: AdoWorkItemType[] = [
  {
    name: "Bug",
    color: "cc293d",
    icon: "",
    states: ["New", "Active", "Resolved", "Closed"],
    dateFields: [],
  },
  { name: "Task", color: "f2cb1d", icon: "", states: ["To Do", "Done"], dateFields: [] },
];

const SHAPE = { columns: COLUMNS, rowTypes: ["Bug"] };

const BUG_ROW = JSON.stringify([{ type: "Bug", states: { new: ["New"], done: ["Closed"] } }]);

function editor(stored = BUG_ROW, types: AdoWorkItemType[] = TYPES) {
  const onChange = vi.fn();
  const result = new StateMappingTableEditor(document, stored, SHAPE, "Map states.", onChange);
  result.setWorkItemTypes(types);
  document.body.append(result.root);
  return { result, onChange, root: result.root };
}

function pick(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function cell(root: HTMLElement, row: number, column: number): HTMLElement {
  return root.querySelectorAll("tbody tr")[row]!.querySelectorAll<HTMLElement>(".wit-cell")[
    column
  ]!;
}

function chips(target: HTMLElement): string[] {
  return [...target.querySelectorAll<HTMLElement>(".wit-state")].map(
    (chip) => chip.dataset.state ?? "",
  );
}

function stateInput(root: HTMLElement, key: string): HTMLInputElement {
  return root.querySelector<HTMLInputElement>(`input[data-cell="${key}"]`)!;
}

afterEach(() => document.body.replaceChildren());

describe("StateMappingTableEditor layout", () => {
  it("renders the Azure DevOps tab's table with one fixed row and one column per status", () => {
    const { root } = editor();

    expect(root.querySelector(".field__hint")?.textContent).toBe("Map states.");
    expect([...root.querySelectorAll("thead th")].map((th) => th.textContent)).toEqual([
      "Work item type",
      "New",
      "Done",
    ]);
    expect(root.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(root.querySelector(".wit-row__type")?.textContent).toContain("Bug");
    expect(chips(cell(root, 0, 0))).toEqual(["New"]);
    expect(cell(root, 0, 0).querySelector(".wit-state")?.className).toContain("wit-state--primary");
  });

  it("offers no way to add, remove, or change the row's type", () => {
    const { root } = editor();

    expect(root.querySelector(".wit-actions")).toBeNull();
    expect(root.querySelector(".wit-row__delete")).toBeNull();
    expect(root.querySelector(".wit-row__type input")).toBeNull();
  });

  it("keeps the fixed row's stored states and drops rows for other types", () => {
    const stored = JSON.stringify([
      { type: "Task", states: { new: ["To Do"] } },
      { type: "bug", states: { done: ["Closed"] } },
    ]);
    const { result } = editor(stored);

    expect(result.value).toBe('[{"type":"Bug","states":{"done":["Closed"]}}]');
  });

  it("carries a row saved under a no-longer-listed type into a fixed row without its own", () => {
    const stored = JSON.stringify([{ type: "Task", states: { new: ["New"], done: ["Closed"] } }]);
    const { root, result } = editor(stored);

    expect(chips(cell(root, 0, 1))).toEqual(["Closed"]);
    expect(result.value).toBe('[{"type":"Bug","states":{"new":["New"],"done":["Closed"]}}]');
  });

  it("shows the type by name, without states to offer, before the project's types are read", () => {
    const { root, result } = editor("", []);

    expect(root.querySelector(".wit-row__type")?.textContent).toContain("Bug");
    expect(cell(root, 0, 0).querySelector<HTMLElement>(".wit-chip-add")!.hidden).toBe(true);
    expect(result.value).toBe("");
  });
});
describe("StateMappingTableEditor state chips", () => {
  it("places a picked state, keeps the picker open, and never offers it again", () => {
    const { root, result, onChange } = editor();
    cell(root, 0, 0).querySelector<HTMLButtonElement>(".wit-chip-add")!.click();

    pick(stateInput(root, "0:new"), "active");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(chips(cell(root, 0, 0))).toEqual(["New", "Active"]);
    expect(document.activeElement).toBe(stateInput(root, "0:new"));

    pick(stateInput(root, "0:new"), "Resolved");
    // Every Bug state is placed now, so the picker closes and no cell offers "+" any more.
    expect(stateInput(root, "0:new").closest<HTMLElement>(".combobox")!.hidden).toBe(true);
    expect(
      [...root.querySelectorAll<HTMLElement>(".wit-chip-add")].every((add) => add.hidden),
    ).toBe(true);
    expect(JSON.parse(result.value)).toEqual([
      { type: "Bug", states: { new: ["New", "Active", "Resolved"], done: ["Closed"] } },
    ]);

    pick(stateInput(root, "0:new"), "Unknown");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("folds the picker back to its + when focus leaves it", () => {
    const { root } = editor();
    const add = cell(root, 0, 1).querySelector<HTMLButtonElement>(".wit-chip-add")!;
    add.click();
    const input = stateInput(root, "0:done");
    input.value = "Act";

    input.dispatchEvent(new FocusEvent("focusout"));

    expect(input.value).toBe("");
    expect(input.closest<HTMLElement>(".combobox")!.hidden).toBe(true);
    expect(add.hidden).toBe(false);
  });

  it("removes a chip", () => {
    const { root, result } = editor();

    cell(root, 0, 1).querySelector<HTMLButtonElement>(".wit-state__remove")!.click();

    expect(result.value).toBe('[{"type":"Bug","states":{"new":["New"]}}]');
  });
});

describe("StateMappingTableEditor drag reorder", () => {
  const STORED = JSON.stringify([{ type: "Bug", states: { new: ["New", "Active", "Closed"] } }]);

  function drag(root: HTMLElement, state: string): void {
    root.querySelector(`.wit-state[data-state="${state}"]`)!.dispatchEvent(new Event("dragstart"));
  }

  it("moves a chip before the chip it is dropped on, or to the end", () => {
    const { root, onChange } = editor(STORED);

    drag(root, "Closed");
    const over = new Event("dragover", { cancelable: true });
    cell(root, 0, 0).dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    root
      .querySelector(`.wit-state[data-state="New"] .wit-state__label`)!
      .dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    expect(chips(cell(root, 0, 0))).toEqual(["Closed", "New", "Active"]);

    drag(root, "Closed");
    cell(root, 0, 0).dispatchEvent(new Event("drop", { cancelable: true }));
    expect(chips(cell(root, 0, 0))).toEqual(["New", "Active", "Closed"]);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("refuses drops in another cell and ignores dropping a chip on itself", () => {
    const { root, onChange } = editor(STORED);

    drag(root, "New");
    const over = new Event("dragover", { cancelable: true });
    cell(root, 0, 1).dispatchEvent(over);
    expect(over.defaultPrevented).toBe(false);
    cell(root, 0, 1).dispatchEvent(new Event("drop", { cancelable: true }));

    drag(root, "New");
    root
      .querySelector(`.wit-state[data-state="New"]`)!
      .dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    root.querySelector(`.wit-state[data-state="New"]`)!.dispatchEvent(new Event("dragend"));

    expect(chips(cell(root, 0, 0))).toEqual(["New", "Active", "Closed"]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disposes its pickers", () => {
    const { root, result } = editor();

    result.dispose();

    expect(root.querySelectorAll("tbody tr")).toHaveLength(1);
  });
});
