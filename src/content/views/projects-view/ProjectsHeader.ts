import type { OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import type { EnhancedViewContext } from "../../../common/view-common/EnhancedView";
import type { BreadcrumbSegment } from "../../../common/view-common/control/Breadcrumbs/Breadcrumbs";
import type {
  RefreshButtonHandle,
  RefreshRequest,
} from "../../../common/view-common/control/HeaderButtons/HeaderButtons";
import { renderOrderingPicker } from "../../../common/view-common/control/OrderingPicker/OrderingPicker";
import { renderViewHeader } from "../../../common/view-common/control/ViewHeader/ViewHeader";
import { renderTagConditionFilter } from "../tag-selection/TagConditionFilter";
import type { TagCondition } from "../tag-selection/tagCondition";

import { projectsViewType } from "./projectsViewType";

/** What the All Projects Catalog View header shows and what pressing each of its controls means. */
export interface ProjectsHeaderOptions {
  /** The query's parent-folder trail; an empty trail omits the row entirely. */
  breadcrumbs: BreadcrumbSegment[];
  /** Every tag worn anywhere in the loaded tree, offered by the tag filter. */
  tags: readonly string[];
  /** The tag condition currently narrowing the board, keyed in lower case. */
  tagCondition: TagCondition;
  /** The ordering the board is showing right now, which the sort glyph names. */
  policy: OrderingPolicy;
  /**
   * The shared "Saving…" / "Couldn't save" indicator.
   *
   * Handed in already mounted because its state outlives any one paint: the header is rebuilt
   * whenever the board repaints, and a fresh indicator would forget an in-flight or rejected write.
   */
  queueStatus: HTMLElement;
  onTagsChange(condition: TagCondition): void;
  onOrderingChange(policy: OrderingPolicy): void;
  onExpandAll(): void;
  onCollapseAll(): void;
  /** Re-reads the catalog; `request.discardCaches` is set by a Ctrl+click. */
  onRefresh(request: RefreshRequest): void;
  /** Opens the catalog-wide menu (copy the query's URL, add a project) at the pointer. */
  onTitleContextMenu(event: MouseEvent): void;
}

/** The mounted header plus the refresh button whose state the board drives. */
export interface ProjectsHeaderHandle {
  element: HTMLElement;
  refresh: RefreshButtonHandle;
}

const CLASS_PREFIX = "awesomeado-projects";

/** Build the All Projects Catalog View header; the board mounts `element` and drives `refresh`. */
export function renderProjectsHeader(
  context: EnhancedViewContext,
  options: ProjectsHeaderOptions,
): ProjectsHeaderHandle {
  const { doc } = context;
  return renderViewHeader(doc, {
    classPrefix: CLASS_PREFIX,
    breadcrumbs: options.breadcrumbs,
    writeQueueStatus: options.queueStatus,
    extensionVersion: context.extensionVersion,
    orderingPicker: renderOrderingPicker(doc, {
      policy: options.policy,
      onChange: options.onOrderingChange,
    }),
    title: projectsViewType.label,
    onTitleContextMenu: options.onTitleContextMenu,
    expandLabel: "Expand every project",
    collapseLabel: "Collapse every project",
    onExpandAll: options.onExpandAll,
    onCollapseAll: options.onCollapseAll,
    filters: [
      renderTagConditionFilter(doc, {
        tags: options.tags,
        condition: options.tagCondition,
        onChange: options.onTagsChange,
      }),
    ],
    onRefresh: options.onRefresh,
  });
}
