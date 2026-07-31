import { afterEach, describe, expect, it } from "vitest";

import {
  WorkItemHierarchyController,
  type WorkItemHierarchyElements,
} from "./WorkItemHierarchyController";
import type { LabeledType } from "./typeLabel";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const EPIC: LabeledType = { name: "Epic", color: "FF7B00", icon: "https://ado/epic" };
const FEATURE: LabeledType = { name: "Feature", color: "773B93", icon: "" };
const STORY: LabeledType = { name: "User Story", color: "009CCC", icon: "" };
const TASK: LabeledType = { name: "Task", color: "F2CB1D", icon: "" };

const TREE: LabeledType[] = [EPIC, FEATURE, STORY, TASK];

interface Harness {
  elements: WorkItemHierarchyElements;
  controller: WorkItemHierarchyController;
  /** How many times the controller reported a change to its owner. */
  changes: () => number;
}

function makeElements(): WorkItemHierarchyElements {
  const table = document.createElement("table");
  const body = document.createElement("tbody");
  table.append(body);
  const empty = document.createElement("p");
  document.body.append(table, empty);
  return { body, empty };
}

/** Wire a controller and render the given types; `seed` pre-loads stored children per type. */
function setup(options?: {
  types?: readonly LabeledType[];
  seed?: Readonly<Record<string, readonly string[]>>;
  primaryWork?: readonly string[];
}): Harness {
  const elements = makeElements();
  let changes = 0;
  const controller = new WorkItemHierarchyController(elements, () => {
    changes += 1;
  });
  controller.init();
  for (const [name, children] of Object.entries(options?.seed ?? {})) {
    controller.setChildren(name, children);
  }
  for (const name of options?.primaryWork ?? []) {
    controller.setPrimaryWork(name, true);
  }
  controller.render(options?.types ?? TREE);
  return { elements, controller, changes: () => changes };
}

function rows(elements: WorkItemHierarchyElements): HTMLElement[] {
  return [...elements.body.querySelectorAll<HTMLElement>(".wit-child-row")];
}

function rowFor(elements: WorkItemHierarchyElements, typeName: string): HTMLElement {
  const row = rows(elements).find((candidate) => candidate.dataset.typeName === typeName);
  if (row === undefined) {
    throw new Error(`no hierarchy row for ${typeName}`);
  }
  return row;
}

/** The child chips in a row, in order. The "Leaf Item" marker carries no name and is excluded. */
function chips(row: HTMLElement): string[] {
  return [...row.querySelectorAll<HTMLElement>(".wit-child")]
    .map((chip) => chip.dataset.child ?? "")
    .filter((name) => name.length > 0);
}

function defaultChip(row: HTMLElement): string | undefined {
  return row.querySelector<HTMLElement>(".wit-child--default")?.dataset.child;
}

function leafChip(row: HTMLElement): HTMLElement | null {
  return row.querySelector<HTMLElement>(".wit-child--leaf");
}

function picker(row: HTMLElement): HTMLInputElement {
  return row.querySelector<HTMLInputElement>('[data-role="child"]')!;
}

function addButton(row: HTMLElement): HTMLButtonElement {
  return row.querySelector<HTMLButtonElement>('[data-role="child-add"]')!;
}

function comboboxOf(row: HTMLElement): HTMLElement {
  return row.querySelector<HTMLElement>(".combobox")!;
}

function primaryWork(row: HTMLElement): HTMLInputElement {
  return row.querySelector<HTMLInputElement>('[data-role="primary-work"]')!;
}

/** Whether the row still offers the "+" that unfolds its child picker. */
function canAdd(row: HTMLElement): boolean {
  return !addButton(row).hidden;
}

/** Click the row's "+" to unfold its picker, and hand back the now-focused input. */
function openPicker(row: HTMLElement): HTMLInputElement {
  addButton(row).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  return picker(row);
}

