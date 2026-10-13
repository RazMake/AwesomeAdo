import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import type { IWorkItemStateTransitionsReader } from "../../../common/ado/WorkItemStateTransitions";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import type { ILogger } from "../../../common/logging/ILogger";
import {
  renderStatusBadge,
  type StatusBadgeHandle,
} from "../../../common/view-common/control/StatusBadge/StatusBadge";
import { changeItemState } from "../item-status/changeItemState";

import { fixedStatesFor, mappedFixedState, type FixedStateMapping } from "./fixedStatuses";

export interface RequestStatusBadgeOptions {
  doc: Document;
  item: TrackedWorkItem;
  /** Request or question statuses: any fixed-status table the binding maps onto ADO states. */
  mapping: FixedStateMapping;
  queue: WorkItemWriteQueue;
  /** The type's allowed State changes, used to route a change ADO refuses as a direct jump. */
  transitions: IWorkItemStateTransitionsReader | undefined;
  logger: ILogger;
  minWidthCh: number;
  now(): Date;
  onCommitted(): void;
}

/**
 * The Consumers View's fixed request- and question-status control, backed by the binding's ADO-state map.
 *
 * Every status is always offered: a change the process does not allow directly is routed through
 * its intermediary States, so the reader picks the outcome and never the path.
 */
export function renderRequestStatusBadge(options: RequestStatusBadgeOptions): StatusBadgeHandle {
  const { item, mapping } = options;
  const statuses = fixedStatesFor(item, mapping);
  const current = mappedFixedState(item, mapping);

  const badge = renderStatusBadge(options.doc, {
    state: current?.label ?? item.state,
    ordinal: current?.ordinal,
    columns: statuses.map(({ label, primaryState, ordinal }) => ({
      column: label,
      primaryState,
      ordinal,
    })),
    editable: true,
    minWidthCh: options.minWidthCh,
    onChange: (_primaryState, label) => {
      const selected = statuses.find((status) => status.label === label);
      if (selected === undefined) return;
      const showReached = (): void => {
        const reached = mappedFixedState(item, mapping);
        badge.setStatus(reached?.label ?? item.state, reached?.ordinal);
        options.onCommitted();
      };
      void changeItemState({
        item,
        queue: options.queue,
        targets: selected.adoStates,
        transitions: options.transitions,
        logger: options.logger,
        now: options.now,
        onAccepted: () => {
          badge.setStatus(selected.label, selected.ordinal);
          options.onCommitted();
        },
        onStopped: showReached,
      });
    },
  });
  return badge;
}
