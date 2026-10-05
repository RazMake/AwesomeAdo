import { describe, expect, it, vi } from "vitest";

import { renderToggleButton } from "./ToggleButton";

function render(pressed: boolean, onToggle = vi.fn()): HTMLButtonElement {
  return renderToggleButton(document, {
    className: "test-toggle",
    label: "Show only requests",
    pressed,
    pressedTitle: "Show consumers",
    releasedTitle: "Show only the requests",
    onToggle,
  });
}

describe("renderToggleButton", () => {
  it("shows a released toggle as an outlined button naming what a press would do", () => {
    const button = render(false);

    expect(button.className).toBe("test-toggle");
    expect(button.type).toBe("button");
    expect(button.textContent).toBe("Show only requests");
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(button.title).toBe("Show only the requests");
    expect(button.getAttribute("aria-label")).toBe("Show only the requests");
    expect(button.style.background).toBe("transparent");
    expect(button.style.borderColor).toBe("var(--control-border-strong)");
  });

  it("fills a pressed toggle with the communication color", () => {
    const button = render(true);

    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.title).toBe("Show consumers");
    expect(button.style.background).toBe("var(--communication-background)");
    expect(button.style.color).toBe("var(--text-on-communication-background)");
  });

  it("flips and reports its new state on every press", () => {
    const onToggle = vi.fn();
    const button = render(false, onToggle);

    button.click();
    expect(button.getAttribute("aria-pressed")).toBe("true");
    button.click();

    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(onToggle.mock.calls).toEqual([[true], [false]]);
  });
});
