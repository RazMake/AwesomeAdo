import {
  renderAreaPathFilter,
  type AreaPathFilterHandle,
} from "../../../common/view-common/control/AreaPathFilter/AreaPathFilter";

/** A board's header area-path filter, bound to the selection the board keeps across repaints. */
export interface RetainedAreaPathFilterOptions {
  /** The full paths the board can offer right now. */
  areaPaths: readonly string[];
  /** The board's retained selection, updated in place as the reader picks. */
  selection: Set<string>;
  /** Called after `selection` changed, with the full paths now selected. */
  onChange(selected: readonly string[]): void;
}

/**
 * The header area-path filter every tree board shares, so they all look and behave the same.
 *
 * A retained path the board no longer offers is dropped first: a refresh can return a tree without
 * it, and keeping it would hide every row behind a filter showing nothing selected — with no way
 * to unpick it. The filter is a reading position rather than configuration, so the lit-up trigger
 * is the way out of it: one press clears it, like every other header filter.
 */
export function renderRetainedAreaPathFilter(
  doc: Document,
  options: RetainedAreaPathFilterOptions,
): AreaPathFilterHandle {
  const { areaPaths, selection } = options;
  for (const selected of [...selection]) {
    if (!areaPaths.includes(selected)) selection.delete(selected);
  }
  return renderAreaPathFilter(doc, {
    areaPaths,
    selectedAreaPaths: [...selection],
    clearOnTriggerWhenActive: true,
    onChange: (selected) => {
      selection.clear();
      for (const path of selected) selection.add(path);
      options.onChange(selected);
    },
  });
}
