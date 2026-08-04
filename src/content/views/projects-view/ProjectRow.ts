import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import { buildWorkItemUrl } from "../../../common/ado/fetchAdoTree";
import {
  orderTrackedItems,
  workItemTypeColor,
  workItemTypeTextColor,
} from "../../../common/ado/workItemTypes";
import type { OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import type { DragReorderController } from "../../../common/view-common/control/DragReorder/DragReorderController";
import { renderItemTypeIcon } from "../../../common/view-common/control/ItemTypeIcon/ItemTypeIcon";
import { renderTagPill } from "../../../common/view-common/control/TagPill/TagPill";
import { createSvgCanvas } from "../../../common/view-common/control/svgIcon/svgIcon";

/** Everything a row needs, grouped so a deeply nested row never reaches for view-level state. */
export interface ProjectRowContext {
  doc: Document;
  /** The ADO page's own URL, the only thing a work item deep link can be derived from. */
  href: string;
  types: ReadonlyMap<string, TypeCatalogEntry>;
  policy: OrderingPolicy;
  /** Ids the reader has opened; everything else stays closed, including on a repaint. */
  expandedIds: Set<number>;
  /** The ids the tag filter keeps, or `null` when no tag is selected and every item is kept. */
  keptIds: ReadonlySet<number> | null;
  /** Lower-cased tags that are the query's own condition, so no row wears them as a pill. */
  hiddenTags: ReadonlySet<string>;
  /**
   * Makes PROJECT titles draggable, or `null` when the board's order is derived rather than manual.
   *
   * Only the top level is registered: a project's own backlog position is what this catalog reports
   * on, while the work beneath it is ranked on the board that tracks it.
   */
  dragReorder: DragReorderController | null;
  /** Every project in display order, including ones the tag filter hides, for honest ranking. */
  projectSiblingIds: readonly number[];
  /** The project's own tracking query as an ADO web URL, or null while it has none. */
  queryUrlOf(item: TrackedWorkItem): string | null;
  /** Opens the item's right-click menu at the pointer. */
  onContextMenu(item: TrackedWorkItem, event: MouseEvent): void;
  /** Rebuild the list after an expand/collapse, so open/closed state lives outside the DOM. */
  repaint(): void;
}

const COLLAPSED_GLYPH = "\u25B8";
const EXPANDED_GLYPH = "\u25BE";

/** The children of `item` that survive the tag filter, in the board's ordering policy. */
export function visibleChildrenOf(
  item: TrackedWorkItem,
  context: ProjectRowContext,
): TrackedWorkItem[] {
  const kept = context.keptIds;
  const children =
    kept === null ? item.children : item.children.filter((child) => kept.has(child.id));
  return orderTrackedItems(children, (child) => child, context.policy);
}

/** The twisty that opens a row, or a same-width spacer so leaf titles still line up. */
function renderTwisty(
  item: TrackedWorkItem,
  context: ProjectRowContext,
  hasChildren: boolean,
  expanded: boolean,
): HTMLElement {
  const { doc } = context;
  if (!hasChildren) {
    const spacer = doc.createElement("span");
    spacer.className = "awesomeado-projects__twisty-spacer";
    spacer.style.cssText = "display:inline-block;width:16px;flex:0 0 auto";
    return spacer;
  }

  const twisty = doc.createElement("button");
  twisty.type = "button";
  twisty.className = "awesomeado-projects__twisty";
  twisty.textContent = expanded ? EXPANDED_GLYPH : COLLAPSED_GLYPH;
  twisty.setAttribute("aria-expanded", String(expanded));
  twisty.title = expanded ? "Collapse" : "Expand";
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
  twisty.addEventListener("click", () => {
    if (expanded) context.expandedIds.delete(item.id);
    else context.expandedIds.add(item.id);
    context.repaint();
  });
  return twisty;
}

/** The item's title as a deep link into Azure DevOps, colored by its work item type. */
function renderTitle(
  item: TrackedWorkItem,
  context: ProjectRowContext,
  color: string,
): HTMLElement {
  const { doc } = context;
  const url = buildWorkItemUrl(context.href, item.id);
  const title = doc.createElement(url === null ? "span" : "a");
  title.className = "awesomeado-projects__title";
  title.textContent = item.title;
  title.title = `${item.type} ${item.id}: ${item.title}`;
  title.style.cssText = [
    `color:${color}`,
    "font-weight:600",
    "text-decoration:none",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
  ].join(";");
  if (url !== null) {
    const link = title as HTMLAnchorElement;
    link.href = url;
    // The link is injected into ADO's own page, so the opened tab must not be able to reach back.
    link.target = "_blank";
    link.rel = "noopener noreferrer";
  }
  return title;
}

/** How much work sits beneath the item, shown beside its title. */
function renderChildCount(doc: Document, childCount: number): HTMLElement {
  const count = doc.createElement("span");
  count.className = "awesomeado-projects__child-count";
  count.textContent = String(childCount);
  count.title = `${childCount} child item(s)`;
  count.style.cssText = [
    "min-width:18px",
    "flex:0 0 auto",
    "text-align:center",
    "border-radius:9px",
    "padding:0 6px",
    "background:var(--palette-neutral-4)",
    "color:var(--text-secondary-color)",
    "font-size:11px",
    "line-height:16px",
  ].join(";");
  return count;
}

/** A chain glyph: the familiar mark for "this opens something else". */
function renderLinkGlyph(doc: Document): SVGSVGElement {
  const svg = createSvgCanvas(doc, "display:block");
  for (const d of [
    "M6.6 9.4a2.6 2.6 0 0 0 3.7 0l2.4-2.4a2.6 2.6 0 0 0-3.7-3.7l-1 1",
    "M9.4 6.6a2.6 2.6 0 0 0-3.7 0L3.3 9a2.6 2.6 0 0 0 3.7 3.7l1-1",
  ]) {
    const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.6");
    path.setAttribute("stroke-linecap", "round");
    svg.append(path);
  }
  return svg;
}

/**
 * Opens the project's own tracking query in a new tab.
 *
 * Rendered even when the project has no query yet, and disabled instead of hidden: the control keeps
 * its place on every row, so the column does not shuffle as projects gain queries, and the tooltip
 * says why it cannot be pressed rather than leaving a silent gap.
 */
function renderQueryLink(item: TrackedWorkItem, context: ProjectRowContext): HTMLElement {
  const { doc } = context;
  const url = context.queryUrlOf(item);
  const control = doc.createElement(url === null ? "span" : "a");
  control.className = "awesomeado-projects__query-link";
  control.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "flex:0 0 auto",
    "width:18px",
    "height:18px",
    "border-radius:4px",
    `color:${url === null ? "var(--text-secondary-color)" : "var(--communication-foreground)"}`,
    url === null ? "opacity:0.4" : "opacity:1",
    url === null ? "cursor:default" : "cursor:pointer",
    "text-decoration:none",
  ].join(";");
  control.title =
    url === null
      ? `${item.title} has no tracking query yet. Use Create Project Query to make one.`
      : `Open the tracking query for ${item.title} in a new tab`;
  control.setAttribute("aria-label", control.title);
  if (url === null) {
    control.setAttribute("aria-disabled", "true");
  } else {
    const link = control as HTMLAnchorElement;
    link.href = url;
    // The link is injected into ADO's own page, so the opened tab must not be able to reach back.
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    // The row's own right-click menu is about the work item, not this link.
    link.addEventListener("click", (event) => event.stopPropagation());
  }
  control.append(renderLinkGlyph(doc));
  return control;
}
function renderRowTags(item: TrackedWorkItem, context: ProjectRowContext): HTMLElement {
  const { doc } = context;
  const tags = doc.createElement("span");
  tags.className = "awesomeado-projects__tags";
  tags.style.cssText =
    "display:inline-flex;align-items:center;gap:6px;margin-left:auto;flex:0 0 auto";
  for (const tag of item.tags) {
    if (!context.hiddenTags.has(tag.trim().toLowerCase())) {
      tags.append(renderTagPill(doc, { tag }));
    }
  }
  return tags;
}

