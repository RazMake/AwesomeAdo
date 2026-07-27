import { describe, expect, it } from "vitest";

import { renderTagFilterPills } from "./TagFilterPanel";

describe("renderTagFilterPills", () => {
  it("renders one loose pill per tag, ending with the untagged bucket", () => {
    const pills = renderTagFilterPills(document, {
      tags: ["Alpha", "Beta", null],
      selected: new Set(),
      onChange: () => {},
    });

    // Loose, not wrapped in a panel: they share the board's one wrapping filter row.
    expect(pills.length).toBe(3);
    expect(pills.every((pill) => pill.classList.contains("awesomeado-tag-pill"))).toBe(true);
    expect(pills[2]?.textContent).toBe("??");
  });

  it("reflects the selected pills", () => {
    const pills = renderTagFilterPills(document, {
      tags: ["Alpha", "Beta"],
      selected: new Set(["Beta"]),
      onChange: () => {},
    });

    expect(pills[0]?.classList.contains("awesomeado-tag-pill--selected")).toBe(false);
    expect(pills[1]?.classList.contains("awesomeado-tag-pill--selected")).toBe(true);
  });

  it("adds a tag to the selection when an unselected pill is clicked", () => {
    const selected = new Set<string | null>();
    let reported: Set<string | null> | null = null;
    const pills = renderTagFilterPills(document, {
      tags: ["Alpha", "Beta"],
      selected,
      onChange: (next) => (reported = next),
    });

    (pills[0] as HTMLButtonElement).click();

    expect(selected.has("Alpha")).toBe(true);
    expect(reported).toBe(selected);
  });

  it("removes a tag from the selection when a selected pill is clicked", () => {
    const selected = new Set<string | null>(["Alpha"]);
    const pills = renderTagFilterPills(document, {
      tags: ["Alpha", "Beta"],
      selected,
      onChange: () => {},
    });

    (pills[0] as HTMLButtonElement).click();

    expect(selected.has("Alpha")).toBe(false);
  });

  it("toggles the untagged (??) bucket via the null pill", () => {
    const selected = new Set<string | null>();
    const pills = renderTagFilterPills(document, {
      tags: ["Alpha", null],
      selected,
      onChange: () => {},
    });

    (pills[1] as HTMLButtonElement).click();

    expect(selected.has(null)).toBe(true);
  });
});
