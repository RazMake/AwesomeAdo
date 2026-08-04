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

    expect(onChange).toHaveBeenLastCalledWith(["api", "docs"]);
    expect(handle.selectedValues()).toEqual(["api", "docs"]);
  });

  it("ignores an initial selection the caller never offered", () => {
    const { handle } = mount({ selected: ["api", "not-offered"] });

    expect(handle.selectedValues()).toEqual(["api"]);
  });

  it("accepts a replacement selection without re-entering the caller's change handler", () => {
    const { handle, onChange } = mount();

    handle.setSelectedValues(["docs"]);

    expect(handle.selectedValues()).toEqual(["docs"]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("disables the trigger when there is nothing to choose from", () => {
    const { handle } = mount({ options: [] });

    expect(handle.element.querySelector<HTMLButtonElement>(`.${PREFIX}__trigger`)?.disabled).toBe(
      true,
    );
  });
});
