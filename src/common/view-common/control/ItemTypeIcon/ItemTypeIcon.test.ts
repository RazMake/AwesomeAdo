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
  it("starts at full strength when the caller asked for no particular emphasis", () => {
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
      emphasis: "muted",
    });

    expect(element.style.opacity).toBe("0.55");
  });

  it("drains the color at the quiet level, so 'nothing here' is not just a dimmer shade", () => {
    const { element } = renderItemTypeIcon(document, {
      iconUrl: ICON_URL,
      color: null,
      typeName: "Feature",
      emphasis: "quiet",
    });

    expect(element.style.filter).toBe("grayscale(1)");
  });

  it("keeps the three levels visually distinct from one another", () => {
    const handle = renderItemTypeIcon(document, {
      iconUrl: ICON_URL,
      color: null,
      typeName: "Feature",
    });

    handle.setEmphasis("quiet");
    const quiet = `${handle.element.style.opacity}/${handle.element.style.filter}`;

    handle.setEmphasis("muted");
    const muted = `${handle.element.style.opacity}/${handle.element.style.filter}`;

    handle.setEmphasis("full");
    const full = `${handle.element.style.opacity}/${handle.element.style.filter}`;

    expect(new Set([quiet, muted, full]).size).toBe(3);
  });

  it("moves between levels on request, so one glyph can show all three states", () => {
    const handle = renderItemTypeIcon(document, {
      iconUrl: ICON_URL,
      color: null,
      typeName: "Feature",
      emphasis: "quiet",
    });

    handle.setEmphasis("full");
    expect(handle.element.style.opacity).toBe("1");
    expect(handle.element.style.filter).toBe("none");

    handle.setEmphasis("quiet");
    expect(handle.element.style.opacity).toBe("0.35");
    expect(handle.element.style.filter).toBe("grayscale(1)");
  });
});
