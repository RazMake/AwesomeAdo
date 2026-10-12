import type { ViewTypeOption } from "./ViewType";

/**
 * One work item type's row of a `state-mapping` view property: the Azure DevOps states routed to
 * each of the view's fixed status columns.
 */
export interface StateMappingRow {
  /** The Azure DevOps work item type this row maps. */
  type: string;
  /**
   * Column id → that type's ADO states in priority order. The first state is the one written back
   * when the column is chosen; a state sits in at most one column of a row.
   */
  states: Record<string, string[]>;
}

/**
 * Read a stored `state-mapping` value.
 *
 * The value is synced and imported, so it is never trusted: anything malformed reads as no mapping
 * rather than throwing, a repeated type keeps its first row, and a state repeated within a row keeps
 * its first column, so every reader sees the one-row-per-type, one-column-per-state shape the editor
 * guarantees.
 */
export function parseStateMapping(raw: string): StateMappingRow[] {
  let parsed: unknown;
  try {
    parsed = raw.trim() === "" ? [] : JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const rows: StateMappingRow[] = [];
  const seenTypes = new Set<string>();
  for (const candidate of parsed) {
    const row = readRow(candidate);
    if (row === null || seenTypes.has(row.type.toLowerCase())) continue;
    seenTypes.add(row.type.toLowerCase());
    rows.push(row);
  }
  return rows;
}

/** Store a mapping; empty cells, type-less rows, and rows mapping nothing carry nothing. */
export function serializeStateMapping(rows: readonly StateMappingRow[]): string {
  const kept = rows
    .filter((row) => row.type.trim() !== "")
    .map((row) => ({
      type: row.type,
      states: Object.fromEntries(
        Object.entries(row.states).filter(([, states]) => states.length > 0),
      ),
    }))
    .filter((row) => Object.keys(row.states).length > 0);
  return kept.length === 0 ? "" : JSON.stringify(kept);
}

/** The mapping as a reader scans it, for read-only display: `Type: Column = A, B; …`. */
export function describeStateMapping(raw: string, columns: readonly ViewTypeOption[]): string {
  const rows = parseStateMapping(raw);
  if (rows.length === 0) return "None";
  return rows
    .map((row) => {
      const cells = columns
        .filter((column) => (row.states[column.value] ?? []).length > 0)
        .map((column) => `${column.label} = ${(row.states[column.value] ?? []).join(", ")}`);
      return `${row.type}: ${cells.length === 0 ? "nothing mapped" : cells.join("; ")}`;
    })
    .join(" · ");
}

function readRow(candidate: unknown): StateMappingRow | null {
  if (typeof candidate !== "object" || candidate === null) return null;
  const { type, states } = candidate as { type?: unknown; states?: unknown };
  if (typeof type !== "string" || type.trim() === "") return null;
  if (typeof states !== "object" || states === null || Array.isArray(states)) return null;
  return { type: type.trim(), states: readCells(states as Record<string, unknown>) };
}

function readCells(states: Record<string, unknown>): Record<string, string[]> {
  const placed = new Set<string>();
  const cells: Record<string, string[]> = {};
  for (const [column, values] of Object.entries(states)) {
    if (!Array.isArray(values)) continue;
    const kept = readCellStates(values, placed);
    if (kept.length > 0) cells[column] = kept;
  }
  return cells;
}

/** `placed` is shared across the row's cells so a state lands in the first column naming it. */
function readCellStates(values: readonly unknown[], placed: Set<string>): string[] {
  const kept: string[] = [];
  for (const value of values) {
    const state = typeof value === "string" ? value.trim() : "";
    if (state === "" || placed.has(state.toLowerCase())) continue;
    placed.add(state.toLowerCase());
    kept.push(state);
  }
  return kept;
}
