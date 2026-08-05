import { afterEach, describe, expect, it, vi } from "vitest";

import { renderCheckboxFilter } from "./CheckboxFilter";

const PREFIX = "awesomeado-test-filter";

afterEach(() => {
  document.body.replaceChildren();
});

function mount(options?: Partial<Parameters<typeof renderCheckboxFilter>[1]>) {
  const onChange = vi.fn();
  const handle = renderCheckboxFilter(document, {
    label: "Tags",
    classPrefix: PREFIX,
    options: [{ value: "api" }, { value: "docs" }],
    onChange,
    ...options,
  });
  document.body.append(handle.element);
  return { handle, onChange };
}

const open = (handle: { element: HTMLElement }): void => {
  handle.element.querySelector<HTMLButtonElement>(`.${PREFIX}__trigger`)!.click();
};

const optionRows = (handle: { element: HTMLElement }): HTMLElement[] => [
  ...handle.element.querySelectorAll<HTMLElement>(`.${PREFIX}__option`),
];

describe("renderCheckboxFilter - marking each instance", () => {
  it("stems every element from the caller's prefix so a view can tell its filters apart", () => {
    const { handle } = mount();
    open(handle);

    expect(handle.element.className).toBe(PREFIX);
    expect(handle.element.querySelector(`.${PREFIX}__popup`)).not.toBeNull();
    expect(handle.element.querySelector(`.${PREFIX}__list`)).not.toBeNull();
    expect(handle.element.querySelector(`.${PREFIX}__clear`)).not.toBeNull();
  });

  it("shows the caller's own display label while keeping the value it filters by", () => {
    const { handle } = mount({
      options: [{ value: "Project\\Web", label: "Web", title: "Project\\Web" }],
    });
    open(handle);
    const row = optionRows(handle)[0]!;

    expect(row.textContent).toBe("Web");
    expect(row.title).toBe("Project\\Web");
    expect(row.querySelector<HTMLInputElement>("input")?.value).toBe("Project\\Web");
  });
});

describe("renderCheckboxFilter - quick search", () => {
  it("is offered only when the caller asks for one", () => {
    const { handle } = mount();
    open(handle);

    expect(handle.element.querySelector(`.${PREFIX}__search`)).toBeNull();
  });

  it("narrows the list to what is typed, matching the label and the underlying value", () => {
    const { handle } = mount({
      options: [
        { value: "Project\\Web", label: "Web" },
        { value: "docs", label: "Docs" },
      ],
      searchPlaceholder: "Search tags",
    });
    open(handle);
    const search = handle.element.querySelector<HTMLInputElement>(`.${PREFIX}__search`)!;

    search.value = "project";
    search.dispatchEvent(new Event("input"));

    expect(optionRows(handle).map((row) => row.style.display)).toEqual(["flex", "none"]);
  });

  it("restores the whole list when the search is cleared", () => {
    const { handle } = mount({ searchPlaceholder: "Search tags" });
    open(handle);
    const search = handle.element.querySelector<HTMLInputElement>(`.${PREFIX}__search`)!;

    search.value = "api";
    search.dispatchEvent(new Event("input"));
    search.value = "";
    search.dispatchEvent(new Event("input"));

    expect(optionRows(handle).map((row) => row.style.display)).toEqual(["flex", "flex"]);
  });
});

