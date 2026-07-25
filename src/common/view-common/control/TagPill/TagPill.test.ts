import { describe, expect, it } from "vitest";

import { renderTagPill, tagPillBackground, UNTAGGED_LABEL } from "./TagPill";

describe("renderTagPill", () => {
  it("shows the tag text for a real tag", () => {
    const pill = renderTagPill(document, { tag: "Alpha" });
    expect(pill.textContent).toBe("Alpha");
    expect(pill.classList.contains("awesomeado-tag-pill--untagged")).toBe(false);
  });

  it("shows the neutral ?? label for a null tag", () => {
    const pill = renderTagPill(document, { tag: null });
    expect(pill.textContent).toBe(UNTAGGED_LABEL);
    expect(pill.classList.contains("awesomeado-tag-pill--untagged")).toBe(true);
  });

  it("treats an empty-string tag as untagged", () => {
    const pill = renderTagPill(document, { tag: "" });
    expect(pill.textContent).toBe(UNTAGGED_LABEL);
    expect(pill.classList.contains("awesomeado-tag-pill--untagged")).toBe(true);
  });

  it("renders a static span by default", () => {
    const pill = renderTagPill(document, { tag: "Alpha" });
    expect(pill.tagName).toBe("SPAN");
  });

  it("renders an interactive button when interactive", () => {
    const pill = renderTagPill(document, { tag: "Alpha", interactive: true });
    expect(pill.tagName).toBe("BUTTON");
    expect(pill.style.cssText).toContain("cursor: pointer");
  });

  it("calls onToggle when an interactive pill is clicked", () => {
    let toggled = 0;
    const pill = renderTagPill(document, {
      tag: "Alpha",
      interactive: true,
      onToggle: () => (toggled += 1),
    });
    pill.click();
    expect(toggled).toBe(1);
  });

  it("does not react to clicks when not interactive", () => {
    const pill = renderTagPill(document, { tag: "Alpha" });
    // A static span has no button semantics; clicking it is a no-op (no throw, no handler).
    expect(() => pill.click()).not.toThrow();
  });

  it("marks the selected interactive pill and rings it", () => {
    const pill = renderTagPill(document, { tag: "Alpha", interactive: true, selected: true });
    expect(pill.classList.contains("awesomeado-tag-pill--selected")).toBe(true);
    // jsdom's CSSOM normalizes `#fff` → `rgb(255, 255, 255)`, so assert against the normalized form.
    expect(pill.style.cssText).toContain("border: 2px solid rgb(255, 255, 255)");
  });

  it("dims an unselected interactive pill", () => {
    const pill = renderTagPill(document, { tag: "Alpha", interactive: true, selected: false });
    expect(pill.classList.contains("awesomeado-tag-pill--selected")).toBe(false);
    expect(pill.style.cssText).toContain("opacity: 0.55");
  });

  it("gives the same tag the same color and different tags different colors", () => {
    expect(tagPillBackground("Alpha")).toBe(tagPillBackground("Alpha"));
    expect(tagPillBackground("Alpha")).not.toBe(tagPillBackground("Beta"));
  });

  it("colors real tags brightly and the untagged pill grey", () => {
    expect(tagPillBackground("Alpha")).toContain("hsl(");
    expect(tagPillBackground(null)).toContain("128,128,128");
    expect(tagPillBackground("")).toContain("128,128,128");
  });
});
