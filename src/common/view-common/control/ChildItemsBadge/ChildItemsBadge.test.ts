import { afterEach, describe, expect, it, vi } from "vitest";

import { renderChildItemsBadge, type ChildItemDescriptor } from "./ChildItemsBadge";

/**
 * A stand-in for the assignee control the owning view builds per row. The badge only slots the
 * element in, so the tests do not need the real picker (and its directory) to prove that.
 */
const assigneeOf = (name = "Alice"): HTMLElement => {
  const chip = document.createElement("span");
  chip.className = "awesomeado-assigned";
  const label = document.createElement("span");
  label.className = "awesomeado-assigned__name";
  label.textContent = name;
  chip.append(label);
  return chip;
};

/** Build a child descriptor with sensible defaults, overridable per test. */
const childOf = (overrides: Partial<ChildItemDescriptor> = {}): ChildItemDescriptor => ({
  assignee: assigneeOf(),
  done: false,
  title: "Do the thing",
  titleColor: "#CC293D",
  eta: null,
  url: "https://dev.azure.com/contoso/web/_workitems/edit/42",
  ...overrides,
});

/** Whitespace-insensitive contains so `rgba(224, 168, 0, …)` matches `rgba(224,168,0,…)`. */
const containsColor = (cssValue: string, needle: string): boolean =>
  cssValue.replace(/\s/g, "").includes(needle.replace(/\s/g, ""));

const badgeOf = (root: HTMLElement): HTMLElement =>
  root.querySelector<HTMLElement>(".awesomeado-child-items__badge")!;

const popupOf = (root: HTMLElement): HTMLElement | null =>
  root.querySelector<HTMLElement>(".awesomeado-child-items__popup");

const checkboxOf = (root: HTMLElement): HTMLButtonElement =>
  popupOf(root)!.querySelector<HTMLButtonElement>(".awesomeado-child-items__check")!;

const titleOf = (root: HTMLElement): HTMLElement =>
  popupOf(root)!.querySelector<HTMLElement>(".awesomeado-child-items__title")!;

const titleTextOf = (root: HTMLElement): HTMLElement =>
  popupOf(root)!.querySelector<HTMLElement>(".awesomeado-child-items__title-text")!;

/** Opens the badge's popup on a body-mounted root, which is what the popup host needs to measure. */
const openPopup = (options: Parameters<typeof renderChildItemsBadge>[1]): HTMLElement => {
  const root = renderChildItemsBadge(document, options);
  document.body.append(root);
  badgeOf(root).click();
  return root;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderChildItemsBadge - badge and popup rendering", () => {
  it("shows the completed / total count", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf(), childOf(), childOf()],
      completedCount: 2,
    });

    expect(badgeOf(root).textContent).toBe("2 / 3");
  });

  it("tints the badge with a discrete wash of the supplied type color", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
      color: "#4FC3F7",
    });

    expect(containsColor(badgeOf(root).style.background, "rgba(79,195,247,0.12)")).toBe(true);
    expect(containsColor(badgeOf(root).style.borderColor, "rgba(79,195,247,0.35)")).toBe(true);
  });

  it("falls back to a neutral themed chip when no usable color is supplied", () => {
    const withoutColor = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
    });
    const withGarbage = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
      color: "not-a-color",
    });

    expect(badgeOf(withoutColor).style.background).toContain("--palette-neutral-4");
    expect(badgeOf(withGarbage).style.background).toContain("--palette-neutral-4");
  });

  it("does not render a popup until the badge is clicked", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 1,
    });

    expect(popupOf(root)).toBeNull();
  });

  it("opens a popup with one row per child on click", () => {
    document.body.innerHTML = "";
    const root = renderChildItemsBadge(document, {
      children: [childOf({ title: "First" }), childOf({ title: "Second" })],
      completedCount: 1,
    });
    document.body.append(root);

    badgeOf(root).click();

    const rows = root.querySelectorAll(".awesomeado-child-items__row");
    expect(rows).toHaveLength(2);
  });

  it("waits until the rebuilt badge is mounted before reopening its popup", async () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
      initiallyOpen: true,
    });

    expect(popupOf(root)).toBeNull();
    document.body.append(root);
    await Promise.resolve();

    expect(popupOf(root)).not.toBeNull();
  });

  it("sizes the popup from its rows, not from the badge it is anchored inside", () => {
    const root = openPopup({ children: [childOf()], completedCount: 0 });

    // Shrink-to-fit would resolve against the badge's own ~30px root and squeeze titles to a few
    // pixels wide, so the width has to come from the content and be capped only by the viewport.
    expect(popupOf(root)!.style.width).toBe("max-content");
    expect(popupOf(root)!.style.maxWidth).toBe("calc(100vw - 24px)");
  });
});

