import { afterEach, describe, expect, it } from "vitest";

import { DropIndicator } from "./DropIndicator";

/** A level container holding two row wrappers, mirroring how the tree renders one depth. */
function buildLevel(): { container: HTMLElement; first: HTMLElement; second: HTMLElement } {
  const container = document.createElement("div");
  const first = document.createElement("div");
  const second = document.createElement("div");
  container.append(first, second);
  document.body.append(container);
  return { container, first, second };
}

/** The children of `container`, with the insertion line named so order reads at a glance. */
const layoutOf = (container: HTMLElement): string[] =>
  [...container.children].map((child) =>
    child.classList.contains("awesomeado-tracking__drop-line") ? "line" : "row",
  );

const lineIn = (container: HTMLElement): HTMLElement | null =>
  container.querySelector<HTMLElement>(".awesomeado-tracking__drop-line");

afterEach(() => {
  document.body.innerHTML = "";
});

describe("DropIndicator - the insertion line", () => {
  it("slots the line above the row when the drop lands before it", () => {
    const { container, second } = buildLevel();

    new DropIndicator(document).show(second, "before", {
      reparenting: false,
      parentContainer: null,
    });

    expect(layoutOf(container)).toEqual(["row", "line", "row"]);
  });

  it("slots the line below the row when the drop lands after it", () => {
    const { container, second } = buildLevel();

    new DropIndicator(document).show(second, "after", {
      reparenting: false,
      parentContainer: null,
    });

    expect(layoutOf(container)).toEqual(["row", "row", "line"]);
  });

  it("hides the line from assistive technology and from the pointer", () => {
    const { container, first } = buildLevel();

    new DropIndicator(document).show(first, "before", {
      reparenting: false,
      parentContainer: null,
    });

    const line = lineIn(container)!;
    expect(line.getAttribute("aria-hidden")).toBe("true");
    expect(line.style.pointerEvents).toBe("none");
    expect(line.style.background).toBe("var(--communication-background)");
    expect(line.style.boxShadow).toContain("var(--palette-neutral-8)");
  });

  it("moves the one line rather than adding another as the pointer travels", () => {
    const { container, first, second } = buildLevel();
    const indicator = new DropIndicator(document);

    indicator.show(first, "before", { reparenting: false, parentContainer: null });
    indicator.show(second, "after", { reparenting: false, parentContainer: null });

    expect(container.querySelectorAll(".awesomeado-tracking__drop-line")).toHaveLength(1);
    expect(layoutOf(container)).toEqual(["row", "row", "line"]);
  });

  it("uses different themed marker roles for reordering and changing parent", () => {
    const { first } = buildLevel();
    const indicator = new DropIndicator(document);

    indicator.show(first, "before", { reparenting: false, parentContainer: null });
    const line = document.querySelector<HTMLElement>(".awesomeado-tracking__drop-line")!;
    expect(line.dataset.dropKind).toBe("reorder");
    expect(line.style.background).toBe("var(--communication-background)");

    indicator.show(first, "after", { reparenting: true, parentContainer: first.parentElement });
    expect(line.dataset.dropKind).toBe("reparent");
    expect(line.style.background).toBe("var(--success-foreground)");
  });

  it("shows nothing for a wrapper that is not in the document", () => {
    const orphan = document.createElement("div");

    new DropIndicator(document).show(orphan, "before", {
      reparenting: false,
      parentContainer: null,
    });

    expect(document.querySelector(".awesomeado-tracking__drop-line")).toBeNull();
  });

  it("removes the line on clear, and tolerates a clear with nothing shown", () => {
    const { container, first } = buildLevel();
    const indicator = new DropIndicator(document);

    indicator.clear();
    indicator.show(first, "before", { reparenting: false, parentContainer: null });
    indicator.clear();

    expect(lineIn(container)).toBeNull();
  });
});

describe("DropIndicator - the re-parent wash", () => {
  /** Whether `element` currently wears the destination wash. */
  const isWashed = (element: HTMLElement): boolean =>
    element.style.getPropertyValue("outline").length > 0;

  it("washes the destination container when the drop also changes parent", () => {
    const { container, first } = buildLevel();
    const destination = document.createElement("div");
    document.body.append(destination);

    new DropIndicator(document).show(first, "before", {
      reparenting: true,
      parentContainer: destination,
    });

    expect(isWashed(destination)).toBe(true);
    expect(destination.style.getPropertyValue("outline")).toContain("dashed");
    expect(destination.style.getPropertyValue("background")).toBe("var(--palette-neutral-4)");
    expect(destination.style.getPropertyValue("outline")).toContain("var(--success-foreground)");
    expect(isWashed(container)).toBe(false);
  });

  it("leaves the destination unwashed when the item keeps its parent", () => {
    const { first } = buildLevel();
    const destination = document.createElement("div");

    new DropIndicator(document).show(first, "before", {
      reparenting: false,
      parentContainer: destination,
    });

    expect(isWashed(destination)).toBe(false);
  });

  it("moves the wash off the container the pointer just left", () => {
    const { first } = buildLevel();
    const left = document.createElement("div");
    const entered = document.createElement("div");
    const indicator = new DropIndicator(document);

    indicator.show(first, "before", { reparenting: true, parentContainer: left });
    indicator.show(first, "before", { reparenting: true, parentContainer: entered });

    expect(isWashed(left)).toBe(false);
    expect(isWashed(entered)).toBe(true);
  });

  it("leaves the wash in place while the pointer stays over the same destination", () => {
    const { first } = buildLevel();
    const destination = document.createElement("div");
    const indicator = new DropIndicator(document);

    indicator.show(first, "before", { reparenting: true, parentContainer: destination });
    indicator.show(first, "after", { reparenting: true, parentContainer: destination });

    expect(isWashed(destination)).toBe(true);
  });

  it("removes the wash on clear", () => {
    const { first } = buildLevel();
    const destination = document.createElement("div");
    const indicator = new DropIndicator(document);

    indicator.show(first, "before", { reparenting: true, parentContainer: destination });
    indicator.clear();

    expect(isWashed(destination)).toBe(false);
    expect(destination.style.getPropertyValue("background")).toBe("");
    expect(destination.style.getPropertyValue("border-radius")).toBe("");
  });
});
