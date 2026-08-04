import { describe, expect, it, vi } from "vitest";

import type { EnhancedView, EnhancedViewContext } from "../../common/view-common/EnhancedView";

import {
  createEnhancedViewRegistry,
  enhancedViewRegistry,
  type DeferredViewLoader,
} from "./enhancedViewRegistry";
import { projectTrackingView } from "./project-tracking/ProjectTrackingView";
import { projectsView } from "./projects-view/ProjectsView";
import { VIEW_TYPES } from "./viewCatalog";

const context = (queryId: string): EnhancedViewContext => ({
  doc: document,
  queryId,
  properties: {},
});

const textOf = (element: HTMLElement | undefined, selector: string): string | null | undefined =>
  element?.querySelector(selector)?.textContent;

const deferredViews = new Map<string, EnhancedView>([
  ["projectTracking", projectTrackingView],
  ["projects", projectsView],
]);

// One stand-in loader for every deferred view keeps each test's arrangement to the id under test.
const fakeLoader: DeferredViewLoader = (id) => Promise.resolve(deferredViews.get(id)!);

describe("enhancedViewRegistry", () => {
  it("has a renderer registration for every view in the catalog, and no orphans", () => {
    const rendererIds = [...enhancedViewRegistry.ids].sort();
    const catalogIds = VIEW_TYPES.map((view) => view.id).sort();
    expect(rendererIds).toEqual(catalogIds);
  });

  it("keeps Sprint loaded and the larger views deferred", () => {
    expect(enhancedViewRegistry.getLoaded("sprint")?.id).toBe("sprint");
    expect(enhancedViewRegistry.getLoaded("projectTracking")).toBeUndefined();
    expect(enhancedViewRegistry.getLoaded("projects")).toBeUndefined();
    expect(enhancedViewRegistry.has("projectTracking")).toBe(true);
    expect(enhancedViewRegistry.has("projects")).toBe(true);
    expect(enhancedViewRegistry.has("does-not-exist")).toBe(false);
  });

  it.each(["projectTracking", "projects"])("loads %s once and caches its renderer", async (id) => {
    const loader = vi.fn(fakeLoader);
    const registry = createEnhancedViewRegistry(loader);
    const expected = deferredViews.get(id);

    expect(await registry.load(id)).toBe(expected);
    expect(await registry.load(id)).toBe(expected);
    expect(registry.getLoaded(id)).toBe(expected);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("resolves an unknown id to no renderer at all", async () => {
    const registry = createEnhancedViewRegistry(fakeLoader);

    expect(await registry.load("does-not-exist")).toBeUndefined();
  });

  it("forgets a failed load so the next attempt retries it", async () => {
    const loader = vi
      .fn<DeferredViewLoader>()
      .mockRejectedValueOnce(new Error("bundle missing"))
      .mockResolvedValue(projectsView);
    const registry = createEnhancedViewRegistry(loader);

    await expect(registry.load("projects")).rejects.toThrow("bundle missing");
    expect(await registry.load("projects")).toBe(projectsView);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("renders each resolved view's own title text", async () => {
    const registry = createEnhancedViewRegistry(fakeLoader);
    const sprint = (await registry.load("sprint"))?.render(context("sprint"));
    const tracking = (await registry.load("projectTracking"))?.render(context("tracking"));
    const projects = (await registry.load("projects"))?.render(context("projects"));

    expect(textOf(sprint, ".awesomeado-view__title")).toBe("Sprint View");
    expect(textOf(tracking, ".awesomeado-view__title")).toBe("Project Tracking");
    expect(textOf(projects, ".awesomeado-view__title")).toBe("All Projects Catalog View");
  });
});
