import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import { renderCheckboxFilter } from "../../../common/view-common/control/CheckboxFilter/CheckboxFilter";

/** The header's Consumer filter, bound to the selection the board keeps across repaints. */
export interface ConsumerFilterOptions {
  /** The consumers the board can offer right now, in any order; listed by title. */
  consumers: readonly TrackedWorkItem[];
  /** The board's retained selection of consumer ids, updated in place as the reader picks. */
  selection: Set<number>;
  /** Called after `selection` changed. */
  onChange(): void;
}

/**
 * The Consumer multi-select: narrows the board to the consumers the reader is talking to.
 *
 * A retained consumer the board no longer offers is dropped first, for the same reason as the area
 * filter: a refresh can return a tree without it, and keeping it would hide every row behind a
 * filter showing nothing selected. Once active, one press on the trigger clears it.
 */
export function renderConsumerFilter(doc: Document, options: ConsumerFilterOptions): HTMLElement {
  const { selection } = options;
  const offered = new Set(options.consumers.map(({ id }) => id));
  for (const id of [...selection]) {
    if (!offered.has(id)) selection.delete(id);
  }
  const byTitle = [...options.consumers].sort((left, right) =>
    left.title.localeCompare(right.title, undefined, { sensitivity: "base" }),
  );
  return renderCheckboxFilter(doc, {
    label: "Consumer",
    classPrefix: "awesomeado-consumer-filter",
    options: byTitle.map((consumer) => ({ value: String(consumer.id), label: consumer.title })),
    selected: [...selection].map(String),
    searchPlaceholder: "Search consumers",
    clearOnTriggerWhenActive: true,
    onChange: (picked) => {
      selection.clear();
      for (const value of picked.included) selection.add(Number(value));
      options.onChange();
    },
  }).element;
}
