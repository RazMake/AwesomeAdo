import { describe, expect, it } from "vitest";

import type { EnhancedViewContext } from "../../common/view-common/EnhancedView";

import { ENHANCED_VIEWS, getEnhancedView } from "./enhancedViewRegistry";
import { VIEW_TYPES } from "./viewCatalog";

const context = (queryId: string): EnhancedViewContext => ({
  doc: document,
  queryId,
  properties: {},
});

// Rendering + querying through the registry both use optional chaining; keeping those branches in
// module-scope helpers keeps each test's cyclomatic complexity low without changing what it asserts.
const renderView = (viewId: string): HTMLElement | undefined =>
  getEnhancedView(viewId)?.render(context(viewId));

const textOf = (element: HTMLElement | undefined, selector: string): string | null | undefined =>
  element?.querySelector(selector)?.textContent;

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
    const sprint = renderView("sprint");
    const tracking = renderView("projectTracking");

    expect(textOf(sprint, ".awesomeado-view__title")).toBe("Sprint View");
    expect(textOf(tracking, ".awesomeado-view__title")).toBe("Project Tracking");
    // A different view produces different body copy, so the surface visibly changes per view type.
    expect(textOf(sprint, ".awesomeado-view__message")).not.toBe(
      textOf(tracking, ".awesomeado-view__message"),
    );
  });
});
