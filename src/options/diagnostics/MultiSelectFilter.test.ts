import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { MultiSelectFilter, type MultiSelectFilterOptions } from "./MultiSelectFilter";

function makeRoot(): HTMLElement {
  document.body.innerHTML = `<div id="filter"></div>`;
  return document.getElementById("filter") as HTMLElement;
}

function optionLabels(root: HTMLElement): string[] {
  return [...root.querySelectorAll(".multiselect__option-label")].map(
    (node) => node.textContent ?? "",
  );
}

function checkboxFor(root: HTMLElement, item: string): HTMLInputElement {
  const label = [...root.querySelectorAll(".multiselect__option")].find(
    (node) => node.querySelector(".multiselect__option-label")?.textContent === item,
  );
  return label?.querySelector("input") as HTMLInputElement;
}

function triggerText(root: HTMLElement): string {
  return root.querySelector(".multiselect__trigger")?.textContent ?? "";
}

describe("MultiSelectFilter", () => {
  let root: HTMLElement;
  let onChange: Mock<() => void>;
  let filter: MultiSelectFilter;

  const options: () => MultiSelectFilterOptions = () => ({
    allLabel: "All sources",
    itemNoun: "sources",
    searchPlaceholder: "Filter sources…",
    noMatchesText: "No matching sources.",
    onChange,
  });

  beforeEach(() => {
    root = makeRoot();
    onChange = vi.fn<() => void>();
    filter = new MultiSelectFilter(root, options());
  });

  const open = (): void => {
    (root.querySelector(".multiselect__trigger") as HTMLButtonElement).click();
  };

  it("stays hidden until it has items, then reveals itself", () => {
    expect(root.hidden).toBe(true);

    filter.setItems(["content"]);
    expect(root.hidden).toBe(false);

    filter.setItems([]);
    expect(root.hidden).toBe(true);
  });

  it("summarizes the selection on the trigger", () => {
    filter.setItems(["a", "b", "c"]);
    expect(triggerText(root)).toBe("All sources");

    open();
    checkboxFor(root, "b").click();

    expect(triggerText(root)).toBe("2 of 3 sources");
  });

  it("opens and closes the panel from the trigger", () => {
    filter.setItems(["a"]);
    const panel = root.querySelector(".multiselect__panel") as HTMLElement;
    expect(panel.hidden).toBe(true);

    open();
    expect(panel.hidden).toBe(false);
    expect(root.querySelector(".multiselect__trigger")?.getAttribute("aria-expanded")).toBe("true");

    open();
    expect(panel.hidden).toBe(true);
  });

  it("renders one checkbox per item when opened", () => {
    filter.setItems(["background", "content"]);
    open();

    expect(optionLabels(root)).toEqual(["background", "content"]);
  });

  it("filters the checkbox list by the typed search text", () => {
    filter.setItems(["QueryPageController", "QueryBindingController", "BrowserSyncSettingsStore"]);
    open();

    const search = root.querySelector(".multiselect__search") as HTMLInputElement;
    search.value = "query";
    search.dispatchEvent(new Event("input"));

    expect(optionLabels(root)).toEqual(["QueryPageController", "QueryBindingController"]);
  });

  it("shows a no-matches notice when the search excludes every item", () => {
    filter.setItems(["content"]);
    open();

    const search = root.querySelector(".multiselect__search") as HTMLInputElement;
    search.value = "zzz";
    search.dispatchEvent(new Event("input"));

    expect(optionLabels(root)).toEqual([]);
    expect(root.querySelector(".multiselect__empty")?.textContent).toBe("No matching sources.");
  });

  it("hides an unchecked item and reports the change", () => {
    filter.setItems(["a", "b"]);
    open();

    checkboxFor(root, "a").click();

    expect(filter.isHidden("a")).toBe(true);
    expect(filter.isHidden("b")).toBe(false);
    expect(onChange).toHaveBeenCalledOnce();

    // Re-checking restores it.
    checkboxFor(root, "a").click();
    expect(filter.isHidden("a")).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("keeps an item hidden across item churn (survives disappear/reappear)", () => {
    filter.setItems(["a", "b"]);
    open();
    checkboxFor(root, "a").click();
    expect(filter.isHidden("a")).toBe(true);

    // The set changes and back again; the choice is keyed by value, so it persists.
    filter.setItems(["b"]);
    filter.setItems(["a", "b"]);

    expect(filter.isHidden("a")).toBe(true);
  });

  it("clears all then selects all via the shortcuts", () => {
    filter.setItems(["a", "b", "c"]);
    open();

    const [selectAll, clearAll] = [
      ...root.querySelectorAll<HTMLButtonElement>(".multiselect__action"),
    ];

    clearAll?.click();
    expect(["a", "b", "c"].every((item) => filter.isHidden(item))).toBe(true);
    expect(triggerText(root)).toBe("0 of 3 sources");

    selectAll?.click();
    expect(["a", "b", "c"].some((item) => filter.isHidden(item))).toBe(false);
    expect(triggerText(root)).toBe("All sources");
  });

  it("closes when the user interacts outside the control", () => {
    filter.setItems(["a"]);
    open();
    const panel = root.querySelector(".multiselect__panel") as HTMLElement;
    expect(panel.hidden).toBe(false);

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(panel.hidden).toBe(true);
  });

  it("does not close when interacting inside the panel", () => {
    filter.setItems(["a"]);
    open();
    const panel = root.querySelector(".multiselect__panel") as HTMLElement;

    panel.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(panel.hidden).toBe(false);
  });

  it("closes on Escape", () => {
    filter.setItems(["a"]);
    open();
    const panel = root.querySelector(".multiselect__panel") as HTMLElement;

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(panel.hidden).toBe(true);
  });

  it("stops responding after dispose", () => {
    filter.setItems(["a"]);
    open();
    filter.dispose();

    // A late outside interaction must not touch the panel once disposed.
    const panel = root.querySelector(".multiselect__panel") as HTMLElement;
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(panel.hidden).toBe(false);
  });
});
