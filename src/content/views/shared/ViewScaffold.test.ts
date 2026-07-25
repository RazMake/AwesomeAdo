import { describe, expect, it } from "vitest";

import { renderViewScaffold } from "./ViewScaffold";

describe("renderViewScaffold", () => {
  it("renders the title and message text", () => {
    const root = renderViewScaffold(document, { title: "Hello View", message: "Hello, world." });

    expect(root.querySelector(".awesomeado-view__title")?.textContent).toBe("Hello View");
    expect(root.querySelector(".awesomeado-view__message")?.textContent).toBe("Hello, world.");
  });

  it("sets its own class so the surface can find it", () => {
    const root = renderViewScaffold(document, { title: "T", message: "M" });

    expect(root.classList.contains("awesomeado-view")).toBe(true);
    expect(root.tagName).toBe("SECTION");
  });

  it("uses text content rather than markup so an injected title cannot inject HTML", () => {
    const root = renderViewScaffold(document, {
      title: "<img src=x onerror=alert(1)>",
      message: "safe",
    });

    // textContent keeps the value inert: no child <img> is created from the string.
    expect(root.querySelector("img")).toBeNull();
    expect(root.querySelector(".awesomeado-view__title")?.textContent).toBe(
      "<img src=x onerror=alert(1)>",
    );
  });
});
