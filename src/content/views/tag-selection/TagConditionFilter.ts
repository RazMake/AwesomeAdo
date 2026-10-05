import { renderCheckboxFilter } from "../../../common/view-common/control/CheckboxFilter/CheckboxFilter";
import type { CheckboxFilterSelection } from "../../../common/view-common/control/CheckboxFilter/CheckboxFilter";

import type { TagCondition } from "./tagCondition";

/** What a header's tag filter offers and reports. */
export interface TagConditionFilterOptions {
  /** The tag vocabulary on offer, in display spelling. */
  tags: readonly string[];
  /** The condition currently narrowing the board, keyed in lower case. */
  condition: TagCondition;
  /** Called with the new condition on every tick, so the board can narrow immediately. */
  onChange(condition: TagCondition): void;
}

const TAG_FILTER_CLASS_PREFIX = "awesomeado-tag-filter";

/** The condition a filter selection expresses, keyed in lower case like every `TagCondition`. */
export function tagConditionOf(selection: CheckboxFilterSelection): TagCondition {
  return {
    required: new Set(selection.included.map((tag) => tag.toLowerCase())),
    excluded: new Set(selection.excluded.map((tag) => tag.toLowerCase())),
    matchAll: selection.matchAll,
  };
}

/**
 * The tag multi-select, given a quick-search because a team's tag vocabulary is unbounded, and the
 * combining controls because "these two but not that one" is the question a board is actually asked
 * — a plain OR cannot narrow a board where every item wears several tags.
 *
 * Every tick reports immediately: the reader builds the condition by watching what it leaves behind.
 * Boards therefore repaint their LIST rather than the header, which would close this open dropdown.
 *
 * Once a condition is active, the trigger clears it in one press instead of reopening the popup,
 * matching the other transient header filters.
 */
export function renderTagConditionFilter(
  doc: Document,
  options: TagConditionFilterOptions,
): HTMLElement {
  const { required, excluded, matchAll } = options.condition;
  return renderCheckboxFilter(doc, {
    label: "Tags",
    classPrefix: TAG_FILTER_CLASS_PREFIX,
    options: options.tags.map((tag) => ({ value: tag })),
    selected: options.tags.filter((tag) => required.has(tag.toLowerCase())),
    excluded: options.tags.filter((tag) => excluded.has(tag.toLowerCase())),
    matchAll,
    combining: true,
    searchPlaceholder: "Search tags",
    clearOnTriggerWhenActive: true,
    onChange: (selection) => options.onChange(tagConditionOf(selection)),
  }).element;
}