describe("renderChildItemsBadge - row content", () => {
  it("hands the assembled row and title to caller-owned behavior", () => {
    const onRowReady = vi.fn();
    const root = openPopup({ children: [childOf({ onRowReady })], completedCount: 0 });

    const row = popupOf(root)!.querySelector<HTMLElement>(".awesomeado-child-items__row")!;
    const title = row.querySelector<HTMLElement>(".awesomeado-child-items__title")!;
    expect(onRowReady).toHaveBeenCalledWith(row, title);
  });

  it("slots in the assignee control the caller built for each child", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
    });
    document.body.append(root);

    badgeOf(root).click();

    const assignee = popupOf(root)!.querySelector(".awesomeado-assigned__name");
    expect(assignee?.textContent).toBe("Alice");
  });

  it("omits the assignee slot for a child with no assignee control", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf({ assignee: null })],
      completedCount: 0,
    });
    document.body.append(root);

    badgeOf(root).click();

    expect(popupOf(root)!.querySelector(".awesomeado-assigned")).toBeNull();
  });

  it("colors the child title with its type color", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf({ titleColor: "#CC293D" })],
      completedCount: 0,
    });
    document.body.append(root);

    badgeOf(root).click();

    const title = popupOf(root)!.querySelector<HTMLElement>(".awesomeado-child-items__title")!;
    expect(title.style.color).toBe("rgb(204, 41, 61)");
  });

  it("wraps a long title instead of truncating it, and keeps the row top-aligned", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
    });
    document.body.append(root);

    badgeOf(root).click();

    const row = popupOf(root)!.querySelector<HTMLElement>(".awesomeado-child-items__row")!;
    const title = popupOf(root)!.querySelector<HTMLElement>(".awesomeado-child-items__title")!;
    expect(row.style.alignItems).toBe("flex-start");
    expect(title.style.whiteSpace).toBe("normal");
    expect(title.style.overflowWrap).toBe("anywhere");
    expect(title.style.textOverflow).toBe("");
  });

  it("centers each side control on the first title line", () => {
    const eta = document.createElement("span");
    eta.className = "fake-eta";
    const root = renderChildItemsBadge(document, {
      children: [childOf({ eta })],
      completedCount: 0,
    });
    document.body.append(root);

    badgeOf(root).click();

    const title = popupOf(root)!.querySelector<HTMLElement>(".awesomeado-child-items__title")!;
    const slots = [
      ...popupOf(root)!.querySelectorAll<HTMLElement>(".awesomeado-child-items__slot"),
    ];
    // The checkbox, the assignee and the ETA; the open glyph rides inside the title instead.
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(slot.style.alignItems).toBe("center");
      expect(slot.style.minHeight).toBe(title.style.lineHeight);
    }
  });
});

describe("renderChildItemsBadge - row ETA slot", () => {
  it("places the caller's ETA control after the title, at the row's right edge", () => {
    const eta = document.createElement("span");
    eta.className = "fake-eta";
    eta.textContent = "Aug 15";
    const root = renderChildItemsBadge(document, {
      children: [childOf({ eta })],
      completedCount: 0,
    });
    document.body.append(root);

    badgeOf(root).click();

    const row = popupOf(root)!.querySelector<HTMLElement>(".awesomeado-child-items__row")!;
    // The side controls sit inside a one-line-tall slot, so unwrap those to compare what they hold.
    const classes = [...row.children].map((child) =>
      child.className === "awesomeado-child-items__slot"
        ? child.firstElementChild!.className
        : child.className,
    );
    expect(classes).toEqual([
      "awesomeado-child-items__check",
      "awesomeado-assigned",
      "awesomeado-child-items__title",
      "fake-eta awesomeado-child-items__eta",
    ]);
    expect(row.textContent).toContain("Aug 15");
  });

  it("omits the ETA slot for a child with no ETA control", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf({ eta: null })],
      completedCount: 0,
    });
    document.body.append(root);

    badgeOf(root).click();

    expect(popupOf(root)!.querySelector(".awesomeado-child-items__eta")).toBeNull();
  });
});

