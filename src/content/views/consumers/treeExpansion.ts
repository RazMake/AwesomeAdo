/** What the board keeps open, which the header's `+` and `−` step through. */
export interface ExpansionState {
  /** Rows the reader opened; every expandable row starts closed. */
  expandedIds: Set<number>;
  expandedDescriptionIds: Set<number>;
  expandedNoteIds: Set<number>;
}

export type { ExpandableLevels } from "../../../common/view-common/treeExpansion";

/** What one press opened or closed, for the diagnostics log; null when nothing was left to do. */
export type ExpansionStep = "descriptions" | "discussions" | `tree level ${number}` | null;

/**
 * One press of `−`: close the open descriptions, else the open discussions, else the deepest tree
 * level that still has an open row.
 *
 * Panels go first because they are what makes a board long, and a discussion can hold a note still
 * being written, so it is the last panel to go. The check looks only at `shownIds`, the items on
 * screen, so a press is never spent closing a panel the reader cannot see; once it acts, every panel
 * of that kind closes, so none pops back open when its row is next shown.
 */
export function collapseStep(
  state: ExpansionState,
  shownIds: readonly number[],
  levels: ExpandableLevels,
): ExpansionStep {
  if (shownIds.some((id) => state.expandedDescriptionIds.has(id))) {
    state.expandedDescriptionIds.clear();
    return "descriptions";
  }
  if (shownIds.some((id) => state.expandedNoteIds.has(id))) {
    state.expandedNoteIds.clear();
    return "discussions";
  }
  const depth = stepTreeExpansion(state.expandedIds, levels, false);
  return depth === null ? null : `tree level ${depth + 1}`;
}

/**
 * One press of `+`: open the shallowest tree level that still has a closed row. Panels are never
 * opened this way — a board full of expanded descriptions is not what "show me more of the tree"
 * asks for.
 */
export function expandStep(state: ExpansionState, levels: ExpandableLevels): ExpansionStep {
  const depth = stepTreeExpansion(state.expandedIds, levels, true);
  return depth === null ? null : `tree level ${depth + 1}`;
}

/**
 * One press of `+` on a flat list, which has no tree level to open: open the descriptions, else the
 * discussions, of the items on screen. This mirrors `collapseStep` in reverse, so `+` and `−`
 * walk the same two panel layers in opposite directions.
 */
export function expandPanelsStep(
  state: ExpansionState,
  shownIds: readonly number[],
): ExpansionStep {
  if (shownIds.some((id) => !state.expandedDescriptionIds.has(id))) {
    for (const id of shownIds) state.expandedDescriptionIds.add(id);
    return "descriptions";
  }
  if (shownIds.some((id) => !state.expandedNoteIds.has(id))) {
    for (const id of shownIds) state.expandedNoteIds.add(id);
    return "discussions";
  }
  return null;
}
import {
  stepTreeExpansion,
  type ExpandableLevels,
} from "../../../common/view-common/treeExpansion";
