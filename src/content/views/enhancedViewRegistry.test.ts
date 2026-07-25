import { describe, expect, it } from "vitest";

import type { EnhancedViewContext } from "../../common/view-common/EnhancedView";

import { ENHANCED_VIEWS, getEnhancedView } from "./enhancedViewRegistry";
import { VIEW_TYPES } from "./viewCatalog";

const context = (queryId: string): EnhancedViewContext => ({
  doc: document,
  queryId,
  properties: {},
});

describe("enhancedViewRegistry", () => {
  it("has a renderer for every view in the catalog, and no orphans", () => {
    const rendererIds = ENHANCED_VIEWS.map((view) => view.id).sort();
    const catalogIds = VIEW_TYPES.map((view) => view.id).sort();
    expect(rendererIds).toEqual(catalogIds);
  });

  it("resolves a known view id to its renderer", () => {
    expect(getEnhancedView("sprint")?.id).toBe("sprint");
    expect(getEnhancedView("projectTracking")?.id).toBe("projectTracking");
  });

  it("returns undefined for an unknown view id", () => {
    expect(getEnhancedView("does-not-exist")).toBeUndefined();
  });

  it("renders each view's own title text into a fresh element", () => {
    const sprint = getEnhancedView("sprint")?.render(context("sprint"));
    const tracking = getEnhancedView("projectTracking")?.render(context("projectTracking"));

    expect(sprint?.querySelector(".awesomeado-view__title")?.textContent).toBe("Sprint View");
    expect(tracking?.querySelector(".awesomeado-view__title")?.textContent).toBe(
      "Project Tracking",
    );
    // A different view produces different body copy, so the surface visibly changes per view type.
    expect(sprint?.querySelector(".awesomeado-view__message")?.textContent).not.toBe(
      tracking?.querySelector(".awesomeado-view__message")?.textContent,
    );
  });
});
