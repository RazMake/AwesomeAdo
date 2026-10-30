import { afterEach, describe, expect, it, vi } from "vitest";

import {
  areaPathHierarchy,
  renderAreaPathFilter,
  shortestUniqueAreaPathLabels,
} from "./AreaPathFilter";

afterEach(() => {
  document.body.replaceChildren();
});

describe("shortestUniqueAreaPathLabels", () => {
  it("uses leaves when they are already distinct", () => {
    const labels = shortestUniqueAreaPathLabels(["Project\\Platform", "Project\\Commerce"]);

    expect([...labels]).toEqual([
      ["Project\\Platform", "Platform"],
      ["Project\\Commerce", "Commerce"],
    ]);
  });

  it("adds only enough parents to distinguish duplicate leaves", () => {
    const labels = shortestUniqueAreaPathLabels([
      "Project\\Platform\\API",
      "Project\\Commerce\\API",
      "Project\\Web",
    ]);

    expect(labels.get("Project\\Platform\\API")).toBe("Platform › API");
    expect(labels.get("Project\\Commerce\\API")).toBe("Commerce › API");
    expect(labels.get("Project\\Web")).toBe("Web");
  });

  it("expands a longer path when another full path is its suffix", () => {
    const labels = shortestUniqueAreaPathLabels(["Shared\\API", "Project\\Shared\\API"]);

    expect(labels.get("Shared\\API")).toBe("Shared › API");
    expect(labels.get("Project\\Shared\\API")).toBe("Project › Shared › API");
  });

  it("drops blank and exact duplicate paths", () => {
    const labels = shortestUniqueAreaPathLabels([" ", "Project\\API", "Project\\API"]);

    expect([...labels]).toEqual([["Project\\API", "API"]]);
  });
});

describe("areaPathHierarchy", () => {
  it("nests each path under its closest offered ancestor, keeping caller order otherwise", () => {
    expect(areaPathHierarchy(["A\\b", "B\\a", "A", "A\\x\\c", "B"])).toEqual([
      { path: "A", depth: 0 },
      { path: "A\\b", depth: 1 },
      { path: "A\\x\\c", depth: 1 },
      { path: "B", depth: 0 },
      { path: "B\\a", depth: 1 },
    ]);
  });

  it("nests ignoring casing and never treats a name prefix as a parent", () => {
    expect(areaPathHierarchy(["a", "A\\b", "AB", "A\\b\\c"])).toEqual([
      { path: "a", depth: 0 },
      { path: "A\\b", depth: 1 },
      { path: "A\\b\\c", depth: 2 },
      { path: "AB", depth: 0 },
    ]);
  });
});

function openFilter(paths = ["Project\\Platform\\API", "Project\\Commerce\\API"]) {
  const onChange = vi.fn();
  const handle = renderAreaPathFilter(document, { areaPaths: paths, onChange });
  document.body.append(handle.element);
  handle.element.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.click();
  return { handle, onChange };
}

describe("renderAreaPathFilter - popup", () => {
  it("lists offered descendants indented under their offered parent", () => {
    openFilter(["Project\\A\\b", "Project\\B", "Project\\A"]);

    const rows = [...document.querySelectorAll<HTMLElement>(".awesomeado-area-filter__option")];
    expect(rows.map((row) => [row.title, row.dataset.depth ?? "0", row.textContent])).toEqual([
      ["Project\\B", "0", "B"],
      ["Project\\A", "0", "A"],
      ["Project\\A\\b", "1", "b"],
    ]);
    expect(rows[2]!.style.paddingLeft).toBe("24px");
    expect(rows[1]!.style.paddingLeft).toBe("8px");
  });

  it("selects a parent path without implying its descendants", () => {
    const { handle, onChange } = openFilter(["Project\\A", "Project\\A\\b"]);

    document.querySelector<HTMLInputElement>('input[value="Project\\\\A"]')!.click();

    expect(onChange).toHaveBeenLastCalledWith(["Project\\A"]);
    expect(handle.selectedAreaPaths()).toEqual(["Project\\A"]);
  });
  it("can present the same full-path selector as Lane", () => {
    const handle = renderAreaPathFilter(document, {
      label: "Lane",
      areaPaths: ["Project\\Platform"],
    });
    document.body.append(handle.element);

    const trigger = handle.element.querySelector<HTMLButtonElement>("button")!;
    expect(trigger.textContent).toBe("Lane0");
    expect(trigger.title).toBe("Filter by lane");
    trigger.click();
    expect(handle.element.querySelector("strong")?.textContent).toBe("Lane");
  });

  it("keeps a fixed tooltip whatever is selected, while the accessible name follows the condition", () => {
    const handle = renderAreaPathFilter(document, {
      label: "Lanes",
      fixedTitle: "Filter by Area Path",
      areaPaths: ["Project\\Platform", "Project\\Apps"],
    });
    document.body.append(handle.element);
    const trigger = handle.element.querySelector<HTMLButtonElement>("button")!;

    expect(trigger.title).toBe("Filter by Area Path");

    handle.setSelectedAreaPaths(["Project\\Apps"]);

    // The button wears the view's shorthand, so the tooltip is the only place naming the field.
    expect(trigger.title).toBe("Filter by Area Path");
    expect(trigger.getAttribute("aria-label")).toContain("Apps");
  });

  it("shows one checkbox per distinct full path with shortest distinct labels", () => {
    const { handle } = openFilter();
    const rows = handle.element.querySelectorAll<HTMLElement>(".awesomeado-area-filter__option");

    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toBe("Platform › API");
    expect(rows[0]?.title).toBe("Project\\Platform\\API");
    expect(rows[1]?.textContent).toBe("Commerce › API");
  });

  it("uses a themed callout and themed hover state", () => {
    const { handle } = openFilter();
    const popup = handle.element.querySelector<HTMLElement>(".awesomeado-area-filter__popup")!;
    const row = handle.element.querySelector<HTMLElement>(".awesomeado-area-filter__option")!;

    expect(popup.style.background).toBe("var(--callout-background-color)");
    expect(popup.style.cssText).toContain("var(--control-border-strong)");
    row.dispatchEvent(new MouseEvent("mouseenter"));
    expect(row.style.background).toBe("var(--control-background-hover)");
  });

  it("disables the trigger when there are no area paths", () => {
    const handle = renderAreaPathFilter(document, { areaPaths: [] });

    expect(
      handle.element.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")?.disabled,
    ).toBe(true);
  });

  it("hides the zero count without relying on the hidden attribute", () => {
    const handle = renderAreaPathFilter(document, { areaPaths: ["Project\\Platform"] });

    expect(
      handle.element.querySelector<HTMLElement>(".awesomeado-area-filter__count")?.style.display,
    ).toBe("none");
  });
});

