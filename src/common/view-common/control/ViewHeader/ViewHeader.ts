import { renderBreadcrumbs, type BreadcrumbSegment } from "../Breadcrumbs/Breadcrumbs";
import {
  renderHeaderButton,
  renderRefreshButton,
  type RefreshButtonHandle,
} from "../HeaderButtons/HeaderButtons";
import { renderVersionLabel, VERSION_MARKER_GAP_PX } from "../VersionLabel/VersionLabel";

/** The band across the top of a view header: where the query lives, and how the board is doing. */
export interface ViewHeaderTopBandOptions {
  /** Prefixes the band's classes: `${classPrefix}__header-top` and `${classPrefix}__header-corner`. */
  classPrefix: string;
  /** The query's parent-folder trail, outermost first; an empty trail leaves the corner alone. */
  breadcrumbs: readonly BreadcrumbSegment[];
  /** The write-queue indicator, grown leftward from the corner so the sort glyph never moves. */
  writeQueueStatus?: HTMLElement | null;
  /** The built extension version, shown quietly beside the sort glyph. */
  extensionVersion?: string;
  /** The board's ordering indicator/picker, always the corner's last element. */
  orderingPicker: HTMLElement;
}

/** The title band of a tree board: its name, the outline buttons, then filters and Refresh. */
export interface ViewTitleBandOptions {
  /**
   * Prefixes the band's classes: `__header-title`, `__expand-all`, `__collapse-all`, `__filters`,
   * and `__refresh`.
   */
  classPrefix: string;
  title: string;
  /** Optional semantic foreground for headings that represent a typed Azure DevOps work item. */
  titleColor?: string | null;
  /** Opens the board-wide menu from the title, which is otherwise the only unclickable heading. */
  onTitleContextMenu(event: MouseEvent): void;
  expandLabel: string;
  collapseLabel: string;
  onExpandAll(): void;
  onCollapseAll(): void;
  /**
   * Controls that change how much of the board is laid out (a mode switch), placed right after the
   * `+` and `−` buttons because they answer the same "how much am I looking at?" question.
   */
  outlineControls?: readonly HTMLElement[];
  /** The narrowing controls, left to right, immediately before Refresh at the far right. */
  filters: readonly HTMLElement[];
  onRefresh(): void;
}

/** The mounted title band plus the refresh button whose state the board drives. */
export interface ViewTitleBandHandle {
  element: HTMLElement;
  refresh: RefreshButtonHandle;
}

/** A complete two-band board header: everything the top band and the title band take. */
export interface ViewHeaderOptions
  extends Omit<ViewHeaderTopBandOptions, "classPrefix">, ViewTitleBandOptions {}

/**
 * The height the top band always occupies, in pixels.
 *
 * Sized to the tallest thing that band can hold: the write-queue status chip in its failed state.
 * Reserving it unconditionally is what stops the sticky header from growing and shrinking every
 * time a save starts, finishes or fails — which reads as the whole board flickering.
 */
const TOP_BAND_MIN_HEIGHT_PX = 24;

/**
 * How far the outline buttons sit from the view's title.
 *
 * Four times the band's own gap, so "open/close everything" reads as its own group rather than as
 * punctuation on the end of the title.
 */
const OUTLINE_BUTTON_OFFSET_PX = 24;

/**
 * The sticky card a view header sits in, so its controls stay reachable while the board scrolls.
 *
 * An OPAQUE surface is required for a sticky header: a translucent fill would let the rows
 * scrolling underneath show through the controls sitting on top of them.
 */
