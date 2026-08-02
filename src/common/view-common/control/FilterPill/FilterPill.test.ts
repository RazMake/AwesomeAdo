import { describe, expect, it } from "vitest";

import {
  appendFilterPillCounts,
  filterPillStyle,
  renderFilterPillCount,
  renderFilterPillFamilies,
} from "./FilterPill";

const COUNT = {
  kind: "active",
  label: "Active",
  background: "var(--communication-background)",
  color: "var(--text-on-communication-background)",
};

describe("renderFilterPillCount", () => {
  it("shows the count and explains it through matching accessible and hover labels", () => {
    const count = renderFilterPillCount(document, { ...COUNT, value: 3 });

    expect(count.textContent).toBe("3");
    expect(count.getAttribute("aria-label")).toBe("Active: 3");
    expect(count.title).toBe("Active: 3");
    expect(count.dataset.count).toBe("active");
    expect(count.className).toBe(
      "awesomeado-filter-pill__count awesomeado-filter-pill__count--active",
    );
    expect(count.style.background).toBe("var(--communication-background)");
    expect(count.style.color).toBe("var(--text-on-communication-background)");
  });

  it("floors a fractional total and clamps a negative one, in the label as well as the circle", () => {
    const fractional = renderFilterPillCount(document, { ...COUNT, value: 2.9 });
    const negative = renderFilterPillCount(document, { ...COUNT, value: -4 });

    expect(fractional.textContent).toBe("2");
    expect(fractional.title).toBe("Active: 2");
    expect(negative.textContent).toBe("0");
    // The label is built from the clamped text, so it must never announce a negative queue.
    expect(negative.title).toBe("Active: 0");
    expect(negative.getAttribute("aria-label")).toBe("Active: 0");
  });

  it("keeps a wide count from resizing its pill", () => {
    const wide = renderFilterPillCount(document, { ...COUNT, value: 1234 });

    expect(wide.textContent).toBe("1234");
    expect(wide.style.height).toBe("14px");
    expect(wide.style.minWidth).toBe("14px");
    expect(wide.style.boxSizing).toBe("border-box");
  });
});

describe("appendFilterPillCounts", () => {
  it("appends the queue total before the active count, each with its own label", () => {
    const pill = document.createElement("span");

    appendFilterPillCounts(document, pill, { total: 7, active: 2 });

    const counts = [...pill.querySelectorAll<HTMLElement>(".awesomeado-filter-pill__count")];
    expect(counts.map((count) => count.dataset.count)).toEqual(["queue", "active"]);
    expect(counts.map((count) => count.textContent)).toEqual(["7", "2"]);
    expect(counts.map((count) => count.title)).toEqual(["Queue: 7", "Active: 2"]);
  });
});

describe("filterPillStyle", () => {
  it("marks a selected pill with a visible border while reserving the same space when unselected", () => {
    const selected = filterPillStyle({ background: "red", color: "white", selected: true });
    const unselected = filterPillStyle({ background: "red", color: "white", selected: false });

    expect(selected).toContain("border:2px solid var(--tag-selected-border)");
    // Transparent rather than absent, so selecting a pill never shifts the row's layout.
    expect(unselected).toContain("border:2px solid transparent");
    expect(selected).toContain("background:red");
    expect(selected).toContain("color:white");
    expect(selected).toContain("opacity:1");
    expect(unselected).toContain("opacity:1");
  });
});

describe("renderFilterPillFamilies", () => {
  it("groups pills per family and drops a family that has none", () => {
    const people = [document.createElement("span"), document.createElement("span")];
    const markers = [document.createElement("span")];

    const container = renderFilterPillFamilies(document, [
      { name: "people", pills: people },
      { name: "empty", pills: [] },
      { name: "markers", pills: markers },
    ]);

    const families = [...container.querySelectorAll<HTMLElement>(".awesomeado-filter-pill-family")];
    expect(families.map((family) => family.dataset.filterPillFamily)).toEqual([
      "people",
      "markers",
    ]);
    expect(families[0]?.children).toHaveLength(2);
    expect(families[1]?.children).toHaveLength(1);
    // An empty family must not leave a gap that reads as a missing filter.
    expect(container.querySelector('[data-filter-pill-family="empty"]')).toBeNull();
  });

  it("wraps within a family but keeps a wider gap between families", () => {
    const container = renderFilterPillFamilies(document, [
      { name: "people", pills: [document.createElement("span")] },
    ]);
    const family = container.querySelector<HTMLElement>(".awesomeado-filter-pill-family")!;

    expect(container.style.flexWrap).toBe("wrap");
    expect(container.style.gap).toBe("16px");
    expect(family.style.flexWrap).toBe("wrap");
    expect(family.style.gap).toBe("6px");
  });
});
