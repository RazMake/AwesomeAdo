import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { boardColumnOrdinal, workItemStatusLabel } from "../../../common/ado/workItemTypes";
import {
  renderStatusBadge,
  type StatusBadgeHandle,
} from "../../../common/view-common/control/StatusBadge/StatusBadge";

/** Everything one editable Status badge needs about its item and the board it sits on. */
export interface ItemStatusBadgeOptions {
  doc: Document;
  item: TrackedWorkItem;
  /** The item's configured type, whose columns the badge offers; undefined for an unknown type. */
  entry: TypeCatalogEntry | undefined;
  /** The team's global board-column order, which decides every badge's color. */
  boardColumns: readonly string[];
  /** The board's one serialized write queue. */
  queue: WorkItemWriteQueue;
  /** The shared badge width, so every row's badge lines up (see `widestStatusLabelLength`). */
  minWidthCh: number;
  /** The injected clock, stamped as the item's state-change time once a new Status lands. */
  now(): Date;
  /** Called after Azure DevOps accepted a new Status, for boards whose other rows depend on it. */
  onCommitted?(): void;
}

/**
 * The item's application Status — its mapped board-column label, never the raw ADO State — as an
 * editable badge offering every column its type maps.
 *
 * Persist-then-reflect: the label only moves once the write succeeds, so a rejected write never
 * leaves a value on screen that ADO did not accept. The rev is read at WRITE time, so a second edit
 * queued behind this one still carries a current rev. The queue logs and counts failures and never
 * rejects, so there is nothing to roll back — the board's write-status indicator reports the loss.
 */
export function renderItemStatusBadge(options: ItemStatusBadgeOptions): StatusBadgeHandle {
  const { item, boardColumns, queue } = options;
  const columns = (options.entry?.columns ?? [])
    .filter((column) => column.states.length > 0)
    .map((column) => ({
      column: column.column,
      primaryState: column.states[0] ?? column.column,
      ordinal: boardColumnOrdinal(column.column, boardColumns),
    }));
  const label = workItemStatusLabel(item, options.entry);
  const badge = renderStatusBadge(options.doc, {
    state: label,
    ordinal: boardColumnOrdinal(label, boardColumns),
    columns,
    editable: true,
    minWidthCh: options.minWidthCh,
    onChange: (primaryState, column) => {
      void queue
        .enqueue({
          id: item.id,
          currentRev: () => item.rev,
          field: "System.State",
          value: primaryState,
        })
        .then((result) => {
          if (!result.ok || result.rev === undefined) return;
          item.state = primaryState;
          item.rev = result.rev;
          item.stateChangeDate = options.now().toISOString();
          badge.setStatus(column, boardColumnOrdinal(column, boardColumns));
          options.onCommitted?.();
        });
    },
  });
  return badge;
}

/**
 * The character length of the widest Status label a board can show — every selectable column label
 * across all types plus each item's displayed status. Feeding it to every badge as a shared
 * `minWidthCh` renders all badges one uniform width regardless of their own type's labels.
 */
export function widestStatusLabelLength(
  items: readonly TrackedWorkItem[],
  types: ReadonlyMap<string, TypeCatalogEntry>,
): number {
  let widest = 0;
  // Any column can be picked from the dropdown, so all their labels must fit the shared width.
  for (const entry of types.values()) {
    for (const column of entry.columns) {
      widest = Math.max(widest, column.column.length);
    }
  }
  // Plus every displayed status — covers items whose state maps to no column (raw-state fallback).
  const pending = [...items];
  while (pending.length > 0) {
    const item = pending.pop()!;
    widest = Math.max(widest, workItemStatusLabel(item, types.get(item.type)).length);
    pending.push(...item.children);
  }
  return widest;
}
