import { describe, expect, it, vi } from "vitest";

import {
  renderViewHeader,
  renderViewHeaderCard,
  renderViewHeaderTopBand,
  renderViewTitleBand,
  type ViewTitleBandOptions,
} from "./ViewHeader";

const PREFIX = "awesomeado-test";

function picker(): HTMLElement {
  const element = document.createElement("button");
  element.className = "picker";
  return element;
}

function titleBandOptions(overrides: Partial<ViewTitleBandOptions> = {}): ViewTitleBandOptions {
  return {
    classPrefix: PREFIX,
    title: "Consumers",
    onTitleContextMenu: vi.fn(),
    expandLabel: "Expand all",
    collapseLabel: "Collapse all",
    onExpandAll: vi.fn(),
    onCollapseAll: vi.fn(),
    filters: [],
    onRefresh: vi.fn(),
    ...overrides,
  };
}

describe("renderViewHeaderCard", () => {
  it("renders a sticky opaque card under the given class", () => {
    const card = renderViewHeaderCard(document, "my-header");

    expect(card.className).toBe("my-header");
    expect(card.style.position).toBe("sticky");
    expect(card.style.background).toContain("var(--callout-background-color)");
  });
});

describe("renderViewHeaderTopBand", () => {
  it("keeps the ordering picker last in a right-pinned corner", () => {
    const status = document.createElement("span");
    const orderingPicker = picker();
    const band = renderViewHeaderTopBand(document, {
      classPrefix: PREFIX,
      breadcrumbs: [{ label: "Shared Queries", url: "https://example.test/folder" }],
      writeQueueStatus: status,
      extensionVersion: "1.2.3",
      orderingPicker,
    });

    expect(band.className).toBe(`${PREFIX}__header-top`);
    expect(band.style.minHeight).toBe("24px");
    expect(band.querySelector('nav[aria-label="Query folder"]')?.textContent).toContain(
      "Shared Queries",
    );
    const corner = band.querySelector<HTMLElement>(`.${PREFIX}__header-corner`)!;
    expect(corner.style.marginLeft).toBe("auto");
    expect(corner.firstElementChild).toBe(status);
    expect(corner.querySelector(".awesomeado-version")?.textContent).toBe("v 1.2");
    expect(corner.lastElementChild).toBe(orderingPicker);
  });

  it("renders only the corner when there is no folder trail, status, or version", () => {
    const band = renderViewHeaderTopBand(document, {
      classPrefix: PREFIX,
      breadcrumbs: [],
      orderingPicker: picker(),
    });

    expect(band.querySelector("nav")).toBeNull();
    expect(band.querySelector(`.${PREFIX}__header-corner`)?.children).toHaveLength(1);
  });
});

describe("renderViewTitleBand", () => {
  it("renders the title, outline buttons, filters, then Refresh last", () => {
    const filter = document.createElement("div");
    const { element } = renderViewTitleBand(
      document,
      titleBandOptions({ filters: [filter], titleColor: "#ff6b6b" }),
    );

    expect(element.className).toBe(`${PREFIX}__header-title`);
    expect(element.querySelector("h1")?.textContent).toBe("Consumers");
    expect(element.querySelector<HTMLElement>("h1")?.style.color).toBe("rgb(255, 107, 107)");
    expect(element.querySelector<HTMLElement>(`.${PREFIX}__expand-all`)?.style.marginLeft).toBe(
      "24px",
    );
    const filters = element.querySelector<HTMLElement>(`.${PREFIX}__filters`)!;
    expect(filters.firstElementChild).toBe(filter);
    expect(filter.style.flex).toBe("0 0 auto");
    expect(filters.lastElementChild?.classList.contains(`${PREFIX}__refresh`)).toBe(true);
  });

  it("wires every button and the title menu to its handler", () => {
    const options = titleBandOptions();
    const { element, refresh } = renderViewTitleBand(document, options);

    element.querySelector<HTMLButtonElement>(`.${PREFIX}__expand-all`)!.click();
    element.querySelector<HTMLButtonElement>(`.${PREFIX}__collapse-all`)!.click();
    refresh.element.click();
    element.querySelector("h1")!.dispatchEvent(new MouseEvent("contextmenu"));

    expect(options.onExpandAll).toHaveBeenCalledTimes(1);
    expect(options.onCollapseAll).toHaveBeenCalledTimes(1);
    expect(options.onRefresh).toHaveBeenCalledTimes(1);
    expect(options.onRefresh).toHaveBeenCalledWith({ discardCaches: false });
    expect(options.onTitleContextMenu).toHaveBeenCalledTimes(1);
  });

  it("asks Refresh to discard cached data when Ctrl or Cmd is held", () => {
    const options = titleBandOptions();
    const { refresh } = renderViewTitleBand(document, options);

    refresh.element.dispatchEvent(new MouseEvent("click", { ctrlKey: true }));
    refresh.element.dispatchEvent(new MouseEvent("click", { metaKey: true }));

    expect(options.onRefresh).toHaveBeenNthCalledWith(1, { discardCaches: true });
    expect(options.onRefresh).toHaveBeenNthCalledWith(2, { discardCaches: true });
  });
});

describe("renderViewHeader", () => {
  it("stacks the top band above the title band inside one sticky card", () => {
    const orderingPicker = picker();
    const { element, refresh } = renderViewHeader(document, {
      ...titleBandOptions(),
      breadcrumbs: [],
      orderingPicker,
    });

    expect(element.className).toBe(`${PREFIX}__header`);
    expect(element.style.position).toBe("sticky");
    expect(element.firstElementChild?.className).toBe(`${PREFIX}__header-top`);
    expect(element.lastElementChild?.className).toBe(`${PREFIX}__header-title`);
    expect(element.querySelector(`.${PREFIX}__header-corner`)?.lastElementChild).toBe(
      orderingPicker,
    );
    expect(element.contains(refresh.element)).toBe(true);
  });
});
