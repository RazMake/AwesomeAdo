import { describe, expect, it, vi } from "vitest";

import type { EnhancedViewContext } from "../../common/view-common/EnhancedView";

import { createEnhancedViewRegistry, enhancedViewRegistry } from "./enhancedViewRegistry";
import { projectTrackingView } from "./project-tracking/ProjectTrackingView";
import { VIEW_TYPES } from "./viewCatalog";

const context = (queryId: string): EnhancedViewContext => ({
  doc: document,
  queryId,
  properties: {},
});

const textOf = (element: HTMLElement | undefined, selector: string): string | null | undefined =>
  element?.querySelector(selector)?.textContent;

describe("enhancedViewRegistry", () => {
  it("has a renderer registration for every view in the catalog, and no orphans", () => {
    const rendererIds = [...enhancedViewRegistry.ids].sort();
    const catalogIds = VIEW_TYPES.map((view) => view.id).sort();
    expect(rendererIds).toEqual(catalogIds);
  });

  it("keeps Sprint loaded and Project Tracking deferred", () => {
    expect(enhancedViewRegistry.getLoaded("sprint")?.id).toBe("sprint");
    expect(enhancedViewRegistry.getLoaded("projectTracking")).toBeUndefined();
    expect(enhancedViewRegistry.has("projectTracking")).toBe(true);
    expect(enhancedViewRegistry.has("does-not-exist")).toBe(false);
  });

  it("loads Project Tracking once and caches its renderer", async () => {
    const loader = vi.fn(() => Promise.resolve(projectTrackingView));
    const registry = createEnhancedViewRegistry(loader);

    expect(await registry.load("projectTracking")).toBe(projectTrackingView);
    expect(await registry.load("projectTracking")).toBe(projectTrackingView);
    expect(registry.getLoaded("projectTracking")).toBe(projectTrackingView);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("renders each resolved view's own title text", async () => {
    const registry = createEnhancedViewRegistry(() => Promise.resolve(projectTrackingView));
    const sprint = (await registry.load("sprint"))?.render(context("sprint"));
    const tracking = (await registry.load("projectTracking"))?.render(context("tracking"));

    expect(textOf(sprint, ".awesomeado-view__title")).toBe("Sprint View");
    expect(textOf(tracking, ".awesomeado-view__title")).toBe("Project Tracking");
  });
});
