import { afterEach, describe, expect, it } from "vitest";

import {
  MODIFIER_HIGHLIGHT_CLASS,
  createRowEmphasisStyle,
  modifierHighlightTracker,
  restripeVisibleRows,
  type RowEmphasisClasses,
} from "./RowEmphasis";

const CLASSES: RowEmphasisClasses = {
  wrapper: "test-item",
  surface: "test-surface",
  children: "test-children",
};

/** One wrapper carrying its own surface, plus a children container holding the nested wrappers. */
function createRow(id: string, children: HTMLElement[] = []): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = CLASSES.wrapper;
  wrapper.dataset.rowId = id;
  const surface = document.createElement("div");
  surface.className = CLASSES.surface;
  wrapper.append(surface);
  if (children.length > 0) {
    const box = document.createElement("div");
    box.className = CLASSES.children;
    box.append(...children);
    wrapper.append(box);
  }
  return wrapper;
}

function stripes(container: HTMLElement): (string | undefined)[] {
  return [...container.querySelectorAll<HTMLElement>(`.${CLASSES.wrapper}`)].map(
    (row) => row.dataset.rowStripe,
  );
}

afterEach(() => {
  document.body.replaceChildren();
  // The tracker latches, is shared per document, and outlives the test that pressed the keys.
  document.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }));
});

describe("createRowEmphasisStyle", () => {
  it("paints stripes, hover, and modifier emphasis from the theme's own row roles", () => {
    const css = createRowEmphasisStyle(document, CLASSES).textContent ?? "";

    expect(css).toContain('.test-item[data-row-stripe="base"] > .test-surface');
    expect(css).toContain("var(--item-row-background)");
    expect(css).toContain("var(--item-row-alternate-background)");
    expect(css).toContain(".test-item > .test-surface:hover");
    expect(css).toContain("var(--item-row-hover-background)");
    expect(css).toContain(`.${MODIFIER_HIGHLIGHT_CLASS} .test-item > .test-surface:hover`);
    expect(css).toContain("var(--item-row-emphasis-background)");
  });

  it("omits the surface rule entirely when the caller adds no declarations of its own", () => {
    expect(createRowEmphasisStyle(document, CLASSES).textContent).not.toContain("padding-bottom");
    expect(createRowEmphasisStyle(document, CLASSES, "padding-bottom: 4px;").textContent).toContain(
      ".test-item > .test-surface {\n  padding-bottom: 4px;\n}",
    );
  });
});

describe("restripeVisibleRows", () => {
  it("alternates in visible depth-first order across nesting levels", () => {
    const container = document.createElement("div");
    container.append(createRow("1", [createRow("2"), createRow("3")]), createRow("4"));

    restripeVisibleRows(container, CLASSES);

    expect(stripes(container)).toEqual(["base", "alternate", "base", "alternate"]);
  });

  it("skips rows inside a collapsed branch and forgets the stripe they had", () => {
    const container = document.createElement("div");
    const parent = createRow("1", [createRow("2")]);
    container.append(parent, createRow("3"));
    restripeVisibleRows(container, CLASSES);

    parent.querySelector<HTMLElement>(`.${CLASSES.children}`)!.style.display = "none";
    restripeVisibleRows(container, CLASSES);

    expect(stripes(container)).toEqual(["base", undefined, "alternate"]);
  });
});

describe("modifierHighlightTracker", () => {
  it("marks every registered root only while Ctrl+Shift+Alt is held", () => {
    const root = document.createElement("div");
    document.body.append(root);
    modifierHighlightTracker(document).register(root);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Alt", ctrlKey: true, shiftKey: true }),
    );
    expect(root.classList.contains(MODIFIER_HIGHLIGHT_CLASS)).toBe(false);

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Alt", ctrlKey: true, shiftKey: true, altKey: true }),
    );
    expect(root.classList.contains(MODIFIER_HIGHLIGHT_CLASS)).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt", ctrlKey: true }));
    expect(root.classList.contains(MODIFIER_HIGHLIGHT_CLASS)).toBe(false);
  });

  it("clears the latch when the window loses focus, which never reports the key-up", () => {
    const root = document.createElement("div");
    document.body.append(root);
    modifierHighlightTracker(document).register(root);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Alt", ctrlKey: true, shiftKey: true, altKey: true }),
    );

    window.dispatchEvent(new Event("blur"));

    expect(root.classList.contains(MODIFIER_HIGHLIGHT_CLASS)).toBe(false);
  });

  it("applies the latched state to a root that registers while the keys are already held", () => {
    const tracker = modifierHighlightTracker(document);
    const first = document.createElement("div");
    document.body.append(first);
    tracker.register(first);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Alt", ctrlKey: true, shiftKey: true, altKey: true }),
    );

    const late = document.createElement("div");
    document.body.append(late);
    tracker.register(late);

    expect(late.classList.contains(MODIFIER_HIGHLIGHT_CLASS)).toBe(true);
    tracker.unregister(late);
    expect(late.classList.contains(MODIFIER_HIGHLIGHT_CLASS)).toBe(false);
  });

  it("drops a root that left the document, so an undisposed view cannot leak", () => {
    const tracker = modifierHighlightTracker(document);
    const detached = document.createElement("div");
    document.body.append(detached);
    tracker.register(detached);
    detached.remove();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Alt", ctrlKey: true, shiftKey: true, altKey: true }),
    );

    expect(detached.classList.contains(MODIFIER_HIGHLIGHT_CLASS)).toBe(false);
  });

  it("shares one tracker per document, so two views cannot disagree about the modifier", () => {
    expect(modifierHighlightTracker(document)).toBe(modifierHighlightTracker(document));
  });
});
