import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import { parseStateMapping, type StateMappingRow } from "../../../common/view-common/StateMapping";

/** One of a board's fixed statuses, which the binding's table maps onto ADO states. */
export interface FixedStatus<Id extends string = string> {
  id: Id;
  label: string;
  /** The settings-table heading, which also says what the status means. */
  heading: string;
  /** StatusBadge palette position: gray, blue, yellow, green, or red. */
  ordinal: number;
}

export interface FixedStateMappingEntry<Id extends string = string> {
  id: Id;
  label: string;
  ordinal: number;
  adoStates: readonly string[];
  /** The state written when this status is picked. */
  primaryState: string;
}

/** The binding's per-type mapping; an opaque value read through the helpers below. */
export interface FixedStateMapping<Id extends string = string> {
  readonly statuses: readonly FixedStatus<Id>[];
  readonly byType: ReadonlyMap<string, readonly FixedStateMappingEntry<Id>[]>;
  /** The table's first row, for items whose type has no row of its own. */
  readonly fallback: readonly FixedStateMappingEntry<Id>[];
}

/**
 * A status whose cell is empty (or whose type has no row) uses the ADO state named exactly like it,
 * so every status always has a state to write and an unconfigured board still works.
 */
function entriesFor<Id extends string>(
  statuses: readonly FixedStatus<Id>[],
  row: StateMappingRow | undefined,
): readonly FixedStateMappingEntry<Id>[] {
  return statuses.map((status) => {
    const mapped = row?.states[status.id] ?? [];
    const adoStates = mapped.length > 0 ? mapped : [status.label];
    return {
      id: status.id,
      label: status.label,
      ordinal: status.ordinal,
      adoStates,
      primaryState: adoStates[0]!,
    };
  });
}

function typeKey(type: string): string {
  return type.trim().toLowerCase();
}

/** Resolve one binding table (stored under `key`) into the per-type mapping a board reads. */
export function fixedStateMapping<Id extends string>(
  statuses: readonly FixedStatus<Id>[],
  key: string,
  properties: Record<string, string>,
): FixedStateMapping<Id> {
  const rows = parseStateMapping(properties[key] ?? "");
  return {
    statuses,
    byType: new Map(rows.map((row) => [typeKey(row.type), entriesFor(statuses, row)])),
    fallback: entriesFor(statuses, rows[0]),
  };
}

/**
 * The fixed statuses as they apply to this item's work item type. An item without a row of its own
 * uses the table's first row rather than the bare status labels, which are rarely real ADO states.
 */
export function fixedStatesFor<Id extends string>(
  item: TrackedWorkItem,
  mapping: FixedStateMapping<Id>,
): readonly FixedStateMappingEntry<Id>[] {
  return mapping.byType.get(typeKey(item.type)) ?? mapping.fallback;
}

/** The fixed status an item's raw ADO state maps to, or null when it is unmapped. */
export function mappedFixedState<Id extends string>(
  item: TrackedWorkItem,
  mapping: FixedStateMapping<Id>,
): FixedStateMappingEntry<Id> | null {
  const raw = item.state.trim().toLowerCase();
  return (
    fixedStatesFor(item, mapping).find((state) =>
      state.adoStates.some((candidate) => candidate.trim().toLowerCase() === raw),
    ) ?? null
  );
}

/** One width for every badge, including an unmapped raw state that remains visible. */
export function widestFixedStateLabelLength<Id extends string>(
  items: readonly TrackedWorkItem[],
  mapping: FixedStateMapping<Id>,
): number {
  return Math.max(
    ...mapping.statuses.map(({ label }) => label.length),
    ...items.map((item) => mappedFixedState(item, mapping)?.label.length ?? item.state.length),
  );
}
