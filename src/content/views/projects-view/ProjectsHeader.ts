import type { OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import type { EnhancedViewContext } from "../../../common/view-common/EnhancedView";
import type { BreadcrumbSegment } from "../../../common/view-common/control/Breadcrumbs/Breadcrumbs";
import { renderCheckboxFilter } from "../../../common/view-common/control/CheckboxFilter/CheckboxFilter";
import type { CheckboxFilterSelection } from "../../../common/view-common/control/CheckboxFilter/CheckboxFilter";
import type { RefreshButtonHandle } from "../../../common/view-common/control/HeaderButtons/HeaderButtons";
import { renderOrderingPicker } from "../../../common/view-common/control/OrderingPicker/OrderingPicker";
import { renderViewHeader } from "../../../common/view-common/control/ViewHeader/ViewHeader";

import type { TagCondition } from "./projectTags";
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
  onTagsChange(selection: CheckboxFilterSelection): void;
  onOrderingChange(policy: OrderingPolicy): void;
  onExpandAll(): void;
  onCollapseAll(): void;
  onRefresh(): void;
  /** Opens the catalog-wide menu (copy the query's URL, add a project) at the pointer. */
  onTitleContextMenu(event: MouseEvent): void;
}

/** The mounted header plus the refresh button whose state the board drives. */
export interface ProjectsHeaderHandle {
  element: HTMLElement;
  refresh: RefreshButtonHandle;
}

const TAG_FILTER_CLASS_PREFIX = "awesomeado-tag-filter";

const CLASS_PREFIX = "awesomeado-projects";

/**
 * The tag multi-select, given a quick-search because a team's tag vocabulary is unbounded, and the
 * combining controls because "these two but not that one" is the question a catalog is actually
 * asked — a plain OR cannot narrow a board where every project wears several tags.
 *
 * Every tick narrows the board immediately: the reader is building the condition by watching what it
 * leaves behind, so waiting for the dropdown to close would make them state the whole thing blind.
 * That is only possible because the board repaints its LIST rather than the whole surface — a full
 * repaint would rebuild this header and take the open dropdown with it.
 *
 * Once a condition is active, the trigger clears it in one press instead of reopening the popup.
 * This matches the other transient header filters and leaves only one clear gesture.
 */
function renderTagFilter(doc: Document, options: ProjectsHeaderOptions): HTMLElement {
  const { required, excluded, matchAll } = options.tagCondition;
  return renderCheckboxFilter(doc, {
    label: "Tags",
    classPrefix: TAG_FILTER_CLASS_PREFIX,
    options: options.tags.map((tag) => ({ value: tag })),
    selected: options.tags.filter((tag) => required.has(tag.toLowerCase())),
    excluded: options.tags.filter((tag) => excluded.has(tag.toLowerCase())),
    matchAll,
    combining: true,
    searchPlaceholder: "Search tags",
    clearOnTriggerWhenActive: true,
    onChange: options.onTagsChange,
  }).element;
}

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
    filters: [renderTagFilter(doc, options)],
    onRefresh: options.onRefresh,
  });
}
