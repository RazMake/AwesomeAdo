import { afterEach, describe, expect, it, vi } from "vitest";

import { renderHierarchyFilter } from "./HierarchyFilter";

const ITEMS = [
  { id: 1, label: "Epic", depth: 0, title: "Epic" },
  { id: 2, label: "Feature", depth: 1, title: "Epic / Feature" },
  { id: 3, label: "Story", depth: 2, title: "Epic / Feature / Story" },
] as const;

afterEach(() => document.body.replaceChildren());

describe("renderHierarchyFilter", () => {
  it("renders parent chains in order with increasing indentation", () => {
    const handle = renderHierarchyFilter(document, { items: ITEMS });
    document.body.append(handle.element);
    handle.element.querySelector<HTMLButtonElement>("button")!.click();

    const rows = handle.element.querySelectorAll<HTMLElement>(
      ".awesomeado-hierarchy-filter__option",
    );
    expect([...rows].map((row) => row.textContent)).toEqual([
      "All projects",
      "Epic",
      "Feature",
      "Story",
    ]);
    expect(rows[2]?.style.paddingLeft).toBe("26px");
    expect(rows[3]?.title).toBe("Epic / Feature / Story");
  });

  it("selects one item, lights the trigger, and reports its id", () => {
    const onChange = vi.fn();
    const handle = renderHierarchyFilter(document, { items: ITEMS, onChange });
    document.body.append(handle.element);
    const trigger = handle.element.querySelector<HTMLButtonElement>("button")!;
    trigger.click();
    handle.element.querySelector<HTMLInputElement>('label[data-item-id="2"] input')!.click();

    expect(handle.selectedId()).toBe(2);
    expect(onChange).toHaveBeenCalledWith(2);
    expect(trigger.getAttribute("aria-pressed")).toBe("true");
    expect(trigger.title).toBe("Project filter: Feature");
  });

  it("clears invalid replacement selections without firing onChange", () => {
    const onChange = vi.fn();
    const handle = renderHierarchyFilter(document, {
      items: ITEMS,
      selectedId: 1,
      onChange,
    });

    handle.setSelectedId(99);

    expect(handle.selectedId()).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });
});
