import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import { parseStateMapping, type StateMappingRow } from "../../../common/view-common/StateMapping";
import type { ViewTypeProperty } from "../../../common/view-common/ViewType";

export type RequestStateId = "new" | "needsClarification" | "accepted" | "rejected" | "done";

interface RequestStatus {
  id: RequestStateId;
  label: string;
  /** The settings-table heading, which also says what the status means. */
  heading: string;
  /** StatusBadge palette position: gray, blue, yellow, green, or red. */
  ordinal: number;
}

/** The fixed statuses, in the order the settings table and the status picker show them. */
const REQUEST_STATUSES: readonly RequestStatus[] = [
  { id: "new", label: "New", heading: "New (Untriaged)", ordinal: 0 },
  {
    id: "needsClarification",
    label: "Needs Clarification",
    heading: "Needs Clarification",
    ordinal: 2,
  },
  { id: "accepted", label: "Accepted", heading: "Accepted", ordinal: 1 },
  { id: "rejected", label: "Rejected", heading: "Rejected", ordinal: 4 },
  { id: "done", label: "Done", heading: "Done", ordinal: 3 },
];

const REQUEST_STATE_MAPPING_KEY = "requestStateMapping";

/** Feature requests are User Stories, so the mapping table has exactly that one row. */
const REQUEST_WORK_ITEM_TYPE = "User Story";

/** The Consumers View setting that maps the request type's ADO states onto the fixed statuses. */
export const requestStateMappingProperty: ViewTypeProperty = {
  key: REQUEST_STATE_MAPPING_KEY,
  label: "Request states",
  required: false,
  kind: "state-mapping",
  stateColumns: REQUEST_STATUSES.map(({ id, heading }) => ({ value: id, label: heading })),
  stateRowTypes: [REQUEST_WORK_ITEM_TYPE],
  hint:
    "Place the request work item type's Azure DevOps states under the request statuses. The table " +
    "applies to every request, whatever its work item type. The first state in a cell is written " +
    "when that status is picked; a status left empty writes the state " +
    "named exactly like it. When Azure DevOps does not allow the change directly, the request is " +
    "moved through the intermediary states its process requires.",
};

export interface RequestStateMappingEntry {
  id: RequestStateId;
  label: string;
  ordinal: number;
  adoStates: readonly string[];
  /** The state written when this status is picked. */
  primaryState: string;
}

/** The binding's per-type mapping; an opaque value read through the helpers below. */
export interface RequestStateMapping {
  readonly byType: ReadonlyMap<string, readonly RequestStateMappingEntry[]>;
  /** The table's first row, for requests whose type has no row of its own. */
  readonly fallback: readonly RequestStateMappingEntry[];
}

/**
 * A status whose cell is empty (or whose type has no row) uses the ADO state named exactly like it,
 * so every status always has a state to write and an unconfigured board still works.
 */
function entriesFor(row: StateMappingRow | undefined): readonly RequestStateMappingEntry[] {
  return REQUEST_STATUSES.map((status) => {
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

const UNMAPPED_TYPE_ENTRIES = entriesFor(undefined);

function typeKey(type: string): string {
  return type.trim().toLowerCase();
}

/** Resolve the binding's table into the per-type mapping the board reads. */
export function requestStateMapping(properties: Record<string, string>): RequestStateMapping {
  const rows = parseStateMapping(properties[REQUEST_STATE_MAPPING_KEY] ?? "");
  return {
    byType: new Map(rows.map((row) => [typeKey(row.type), entriesFor(row)])),
    fallback: rows.length > 0 ? entriesFor(rows[0]) : UNMAPPED_TYPE_ENTRIES,
  };
}

/**
 * The fixed statuses as they apply to this item's work item type. The table's row is named after
 * the type whose states it was picked from, but requests can be of any type (often User Stories), so
 * a request without a row of its own uses the table's row rather than the bare status labels, which
 * are rarely real ADO states.
 */
export function requestStatesFor(
  item: TrackedWorkItem,
  mapping: RequestStateMapping,
): readonly RequestStateMappingEntry[] {
  return mapping.byType.get(typeKey(item.type)) ?? mapping.fallback;
}

/** The fixed Consumers status an item's raw ADO state maps to, or null when it is unmapped. */
export function mappedRequestState(
  item: TrackedWorkItem,
  mapping: RequestStateMapping,
): RequestStateMappingEntry | null {
  const raw = item.state.trim().toLowerCase();
  return (
    requestStatesFor(item, mapping).find((state) =>
      state.adoStates.some((candidate) => candidate.trim().toLowerCase() === raw),
    ) ?? null
  );
}

export function requestHasState(
  item: TrackedWorkItem,
  state: RequestStateId,
  mapping: RequestStateMapping,
): boolean {
  return mappedRequestState(item, mapping)?.id === state;
}

/** One width for every request badge, including an unmapped raw state that remains visible. */
export function widestRequestStateLabelLength(
  requests: readonly TrackedWorkItem[],
  mapping: RequestStateMapping,
): number {
  return Math.max(
    ...REQUEST_STATUSES.map(({ label }) => label.length),
    ...requests.map(
      (request) => mappedRequestState(request, mapping)?.label.length ?? request.state.length,
    ),
  );
}