describe("renderChildItemsBadge - row open affordance", () => {
  it("links an open-in-new-tab glyph to the child's ADO url in a new tab", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf({ url: "https://dev.azure.com/contoso/web/_workitems/edit/42" })],
      completedCount: 0,
    });
    document.body.append(root);

    badgeOf(root).click();

    const link = popupOf(root)!.querySelector<HTMLAnchorElement>(".awesomeado-child-items__open")!;
    expect(link.href).toBe("https://dev.azure.com/contoso/web/_workitems/edit/42");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    // The affordance no longer echoes the work item type icon: it is an inline link glyph that
    // inherits the row's text color, so no image is fetched at all.
    expect(link.querySelector("img")).toBeNull();
    const glyph = link.querySelector<SVGSVGElement>(".awesomeado-child-items__icon svg")!;
    expect(glyph.querySelector("path")?.getAttribute("stroke")).toBe("currentColor");
  });

  it("trails the title's words, taking the title's own color", () => {
    const root = openPopup({ children: [childOf({ titleColor: "#CC293D" })], completedCount: 0 });

    const title = titleOf(root);
    // Inside the title (so it follows the last word of a wrapped title) and last within it.
    expect(title.lastElementChild?.className).toBe("awesomeado-child-items__open");
    expect(title.firstElementChild).toBe(titleTextOf(root));
    // `currentColor` on the glyph resolves against the anchor, which inherits the title's color.
    expect(title.style.color).toBe("rgb(204, 41, 61)");
    expect(title.lastElementChild).toHaveProperty("style.color", "inherit");
  });

  it("renders an inert affordance when the child has no url", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf({ url: null })],
      completedCount: 0,
    });
    document.body.append(root);

    badgeOf(root).click();

    expect(popupOf(root)!.querySelector(".awesomeado-child-items__open")).toBeNull();
    // The link glyph is still present so the row lines up.
    expect(popupOf(root)!.querySelector(".awesomeado-child-items__icon svg")).not.toBeNull();
  });
});

