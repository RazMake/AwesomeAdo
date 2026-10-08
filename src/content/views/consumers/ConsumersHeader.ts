import type { OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import type { EnhancedViewContext } from "../../../common/view-common/EnhancedView";
import type { BreadcrumbSegment } from "../../../common/view-common/control/Breadcrumbs/Breadcrumbs";
import type { RefreshRequest } from "../../../common/view-common/control/HeaderButtons/HeaderButtons";
import { renderOrderingPicker } from "../../../common/view-common/control/OrderingPicker/OrderingPicker";
import {
  renderViewHeader,
  type ViewTitleBandHandle,
} from "../../../common/view-common/control/ViewHeader/ViewHeader";

import { CONSUMERS_ORDERING_POLICIES } from "./consumersViewType";

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
  /**
   * The header filters, built by the board over the selections it retains, in the order they are
   * shown (Consumer, Tags, Area).
   */
  filters: readonly HTMLElement[];
  /** The switch between the requests-only list and the consumer cards, built by the board. */
  showConsumersToggle: HTMLElement;
  /** The Add Consumer button, shown beside the switch whose mode decides whether it is enabled. */
  addConsumerButton: HTMLElement;
  onOrderingChange(policy: OrderingPolicy): void;
  /** Opens the next tree level. */
  onExpandAll(): void;
  /** Closes open descriptions, then open discussions, then the deepest open tree level. */
  onCollapseAll(): void;
  /** Re-reads the board; `request.discardCaches` is set by a Ctrl+click. */
  onRefresh(request: RefreshRequest): void;
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
      policies: CONSUMERS_ORDERING_POLICIES,
    }),
    title: options.title,
    titleColor: options.titleColor,
    onTitleContextMenu: options.onTitleContextMenu,
    expandLabel: "Expand the next tree level",
    collapseLabel: "Collapse open descriptions, then discussions, then one tree level",
    onExpandAll: options.onExpandAll,
    onCollapseAll: options.onCollapseAll,
    // The mode switch sits with `+` and `−` because, like them, it changes how much of the tree is
    // drawn rather than which items qualify. Sprints, markers, and blocked/interrupt flags describe
    // delivery work, not a consumer's request queue, so only consumer, tag, and area filters exist.
    outlineControls: [options.showConsumersToggle, options.addConsumerButton],
    filters: options.filters,
    onRefresh: options.onRefresh,
  });
}
