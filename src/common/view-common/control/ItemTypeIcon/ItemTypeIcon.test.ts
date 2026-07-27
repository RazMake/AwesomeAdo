import { describe, expect, it } from "vitest";

import { renderItemTypeIcon } from "./ItemTypeIcon";

const ICON_URL = "https://ado.example/icons/feature.svg?color=6bcf7f";

/** The image an icon rendered, or null when it fell back to the colored dot. */
function imageOf(element: HTMLElement): HTMLImageElement | null {
  return element.querySelector<HTMLImageElement>(".awesomeado-type-icon__image");
}

/** The fallback dot an icon rendered, or null when it rendered ADO's image. */
function dotOf(element: HTMLElement): HTMLElement | null {
  return element.querySelector<HTMLElement>(".awesomeado-type-icon__dot");
}

/** The dot's inline style. jsdom normalizes a hex fill to its `rgb(...)` form, so cases match on that. */
function dotStyle(element: HTMLElement): string {
  return dotOf(element)?.style.cssText ?? "";
}

describe("renderItemTypeIcon — the image", () => {
  it("renders ADO's own icon for the type", () => {
    const { element } = renderItemTypeIcon(document, {
      iconUrl: ICON_URL,
      color: "#6bcf7f",
      typeName: "Feature",
    });

    expect(imageOf(element)?.getAttribute("src")).toBe(ICON_URL);
    expect(dotOf(element)).toBeNull();
  });

  it("sends no referrer, since the icon host is whatever the tenant configured", () => {
    const { element } = renderItemTypeIcon(document, {
      iconUrl: ICON_URL,
      color: "#6bcf7f",
      typeName: "Feature",
    });

    expect(imageOf(element)?.referrerPolicy).toBe("no-referrer");
  });

  it("announces the type on hover rather than being a decorative blank", () => {
    const { element } = renderItemTypeIcon(document, {
      iconUrl: ICON_URL,
      color: "#6bcf7f",
      typeName: "Feature",
    });

    expect(element.title).toBe("Feature");
    // The alt is empty on purpose: the title already names the type, so a reader is not told twice.
    expect(imageOf(element)?.alt).toBe("");
  });

  it("carries no tooltip at all when the caller's own control owns it", () => {
    const { element } = renderItemTypeIcon(document, {
      iconUrl: ICON_URL,
      color: "#6bcf7f",
      typeName: "Feature",
      title: "",
    });

    // An EMPTY title attribute would still shadow the container's, leaving the reader with no
    // tooltip; the attribute has to be absent for the container's own to show through.
    expect(element.hasAttribute("title")).toBe(false);
  });
});

describe("renderItemTypeIcon — the fallback dot", () => {
  it("renders a colored dot when the tenant configured no icon", () => {
    const { element } = renderItemTypeIcon(document, {
      iconUrl: null,
      color: "#ff6b6b",
      typeName: "Epic",
    });

    expect(imageOf(element)).toBeNull();
    expect(dotStyle(element)).toContain("rgb(255, 107, 107)");
  });

  it("treats an empty icon URL as no icon at all", () => {
    const { element } = renderItemTypeIcon(document, {
      iconUrl: "",
      color: "#ff6b6b",
      typeName: "Epic",
    });

    expect(dotOf(element)).not.toBeNull();
  });

  it("falls back to the surrounding text color when the type carries none", () => {
    const { element } = renderItemTypeIcon(document, {
      iconUrl: null,
      color: null,
      typeName: "Epic",
    });

    expect(dotStyle(element).toLowerCase()).toContain("currentcolor");
  });

  it("replaces an icon that will not load, rather than leaving a broken-image glyph", () => {
    const { element } = renderItemTypeIcon(document, {
      iconUrl: ICON_URL,
      color: "#6bcf7f",
      typeName: "Feature",
    });

    imageOf(element)?.dispatchEvent(new Event("error"));

    expect(imageOf(element)).toBeNull();
    expect(dotStyle(element)).toContain("rgb(107, 207, 127)");
  });
});

describe("renderItemTypeIcon — emphasis", () => {
  /** The pair a reader actually sees, as one comparable string. */
  function lookOf(element: HTMLElement): string {
    return `${element.style.opacity}/${element.style.filter}`;
  }

  it("starts colored and at full strength when the caller asked for no particular emphasis", () => {
    const { element } = renderItemTypeIcon(document, {
      iconUrl: ICON_URL,
      color: null,
      typeName: "Feature",
    });

    expect(element.style.opacity).toBe("1");
    expect(element.style.filter).toBe("none");
  });

  it("starts where the caller asked", () => {
    const { element } = renderItemTypeIcon(document, {
      iconUrl: ICON_URL,
      color: null,
      typeName: "Feature",
      emphasis: { colored: true, loud: false },
    });

    expect(element.style.opacity).toBe("0.55");
  });

  it("drains the color when asked, so 'nothing here' is not just a dimmer shade", () => {
    const { element } = renderItemTypeIcon(document, {
      iconUrl: ICON_URL,
      color: null,
      typeName: "Feature",
      emphasis: { colored: false, loud: false },
    });

    expect(element.style.filter).toBe("grayscale(1)");
    // A drained icon recedes further than a dimmed colored one, so the two differ in two ways at
    // once rather than in one brightness judgement the reader has nothing to compare against.
    expect(element.style.opacity).toBe("0.35");
  });

  it("keeps the four combinations visually distinct from one another", () => {
    const handle = renderItemTypeIcon(document, {
      iconUrl: ICON_URL,
      color: null,
      typeName: "Feature",
    });

    const looks = new Set<string>();
    for (const colored of [false, true]) {
      for (const loud of [false, true]) {
        handle.setEmphasis({ colored, loud });
        looks.add(lookOf(handle.element));
      }
    }

    expect(looks.size).toBe(4);
  });

  it("comes to full strength while staying grey, so an open item can still say it holds nothing", () => {
    const handle = renderItemTypeIcon(document, {
      iconUrl: ICON_URL,
      color: null,
      typeName: "Feature",
      emphasis: { colored: false, loud: false },
    });
    const closed = handle.element.style.opacity;

    handle.setEmphasis({ colored: false, loud: true });

    // Brighter, but still drained: the type color is a claim about content, not about attention.
    expect(handle.element.style.filter).toBe("grayscale(1)");
    expect(Number(handle.element.style.opacity)).toBeGreaterThan(Number(closed));
  });

  it("moves between emphases on request, so one glyph can show every state", () => {
    const handle = renderItemTypeIcon(document, {
      iconUrl: ICON_URL,
      color: null,
      typeName: "Feature",
      emphasis: { colored: false, loud: false },
    });

    handle.setEmphasis({ colored: true, loud: true });
    expect(handle.element.style.opacity).toBe("1");
    expect(handle.element.style.filter).toBe("none");

    handle.setEmphasis({ colored: false, loud: false });
    expect(handle.element.style.opacity).toBe("0.35");
    expect(handle.element.style.filter).toBe("grayscale(1)");
  });
});
