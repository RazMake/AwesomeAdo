import type { EnhancedView } from "../../common/view-common/EnhancedView";

import { sprintView } from "./sprint/SprintView";

const PROJECT_TRACKING_ID = "projectTracking";
const PROJECT_TRACKING_BUNDLE = "content/project-tracking.js";

export interface EnhancedViewRegistry {
  readonly ids: readonly string[];
  has(id: string): boolean;
  getLoaded(id: string): EnhancedView | undefined;
  load(id: string): Promise<EnhancedView | undefined>;
}

type ProjectTrackingLoader = () => Promise<EnhancedView>;

const loadProjectTrackingBundle: ProjectTrackingLoader = () => {
  const bundleUrl = chrome.runtime.getURL(PROJECT_TRACKING_BUNDLE);
  return import(/* @vite-ignore */ bundleUrl).then((module: unknown) => {
    const view = (module as { projectTrackingView?: EnhancedView }).projectTrackingView;
    if (view?.id !== PROJECT_TRACKING_ID) {
      return Promise.reject(new Error("Project Tracking renderer bundle has an invalid export."));
    }
    return view;
  });
};

/** Build a registry; the loader parameter keeps chunk resolution deterministic in unit tests. */
export function createEnhancedViewRegistry(
  loadProjectTracking: ProjectTrackingLoader = loadProjectTrackingBundle,
): EnhancedViewRegistry {
  let projectTrackingView: EnhancedView | undefined;
  let projectTrackingPromise: Promise<EnhancedView> | undefined;
  const ids = [sprintView.id, PROJECT_TRACKING_ID] as const;

  return {
    ids,
    has: (id) => ids.includes(id as (typeof ids)[number]),
    getLoaded: (id) => (id === sprintView.id ? sprintView : projectTrackingView),
    load: (id) => {
      if (id === sprintView.id) return Promise.resolve(sprintView);
      if (id !== PROJECT_TRACKING_ID) return Promise.resolve(undefined);
      if (projectTrackingView !== undefined) return Promise.resolve(projectTrackingView);
      projectTrackingPromise ??= loadProjectTracking().then(
        (view) => {
          projectTrackingView = view;
          return view;
        },
        (error: unknown) => {
          projectTrackingPromise = undefined;
          return Promise.reject(error);
        },
      );
      return projectTrackingPromise;
    },
  };
}

/** Runtime singleton: Sprint is immediate; Project Tracking loads once on first use. */
export const enhancedViewRegistry = createEnhancedViewRegistry();
