import type { EnhancedView } from "../../common/view-common/EnhancedView";

import { sprintView } from "./sprint/SprintView";

/**
 * The views whose renderer is too large to parse on every ADO page.
 *
 * Each is emitted as its own web-accessible ESM bundle (see `scripts/build.mjs` and
 * `src/manifest.json`) and resolved by URL the first time a binding asks for it. The registry key is
 * the view's id, so a bundle exporting a different view is rejected rather than silently painted in
 * that view's place.
 */
const DEFERRED_VIEWS = {
  projectTracking: { bundle: "content/project-tracking.js", exportName: "projectTrackingView" },
  projects: { bundle: "content/projects-view.js", exportName: "projectsView" },
} as const satisfies Record<string, { bundle: string; exportName: string }>;

type DeferredViewId = keyof typeof DEFERRED_VIEWS;

/** Resolves a deferred view's renderer; injected so chunk resolution stays deterministic in tests. */
export type DeferredViewLoader = (id: string) => Promise<EnhancedView>;

export interface EnhancedViewRegistry {
  readonly ids: readonly string[];
  has(id: string): boolean;
  getLoaded(id: string): EnhancedView | undefined;
  load(id: string): Promise<EnhancedView | undefined>;
}

function isDeferred(id: string): id is DeferredViewId {
  return Object.prototype.hasOwnProperty.call(DEFERRED_VIEWS, id);
}

const loadDeferredBundle: DeferredViewLoader = (id) => {
  if (!isDeferred(id)) {
    return Promise.reject(new Error(`No deferred renderer bundle is registered for "${id}".`));
  }
  const { bundle, exportName } = DEFERRED_VIEWS[id];
  const bundleUrl = chrome.runtime.getURL(bundle);
  return import(/* @vite-ignore */ bundleUrl).then((module: unknown) => {
    const view = (module as Record<string, EnhancedView | undefined>)[exportName];
    if (view?.id !== id) {
      return Promise.reject(new Error(`The ${id} renderer bundle has an invalid export.`));
    }
    return view;
  });
};

/** Build a registry; the loader parameter keeps chunk resolution deterministic in unit tests. */
export function createEnhancedViewRegistry(
  loadDeferred: DeferredViewLoader = loadDeferredBundle,
): EnhancedViewRegistry {
  const ids: readonly string[] = [sprintView.id, ...Object.keys(DEFERRED_VIEWS)];
  const loaded = new Map<string, EnhancedView>();
  const inFlight = new Map<string, Promise<EnhancedView>>();

  const resolveDeferred = (id: DeferredViewId): Promise<EnhancedView> => {
    const pending =
      inFlight.get(id) ??
      loadDeferred(id).then(
        (view) => {
          loaded.set(id, view);
          return view;
        },
        (error: unknown) => {
          // Forgetting the rejected attempt is what lets a later press retry instead of replaying
          // the same failure for the rest of the session.
          inFlight.delete(id);
          return Promise.reject(error);
        },
      );
    inFlight.set(id, pending);
    return pending;
  };

  return {
    ids,
    has: (id) => ids.includes(id),
    getLoaded: (id) => (id === sprintView.id ? sprintView : loaded.get(id)),
    load: (id) => {
      if (id === sprintView.id) return Promise.resolve(sprintView);
      if (!isDeferred(id)) return Promise.resolve(undefined);
      const already = loaded.get(id);
      return already === undefined ? resolveDeferred(id) : Promise.resolve(already);
    },
  };
}

/** Runtime singleton: Sprint is immediate; the larger views load once on first use. */
export const enhancedViewRegistry = createEnhancedViewRegistry();