/** The options the row's picker offers once its "+" is clicked. */
function options(row: HTMLElement): string[] {
  openPicker(row);
  return [...comboboxOf(row).querySelectorAll<HTMLElement>(".combobox__option")].map(
    (option) => option.textContent ?? "",
  );
}

function commit(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function addChild(row: HTMLElement, name: string): void {
  commit(openPicker(row), name);
}

function removeChild(row: HTMLElement, name: string): void {
  const chip = [...row.querySelectorAll<HTMLElement>(".wit-child")].find(
    (candidate) => candidate.dataset.child === name,
  );
  chip!
    .querySelector<HTMLButtonElement>('[data-role="child-remove"]')!
    .dispatchEvent(new MouseEvent("click", { bubbles: true }));
}

function chipEl(row: HTMLElement, name: string): HTMLElement {
  const chip = [...row.querySelectorAll<HTMLElement>(".wit-child")].find(
    (candidate) => candidate.dataset.child === name,
  );
  if (chip === undefined) {
    throw new Error(`no child chip "${name}"`);
  }
  return chip;
}

/** Simulate dragging one chip onto another through the controller's delegated drag events. */
function dragOnto(from: HTMLElement, to: HTMLElement): void {
  from.dispatchEvent(new Event("dragstart", { bubbles: true }));
  to.dispatchEvent(new Event("dragover", { bubbles: true }));
  to.dispatchEvent(new Event("drop", { bubbles: true }));
  from.dispatchEvent(new Event("dragend", { bubbles: true }));
}

afterEach(() => {
  document.body.replaceChildren();
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("WorkItemHierarchyController rows", () => {
  it("renders one row per committed type, in the table's order", () => {
    const { elements } = setup();

    expect(rows(elements).map((row) => row.dataset.typeName)).toEqual([
      "Epic",
      "Feature",
      "User Story",
      "Task",
    ]);
    expect(elements.empty.hidden).toBe(true);
  });

  it("shows the empty notice while no type is committed", () => {
    const { elements } = setup({ types: [] });

    expect(rows(elements)).toHaveLength(0);
    expect(elements.empty.hidden).toBe(false);
  });

  it("renders each type's icon and color", () => {
    const { elements } = setup();
    const row = rowFor(elements, "Epic");

    const icon = row.querySelector<HTMLImageElement>(".wit-type-label__icon")!;
    expect(icon.src).toBe("https://ado/epic");
    expect(icon.referrerPolicy).toBe("no-referrer");
    expect(row.querySelector<HTMLElement>(".wit-type-label__name")!.style.color).toBe(
      "rgb(255, 123, 0)",
    );
  });

  it("drops an icon that fails to load rather than showing a broken image", () => {
    const { elements } = setup();
    const icon = rowFor(elements, "Epic").querySelector<HTMLImageElement>(".wit-type-label__icon")!;

    icon.dispatchEvent(new Event("error"));

    expect(rowFor(elements, "Epic").querySelector(".wit-type-label__icon")).toBeNull();
  });

  it("renders a type with no icon as its colored name alone", () => {
    const { elements } = setup();
    const row = rowFor(elements, "Feature");

    expect(row.querySelector(".wit-type-label__icon")).toBeNull();
    expect(row.querySelector<HTMLElement>(".wit-type-label__name")!.textContent).toBe("Feature");
  });

  it("forces the root to planning context and disables its primary-work checkbox", () => {
    const { elements, controller } = setup({ primaryWork: ["Epic"] });

    expect(primaryWork(rowFor(elements, "Epic")).checked).toBe(false);
    expect(primaryWork(rowFor(elements, "Epic")).disabled).toBe(true);
    expect(controller.isPrimaryWork("Epic")).toBe(false);
  });

  it("renders and updates primary work for non-root types", () => {
    const { elements, controller, changes } = setup({ primaryWork: ["User Story"] });
    const story = primaryWork(rowFor(elements, "User Story"));

    expect(story.checked).toBe(true);
    expect(story.disabled).toBe(false);

    story.checked = false;
    story.dispatchEvent(new Event("change", { bubbles: true }));

    expect(controller.isPrimaryWork("User Story")).toBe(false);
    expect(changes()).toBe(1);
  });

  it("clears primary work when a checked type becomes the root", () => {
    const { elements, controller } = setup({ primaryWork: ["User Story"] });

    controller.render([STORY, EPIC, FEATURE, TASK]);

    expect(primaryWork(rowFor(elements, "User Story")).checked).toBe(false);
    expect(primaryWork(rowFor(elements, "User Story")).disabled).toBe(true);
    expect(controller.isPrimaryWork("User Story")).toBe(false);
  });
});

describe("WorkItemHierarchyController children", () => {
  it("marks a type with no children as a leaf", () => {
    const { elements, controller } = setup();
    const row = rowFor(elements, "Task");

    expect(leafChip(row)?.textContent).toBe("Leaf Item");
    expect(controller.childrenFor("Task")).toEqual([]);
  });

  it("adds a picked type as a child and reports the change", () => {
    const { elements, controller, changes } = setup();
    const row = rowFor(elements, "Epic");

    addChild(row, "Feature");

    expect(chips(row)).toEqual(["Feature"]);
    expect(controller.childrenFor("Epic")).toEqual(["Feature"]);
    expect(leafChip(row)).toBeNull();
    expect(changes()).toBe(1);
  });

  it("highlights the first child as the default and keeps later ones plain", () => {
    const { elements } = setup();
    const row = rowFor(elements, "Epic");

    addChild(row, "Feature");
    addChild(row, "User Story");

    expect(chips(row)).toEqual(["Feature", "User Story"]);
    expect(defaultChip(row)).toBe("Feature");
    expect(chipEl(row, "Feature").title).toContain("Default child type");
  });

  it("ignores text that is not an offered type", () => {
    const { elements, controller, changes } = setup();
    const row = rowFor(elements, "Epic");

    addChild(row, "Nonsense");

    expect(controller.childrenFor("Epic")).toEqual([]);
    expect(changes()).toBe(0);
  });

  it("removes a child and returns the row to a leaf once the list empties", () => {
    const { elements, controller } = setup({ seed: { Epic: ["Feature"] } });
    const row = rowFor(elements, "Epic");

    removeChild(row, "Feature");

    expect(controller.childrenFor("Epic")).toEqual([]);
    expect(leafChip(row)?.textContent).toBe("Leaf Item");
  });

  it("seeds stored children and clears them on reset", () => {
    const { elements, controller } = setup({ seed: { Epic: ["Feature", "User Story"] } });

    expect(chips(rowFor(elements, "Epic"))).toEqual(["Feature", "User Story"]);

    controller.reset();
    controller.render(TREE);

    expect(controller.childrenFor("Epic")).toEqual([]);
  });

  it("forgets children naming a type the table above no longer holds", () => {
    const { elements, controller } = setup({ seed: { Epic: ["Feature", "Task"] } });

    controller.render([EPIC, FEATURE]);

    expect(controller.childrenFor("Epic")).toEqual(["Feature"]);
    expect(chips(rowFor(elements, "Epic"))).toEqual(["Feature"]);
  });

  it("forgets the child list of a type that is removed from the table above", () => {
    const { controller } = setup({ seed: { Task: ["Feature"] } });

    controller.render([EPIC, FEATURE]);
    controller.render(TREE);

    expect(controller.childrenFor("Task")).toEqual([]);
  });
});

describe("WorkItemHierarchyController add control", () => {
  it("gives the last type no add control, leaving it a leaf", () => {
    const { elements } = setup();
    const row = rowFor(elements, "Task");

    expect(canAdd(row)).toBe(false);
    expect(leafChip(row)?.textContent).toBe("Leaf Item");
  });

  it("drops the add control once every type below is already a child", () => {
    const { elements } = setup({ seed: { "User Story": ["Task"] } });

    expect(canAdd(rowFor(elements, "User Story"))).toBe(false);
  });

  it("keeps the picker folded away until the add button is clicked", () => {
    const { elements } = setup();
    const row = rowFor(elements, "Epic");

    expect(comboboxOf(row).hidden).toBe(true);
    expect(canAdd(row)).toBe(true);

    openPicker(row);

    expect(comboboxOf(row).hidden).toBe(false);
    expect(canAdd(row)).toBe(false);
  });

  it("folds the picker back to the add button when it loses focus", () => {
    const { elements } = setup();
    const row = rowFor(elements, "Epic");
    const input = openPicker(row);
    input.value = "Fea";

    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    expect(comboboxOf(row).hidden).toBe(true);
    expect(canAdd(row)).toBe(true);
    expect(input.value).toBe("");
  });

  it("folds the picker away once the last offered type is taken", () => {
    const { elements } = setup({ types: [EPIC, FEATURE] });
    const row = rowFor(elements, "Epic");

    addChild(row, "Feature");

    expect(comboboxOf(row).hidden).toBe(true);
    expect(canAdd(row)).toBe(false);
  });
});

describe("WorkItemHierarchyController picker", () => {
  it("offers Leaf Item plus every type below this one on a fresh row", () => {
    const { elements } = setup();

    expect(options(rowFor(elements, "Epic"))).toEqual([
      "Leaf Item",
      "Feature",
      "User Story",
      "Task",
    ]);
  });

  it("never offers itself or a type above it in the configured order", () => {
    const { elements } = setup();

    expect(options(rowFor(elements, "User Story"))).toEqual(["Leaf Item", "Task"]);
  });

  it("stops offering a type once it is already a child", () => {
    const { elements } = setup({ seed: { Epic: ["Feature"] } });

    expect(options(rowFor(elements, "Epic"))).toEqual(["Leaf Item", "User Story", "Task"]);
  });

  it("never offers a type that could loop back to this one", () => {
    // An imported configuration can hold a link that runs backwards: User Story already reaches
    // Feature, so offering it under Feature would close a loop.
    const { elements } = setup({ seed: { "User Story": ["Feature"] } });

    expect(options(rowFor(elements, "Feature"))).toEqual(["Leaf Item", "Task"]);
  });

  it("re-offers a type elsewhere once the link that forbade it is removed", () => {
    const { elements } = setup({ seed: { "User Story": ["Feature"] } });

    expect(options(rowFor(elements, "Feature"))).toEqual(["Leaf Item", "Task"]);

    removeChild(rowFor(elements, "User Story"), "Feature");

    expect(options(rowFor(elements, "Feature"))).toEqual(["Leaf Item", "User Story", "Task"]);
  });

  it("clears the whole list when Leaf Item is picked", () => {
    const { elements, controller } = setup({ seed: { Epic: ["Feature", "User Story"] } });
    const row = rowFor(elements, "Epic");

    addChild(row, "Leaf Item");

    expect(controller.childrenFor("Epic")).toEqual([]);
    expect(leafChip(row)?.textContent).toBe("Leaf Item");
  });

  it("ignores a blank commit", () => {
    const { elements, changes } = setup();

    addChild(rowFor(elements, "Epic"), "   ");

    expect(changes()).toBe(0);
  });

  it("marks the Leaf Item option so it does not read as a real type", () => {
    const { elements } = setup();
    const row = rowFor(elements, "Epic");

    openPicker(row);

    const first = comboboxOf(row).querySelector<HTMLElement>(".combobox__option")!;
    expect(first.classList.contains("wit-child-option--leaf")).toBe(true);
    expect(first.title).toContain("clears the list");
  });
});

describe("WorkItemHierarchyController sibling rule", () => {
  it("never offers a type that already shares a parent with this one", () => {
    const { elements } = setup({ seed: { Epic: ["Feature", "User Story"] } });

    expect(options(rowFor(elements, "Feature"))).toEqual(["Leaf Item", "Task"]);
  });

  it("re-offers a sibling once it no longer shares a parent", () => {
    const { elements } = setup({ seed: { Epic: ["Feature", "User Story"] } });

    removeChild(rowFor(elements, "Epic"), "User Story");

    expect(options(rowFor(elements, "Feature"))).toEqual(["Leaf Item", "User Story", "Task"]);
  });

  it("refuses a sibling typed straight into the picker", () => {
    const { elements, controller } = setup({ seed: { Epic: ["Feature", "User Story"] } });

    addChild(rowFor(elements, "Feature"), "User Story");

    expect(controller.childrenFor("Feature")).toEqual([]);
  });
});

describe("WorkItemHierarchyController reordering", () => {
  it("moves a chip down the list and re-points the default", () => {
    const { elements, controller } = setup({
      seed: { Epic: ["Feature", "User Story", "Task"] },
    });
    const row = rowFor(elements, "Epic");

    dragOnto(chipEl(row, "Feature"), chipEl(row, "User Story"));

    expect(controller.childrenFor("Epic")).toEqual(["User Story", "Feature", "Task"]);
    expect(defaultChip(rowFor(elements, "Epic"))).toBe("User Story");
  });

  it("moves a chip up the list", () => {
    const { elements, controller } = setup({
      seed: { Epic: ["Feature", "User Story", "Task"] },
    });
    const row = rowFor(elements, "Epic");

    dragOnto(chipEl(row, "Task"), chipEl(row, "Feature"));

    expect(controller.childrenFor("Epic")).toEqual(["Task", "Feature", "User Story"]);
  });

  it("parks a chip at the end when it is released past the last one", () => {
    const { elements, controller } = setup({ seed: { Epic: ["Feature", "User Story"] } });
    const row = rowFor(elements, "Epic");
    const container = row.querySelector<HTMLElement>(".wit-child-row__children")!;

    dragOnto(chipEl(row, "Feature"), container);

    expect(controller.childrenFor("Epic")).toEqual(["User Story", "Feature"]);
  });

  it("refuses a drop into another type's row so a child list keeps one parent", () => {
    const { elements, controller } = setup({
      seed: { Epic: ["Feature"], Task: [] },
    });
    const source = chipEl(rowFor(elements, "Epic"), "Feature");
    const target = rowFor(elements, "User Story").querySelector<HTMLElement>(
      ".wit-child-row__children",
    )!;

    dragOnto(source, target);

    expect(controller.childrenFor("Epic")).toEqual(["Feature"]);
    expect(controller.childrenFor("User Story")).toEqual([]);
  });

  it("does not drag the Leaf Item marker", () => {
    const { elements, changes } = setup({ seed: { Epic: ["Feature"] } });
    const leaf = leafChip(rowFor(elements, "Task"))!;

    dragOnto(leaf, chipEl(rowFor(elements, "Epic"), "Feature"));

    expect(changes()).toBe(0);
  });

  it("leaves the order alone when a chip is dropped on itself", () => {
    const { elements, controller, changes } = setup({ seed: { Epic: ["Feature", "Task"] } });
    const chip = chipEl(rowFor(elements, "Epic"), "Feature");

    dragOnto(chip, chip);

    expect(controller.childrenFor("Epic")).toEqual(["Feature", "Task"]);
    expect(changes()).toBe(0);
  });
});

describe("WorkItemHierarchyController lifecycle", () => {
  it("stops responding to the section's events once disposed", () => {
    const { elements, controller, changes } = setup();
    const row = rowFor(elements, "Epic");

    controller.dispose();
    addChild(row, "Feature");

    expect(changes()).toBe(0);
    expect(controller.childrenFor("Epic")).toEqual([]);
  });
});