/** The single line a row draws on; nested levels read slightly smaller than the projects above them. */
function createRowLine(doc: Document, depth: number): HTMLElement {
  const line = doc.createElement("div");
  line.className = depth === 0 ? "awesomeado-projects__row is-project" : "awesomeado-projects__row";
  line.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "padding:3px 4px",
    "border-radius:4px",
    depth === 0 ? "font-size:14px" : "font-size:13px",
  ].join(";");
  return line;
}

/**
 * Make a project's title the handle that re-ranks it.
 *
 * Only the top level is registered: a project's own backlog position is what this catalog reports
 * on, while the work beneath it is ranked on the board that tracks it.
 */
function registerProjectDrag(
  item: TrackedWorkItem,
  context: ProjectRowContext,
  parts: { title: HTMLElement; line: HTMLElement; wrapper: HTMLElement },
): void {
  context.dragReorder?.register({
    id: item.id,
    depth: 0,
    hasChildren: item.children.length > 0,
    // Projects are the query's top-level results, so ADO's own sentinel for "no parent" is the only
    // honest answer: a drop here re-ranks the backlog, it never re-parents anything.
    parentId: 0,
    destinationType: null,
    siblingIds: context.projectSiblingIds,
    handle: parts.title,
    row: parts.line,
    wrapper: parts.wrapper,
  });
}

