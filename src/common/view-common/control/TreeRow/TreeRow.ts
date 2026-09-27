import type { TypeCatalogEntry } from "../../../ado/TrackedWorkItem";
import { workItemTypeDisplayColor, workItemTypeTextColor } from "../../../ado/workItemTypes";
import { renderItemTypeIcon } from "../ItemTypeIcon/ItemTypeIcon";
import type { RowEmphasisClasses } from "../RowEmphasis/RowEmphasis";

/** What a tree row shows about its work item. */
export interface TreeRowItem {
  id: number;
  type: string;
  title: string;
}

/** How a row's twisty behaves; `null` for a leaf, which gets a same-width spacer instead. */
export interface TreeTwistyOptions {
  expanded: boolean;
  /** Called on press; the owner records the new state and repaints, so it survives a rebuild. */
  onToggle(): void;
}

const COLLAPSED_GLYPH = "\u25B8";
const EXPANDED_GLYPH = "\u25BE";

/**
 * The stripe/hover/emphasis classes a prefixed tree hands to `RowEmphasis`, so the shared
 * treatment paints exactly the elements these helpers build.
 */
export function treeRowEmphasisClasses(prefix: string): RowEmphasisClasses {
  return {
    wrapper: `${prefix}__item`,
    surface: `${prefix}__row`,
    children: `${prefix}__children`,
  };
}

/** The twisty that opens a row, or a same-width spacer so leaf titles still line up. */
export function renderTreeTwisty(
  doc: Document,
  prefix: string,
  item: TreeRowItem,
  options: TreeTwistyOptions | null,
): HTMLElement {
  if (options === null) {
    const spacer = doc.createElement("span");
    spacer.className = `${prefix}__twisty-spacer`;
    spacer.style.cssText = "display:inline-block;width:16px;flex:0 0 auto";
    return spacer;
  }

  const twisty = doc.createElement("button");
  twisty.type = "button";
  twisty.className = `${prefix}__twisty`;
  twisty.textContent = options.expanded ? EXPANDED_GLYPH : COLLAPSED_GLYPH;
  twisty.setAttribute("aria-expanded", String(options.expanded));
  twisty.title = options.expanded ? "Collapse" : "Expand";
  twisty.setAttribute("aria-label", `${twisty.title} ${item.title}`);
  twisty.style.cssText = [
    "width:16px",
    "flex:0 0 auto",
    "border:none",
    "background:transparent",
    "color:var(--text-secondary-color)",
    "font:inherit",
    "line-height:1",
    "padding:0",
    "cursor:pointer",
  ].join(";");
  twisty.addEventListener("click", () => options.onToggle());
  return twisty;
}

/** The type icon Azure DevOps shows for an item, neutral when the catalog does not know the type. */
export function renderTreeTypeIcon(
  doc: Document,
  item: TreeRowItem,
  entry: TypeCatalogEntry | undefined,
): HTMLElement {
  return renderItemTypeIcon(doc, {
    iconUrl: entry?.icon ?? null,
    color: workItemTypeDisplayColor(entry?.color),
    typeName: item.type,
  }).element;
}

/**
 * The item's title, colored by its work item type.
 *
 * Deliberately inert text rather than a deep link: these boards are read by scrolling and dragging
 * across a dense tree, where a click that navigates away is far more often a slip than an intent.
 * The row's right-click menu offers **Open in ADO** for the times it is meant.
 */
export function renderTreeTitle(
  doc: Document,
  prefix: string,
  item: TreeRowItem,
  entry: TypeCatalogEntry | undefined,
): HTMLElement {
  const title = doc.createElement("span");
  title.className = `${prefix}__title`;
  title.textContent = item.title;
  title.title = `${item.type} ${item.id}: ${item.title}`;
  title.style.cssText = [
    `color:${workItemTypeTextColor(entry?.color)}`,
    "font-weight:600",
    "text-decoration:none",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
  ].join(";");
  return title;
}

/**
 * The single line a row draws on.
 *
 * A `topLevelClass` marks the board's outermost items, which read slightly larger than the levels
 * nested beneath them.
 */
export function renderTreeRowLine(
  doc: Document,
  prefix: string,
  topLevelClass: string | null,
): HTMLElement {
  const line = doc.createElement("div");
  line.className = topLevelClass === null ? `${prefix}__row` : `${prefix}__row ${topLevelClass}`;
  line.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "padding:3px 4px",
    "border-radius:4px",
    topLevelClass === null ? "font-size:13px" : "font-size:14px",
  ].join(";");
  return line;
}

/** The element one item occupies: its line, then (while open) its children beneath. */
export function renderTreeItemWrapper(
  doc: Document,
  prefix: string,
  item: TreeRowItem,
  line: HTMLElement,
): HTMLElement {
  const wrapper = doc.createElement("div");
  wrapper.className = `${prefix}__item`;
  wrapper.dataset.itemId = String(item.id);
  wrapper.append(line);
  return wrapper;
}

/** The indented branch an open row's children sit in, with a guide line down its left edge. */
export function renderTreeChildren(doc: Document, prefix: string): HTMLElement {
  const children = doc.createElement("div");
  children.className = `${prefix}__children`;
  children.style.cssText =
    "margin-left:8px;padding-left:8px;border-left:1px solid var(--control-border)";
  return children;
}
