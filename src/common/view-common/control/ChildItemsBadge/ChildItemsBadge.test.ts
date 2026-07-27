import { afterEach, describe, expect, it } from "vitest";

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
});

describe("renderChildItemsBadge - row content", () => {
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
    expect(slots).toHaveLength(3);
    for (const slot of slots) {
      expect(slot.style.alignItems).toBe("center");
      expect(slot.style.minHeight).toBe(title.style.lineHeight);
    }
  });
});

describe("renderChildItemsBadge - row ETA slot", () => {
  it("places the caller's ETA control between the title and the open affordance", () => {
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
    // The side controls sit inside a one-line-tall slot, so compare the slotted content.
    const classes = [...row.children].map((child) => (child.firstElementChild ?? child).className);
    expect(classes).toEqual([
      "awesomeado-assigned",
      "awesomeado-child-items__title",
      "fake-eta awesomeado-child-items__eta",
      "awesomeado-child-items__open",
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
  it("links a chain-link glyph to the child's ADO url in a new tab", () => {
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
});
