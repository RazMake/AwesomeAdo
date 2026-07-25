import type { EnhancedView } from "../../../common/view-common/EnhancedView";
import { renderViewScaffold } from "../shared/ViewScaffold";

import { projectTrackingViewType } from "./projectTrackingViewType";

/**
 * The Project Tracking view's renderer. For now it paints the shared placeholder shell with
 * tracking-specific copy; the grouped tracking board grows in here later, reusing the shared view
 * components (ordering, recent-activity windows) as they arrive.
 */
export const projectTrackingView: EnhancedView = {
  id: projectTrackingViewType.id,
  render: (context) =>
    renderViewScaffold(context.doc, {
      title: projectTrackingViewType.label,
      message: "AwesomeADO will show this query's items grouped for tracking here.",
    }),
};
