import type { OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import type { EnhancedViewContext } from "../../../common/view-common/EnhancedView";
import {
  renderBreadcrumbs,
  type BreadcrumbSegment,
} from "../../../common/view-common/control/Breadcrumbs/Breadcrumbs";
import { renderCheckboxFilter } from "../../../common/view-common/control/CheckboxFilter/CheckboxFilter";
import type { CheckboxFilterSelection } from "../../../common/view-common/control/CheckboxFilter/CheckboxFilter";
import {
  renderHeaderButton,
  renderRefreshButton,
  type RefreshButtonHandle,
} from "../../../common/view-common/control/HeaderButtons/HeaderButtons";
import { renderOrderingPicker } from "../../../common/view-common/control/OrderingPicker/OrderingPicker";
import {
  renderVersionLabel,
  VERSION_MARKER_GAP_PX,
} from "../../../common/view-common/control/VersionLabel/VersionLabel";

import type { TagCondition } from "./projectTags";
import { projectsViewType } from "./projectsViewType";

/** What the All Projects Catalog View header shows and what pressing each of its controls means. */
export interface ProjectsHeaderOptions {
  /** The query's parent-folder trail; an empty trail omits the row entirely. */
  breadcrumbs: BreadcrumbSegment[];
  /** Every tag worn anywhere in the loaded tree, offered by the tag filter. */
  tags: readonly string[];
  /** The tag condition currently narrowing the board, keyed in lower case. */
  tagCondition: TagCondition;
  /** The ordering the board is showing right now, which the sort glyph names. */
  policy: OrderingPolicy;
  /**
   * The shared "Saving…" / "Couldn't save" indicator.
   *
   * Handed in already mounted because its state outlives any one paint: the header is rebuilt
   * whenever the board repaints, and a fresh indicator would forget an in-flight or rejected write.
   */
  queueStatus: HTMLElement;
  onTagsChange(selection: CheckboxFilterSelection): void;
  onOrderingChange(policy: OrderingPolicy): void;
  onExpandAll(): void;
  onCollapseAll(): void;
  onRefresh(): void;
  /** Opens the catalog-wide menu (copy the query's URL, add a project) at the pointer. */
  onTitleContextMenu(event: MouseEvent): void;
}

/** The mounted header plus the refresh button whose state the board drives. */
export interface ProjectsHeaderHandle {
  element: HTMLElement;
  refresh: RefreshButtonHandle;
}

const TAG_FILTER_CLASS_PREFIX = "awesomeado-tag-filter";

/**
 * How far the outline buttons sit from the view's title.
 *
 * Four times the band's own gap, so "open/close everything" reads as its own group rather than as
 * punctuation on the end of the title.
 */
const OUTLINE_BUTTON_OFFSET_PX = 24;

/** The sticky card the header sits in, so its controls stay reachable while projects scroll. */
function createHeaderCard(doc: Document): HTMLElement {
  const header = doc.createElement("div");
  header.className = "awesomeado-projects__header";
  // An OPAQUE surface is required for a sticky header: a translucent fill would let the rows
  // scrolling underneath show through the controls sitting on top of them.
  header.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "gap:8px",
    "padding:8px 16px",
    "background:var(--callout-background-color)",
    "border:1px solid var(--control-border)",
    "border-radius:6px",
    "box-shadow:0 1px 3px var(--palette-neutral-20)",
    "margin-bottom:16px",
    "position:sticky",
    "top:0",
    "z-index:2",
  ].join(";");
  return header;
}

