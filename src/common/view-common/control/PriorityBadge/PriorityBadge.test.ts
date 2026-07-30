import { afterEach, describe, expect, it, vi } from "vitest";

import { renderPriorityBadge } from "./PriorityBadge";

afterEach(() => {
  document.body.innerHTML = "";
});

function chipOf(badge: HTMLElement): HTMLButtonElement {
  return badge.querySelector<HTMLButtonElement>(".awesomeado-priority__badge")!;
}

describe("renderPriorityBadge", () => {
  it("uses one cross-theme background and border for every priority", () => {
    const chips = [0, 1, 2, 3, 4].map((priority) =>
      chipOf(renderPriorityBadge(document, { priority })),
    );

    expect(new Set(chips.map((chip) => chip.style.background))).toEqual(
      new Set(["var(--priority-background)"]),
    );
    expect(new Set(chips.map((chip) => chip.style.border))).toEqual(
      new Set(["1px solid var(--priority-border)"]),
    );
  });

  it("emphasizes P0 through P2 while later priorities use muted normal text", () => {
    const p0 = chipOf(renderPriorityBadge(document, { priority: 0 }));
    const p1 = chipOf(renderPriorityBadge(document, { priority: 1 }));
    const p2 = chipOf(renderPriorityBadge(document, { priority: 2 }));
    const p3 = chipOf(renderPriorityBadge(document, { priority: 3 }));
    const p4 = chipOf(renderPriorityBadge(document, { priority: 4 }));

    expect(p0.style.color).toBe("var(--priority-critical-foreground)");
    expect(p1.style.color).toBe("var(--priority-high-foreground)");
    expect(p0.style.color).not.toContain("color-mix");
    expect(p1.style.color).not.toContain("color-mix");
    expect(p2.style.color).toBe("var(--priority-medium-foreground)");
    expect([p3, p4].every((chip) => chip.style.color === "var(--text-secondary-color)")).toBe(true);
    expect([p0, p1, p2].every((chip) => chip.style.fontWeight === "800")).toBe(true);
    expect([p3, p4].every((chip) => chip.style.fontWeight === "400")).toBe(true);
    expect([p0, p1, p2, p3, p4].every((chip) => chip.style.fontSize === "11px")).toBe(true);
    expect([p0, p1, p2, p3, p4].every((chip) => chip.style.padding === "2px 6px")).toBe(true);
  });

  it("shows every alternative as the same formatted chip and excludes the current value", () => {
    const badge = renderPriorityBadge(document, { priority: 1 });
    document.body.append(badge);

    chipOf(badge).click();

    const options = [...badge.querySelectorAll<HTMLButtonElement>(".awesomeado-priority__option")];
    expect(options.map((option) => option.textContent)).toEqual(["P0", "P2", "P3", "P4"]);
    expect(options.map((option) => option.style.fontWeight)).toEqual(["800", "800", "400", "400"]);
    expect(options[0]?.style.padding).toBe(chipOf(badge).style.padding);
    expect(options[0]?.style.borderRadius).toBe(chipOf(badge).style.borderRadius);
    expect(
      options.every((option) => option.style.background === chipOf(badge).style.background),
    ).toBe(true);
    expect(options.every((option) => option.style.border === chipOf(badge).style.border)).toBe(
      true,
    );
  });

  it("reports a picked priority, closes the popup, and reflects a committed update", () => {
    const onChange = vi.fn();
    const badge = renderPriorityBadge(document, { priority: 2, onChange });
    document.body.append(badge);

    chipOf(badge).click();
    badge.querySelector<HTMLButtonElement>(".awesomeado-priority__option")?.click();

    expect(onChange).toHaveBeenCalledWith(0);
    expect(badge.querySelector(".awesomeado-priority__popup")).toBeNull();

    badge.setPriority(1);
    expect(chipOf(badge).textContent).toContain("P1");
    expect(chipOf(badge).style.background).toBe("var(--priority-background)");
    expect(chipOf(badge).style.color).toBe("var(--priority-high-foreground)");
  });
});
