import { describe, expect, it } from "vitest";

import { ensureControlStyles } from "./controlStyles";

describe("ensureControlStyles", () => {
  it("adds the stylesheet once, however many times it is asked", () => {
    ensureControlStyles(document, "awesomeado-test-style", ".a{color:red}");
    ensureControlStyles(document, "awesomeado-test-style", ".b{color:blue}");

    const styles = document.querySelectorAll("#awesomeado-test-style");
    expect(styles).toHaveLength(1);
    expect(styles[0]?.textContent).toBe(".a{color:red}");

    styles[0]?.remove();
  });

  it("keeps separate ids apart", () => {
    ensureControlStyles(document, "awesomeado-test-one", ".one{}");
    ensureControlStyles(document, "awesomeado-test-two", ".two{}");

    expect(document.getElementById("awesomeado-test-one")).toBeTruthy();
    expect(document.getElementById("awesomeado-test-two")).toBeTruthy();

    document.getElementById("awesomeado-test-one")?.remove();
    document.getElementById("awesomeado-test-two")?.remove();
  });
});
