import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BindingMenu, type MenuEntry } from "./BindingMenu";

const MENU_SELECTOR = "#awesomeado-button-menu";

function makeAnchor(rect: Partial<DOMRect> = {}): HTMLElement {
  const anchor = document.createElement("button");
  document.body.append(anchor);
  const full: DOMRect = {
    top: 8,
    bottom: 40,
    left: 700,
    right: 774,
    x: 700,
    y: 8,
    width: 74,
    height: 32,
    toJSON: () => ({}),
    ...rect,
  } as DOMRect;
  vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue(full);
  return anchor;
}

function menuNode(): HTMLElement | null {
  return document.querySelector<HTMLElement>(MENU_SELECTOR);
}

function menuItems(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(`${MENU_SELECTOR} [role="menuitem"]`),
  );
}

// Shared across the sibling describes below so each split group reuses one setup with zero
// duplication (jscpd threshold is 0).
let menu: BindingMenu;

beforeEach(() => {
  document.body.innerHTML = "";
  menu = new BindingMenu(document);
});

// Detach the document-level listeners so an open menu can't leak into the next test.
afterEach(() => {
  menu.close();
});

describe("BindingMenu - rendering", () => {
  it("reports closed until opened and open once shown", () => {
    expect(menu.isOpen).toBe(false);

    menu.open(makeAnchor(), [{ kind: "item", label: "Options", onSelect: vi.fn() }]);

    expect(menu.isOpen).toBe(true);
    expect(menuNode()).not.toBeNull();
  });

  it("renders items and separators in order", () => {
    const entries: MenuEntry[] = [
      { kind: "item", label: "Sprint View", onSelect: vi.fn() },
      { kind: "item", label: "Standard View", onSelect: vi.fn() },
      { kind: "separator" },
      { kind: "item", label: "Options", onSelect: vi.fn() },
    ];

    menu.open(makeAnchor(), entries);

    const node = menuNode()!;
    expect(node.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
    expect(node.querySelectorAll('[role="separator"]')).toHaveLength(1);
    expect(node.style.background).toBe("var(--callout-background-color)");
    expect(node.style.color).toBe("var(--text-primary-color)");
    expect(node.style.border).toContain("var(--control-border-strong)");
    expect(node.style.borderRadius).toBe("10px");
    expect(node.style.padding).toBe("4px");
    expect(node.style.boxShadow).toBe("0 2px 8px var(--shadow-subtle)");
    expect(node.querySelector<HTMLElement>('[role="separator"]')?.style.borderTopColor).toBe(
      "var(--control-border-strong)",
    );
    expect(menuItems()[0]?.style.borderRadius).toBe("6px");
    expect(menuItems().map((item) => item.textContent)).toEqual([
      "Sprint View",
      "Standard View",
      "Options",
    ]);
  });

  it("shows a check mark only on checked items", () => {
    menu.open(makeAnchor(), [
      { kind: "item", label: "Sprint View", checked: true, onSelect: vi.fn() },
      { kind: "item", label: "Standard View", checked: false, onSelect: vi.fn() },
    ]);

    const [checked, unchecked] = menuItems();
    expect(checked?.firstElementChild?.textContent).toBe("\u2713");
    expect(unchecked?.firstElementChild?.textContent).toBe("");
  });
});

describe("BindingMenu - interaction", () => {
  it("runs the item's onSelect and closes when an item is clicked", () => {
    const onSelect = vi.fn();
    menu.open(makeAnchor(), [{ kind: "item", label: "Options", onSelect }]);

    menuItems()[0]?.click();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(menu.isOpen).toBe(false);
    expect(menuNode()).toBeNull();
  });

  it("highlights an item on hover and clears it on leave", () => {
    menu.open(makeAnchor(), [{ kind: "item", label: "Options", onSelect: vi.fn() }]);
    const item = menuItems()[0]!;

    item.dispatchEvent(new MouseEvent("mouseenter"));
    expect(item.style.backgroundColor).toBe("var(--control-background-hover)");

    item.dispatchEvent(new MouseEvent("mouseleave"));
    expect(item.style.backgroundColor).toBe("transparent");
  });
});

describe("BindingMenu - theming", () => {
  it("pins the selected AwesomeADO theme onto the menu", () => {
    menu.applyTheme("blue");
    menu.open(makeAnchor(), [{ kind: "item", label: "Options", onSelect: vi.fn() }]);

    const node = menuNode();
    expect(node?.style.getPropertyValue("--text-primary-color")).toBe("#10233b");
    expect(node?.style.getPropertyValue("--callout-background-color")).toBe("#ffffff");
    expect(node?.style.getPropertyValue("color-scheme")).toBe("light");
  });

  it("re-themes an open menu without rebuilding it", () => {
    menu.applyTheme("dark");
    menu.open(makeAnchor(), [{ kind: "item", label: "Options", onSelect: vi.fn() }]);
    const node = menuNode();

    menu.applyTheme("light");

    expect(menuNode()).toBe(node);
    expect(node?.style.getPropertyValue("--text-primary-color")).toBe("#1f1f1f");
    expect(node?.style.getPropertyValue("color-scheme")).toBe("light");
  });
});

describe("BindingMenu - dismissal", () => {
  it("closes on a pointer down outside the menu and its anchor", () => {
    menu.open(makeAnchor(), [{ kind: "item", label: "Options", onSelect: vi.fn() }]);

    const outside = document.createElement("div");
    document.body.append(outside);
    outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));

    expect(menu.isOpen).toBe(false);
  });

  it("stays open when the pointer down lands on its anchor", () => {
    const anchor = makeAnchor();
    menu.open(anchor, [{ kind: "item", label: "Options", onSelect: vi.fn() }]);

    anchor.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));

    // The anchor's own click handler owns the toggle, so the menu must not close here.
    expect(menu.isOpen).toBe(true);
  });

  it("stays open when the pointer down lands inside the menu", () => {
    menu.open(makeAnchor(), [{ kind: "item", label: "Options", onSelect: vi.fn() }]);

    menuItems()[0]?.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));

    expect(menu.isOpen).toBe(true);
  });

  it("closes on Escape but ignores other keys", () => {
    menu.open(makeAnchor(), [{ kind: "item", label: "Options", onSelect: vi.fn() }]);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(menu.isOpen).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(menu.isOpen).toBe(false);
  });

  it("replaces a previously open menu instead of stacking a second one", () => {
    menu.open(makeAnchor(), [{ kind: "item", label: "First", onSelect: vi.fn() }]);
    menu.open(makeAnchor(), [{ kind: "item", label: "Second", onSelect: vi.fn() }]);

    expect(document.querySelectorAll(MENU_SELECTOR)).toHaveLength(1);
    expect(menuItems()[0]?.textContent).toBe("Second");
  });
});

