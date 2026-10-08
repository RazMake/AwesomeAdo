import { describe, expect, it } from "vitest";

import {
  refreshRequestOf,
  renderHeaderTextButton,
  setHeaderButtonAvailability,
} from "./HeaderButtons";

describe("refreshRequestOf", () => {
  it("reads a plain click as an ordinary re-read", () => {
    expect(refreshRequestOf(new MouseEvent("click"))).toEqual({ discardCaches: false });
  });

  it("reads a Ctrl+click as a request to discard cached data", () => {
    expect(refreshRequestOf(new MouseEvent("click", { ctrlKey: true }))).toEqual({
      discardCaches: true,
    });
  });

  it("reads a Cmd+click (macOS) as a request to discard cached data", () => {
    expect(refreshRequestOf(new MouseEvent("click", { metaKey: true }))).toEqual({
      discardCaches: true,
    });
  });
});

describe("renderHeaderTextButton", () => {
  it("is a released, worded header action sized like the others", () => {
    const button = renderHeaderTextButton(document, { className: "test__add", label: "Add" });

    expect(button.type).toBe("button");
    expect(button.className).toBe("test__add");
    expect(button.textContent).toBe("Add");
    expect(button.style.height).toBe("27.2px");
    expect(button.style.color).toBe("var(--text-primary-color)");
  });
});

describe("setHeaderButtonAvailability", () => {
  it("disables and dims the button with the reason as its tooltip, and restores it", () => {
    const button = renderHeaderTextButton(document, { className: "test__add", label: "Add" });

    setHeaderButtonAvailability(button, "Not now", "Add an item");
    expect(button.disabled).toBe(true);
    expect(button.title).toBe("Not now");
    expect(button.getAttribute("aria-label")).toBe("Not now");
    expect(button.style.opacity).toBe("0.5");

    setHeaderButtonAvailability(button, null, "Add an item");
    expect(button.disabled).toBe(false);
    expect(button.title).toBe("Add an item");
    expect(button.style.opacity).toBe("1");
    expect(button.style.cursor).toBe("pointer");
  });
});