describe("renderCheckboxFilter - selection", () => {
  it("reports the values selected, in the order they were offered", () => {
    const { handle, onChange } = mount();
    open(handle);
    const boxes = handle.element.querySelectorAll<HTMLInputElement>("input[type=checkbox]");

    boxes[1]!.click();
    boxes[0]!.click();

    expect(onChange).toHaveBeenLastCalledWith({
      included: ["api", "docs"],
      excluded: [],
      matchAll: false,
    });
    expect(handle.selection().included).toEqual(["api", "docs"]);
  });

  it("ignores an initial selection the caller never offered", () => {
    const { handle } = mount({ selected: ["api", "not-offered"] });

    expect(handle.selection().included).toEqual(["api"]);
  });

  it("accepts a replacement selection without re-entering the caller's change handler", () => {
    const { handle, onChange } = mount();

    handle.setSelectedValues(["docs"]);

    expect(handle.selection().included).toEqual(["docs"]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables the trigger when there is nothing to choose from", () => {
    const { handle } = mount({ options: [] });

    expect(handle.element.querySelector<HTMLButtonElement>(`.${PREFIX}__trigger`)?.disabled).toBe(
      true,
    );
  });
});

describe("renderCheckboxFilter - combining", () => {
  const excludeToggles = (handle: { element: HTMLElement }): HTMLButtonElement[] => [
    ...handle.element.querySelectorAll<HTMLButtonElement>(`.${PREFIX}__exclude`),
  ];

  it("offers no exclusion or match-mode control unless the caller asks to combine", () => {
    const { handle } = mount();
    open(handle);

    expect(excludeToggles(handle)).toHaveLength(0);
    expect(handle.element.querySelector(`.${PREFIX}__match-mode`)).toBeNull();
    expect(handle.selection()).toEqual({ included: [], excluded: [], matchAll: false });
  });

  it("ignores a seeded exclusion and match mode the caller did not enable combining for", () => {
    const { handle } = mount({ excluded: ["api"], matchAll: true });

    expect(handle.selection()).toEqual({ included: [], excluded: [], matchAll: false });
  });

  it("reports an excluded value and drops it again when the toggle is pressed twice", () => {
    const { handle, onChange } = mount({ combining: true });
    open(handle);

    excludeToggles(handle)[0]!.click();
    expect(onChange).toHaveBeenLastCalledWith({
      included: [],
      excluded: ["api"],
      matchAll: false,
    });

    excludeToggles(handle)[0]!.click();
    expect(onChange).toHaveBeenLastCalledWith({ included: [], excluded: [], matchAll: false });
  });

  it("keeps required and excluded mutually exclusive on one row", () => {
    const { handle } = mount({ combining: true, selected: ["api"] });
    open(handle);
    const checkbox = handle.element.querySelector<HTMLInputElement>("input[type=checkbox]")!;

    excludeToggles(handle)[0]!.click();
    expect(checkbox.checked).toBe(false);
    expect(handle.selection()).toEqual({ included: [], excluded: ["api"], matchAll: false });

    checkbox.click();
    expect(excludeToggles(handle)[0]!.getAttribute("aria-pressed")).toBe("false");
    expect(handle.selection()).toEqual({ included: ["api"], excluded: [], matchAll: false });
  });

  it("resolves a value the caller seeded as both required and excluded in favour of required", () => {
    const { handle } = mount({ combining: true, selected: ["api"], excluded: ["api", "docs"] });

    expect(handle.selection()).toEqual({ included: ["api"], excluded: ["docs"], matchAll: false });
  });

  it("flips between requiring any ticked value and requiring all of them", () => {
    const { handle, onChange } = mount({ combining: true, selected: ["api"] });
    open(handle);
    const mode = handle.element.querySelector<HTMLButtonElement>(`.${PREFIX}__match-mode`)!;

    expect(mode.textContent).toBe("Any");
    mode.click();

    expect(mode.textContent).toBe("All");
    expect(onChange).toHaveBeenLastCalledWith({
      included: ["api"],
      excluded: [],
      matchAll: true,
    });
  });

  it("counts both directions on the trigger and spells the condition out in its tooltip", () => {
    const { handle } = mount({ combining: true, matchAll: true });
    open(handle);
    handle.element.querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
    excludeToggles(handle)[1]!.click();

    const trigger = handle.element.querySelector<HTMLButtonElement>(`.${PREFIX}__trigger`)!;
    expect(handle.element.querySelector(`.${PREFIX}__count`)?.textContent).toBe("2");
    expect(trigger.title).toBe("Tags: all of api; none of docs");
  });

  it("clears both directions but keeps the match mode the reader chose", () => {
    const { handle } = mount({ combining: true, selected: ["api"], excluded: ["docs"] });
    open(handle);
    handle.element.querySelector<HTMLButtonElement>(`.${PREFIX}__match-mode`)!.click();

    handle.element.querySelector<HTMLButtonElement>(`.${PREFIX}__clear`)!.click();

    expect(handle.selection()).toEqual({ included: [], excluded: [], matchAll: true });
  });
});

describe("renderCheckboxFilter - clearing from the trigger", () => {
  it("opens the popup rather than clearing unless the caller asked for it", () => {
    const { handle, onChange } = mount({ combining: true, selected: ["api"] });

    open(handle);

    expect(handle.element.querySelector(`.${PREFIX}__popup`)).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("empties an active condition and reports it, leaving the popup shut", () => {
    const { handle, onChange } = mount({
      combining: true,
      clearOnTriggerWhenActive: true,
      selected: ["api"],
      excluded: ["docs"],
      matchAll: true,
    });

    open(handle);

    expect(handle.selection()).toEqual({ included: [], excluded: [], matchAll: true });
    expect(onChange).toHaveBeenCalledWith({ included: [], excluded: [], matchAll: true });
    expect(handle.element.querySelector(`.${PREFIX}__popup`)).toBeNull();
  });

  it("opens the popup once nothing is chosen any more", () => {
    const { handle } = mount({ clearOnTriggerWhenActive: true, selected: ["api"] });

    open(handle);
    open(handle);

    expect(handle.element.querySelector(`.${PREFIX}__popup`)).not.toBeNull();
  });

  it("still closes an open popup instead of clearing what was picked in it", () => {
    const { handle } = mount({ clearOnTriggerWhenActive: true });
    open(handle);

    handle.element.querySelector<HTMLInputElement>("input[type=checkbox]")!.click();
    open(handle);

    expect(handle.element.querySelector(`.${PREFIX}__popup`)).toBeNull();
    expect(handle.selection().included).toEqual(["api"]);
  });

  it("drops the popup's own Clear, so one gesture owns emptying the condition", () => {
    const { handle } = mount({ clearOnTriggerWhenActive: true });

    open(handle);

    expect(handle.element.querySelector(`.${PREFIX}__popup`)).not.toBeNull();
    expect(handle.element.querySelector(`.${PREFIX}__clear`)).toBeNull();
  });
});
