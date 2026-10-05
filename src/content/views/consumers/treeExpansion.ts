/** What the board keeps open, which the header's `+` and `−` step through. */
export interface ExpansionState {
  /** Rows the reader opened; every expandable row starts closed. */
  expandedIds: Set<number>;
  expandedDescriptionIds: Set<number>;
  expandedNoteIds: Set<number>;
}

/** The expandable rows on screen, one list per tree level, top level first. */
export type ExpandableLevels = readonly (readonly number[])[];

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
  for (let depth = levels.length - 1; depth >= 0; depth -= 1) {
    const level = levels[depth] ?? [];
    if (level.some((id) => state.expandedIds.has(id))) {
      for (const id of level) state.expandedIds.delete(id);
      return `tree level ${depth + 1}`;
    }
  }
  return null;
}

/**
 * One press of `+`: open the shallowest tree level that still has a closed row. Panels are never
 * opened this way — a board full of expanded descriptions is not what "show me more of the tree"
 * asks for.
 */
export function expandStep(state: ExpansionState, levels: ExpandableLevels): ExpansionStep {
  for (const [depth, level] of levels.entries()) {
    if (level.some((id) => !state.expandedIds.has(id))) {
      for (const id of level) state.expandedIds.add(id);
      return `tree level ${depth + 1}`;
    }
  }
  return null;
}