/** The trail band: the query's folders on the left, the version marker and sort glyph in the corner. */
function renderTopBand(
  doc: Document,
  options: ProjectsHeaderOptions,
  version?: string,
): HTMLElement {
  const band = doc.createElement("div");
  band.className = "awesomeado-projects__header-top";
  band.style.cssText = "display:flex;align-items:center;gap:16px;min-height:20px";

  const breadcrumbs = renderBreadcrumbs(doc, {
    segments: options.breadcrumbs,
    ariaLabel: "Query folder",
  });
  if (breadcrumbs) band.append(breadcrumbs);

  const corner = doc.createElement("div");
  corner.className = "awesomeado-projects__header-corner";
  corner.style.cssText = "display:flex;align-items:center;gap:8px;margin-left:auto";
  corner.append(options.queueStatus);
  if (version) {
    const marker = renderVersionLabel(doc, version);
    marker.style.marginRight = `${VERSION_MARKER_GAP_PX}px`;
    corner.append(marker);
  }
  corner.append(
    renderOrderingPicker(doc, { policy: options.policy, onChange: options.onOrderingChange }),
  );
  band.append(corner);
  return band;
}

/**
 * The tag multi-select, given a quick-search because a team's tag vocabulary is unbounded, and the
 * combining controls because "these two but not that one" is the question a catalog is actually
 * asked — a plain OR cannot narrow a board where every project wears several tags.
 *
 * Every tick narrows the board immediately: the reader is building the condition by watching what it
 * leaves behind, so waiting for the dropdown to close would make them state the whole thing blind.
 * That is only possible because the board repaints its LIST rather than the whole surface — a full
 * repaint would rebuild this header and take the open dropdown with it.
 *
 * Once a condition is active, the trigger clears it in one press instead of reopening the popup.
 * This matches the other transient header filters and leaves only one clear gesture.
 */
function renderTagFilter(doc: Document, options: ProjectsHeaderOptions): HTMLElement {
  const { required, excluded, matchAll } = options.tagCondition;
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
    onChange: options.onTagsChange,
  }).element;
}

/** The title band: the view's name and outline controls, then Tags + Refresh at the right edge. */
function renderTitleBand(
  doc: Document,
  options: ProjectsHeaderOptions,
): {
  band: HTMLElement;
  refresh: RefreshButtonHandle;
} {
  const band = doc.createElement("div");
  band.className = "awesomeado-projects__header-title";
  band.style.cssText = "display:flex;align-items:center;gap:8px";

  const title = doc.createElement("h1");
  title.className = "awesomeado-view__title";
  title.textContent = projectsViewType.label;
  // The context-menu cursor is the only thing that advertises the menu, exactly as on the Sprint
  // view's title: nothing else about a heading suggests it is right-clickable.
  title.style.cssText = "margin:0;font-size:20px;font-weight:600;cursor:context-menu";
  title.addEventListener("contextmenu", options.onTitleContextMenu);

  const expand = renderHeaderButton(
    doc,
    "awesomeado-projects__expand-all",
    "+",
    "Expand every project",
  );
  expand.style.marginLeft = `${OUTLINE_BUTTON_OFFSET_PX}px`;
  expand.addEventListener("click", options.onExpandAll);
  const collapse = renderHeaderButton(
    doc,
    "awesomeado-projects__collapse-all",
    "\u2212",
    "Collapse every project",
  );
  collapse.addEventListener("click", options.onCollapseAll);

  const refresh = renderRefreshButton(doc, "awesomeado-projects__refresh");
  refresh.element.addEventListener("click", options.onRefresh);

  const filters = doc.createElement("div");
  filters.className = "awesomeado-projects__filters";
  filters.style.cssText = "display:flex;align-items:center;gap:8px;margin-left:auto";
  filters.append(renderTagFilter(doc, options), refresh.element);

  band.append(title, expand, collapse, filters);
  return { band, refresh };
}

/** Build the All Projects Catalog View header; the board mounts `element` and drives `refresh`. */
export function renderProjectsHeader(
  context: EnhancedViewContext,
  options: ProjectsHeaderOptions,
): ProjectsHeaderHandle {
  const { doc } = context;
  const header = createHeaderCard(doc);
  const { band, refresh } = renderTitleBand(doc, options);
  header.append(renderTopBand(doc, options, context.extensionVersion), band);
  return { element: header, refresh };
}
