import { renderTagPill } from "../../../../common/view-common/control/TagPill/TagPill";

/** Options for rendering the tag filter panel. */
export interface TagFilterPanelOptions {
  /**
   * The tags to offer, in display order (`null` = the neutral "??" bucket for assigned-but-untagged
   * people). Typically the distinct tags actually worn across the tree.
   */
  tags: (string | null)[];
  /** The currently active filter selection; the panel reflects it and reports changes back through it. */
  selected: Set<string | null>;
  /**
   * Called after a pill toggles, with the same (now-mutated) `selected` set. The caller re-filters
   * the tree and re-renders the panel so the pills reflect the new selection.
   */
  onChange: (selected: Set<string | null>) => void;
}

/**
 * A panel of clickable tag pills that filters the tree to items assigned to people wearing any of the
 * selected tags (an OR across the selection; an empty selection means "show everything"). Clicking a
 * pill toggles it. The "??" pill selects items assigned to people with no tag yet.
 *
 * The panel is stateless about the selection — it renders the caller's `selected` set and mutates it
 * on toggle, so the caller owns the single source of truth and re-renders both the panel and the tree
 * from it.
 */
export function renderTagFilterPanel(doc: Document, options: TagFilterPanelOptions): HTMLElement {
  const { tags, selected, onChange } = options;

  const panel = doc.createElement("div");
  panel.className = "awesomeado-tag-filter";
  panel.style.cssText = [
    "display:flex",
    "flex-wrap:wrap",
    "align-items:center",
    "gap:6px",
    "margin:8px 0",
  ].join(";");

  const label = doc.createElement("span");
  label.className = "awesomeado-tag-filter__label";
  label.textContent = "Filter by tag:";
  label.style.cssText = [
    "font-size:11px",
    "font-weight:600",
    "color:var(--text-secondary-color, #8a8886)",
    "margin-right:2px",
  ].join(";");
  panel.append(label);

  for (const tag of tags) {
    const pill = renderTagPill(doc, {
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
    });
    panel.append(pill);
  }

  return panel;
}
