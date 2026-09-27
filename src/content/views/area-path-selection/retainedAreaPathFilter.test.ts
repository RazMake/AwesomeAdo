import { afterEach, describe, expect, it, vi } from "vitest";

import { renderRetainedAreaPathFilter } from "./retainedAreaPathFilter";

const PLATFORM = "Project\\Platform";
const COMMERCE = "Project\\Commerce";

afterEach(() => {
  document.body.replaceChildren();
});

describe("renderRetainedAreaPathFilter", () => {
  it("drops retained paths the board no longer offers", () => {
    const selection = new Set([PLATFORM, "Project\\Retired"]);

    const handle = renderRetainedAreaPathFilter(document, {
      areaPaths: [PLATFORM, COMMERCE],
      selection,
      onChange: vi.fn(),
    });

    expect([...selection]).toEqual([PLATFORM]);
    expect(handle.selectedAreaPaths()).toEqual([PLATFORM]);
  });

  it("updates the retained selection before reporting the change", () => {
    const selection = new Set<string>();
    const seen: string[][] = [];
    const handle = renderRetainedAreaPathFilter(document, {
      areaPaths: [PLATFORM, COMMERCE],
      selection,
      onChange: (selected) => seen.push([...selected, ...selection]),
    });
    document.body.append(handle.element);

    handle.element.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.click();
    handle.element.querySelector<HTMLInputElement>("input[type=checkbox]")!.click();

    expect(seen).toEqual([[PLATFORM, PLATFORM]]);
  });

  it("clears an active selection from the lit-up trigger in one press", () => {
    const selection = new Set([COMMERCE]);
    const onChange = vi.fn();
    const handle = renderRetainedAreaPathFilter(document, {
      areaPaths: [PLATFORM, COMMERCE],
      selection,
      onChange,
    });
    document.body.append(handle.element);

    handle.element.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.click();

    expect(onChange).toHaveBeenCalledWith([]);
    expect(selection.size).toBe(0);
  });
});
