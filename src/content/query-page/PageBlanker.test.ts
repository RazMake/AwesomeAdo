import { beforeEach, describe, expect, it } from "vitest";

import { PageBlanker } from "./PageBlanker";

describe("PageBlanker", () => {
  let blanker: PageBlanker;

  beforeEach(() => {
    // Reset DOM to clean state for each test
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    blanker = new PageBlanker(document);
  });

  it("leaves existing body children visible when not enhancing", () => {
    const child = document.createElement("div");
    child.id = "existing";
    document.body.append(child);

    blanker.apply(false);

    expect(document.getElementById("existing")).toBeTruthy();
    expect(document.querySelector("style")).toBeNull();
  });

  it("does not add a style when not enhancing", () => {
    blanker.apply(false);
    expect(document.querySelectorAll("style")).toHaveLength(0);
  });

  it("adds exactly one style element that hides only the main landmark when enhancing", () => {
    const child = document.createElement("div");
    document.body.append(child);

    blanker.apply(true);

    const styles = document.querySelectorAll("style");
    expect(styles).toHaveLength(1);
    // Blanks the content below the breadcrumb bar without hiding every body child.
    expect(styles[0]?.textContent).toContain('[role="main"]');
    expect(styles[0]?.textContent).not.toContain("body > *");
    expect(styles[0]?.textContent).toContain("display: none");
    // Original children are still in the DOM
    expect(document.body.children.length).toBeGreaterThan(0);
  });

  it("is idempotent: calling apply(true) twice adds exactly one style", () => {
    blanker.apply(true);
    blanker.apply(true);

    expect(document.querySelectorAll("style")).toHaveLength(1);
  });

  it("paints ADO's theme background token so the blank surface follows the account theme", () => {
    blanker.apply(true);

    // Following ADO's own `--background-color` token keeps the Enhanced View on-theme (dark stays
    // dark) instead of hardcoding white; #fff only backstops an un-themed or still-loading page.
    const style = document.querySelector("style");
    expect(style?.textContent).toContain("background: var(--background-color, #fff)");
    expect(style?.textContent).not.toContain("background: #fff !important");
  });

  it("removes the style when called with false after true", () => {
    const child = document.createElement("div");
    document.body.append(child);
    blanker.apply(true);

    blanker.apply(false);

    expect(document.querySelector("style")).toBeNull();
  });

  it("preserves existing host-owned element with the same id after apply(true)", () => {
    const hostElement = document.createElement("style");
    hostElement.id = "awesomeado-blank-query-page";
    hostElement.textContent = "/* host owned */";
    document.head.append(hostElement);

    blanker.apply(true);

    // Host-owned element still present
    expect(document.head.contains(hostElement)).toBe(true);
    // An additional style was still inserted
    expect(document.querySelectorAll("style")).toHaveLength(2);
  });

  it("disabling after re-apply removes only the blanker-owned style", () => {
    const hostElement = document.createElement("style");
    hostElement.id = "awesomeado-blank-query-page";
    hostElement.textContent = "/* host owned */";
    document.head.append(hostElement);

    blanker.apply(true);
    blanker.apply(false);

    // Host-owned element remains
    expect(document.head.contains(hostElement)).toBe(true);
    // Blanker style removed
    expect(document.querySelectorAll("style")).toHaveLength(1);
  });

  it("covers a main landmark inserted after apply(true) without a second apply", () => {
    blanker.apply(true);
    // ADO renders the content region after initial load — the document-level rule covers it.
    const lateContent = document.createElement("main");
    document.body.append(lateContent);

    // One single document-level style covers the main landmark whenever ADO inserts it.
    expect(document.querySelectorAll("style")).toHaveLength(1);
    // No second apply was called
  });
});