export function renderViewHeaderCard(doc: Document, className: string): HTMLElement {
  const header = doc.createElement("div");
  header.className = className;
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

/**
 * The folder trail on the left and, pinned to the right corner, the write status, version marker,
 * and ordering glyph.
 *
 * Rendered even with no breadcrumbs, because the glyph belongs in that corner whether or not the
 * query sits in a folder. The corner is grouped and pushed right as one, so the glyph keeps its
 * position while the status comes and goes further left.
 */
export function renderViewHeaderTopBand(
  doc: Document,
  options: ViewHeaderTopBandOptions,
): HTMLElement {
  const band = doc.createElement("div");
  band.className = `${options.classPrefix}__header-top`;
  band.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:16px",
    "flex-wrap:wrap",
    `min-height:${TOP_BAND_MIN_HEIGHT_PX}px`,
  ].join(";");

  const breadcrumbs = renderBreadcrumbs(doc, {
    segments: [...options.breadcrumbs],
    ariaLabel: "Query folder",
  });
  if (breadcrumbs) band.append(breadcrumbs);

  const corner = doc.createElement("div");
  corner.className = `${options.classPrefix}__header-corner`;
  corner.style.cssText =
    "display:flex;align-items:center;gap:8px;flex:0 0 auto;margin-left:auto;white-space:nowrap";
  if (options.writeQueueStatus) corner.append(options.writeQueueStatus);
  if (options.extensionVersion) {
    const marker = renderVersionLabel(doc, options.extensionVersion);
    marker.style.marginRight = `${VERSION_MARKER_GAP_PX}px`;
    corner.append(marker);
  }
  corner.append(options.orderingPicker);
  band.append(corner);
  return band;
}

/**
 * The board's name with its outline buttons, then the narrowing filters and Refresh at the right
 * edge — Refresh last, because it acts on everything the filters to its left are scoping.
 *
 * Every piece keeps its natural width, so a narrow header wraps whole controls onto the next line
 * instead of squeezing their labels.
 */
export function renderViewTitleBand(
  doc: Document,
  options: ViewTitleBandOptions,
): ViewTitleBandHandle {
  const { classPrefix } = options;
  const band = doc.createElement("div");
  band.className = `${classPrefix}__header-title`;
  band.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap";

  const title = doc.createElement("h1");
  title.className = "awesomeado-view__title";
  title.textContent = options.title;
  // The context-menu cursor is the only thing that advertises the menu: nothing else about a
  // heading suggests it is right-clickable.
  title.style.cssText = "margin:0;font-size:20px;font-weight:600;cursor:context-menu";
  if (options.titleColor) title.style.color = options.titleColor;
  title.addEventListener("contextmenu", options.onTitleContextMenu);

  const expand = renderHeaderButton(doc, `${classPrefix}__expand-all`, "+", options.expandLabel);
  expand.style.marginLeft = `${OUTLINE_BUTTON_OFFSET_PX}px`;
  expand.addEventListener("click", options.onExpandAll);
  const collapse = renderHeaderButton(
    doc,
    `${classPrefix}__collapse-all`,
    "\u2212",
    options.collapseLabel,
  );
  collapse.addEventListener("click", options.onCollapseAll);

  const refresh = renderRefreshButton(doc, `${classPrefix}__refresh`);
  refresh.element.addEventListener("click", options.onRefresh);

  const filters = doc.createElement("div");
  filters.className = `${classPrefix}__filters`;
  filters.style.cssText =
    "display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-left:auto";
  for (const filter of options.filters) {
    filter.style.flex = "0 0 auto";
    filter.style.whiteSpace = "nowrap";
    filters.append(filter);
  }
  filters.append(refresh.element);

  band.append(title, expand, collapse);
  for (const control of options.outlineControls ?? []) {
    control.style.flex = "0 0 auto";
    control.style.whiteSpace = "nowrap";
    band.append(control);
  }
  band.append(filters);
  return { element: band, refresh };
}

/**
 * The whole header of a tree board with no bands of its own: the sticky card holding the top band
 * and then the title band. `element` is the card.
 */
export function renderViewHeader(doc: Document, options: ViewHeaderOptions): ViewTitleBandHandle {
  const header = renderViewHeaderCard(doc, `${options.classPrefix}__header`);
  const titleBand = renderViewTitleBand(doc, options);
  header.append(renderViewHeaderTopBand(doc, options), titleBand.element);
  return { element: header, refresh: titleBand.refresh };
}