describe("renderAreaPathFilter - selection", () => {
  it("receives and returns full selected paths", () => {
    const selected = "Project\\Commerce\\API";
    const handle = renderAreaPathFilter(document, {
      areaPaths: ["Project\\Platform\\API", selected],
      selectedAreaPaths: [selected, "Unknown"],
    });
    document.body.append(handle.element);
    handle.element.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.click();

    expect(handle.selectedAreaPaths()).toEqual([selected]);
    expect(
      handle.element.querySelector<HTMLInputElement>(
        `input[value="${selected.replaceAll("\\", "\\\\")}"]`,
      )?.checked,
    ).toBe(true);
  });

  it("reports full paths and lights the count when a checkbox changes", () => {
    const { handle, onChange } = openFilter();
    const checkbox = handle.element.querySelector<HTMLInputElement>("input[type=checkbox]")!;

    checkbox.click();

    expect(onChange).toHaveBeenCalledWith(["Project\\Platform\\API"]);
    expect(handle.selectedAreaPaths()).toEqual(["Project\\Platform\\API"]);
    const trigger = handle.element.querySelector<HTMLButtonElement>(
      ".awesomeado-area-filter__trigger",
    )!;
    expect(trigger.getAttribute("aria-pressed")).toBe("true");
    expect(handle.element.querySelector(".awesomeado-area-filter__count")?.textContent).toBe("1");
    expect(trigger.style.background).toBe("var(--communication-background)");
    expect(trigger.style.color).toBe("var(--text-on-communication-background)");
    expect(trigger.style.borderColor).toBe("var(--communication-background)");
    expect(trigger.disabled).toBe(false);
    expect(trigger.style.opacity).toBe("");
    expect(
      handle.element.querySelector<HTMLButtonElement>(".awesomeado-area-filter__clear")?.disabled,
    ).toBe(false);
    expect(handle.element.querySelector(".awesomeado-area-filter__popup")).not.toBeNull();
  });

  it("allows multiple checkbox selections before the popup closes", () => {
    const { handle, onChange } = openFilter();
    const checkboxes = handle.element.querySelectorAll<HTMLInputElement>("input[type=checkbox]");

    checkboxes[0]!.click();
    checkboxes[1]!.click();

    expect(onChange).toHaveBeenLastCalledWith(["Project\\Platform\\API", "Project\\Commerce\\API"]);
    expect(handle.element.querySelector(".awesomeado-area-filter__popup")).not.toBeNull();
  });
});

describe("renderAreaPathFilter - dismissal", () => {
  it.each([
    [
      "outside pointer",
      () => document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })),
    ],
    ["Escape", () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }))],
  ])("closes on %s", (_label, dismiss) => {
    const onPopupClosed = vi.fn();
    const handle = renderAreaPathFilter(document, {
      areaPaths: ["Project\\Platform"],
      onPopupClosed,
    });
    document.body.append(handle.element);
    handle.element.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.click();

    dismiss();

    expect(handle.element.querySelector(".awesomeado-area-filter__popup")).toBeNull();
    expect(onPopupClosed).toHaveBeenCalledOnce();
  });

  it("Clear reports an empty selection and closes the popup", () => {
    const selected = "Project\\Platform";
    const onChange = vi.fn();
    const handle = renderAreaPathFilter(document, {
      areaPaths: [selected],
      selectedAreaPaths: [selected],
      onChange,
    });
    document.body.append(handle.element);
    handle.element.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.click();

    handle.element.querySelector<HTMLButtonElement>(".awesomeado-area-filter__clear")!.click();

    expect(onChange).toHaveBeenCalledWith([]);
    expect(handle.selectedAreaPaths()).toEqual([]);
    expect(handle.element.querySelector(".awesomeado-area-filter__popup")).toBeNull();
  });
});

describe("renderAreaPathFilter - replacement", () => {
  it("accepts a replacement selection without firing onChange", () => {
    const { handle, onChange } = openFilter();

    handle.setSelectedAreaPaths(["Project\\Commerce\\API", "Unknown"]);

    expect(handle.selectedAreaPaths()).toEqual(["Project\\Commerce\\API"]);
    expect(onChange).not.toHaveBeenCalled();
    expect(handle.element.querySelector(".awesomeado-area-filter__popup")).toBeNull();
  });
});
