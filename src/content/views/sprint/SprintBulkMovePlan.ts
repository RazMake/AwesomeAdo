import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import { identityFieldValue } from "../../../common/ado/adoApi";

import {
  SPRINT_DONE_COLUMN,
  isSprintBulkMovableColumn,
  sprintItemStateOrdinal,
  type SprintBulkMoveCandidate,
} from "./SprintBulkMove";

/** A board column as the bulk-move dialog offers it. */
export interface SprintBulkMoveColumn {
  ordinal: number;
  label: string;
  /** False only for Done, which is shown so the reader sees it exists but can never be chosen. */
  movable: boolean;
}

export interface SprintBulkMoveAssignee {
  value: string;
  label: string;
}

export interface SprintBulkMovePlan {
  columns: SprintBulkMoveColumn[];
  /** Every assigned visible Primary-work card in a movable column, before the reader narrows it. */
  candidates: SprintBulkMoveCandidate[];
  /** The column of each visible unassigned card that would otherwise have been a candidate. */
  unassignedColumns: number[];
}

/** Which columns and assignees the reader kept ticked; a candidate must match both to move. */
export interface SprintBulkMoveSelection {
  columns: ReadonlySet<number>;
  assignees: ReadonlySet<string>;
}

function planColumns(boardColumns: readonly string[]): SprintBulkMoveColumn[] {
  return Array.from({ length: SPRINT_DONE_COLUMN + 1 }, (_, ordinal) => ({
    ordinal,
    label: boardColumns[ordinal] ?? "",
    movable: ordinal < SPRINT_DONE_COLUMN,
  }));
}

/** Snapshot the visible Primary-work cards in every column the reader could choose to move. */
export function buildSprintBulkMovePlan(
  visibleItems: readonly TrackedWorkItem[],
  types: ReadonlyMap<string, TypeCatalogEntry>,
  boardColumns: readonly string[],
): SprintBulkMovePlan {
  const columns = planColumns(boardColumns);
  const movable = new Set(columns.filter((column) => column.movable).map(({ ordinal }) => ordinal));
  const candidates: SprintBulkMoveCandidate[] = [];
  const unassignedColumns: number[] = [];
  for (const item of visibleItems) {
    const type = types.get(item.type);
    if (type?.isPrimaryWork !== true) continue;
    const column = sprintItemStateOrdinal(item, type);
    if (!isSprintBulkMovableColumn(column, movable)) continue;
    if (item.assignedTo === null) {
      unassignedColumns.push(column);
      continue;
    }
    candidates.push({
      id: item.id,
      column,
      areaPath: item.areaPath,
      assigneeValue: identityFieldValue(item.assignedTo),
      assigneeLabel: item.assignedTo.displayName,
    });
  }
  return { columns, candidates, unassignedColumns };
}

/** The distinct assignees among the plan's candidates, in display-name order. */
export function sprintBulkMoveAssignees(plan: SprintBulkMovePlan): SprintBulkMoveAssignee[] {
  const byValue = new Map<string, string>();
  for (const candidate of plan.candidates) {
    if (!byValue.has(candidate.assigneeValue)) {
      byValue.set(candidate.assigneeValue, candidate.assigneeLabel);
    }
  }
  return [...byValue]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

/** Every movable column and every assignee: the same set the command moved before it was narrowable. */
export function defaultSprintBulkMoveSelection(plan: SprintBulkMovePlan): SprintBulkMoveSelection {
  return {
    columns: new Set(plan.columns.filter((column) => column.movable).map(({ ordinal }) => ordinal)),
    assignees: new Set(plan.candidates.map((candidate) => candidate.assigneeValue)),
  };
}

export function selectSprintBulkMoveCandidates(
  plan: SprintBulkMovePlan,
  selection: SprintBulkMoveSelection,
): SprintBulkMoveCandidate[] {
  return plan.candidates.filter(
    (candidate) =>
      selection.columns.has(candidate.column) && selection.assignees.has(candidate.assigneeValue),
  );
}

/** Unassigned cards in the chosen columns: the ones the reader might expect to move but will not. */
export function unassignedInSelection(
  plan: SprintBulkMovePlan,
  selection: SprintBulkMoveSelection,
): number {
  return plan.unassignedColumns.filter((column) => selection.columns.has(column)).length;
}
