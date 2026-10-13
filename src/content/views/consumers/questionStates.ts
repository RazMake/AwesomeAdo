import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import type { ViewTypeProperty } from "../../../common/view-common/ViewType";

import {
  fixedStateMapping,
  mappedFixedState,
  widestFixedStateLabelLength,
  type FixedStateMapping,
  type FixedStatus,
} from "./fixedStatuses";

export type QuestionStateId = "open" | "inProgress" | "answered" | "removed";

/** The fixed question statuses, in the order the settings table and the status picker show them. */
const QUESTION_STATUSES: readonly FixedStatus<QuestionStateId>[] = [
  { id: "open", label: "Open", heading: "Open", ordinal: 0 },
  { id: "inProgress", label: "In Progress", heading: "In Progress", ordinal: 1 },
  { id: "answered", label: "Answered", heading: "Answered", ordinal: 3 },
  { id: "removed", label: "Removed", heading: "Removed", ordinal: 4 },
];

const QUESTION_STATE_MAPPING_KEY = "questionStateMapping";

/** Questions are Tasks under a Pending Questions story, so the table has exactly that one row. */
const QUESTION_WORK_ITEM_TYPE = "Task";

/** The Consumers View setting that maps the question Task's ADO states onto the fixed statuses. */
export const questionStateMappingProperty: ViewTypeProperty = {
  key: QUESTION_STATE_MAPPING_KEY,
  label: "Question states",
  required: false,
  kind: "state-mapping",
  stateColumns: QUESTION_STATUSES.map(({ id, heading }) => ({ value: id, label: heading })),
  stateRowTypes: [QUESTION_WORK_ITEM_TYPE],
  hint:
    "Place the question Task's Azure DevOps states under the question statuses. The first state in " +
    "a cell is written when that status is picked; a status left empty writes the state named " +
    "exactly like it. Answered and Removed questions are no longer counted as open.",
};

export type QuestionStateMapping = FixedStateMapping<QuestionStateId>;

export function questionStateMapping(properties: Record<string, string>): QuestionStateMapping {
  return fixedStateMapping(QUESTION_STATUSES, QUESTION_STATE_MAPPING_KEY, properties);
}

/** States that ended a question before the mapping existed, still honoured while they are unmapped. */
const LEGACY_TERMINAL_STATES = new Set(["closed", "resolved", "removed"]);

/** Whether a question still needs an answer: mapped Answered/Removed (or a legacy end state) do not. */
export function isOpenQuestion(question: TrackedWorkItem, mapping: QuestionStateMapping): boolean {
  const mapped = mappedFixedState(question, mapping);
  if (mapped !== null) return mapped.id === "open" || mapped.id === "inProgress";
  return !LEGACY_TERMINAL_STATES.has(question.state.trim().toLowerCase());
}

export const widestQuestionStateLabelLength = widestFixedStateLabelLength<QuestionStateId>;
