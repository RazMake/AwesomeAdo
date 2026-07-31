import { renderTagPill } from "../../../../common/view-common/control/TagPill/TagPill";

/** Options for rendering the tag filter pills. */
export interface TagFilterPanelOptions {
  /**
   * The tags to offer, in display order (`null` = the neutral "??" bucket for assigned-but-untagged
   * people). Typically the distinct tags actually worn across the tree.
   */
  tags: (string | null)[];
  /** The currently active filter selection; the pills reflect it and report changes back through it. */
  selected: Set<string | null>;
  /**
   * Called after a pill toggles, with the same (now-mutated) `selected` set. The caller re-filters
   * the tree and re-renders the pills so they reflect the new selection.
   */
  onChange: (selected: Set<string | null>) => void;
}

/**
 * Clickable tag pills that filter the tree to items assigned to people wearing any of the selected
 * tags (an OR across the selection; an empty selection means "show everything"). Clicking a pill
 * toggles it. The "??" pill selects items assigned to people with no tag yet.
 *
 * Returns the pills loose so the board can place them beside markers in its non-activity family.
 *
 * Stateless about the selection — it renders the caller's `selected` set and mutates it on toggle, so
 * the caller owns the single source of truth and re-renders both the pills and the tree from it.
 */
export function renderTagFilterPills(doc: Document, options: TagFilterPanelOptions): HTMLElement[] {
  const { tags, selected, onChange } = options;

  return tags.map((tag) =>
    renderTagPill(doc, {
      tag,
      interactive: true,
      selected: selected.has(tag),
      onToggle: () => {
        if (selected.has(tag)) {
          selected.delete(tag);
        } else {
          selected.add(tag);
        }
        onChange(selected);
      },
    }),
  );
}
