import type { EnhancedView } from "../../../common/view-common/EnhancedView";
import { renderViewScaffold } from "../../../common/view-common/control/ViewScaffold/ViewScaffold";

import { sprintViewType } from "./sprintViewType";

/**
 * The Sprint View's renderer. For now it paints the shared placeholder shell with sprint-specific
 * copy; the sprint board grows in here later, reusing the shared view components as they arrive.
 */
export const sprintView: EnhancedView = {
  id: sprintViewType.id,
  render: (context) =>
    renderViewScaffold(context.doc, {
      title: sprintViewType.label,
      message: "AwesomeADO will show this query's work grouped by sprint here.",
    }),
};
