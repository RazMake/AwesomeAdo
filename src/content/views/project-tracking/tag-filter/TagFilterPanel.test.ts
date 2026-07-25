import { describe, expect, it } from "vitest";

import { renderTagFilterPanel } from "./TagFilterPanel";

describe("renderTagFilterPanel", () => {
  it("renders one pill per tag plus the label", () => {
    const panel = renderTagFilterPanel(document, {
      tags: ["Alpha", "Beta", null],
      selected: new Set(),
      onChange: () => {},
    });

    expect(panel.querySelector(".awesomeado-tag-filter__label")?.textContent).toBe(
      "Filter by tag:",
    );
    const pills = panel.querySelectorAll(".awesomeado-tag-pill");
    expect(pills.length).toBe(3);
    expect(pills[2]?.textContent).toBe("??");
  });

  it("reflects the selected pills", () => {
    const panel = renderTagFilterPanel(document, {
      tags: ["Alpha", "Beta"],
      selected: new Set(["Beta"]),
      onChange: () => {},
    });

    const pills = panel.querySelectorAll(".awesomeado-tag-pill");
    expect(pills[0]?.classList.contains("awesomeado-tag-pill--selected")).toBe(false);
    expect(pills[1]?.classList.contains("awesomeado-tag-pill--selected")).toBe(true);
  });

  it("adds a tag to the selection when an unselected pill is clicked", () => {
    const selected = new Set<string | null>();
    let reported: Set<string | null> | null = null;
    const panel = renderTagFilterPanel(document, {
      tags: ["Alpha", "Beta"],
      selected,
      onChange: (next) => (reported = next),
    });

    panel.querySelectorAll<HTMLButtonElement>(".awesomeado-tag-pill")[0]?.click();

    expect(selected.has("Alpha")).toBe(true);
    expect(reported).toBe(selected);
  });

  it("removes a tag from the selection when a selected pill is clicked", () => {
    const selected = new Set<string | null>(["Alpha"]);
    const panel = renderTagFilterPanel(document, {
      tags: ["Alpha", "Beta"],
      selected,
      onChange: () => {},
    });

    panel.querySelectorAll<HTMLButtonElement>(".awesomeado-tag-pill")[0]?.click();

    expect(selected.has("Alpha")).toBe(false);
  });

  it("toggles the untagged (??) bucket via the null pill", () => {
    const selected = new Set<string | null>();
    const panel = renderTagFilterPanel(document, {
      tags: ["Alpha", null],
      selected,
      onChange: () => {},
    });

    panel.querySelectorAll<HTMLButtonElement>(".awesomeado-tag-pill")[1]?.click();

    expect(selected.has(null)).toBe(true);
  });
});
