import { afterEach, describe, expect, it, vi } from "vitest";

import { showAddedBurst } from "./addedBurst";

function burst(): HTMLElement {
  return document.querySelector<HTMLElement>(".awesomeado-item-collector__added-burst")!;
}

describe("showAddedBurst", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });

  it("sits below-right of the pointer, clear of the cursor, and drifts away from it", () => {
    const animate = vi.fn(() => ({ onfinish: null, oncancel: null }));
    HTMLElement.prototype.animate = animate as unknown as HTMLElement["animate"];
    const icon = document.createElement("img");
    showAddedBurst(document, 100, 100, { icon, color: "#cc293d" });
    expect(burst().style.left).toBe("120px");
    expect(burst().style.top).toBe("126px");
    expect(burst().contains(icon)).toBe(true);
    expect(burst().style.filter).toContain("#cc293d");
    const frames = (animate.mock.calls[0] as unknown as [Keyframe[]])[0];
    expect(String(frames.at(-1)!.transform)).toContain("calc(-50% + 18px)");
  });

  it("flips to the pointer's other side near the right and bottom edges", () => {
    HTMLElement.prototype.animate = vi.fn(() => ({
      onfinish: null,
      oncancel: null,
    })) as unknown as HTMLElement["animate"];
    showAddedBurst(document, window.innerWidth - 10, window.innerHeight - 10, {
      icon: document.createElement("span"),
      color: null,
    });
    expect(burst().style.left).toBe(`${window.innerWidth - 30}px`);
    expect(burst().style.top).toBe(`${window.innerHeight - 36}px`);
  });
});