describe("renderChildItemsBadge - interaction and dismissal", () => {
  it("toggles the popup closed on a second badge click", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
    });
    document.body.append(root);

    badgeOf(root).click();
    expect(popupOf(root)).not.toBeNull();

    badgeOf(root).click();
    expect(popupOf(root)).toBeNull();
  });

  it("closes the popup on Escape", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
    });
    document.body.append(root);

    badgeOf(root).click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(popupOf(root)).toBeNull();
  });

  it("closes the popup on an outside pointerdown", () => {
    const outside = document.createElement("div");
    document.body.append(outside);
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
    });
    document.body.append(root);

    badgeOf(root).click();
    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(popupOf(root)).toBeNull();
  });

  it("keeps the popup open when a pointerdown lands inside it", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
    });
    document.body.append(root);

    badgeOf(root).click();
    popupOf(root)!.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(popupOf(root)).not.toBeNull();
  });

  it("reports a right-click on a row so the view can offer its own menu", () => {
    const seen: MouseEvent[] = [];
    const root = openPopup({
      children: [childOf({ onContextMenu: (event) => seen.push(event) })],
      completedCount: 0,
    });

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    popupOf(root)!.querySelector(".awesomeado-child-items__row")!.dispatchEvent(event);

    expect(seen).toEqual([event]);
  });

  it("leaves a right-click alone when no menu is offered", () => {
    const root = openPopup({ children: [childOf()], completedCount: 0 });

    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    popupOf(root)!.querySelector(".awesomeado-child-items__row")!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

describe("renderChildItemsBadge - row completion", () => {
  it("ticks the checkbox and strikes the title through for a finished child", () => {
    const root = openPopup({ children: [childOf({ done: true })], completedCount: 1 });

    expect(checkboxOf(root).getAttribute("aria-checked")).toBe("true");
    expect(
      popupOf(root)!.querySelector<HTMLElement>(".awesomeado-child-items__tick")!.style.visibility,
    ).toBe("visible");
    expect(titleTextOf(root).style.textDecoration).toBe("line-through");
    // Struck on the words only, so the line is not dragged across the open glyph beside them.
    expect(titleOf(root).style.textDecoration).toBe("");
  });

  it("leaves an unfinished child's checkbox clear and its title unstruck", () => {
    const root = openPopup({ children: [childOf({ done: false })], completedCount: 0 });

    expect(checkboxOf(root).getAttribute("aria-checked")).toBe("false");
    expect(
      popupOf(root)!.querySelector<HTMLElement>(".awesomeado-child-items__tick")!.style.visibility,
    ).toBe("hidden");
    expect(titleTextOf(root).style.textDecoration).toBe("none");
  });

  it("disables the checkbox when the caller supplied no writer", () => {
    const root = openPopup({ children: [childOf()], completedCount: 0 });

    expect(checkboxOf(root).disabled).toBe(true);
    expect(checkboxOf(root).style.cursor).toBe("default");
  });

  it("frames the checkbox with dedicated control roles", () => {
    const root = openPopup({ children: [childOf()], completedCount: 0 });

    expect(checkboxOf(root).style.borderColor).toBe("var(--control-border-emphasis)");
    expect(checkboxOf(root).style.background).toBe("var(--control-background-muted)");
  });

  it("uses the completion role for the tick", () => {
    const root = openPopup({ children: [childOf({ done: true })], completedCount: 1 });

    const tick = popupOf(root)!.querySelector<HTMLElement>(".awesomeado-child-items__tick")!;
    expect(tick.style.cssText).toContain("var(--completion-foreground)");
  });

  it("asks the caller to persist the opposite of the child's current completion", async () => {
    const onToggleDone = vi.fn(() => Promise.resolve(true));
    const root = openPopup({
      children: [childOf({ done: false, onToggleDone })],
      completedCount: 0,
    });

    checkboxOf(root).click();
    await vi.waitFor(() => expect(onToggleDone).toHaveBeenCalledWith(true));

    expect(checkboxOf(root).getAttribute("aria-checked")).toBe("true");
    expect(titleTextOf(root).style.textDecoration).toBe("line-through");
  });

  it("reflects the completion the write committed, not the one that was clicked", async () => {
    // The write did not take, so the caller reports the child as still unfinished.
    const onToggleDone = vi.fn(() => Promise.resolve(false));
    const root = openPopup({
      children: [childOf({ done: false, onToggleDone })],
      completedCount: 0,
    });

    checkboxOf(root).click();
    await vi.waitFor(() => expect(onToggleDone).toHaveBeenCalled());

    expect(checkboxOf(root).getAttribute("aria-checked")).toBe("false");
    expect(titleTextOf(root).style.textDecoration).toBe("none");
  });

  it("ignores further clicks while a completion write is still in flight", async () => {
    let settle: (committed: boolean) => void = () => undefined;
    const onToggleDone = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          settle = resolve;
        }),
    );
    const root = openPopup({
      children: [childOf({ done: false, onToggleDone })],
      completedCount: 0,
    });

    checkboxOf(root).click();
    checkboxOf(root).click();
    expect(onToggleDone).toHaveBeenCalledTimes(1);

    settle(true);
    await vi.waitFor(() => expect(checkboxOf(root).getAttribute("aria-checked")).toBe("true"));

    // The row is released once the write settles, so the next click is accepted.
    checkboxOf(root).click();
    expect(onToggleDone).toHaveBeenCalledTimes(2);
    expect(onToggleDone).toHaveBeenLastCalledWith(false);
  });
});
