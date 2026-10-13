import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import type { ViewTypeProperty } from "../../../common/view-common/ViewType";

import {
  fixedStateMapping,
  fixedStatesFor,
  mappedFixedState,
  widestFixedStateLabelLength,
  type FixedStateMapping,
  type FixedStateMappingEntry,
  type FixedStatus,
} from "./fixedStatuses";

export type RequestStateId = "new" | "needsClarification" | "accepted" | "rejected" | "done";

/** The fixed statuses, in the order the settings table and the status picker show them. */
export const REQUEST_STATUSES: readonly FixedStatus<RequestStateId>[] = [
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

export type RequestStateMappingEntry = FixedStateMappingEntry<RequestStateId>;
export type RequestStateMapping = FixedStateMapping<RequestStateId>;

/** Resolve the binding's table into the per-type mapping the board reads. */
export function requestStateMapping(properties: Record<string, string>): RequestStateMapping {
  return fixedStateMapping(REQUEST_STATUSES, REQUEST_STATE_MAPPING_KEY, properties);
}

/** Requests can be of any type; one without a row of its own uses the table's first row. */
export const requestStatesFor = fixedStatesFor<RequestStateId>;

/** The fixed Consumers status an item's raw ADO state maps to, or null when it is unmapped. */
export const mappedRequestState = mappedFixedState<RequestStateId>;

export function requestHasState(
  item: TrackedWorkItem,
  state: RequestStateId,
  mapping: RequestStateMapping,
): boolean {
  return mappedRequestState(item, mapping)?.id === state;
}

/**
 * The request-state condition the requests list can be narrowed by. A request has exactly one
 * state, so `required` lists alternatives (any one qualifies) rather than a set to hold together.
 */
export interface RequestStateCondition {
  required: ReadonlySet<RequestStateId>;
  excluded: ReadonlySet<RequestStateId>;
}

export const NO_REQUEST_STATE_CONDITION: RequestStateCondition = {
  required: new Set(),
  excluded: new Set(),
};

export function isRequestStateConditionActive(condition: RequestStateCondition): boolean {
  return condition.required.size > 0 || condition.excluded.size > 0;
}

/**
 * Whether a request passes the condition. A request whose raw state maps to no status has no
 * state to require, so it is hidden by any required state but is not excluded by an exclusion.
 */
export function matchesRequestStateCondition(
  item: TrackedWorkItem,
  condition: RequestStateCondition,
  mapping: RequestStateMapping,
): boolean {
  const state = mappedRequestState(item, mapping)?.id ?? null;
  if (condition.required.size > 0 && (state === null || !condition.required.has(state))) {
    return false;
  }
  return state === null || !condition.excluded.has(state);
}

/** The condition in one log-readable phrase. */
export function describeRequestStateCondition(condition: RequestStateCondition): string {
  if (!isRequestStateConditionActive(condition)) return "none";
  return `any of [${[...condition.required].join(",")}], none of [${[...condition.excluded].join(",")}]`;
}

/** One width for every request badge, including an unmapped raw state that remains visible. */
export const widestRequestStateLabelLength = widestFixedStateLabelLength<RequestStateId>;
