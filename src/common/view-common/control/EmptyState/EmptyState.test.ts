import { describe, expect, it } from "vitest";

import { renderEmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("states why the list is empty and how to refill it", () => {
    const panel = renderEmptyState(document, {
      message: "No items match the current filters.",
      hint: "Clear or widen a filter to bring items back.",
    });

    expect(panel.className).toBe("awesomeado-empty-state");
    // Announced, because the panel replaces content that silently disappeared under a filter change.
    expect(panel.getAttribute("role")).toBe("status");
    expect(panel.querySelector(".awesomeado-empty-state__message")?.textContent).toBe(
      "No items match the current filters.",
    );
    expect(panel.querySelector(".awesomeado-empty-state__hint")?.textContent).toBe(
      "Clear or widen a filter to bring items back.",
    );
    expect(panel.style.border).toBe("1px dashed var(--control-border)");
  });

  it("builds into the document it was handed, not the ambient one", () => {
    const other = document.implementation.createHTMLDocument("other");

    const panel = renderEmptyState(other, { message: "Nothing here.", hint: "Widen a filter." });

    expect(panel.ownerDocument).toBe(other);
  });

  it("sets both lines as text, so a caller can never inject markup through them", () => {
    const panel = renderEmptyState(document, {
      message: "<img src=x onerror=alert(1)>",
      hint: "<script>alert(2)</script>",
    });

    expect(panel.querySelector("img")).toBeNull();
    expect(panel.querySelector("script")).toBeNull();
    expect(panel.querySelector(".awesomeado-empty-state__message")?.textContent).toBe(
      "<img src=x onerror=alert(1)>",
    );
    expect(panel.querySelector(".awesomeado-empty-state__hint")?.textContent).toBe(
      "<script>alert(2)</script>",
    );
  });
});
