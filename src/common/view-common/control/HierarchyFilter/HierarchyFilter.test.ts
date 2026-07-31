import { afterEach, describe, expect, it, vi } from "vitest";

import { renderHierarchyFilter } from "./HierarchyFilter";

const ITEMS = [
  { id: 1, label: "Epic: Portfolio", title: "Portfolio", color: "rgb(1, 2, 3)", depth: 0 },
  { id: 2, label: "Feature: Search", title: "Search", color: "rgb(4, 5, 6)", depth: 1 },
  { id: 3, label: "Story: Results", title: "Results", color: "rgb(7, 8, 9)", depth: 2 },
  { id: 4, label: "Feature: Billing", title: "Billing", color: "rgb(4, 5, 6)", depth: 1 },
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
      "Epic: Portfolio",
      "Feature: Search",
      "Story: Results",
      "Feature: Billing",
    ]);
    expect(rows[2]?.style.paddingLeft).toBe("26px");
    expect(rows[3]?.querySelector<HTMLElement>("span")?.title).toBe("Story: Results");
    expect(rows[3]?.querySelector<HTMLElement>("span")?.style.textOverflow).toBe("ellipsis");
    expect(rows[2]?.style.color).toBe("rgb(4, 5, 6)");
    const popup = handle.element.querySelector<HTMLElement>(".awesomeado-hierarchy-filter__popup")!;
    expect(popup.style.width).toBe("max-content");
    expect(popup.style.maxWidth).toBe("calc(100vw - 16px)");
  });

  it("searches titles case-insensitively and retains matching items' ancestors", () => {
    const handle = renderHierarchyFilter(document, { items: ITEMS });
    document.body.append(handle.element);
    handle.element.querySelector<HTMLButtonElement>("button")!.click();
    const search = handle.element.querySelector<HTMLInputElement>("input[type=search]")!;

    search.value = "sUl";
    search.dispatchEvent(new Event("input"));

    const rows = handle.element.querySelectorAll<HTMLElement>(
      ".awesomeado-hierarchy-filter__option",
    );
    expect([...rows].map((row) => row.dataset.itemId)).toEqual(["", "1", "2", "3"]);
    expect(document.activeElement).toBe(search);
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
    expect(trigger.title).toBe("Project filter: Feature: Search");
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
