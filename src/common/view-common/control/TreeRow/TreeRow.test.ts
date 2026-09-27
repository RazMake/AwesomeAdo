import { describe, expect, it, vi } from "vitest";

import type { TypeCatalogEntry } from "../../../ado/TrackedWorkItem";

import {
  renderTreeChildren,
  renderTreeItemWrapper,
  renderTreeRowLine,
  renderTreeTitle,
  renderTreeTwisty,
  renderTreeTypeIcon,
  treeRowEmphasisClasses,
} from "./TreeRow";

const PREFIX = "awesomeado-test";
const ITEM = { id: 7, type: "Feature", title: "Checkout" };
const ENTRY: TypeCatalogEntry = {
  name: "Feature",
  color: "773B93",
  icon: "",
  etaField: null,
  columns: [],
};

describe("treeRowEmphasisClasses", () => {
  it("names the elements the row helpers build", () => {
    expect(treeRowEmphasisClasses(PREFIX)).toEqual({
      wrapper: `${PREFIX}__item`,
      surface: `${PREFIX}__row`,
      children: `${PREFIX}__children`,
    });
  });
});

describe("renderTreeTwisty", () => {
  it("renders a same-width spacer for a leaf", () => {
    const spacer = renderTreeTwisty(document, PREFIX, ITEM, null);

    expect(spacer.className).toBe(`${PREFIX}__twisty-spacer`);
    expect(spacer.style.width).toBe("16px");
  });

  it("renders an open twisty that offers to collapse", () => {
    const onToggle = vi.fn();
    const twisty = renderTreeTwisty(document, PREFIX, ITEM, { expanded: true, onToggle });

    expect(twisty.className).toBe(`${PREFIX}__twisty`);
    expect(twisty.textContent).toBe("\u25BE");
    expect(twisty.getAttribute("aria-expanded")).toBe("true");
    expect(twisty.getAttribute("aria-label")).toBe("Collapse Checkout");

    twisty.click();
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("renders a closed twisty that offers to expand", () => {
    const twisty = renderTreeTwisty(document, PREFIX, ITEM, { expanded: false, onToggle: vi.fn() });

    expect(twisty.textContent).toBe("\u25B8");
    expect(twisty.getAttribute("aria-expanded")).toBe("false");
    expect(twisty.title).toBe("Expand");
  });
});

describe("renderTreeTitle", () => {
  it("shows the title as inert text with the type and id in its tooltip", () => {
    const title = renderTreeTitle(document, PREFIX, ITEM, ENTRY);

    expect(title.tagName).toBe("SPAN");
    expect(title.className).toBe(`${PREFIX}__title`);
    expect(title.textContent).toBe("Checkout");
    expect(title.title).toBe("Feature 7: Checkout");
    expect(title.style.fontWeight).toBe("600");
  });

  it("still renders for a type the catalog does not know", () => {
    expect(renderTreeTitle(document, PREFIX, ITEM, undefined).textContent).toBe("Checkout");
  });
});

describe("renderTreeTypeIcon", () => {
  it("renders an icon element for known and unknown types", () => {
    expect(renderTreeTypeIcon(document, ITEM, ENTRY)).toBeInstanceOf(HTMLElement);
    expect(renderTreeTypeIcon(document, ITEM, undefined)).toBeInstanceOf(HTMLElement);
  });
});

describe("renderTreeRowLine", () => {
  it("renders top-level rows one size larger and tagged", () => {
    const line = renderTreeRowLine(document, PREFIX, "is-top");

    expect(line.className).toBe(`${PREFIX}__row is-top`);
    expect(line.style.fontSize).toBe("14px");
  });

  it("renders nested rows at the smaller size", () => {
    const line = renderTreeRowLine(document, PREFIX, null);

    expect(line.className).toBe(`${PREFIX}__row`);
    expect(line.style.fontSize).toBe("13px");
  });
});

describe("renderTreeItemWrapper and renderTreeChildren", () => {
  it("wraps the line under the item's id and indents the branch", () => {
    const line = renderTreeRowLine(document, PREFIX, null);
    const wrapper = renderTreeItemWrapper(document, PREFIX, ITEM, line);
    const children = renderTreeChildren(document, PREFIX);

    expect(wrapper.className).toBe(`${PREFIX}__item`);
    expect(wrapper.dataset.itemId).toBe("7");
    expect(wrapper.firstElementChild).toBe(line);
    expect(children.className).toBe(`${PREFIX}__children`);
    expect(children.style.borderLeft).toContain("1px solid");
  });
});
