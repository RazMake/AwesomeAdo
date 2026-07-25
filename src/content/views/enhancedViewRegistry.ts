import type { EnhancedView } from "../../common/view-common/EnhancedView";

import { projectTrackingView } from "./project-tracking/ProjectTrackingView";
import { sprintView } from "./sprint/SprintView";

/**
 * Every enhanced view's renderer, keyed by resolving through `getEnhancedView`.
 *
 * Mirrors `VIEW_TYPES` in `viewCatalog.ts` but on the runtime side: the catalog is the config a
 * binding is built from, this registry is what actually paints once a bound query resolves to a
 * view. Only the content surface imports this, so options never bundles view DOM code.
 */
export const ENHANCED_VIEWS: readonly EnhancedView[] = [sprintView, projectTrackingView];

/** Resolve a view id (from a binding) to its renderer, or undefined when the id is unknown. */
export function getEnhancedView(id: string): EnhancedView | undefined {
  return ENHANCED_VIEWS.find((view) => view.id === id);
}
