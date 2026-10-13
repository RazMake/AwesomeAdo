import { renderCheckboxFilter } from "../../../common/view-common/control/CheckboxFilter/CheckboxFilter";

import { REQUEST_STATUSES, type RequestStateCondition, type RequestStateId } from "./requestStates";

export interface RequestStateFilterOptions {
  condition: RequestStateCondition;
  onChange(condition: RequestStateCondition): void;
}

const KNOWN_STATES: ReadonlySet<string> = new Set(REQUEST_STATUSES.map(({ id }) => id));

function statesOf(values: readonly string[]): Set<RequestStateId> {
  return new Set(values.filter((value) => KNOWN_STATES.has(value)) as RequestStateId[]);
}

/**
 * The requests list's state filter: tick the states to keep, and mark any state as NOT wanted.
 *
 * Offers the board's fixed request statuses rather than raw ADO states, so the choices read the
 * same as the status badges whatever process the team's work item type uses. Once a condition is
 * active the trigger clears it in one press, like the other transient header filters.
 */
export function renderRequestStateFilter(
  doc: Document,
  options: RequestStateFilterOptions,
): HTMLElement {
  return renderCheckboxFilter(doc, {
    label: "By state",
    fixedTitle: "Filter requests by their state",
    classPrefix: "awesomeado-request-state-filter",
    options: REQUEST_STATUSES.map(({ id, label }) => ({ value: id, label })),
    selected: [...options.condition.required],
    excluded: [...options.condition.excluded],
    combining: true,
    exclusiveValues: true,
    clearOnTriggerWhenActive: true,
    onChange: ({ included, excluded }) =>
      options.onChange({ required: statesOf(included), excluded: statesOf(excluded) }),
  }).element;
}