describe("BindingMenu - positioning", () => {
  it("aligns its right edge and top to the anchor", () => {
    const anchor = makeAnchor({ bottom: 40, right: 774 });
    menu.open(anchor, [{ kind: "item", label: "Options", onSelect: vi.fn() }]);

    const node = menuNode()!;
    expect(node.style.position).toBe("fixed");
    expect(node.style.top).toBe("44px");
    expect(node.style.right).toBe(`${window.innerWidth - 774}px`);
    expect(node.style.left).toBe("auto");
  });

  it("repositions when the viewport scrolls", () => {
    const rect = { top: 8, bottom: 40, left: 700, right: 774 };
    const anchor = document.createElement("button");
    document.body.append(anchor);
    const getRect = vi.spyOn(anchor, "getBoundingClientRect");
    getRect.mockReturnValue({
      ...rect,
      width: 74,
      height: 32,
      x: 700,
      y: 8,
      toJSON: () => ({}),
    } as DOMRect);

    menu.open(anchor, [{ kind: "item", label: "Options", onSelect: vi.fn() }]);
    getRect.mockReturnValue({
      ...rect,
      bottom: 60,
      width: 74,
      height: 32,
      x: 700,
      y: 8,
      toJSON: () => ({}),
    } as DOMRect);

    document.dispatchEvent(new Event("scroll"));

    expect(menuNode()?.style.top).toBe("64px");
  });

  it("is safe to close when nothing is open", () => {
    expect(() => menu.close()).not.toThrow();
  });
});
