import type { OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import type { EnhancedViewContext } from "../../../common/view-common/EnhancedView";
import type { BreadcrumbSegment } from "../../../common/view-common/control/Breadcrumbs/Breadcrumbs";
import { renderOrderingPicker } from "../../../common/view-common/control/OrderingPicker/OrderingPicker";
import {
  renderViewHeader,
  type ViewTitleBandHandle,
} from "../../../common/view-common/control/ViewHeader/ViewHeader";

/** What the Consumers View header shows and what pressing each of its controls means. */
export interface ConsumersHeaderOptions {
  /** The query's parent-folder trail; an empty trail leaves only the corner. */
  breadcrumbs: readonly BreadcrumbSegment[];
  /** The grouping root's title, or the view label when the query has no usable root. */
  title: string;
  /** The grouping root type's display color, or null to keep the themed default. */
  titleColor: string | null;
  /** The ordering the board is showing right now, which the sort glyph names. */
  policy: OrderingPolicy;
  /** Why dragging is off under a policy, shown on the sort glyph; null when it is available. */
  dragReorderUnavailable(policy: OrderingPolicy): string | null;
  /**
   * The shared "Saving…" / "Couldn't save" indicator, handed in already mounted because its state
   * outlives any one paint of the header.
   */
  queueStatus: HTMLElement;
  /** The header area-path filter, built by the board over the selection it retains. */
  areaPathFilter: HTMLElement;
  onOrderingChange(policy: OrderingPolicy): void;
  onExpandAll(): void;
  onCollapseAll(): void;
  onRefresh(): void;
  /** Opens the board-wide menu (copy this board's link) at the pointer. */
  onTitleContextMenu(event: MouseEvent): void;
}

/** Build the Consumers View header; the board mounts `element` and drives `refresh`. */
export function renderConsumersHeader(
  context: EnhancedViewContext,
  options: ConsumersHeaderOptions,
): ViewTitleBandHandle {
  const { doc } = context;
  return renderViewHeader(doc, {
    classPrefix: "awesomeado-consumers",
    breadcrumbs: options.breadcrumbs,
    writeQueueStatus: options.queueStatus,
    extensionVersion: context.extensionVersion,
    orderingPicker: renderOrderingPicker(doc, {
      policy: options.policy,
      onChange: options.onOrderingChange,
      dragReorderUnavailable: options.dragReorderUnavailable,
    }),
    title: options.title,
    titleColor: options.titleColor,
    onTitleContextMenu: options.onTitleContextMenu,
    expandLabel: "Expand every consumer",
    collapseLabel: "Collapse every consumer",
    onExpandAll: options.onExpandAll,
    onCollapseAll: options.onCollapseAll,
    // Area paths are the only narrowing this board has: sprints, markers, and blocked/interrupt
    // flags describe delivery work, not a consumer's request queue.
    filters: [options.areaPathFilter],
    onRefresh: options.onRefresh,
  });
}
