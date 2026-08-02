import { describe, expect, it } from "vitest";

import { renderItemDetailsButton, renderItemDetailsContent } from "./ItemDetails";

describe("renderItemDetailsButton", () => {
  it("reports both states through aria-expanded, the hover title, and a distinct tint", () => {
    const button = renderItemDetailsButton(document, {
      hasDescription: true,
      typeColor: "#0078d4",
    });

    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.title).toBe("Show description");
    const collapsedBackground = button.style.background;
    expect(collapsedBackground).toContain("#0078d4");

    button.setExpanded(true);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.title).toBe("Hide description");
    expect(button.style.background).toContain("#0078d4");
    // Same type color, stronger mix: without this the open state is indistinguishable from closed.
    expect(button.style.background).not.toBe(collapsedBackground);

    button.setExpanded(false);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.title).toBe("Show description");
    expect(button.style.background).toBe(collapsedBackground);
  });

  it("falls back to the neutral tint when there is no description or no type color", () => {
    const withoutDescription = renderItemDetailsButton(document, {
      hasDescription: false,
      typeColor: "#0078d4",
    });
    const withoutTypeColor = renderItemDetailsButton(document, {
      hasDescription: true,
      typeColor: null,
    });

    for (const button of [withoutDescription, withoutTypeColor]) {
      expect(button.style.background).toBe("var(--description-neutral-background)");
      button.setExpanded(true);
      expect(button.style.background).toBe("var(--description-neutral-active-background)");
    }
  });

  it("adopts the caller's class name so a view can style its own copy", () => {
    const shared = renderItemDetailsButton(document, { hasDescription: true, typeColor: null });
    const owned = renderItemDetailsButton(document, {
      hasDescription: true,
      typeColor: null,
      className: "awesomeado-tracking__desc",
    });

    expect(shared.className).toBe("awesomeado-item-details__button");
    expect(owned.className).toBe("awesomeado-tracking__desc");
    expect(owned.type).toBe("button");
    expect(owned.textContent).toBe("?");
  });
});

describe("renderItemDetailsContent", () => {
  it("keeps both lifecycle moments in the meta line and the description in its own node", () => {
    const content = renderItemDetailsContent(
      document,
      {
        description: "A useful description",
        createdDate: "2026-07-01T10:00:00Z",
        createdBy: null,
        changedDate: "2026-07-02T10:00:00Z",
        changedBy: null,
      },
      new Map(),
    );

    const meta = content.querySelector(".awesomeado-item-details__meta");
    expect(meta?.textContent).toContain("Created on:");
    expect(meta?.textContent).toContain("Last Modified on:");
    // The two moments only read as one sentence while the separator survives.
    expect(meta?.textContent).toContain(", ");
    // The description must not leak into the meta line, or the dates run into the prose.
    expect(meta?.textContent).not.toContain("A useful description");

    const description = content.querySelector(".awesomeado-item-details__description");
    expect(description?.textContent).toContain("A useful description");
  });

  it("rebuilds the description through the shared allowlist instead of trusting its HTML", () => {
    const content = renderItemDetailsContent(
      document,
      {
        description:
          '<img src="x" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">still readable</a>',
        createdDate: "2026-07-01T10:00:00Z",
        createdBy: null,
        changedDate: "2026-07-02T10:00:00Z",
        changedBy: null,
      },
      new Map(),
    );

    const description = content.querySelector(".awesomeado-item-details__description")!;
    expect(description.querySelector("script")).toBeNull();
    expect(description.querySelector("[onerror]")).toBeNull();
    expect(description.innerHTML).not.toContain("alert(");
    expect(description.querySelector("a[href^='javascript:']")).toBeNull();
    // Stripping the hostile parts must not cost the reader the description itself.
    expect(description.textContent).toContain("still readable");
  });
});