/**
 * The type icon Azure DevOps shows for an item, neutral when this build does not know the type.
 *
 * Kept beside the row so the row itself never has to reason about a type the catalog has not loaded.
 */
function renderTypeIcon(item: TrackedWorkItem, context: ProjectRowContext): HTMLElement {
  const entry = context.types.get(item.type);
  return renderItemTypeIcon(context.doc, {
    iconUrl: entry?.icon ?? null,
    color: workItemTypeColor(entry?.color),
    typeName: item.type,
  }).element;
}

/** The title colour for an item's type, readable against the row background. */
function typeTextColorOf(item: TrackedWorkItem, context: ProjectRowContext): string {
  return workItemTypeTextColor(context.types.get(item.type)?.color);
}

/**
 * One row and, when the reader has opened it, its children beneath.
 *
 * Child DOM is built only while a row is open: a query can return thousands of items, and materializing
 * every level up front spends that cost on branches nobody looked at.
 */
export function renderProjectRow(
  item: TrackedWorkItem,
  context: ProjectRowContext,
  depth: number,
): HTMLElement {
  const { doc } = context;
  const children = visibleChildrenOf(item, context);
  const expanded = context.expandedIds.has(item.id) && children.length > 0;

  const line = createRowLine(doc, depth);
  const title = renderTitle(item, context, typeTextColorOf(item, context));
  line.append(
    renderTwisty(item, context, children.length > 0, expanded),
    renderTypeIcon(item, context),
    title,
  );
  if (children.length > 0) {
    line.append(renderChildCount(doc, children.length));
  }
  if (depth === 0) {
    line.append(renderQueryLink(item, context));
  }
  line.append(renderRowTags(item, context));
  // Bound on the row rather than the list so the INNERMOST row under the pointer wins; the shared
  // menu stops the event itself, so an ancestor row never also opens.
  line.addEventListener("contextmenu", (event) => context.onContextMenu(item, event));

  const wrapper = doc.createElement("div");
  wrapper.className = "awesomeado-projects__item";
  wrapper.dataset.itemId = String(item.id);
  wrapper.append(line);

  if (depth === 0) {
    registerProjectDrag(item, context, { title, line, wrapper });
  }

  if (expanded) {
    const childrenBox = doc.createElement("div");
    childrenBox.className = "awesomeado-projects__children";
    childrenBox.style.cssText =
      "margin-left:8px;padding-left:8px;border-left:1px solid var(--control-border)";
    for (const child of children) {
      childrenBox.append(renderProjectRow(child, context, depth + 1));
    }
    wrapper.append(childrenBox);
  }
  return wrapper;
}
