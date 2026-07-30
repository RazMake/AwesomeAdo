/**
 * The Project Tracking view's header tile.
 *
 * This control is intentionally NOT generic: it encodes the exact three-band layout that only the
 * Project Tracking board wants, so it lives beside the view rather than under
 * `common/view-common/control`. It composes generic controls it is handed (the Tech Lead picker and
 * the sprint picker) plus the shared ETA badge; it never reaches for ADO data itself.
 *
 * Layout (a single subtle-filled tile so it reads as a card):
 *
 *   Folder / Folder / …                                     Saving N changes…  ⇅
 *   Title                         + −    ⟳                          Sprint Picker
 *   TechLead  ETA
 *
 * The `+`/`−` expansion buttons are vertically centred against the two-line title/tech-lead block;
 * the view opens parents before notes and closes row details before parents. The sprint picker sits
 * on that same band but pinned to the right edge. The
 * refresh button shares that band and that styling but is separated by a wider gap, because it is a
 * different KIND of action: `+`/`−` only rearrange what is already on screen, while refresh throws
 * the board's data away and re-reads it from Azure DevOps. The
 * ordering indicator is deliberately parked in the top-right corner, away from those controls: it is
 * a quiet "this is how the items are sorted" readout that only occasionally gets clicked, and the
 * write-queue status shares that corner with it.
 */

import {
  renderBreadcrumbs,
  type BreadcrumbSegment,
} from "../../../../common/view-common/control/Breadcrumbs/Breadcrumbs";

/** Everything the header tile needs to render, injected so the control never fetches ADO data. */
export interface ProjectTrackingHeaderOptions {
  /**
   * The query's parent-folder trail, ordered outermost → nearest folder. Each segment is a link;
   * an empty array hides the breadcrumb row entirely.
   */
  breadcrumbs: BreadcrumbSegment[];
  /**
   * The board's item-ordering indicator/picker, pinned to the tile's top-right corner. Built by the
   * view so the ordering policy stays owned by whoever renders the items.
   */
  orderingPicker: HTMLElement;
  /** The project (root item) title. */
  title: string;
  /** Hex color for the title (the root type's color), or null to keep the themed default. */
  titleColor: string | null;
  /**
   * Called when the title is right-clicked, so the view can offer the root item the same menu its
   * rows offer. The header stays menu-agnostic: it reports the gesture, the view decides what opens.
   * Omitted leaves the browser's own menu alone.
   */
  onTitleContextMenu?: (event: MouseEvent) => void;
  /**
   * The Tech Lead control (the root's "TechLead:" label + Assigned To picker), built by the view so
   * this control stays free of the user directory. Null when view services are unavailable.
   */
  techLead: HTMLElement | null;
  /**
   * The root item's ETA badge, pre-built by the view so ETA read/write wiring lives in one place;
   * the header only lays it out. Null when view services are unavailable.
   */
  eta: HTMLElement | null;
  /** The sprint picker control element, pinned to the right of the controls band. */
  sprintPicker: HTMLElement;
  /** The compact area-path filter, grouped with the sprint picker on the right. */
  areaPathFilter: HTMLElement;
  /**
   * The write-queue status indicator, mounted in the tile's top-right corner beside the ordering
   * indicator so it reports in-flight saves without disturbing the title band. Null/omitted simply
   * leaves the corner to the ordering indicator.
   */
  writeQueueStatus?: HTMLElement | null;
}

/**
 * The refresh button plus the two states the view drives it through.
 *
 * A re-read is neither instant nor guaranteed, so the glyph alone would leave the reader unable to
 * tell "still fetching" from "nothing happened" from "it failed and you are looking at stale data".
 * The states are exposed as commands rather than inferred by the control, because only the view
 * knows when the fetch settled.
 */
export interface RefreshButtonHandle {
  /** The button to lay out and wire. */
  element: HTMLButtonElement;
  /** Show the re-read as in progress (also blocks a second click) or return to idle. */
  setBusy(busy: boolean): void;
  /**
   * Mark the last re-read as failed, so the button reports that the board is showing stale data and
   * invites the reader to the recorded cause; clearing it returns the button to plain "Refresh".
   */
  setFailed(failed: boolean): void;
}

/** The mounted header plus the board-wide controls the view still needs to wire to the tree. */
export interface ProjectTrackingHeaderHandle {
  /** The header tile to mount at the top of the board. */
  element: HTMLElement;
  /**
   * Re-labels the project title in place.
   *
   * The root item is summarized here rather than rendered as a row, so a repaint of the TREE cannot
   * reach it — without this, renaming the root would leave the board's own heading showing the name
   * nobody uses any more.
   */
  setTitle(title: string): void;
  /** The expand ("+") button; the view wires its staged parent-then-notes behavior. */
  expandAllButton: HTMLButtonElement;
  /** The collapse ("−") button; the view wires its staged details-then-parents behavior. */
  collapseAllButton: HTMLButtonElement;
  /** The refresh ("⟳") button; the view wires it to re-read the board's data from Azure DevOps. */
  refreshButton: RefreshButtonHandle;
}

/**
 * The height the top band always occupies, in pixels.
 *
 * Sized to the tallest thing that band can hold: the write-queue status chip in its failed state
 * (12px text + 3px padding + 1px border, top and bottom, plus slack). Reserving it unconditionally
 * is what stops the sticky header from growing and shrinking every time a save starts, finishes or
 * fails — which reads as the whole board flickering up and down while the user is looking at it.
 */
const TOP_ROW_MIN_HEIGHT_PX = 24;

/**
 * The gap that separates the refresh button from the `+`/`−` pair, in pixels.
 *
 * Deliberately much wider than the 8px that groups `+` and `−` together: those two only rearrange
 * what is already on screen, while refresh discards the board's data and re-reads it. Sitting them
 * flush would read as one three-button group and invite the mis-click.
 */
const REFRESH_BUTTON_GAP_PX = 24;

/**
 * The outer box every band button occupies, in pixels (border included).
 *
 * Pinned to a square rather than left to shrink-wrap each glyph: the three buttons carry glyphs of
 * very different widths, and letting the text decide the box would leave them visibly mismatched.
 * The value is the height the band already had (14px text + 5.6px padding + 1px border a side), so
 * fixing the size does not move the band.
 */
const BAND_BUTTON_SIZE_PX = 27.2;

/** The band button's border width, in pixels; subtracted when sizing a glyph to its inner box. */
const BAND_BUTTON_BORDER_PX = 1;

/** Builds one themed band button carrying the class the board's wiring queries by. */
function renderBandButton(
  doc: Document,
  className: string,
  glyph: string,
  label?: string,
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = glyph;
  if (label !== undefined) {
    button.title = label;
    button.setAttribute("aria-label", label);
  }
  // Subtle themed affordance: neutral fill + a clearly visible rounded border so it reads as a button
  // on any theme.
  // Flex centring (rather than padding) is what keeps a glyph optically centred in the fixed square
  // whatever size it is drawn at, so each button can size its own glyph independently.
  button.style.cssText = [
    "cursor:pointer",
    "box-sizing:border-box",
    `width:${BAND_BUTTON_SIZE_PX}px`,
    `height:${BAND_BUTTON_SIZE_PX}px`,
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    `border:${BAND_BUTTON_BORDER_PX}px solid var(--control-border-strong)`,
    "border-radius:6px",
    "padding:0",
    "background:var(--palette-neutral-4)",
    "color:var(--text-primary-color)",
    "font-size:14px",
    "font-weight:bold",
    "line-height:1",
  ].join(";");
  return button;
}

/** What the refresh button says in each of its three states, so the tooltip is the only explanation. */
const REFRESH_IDLE_LABEL = "Refresh — re-read this board from Azure DevOps";
const REFRESH_BUSY_LABEL = "Refreshing…";
const REFRESH_FAILED_LABEL =
  "Couldn't refresh — this board is showing older data. Click for details.";

/** The theme's success ink keeps the refresh icon distinct from the adjacent neutral controls. */
const REFRESH_IDLE_COLOR = "var(--success-foreground)";

/**
 * The gap left between the refresh icon and the button's border, in pixels.
 *
 * Just enough that the icon never appears to touch (or bleed through) the rounded border, while
 * still letting it fill the button — a thin circular arrow reads as far weaker than a bold `+`
 * unless it is drawn much bigger.
 */
const REFRESH_GLYPH_INSET_PX = 2;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * Builds the refresh icon as drawn geometry rather than as the ⟳ character.
 *
 * A text glyph is positioned by the font's baseline and side bearings, not by its ink, so it lands
 * visibly off-centre inside a square button — and there is no font-independent way to correct that,
 * because the offset differs per platform font. An SVG viewBox is centred by construction at any
 * size. The paths are stroked/filled in `currentColor` so the button's state colouring (idle green,
 * failed red) still reaches the icon without this function knowing about those states.
 */
function renderRefreshIcon(doc: Document, sizePx: number): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", `${sizePx}`);
  svg.setAttribute("height", `${sizePx}`);
  // The button already carries the accessible name, so the icon must not add a second one.
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.display = "block";

  // A circle of r=8 about the viewBox centre, drawn clockwise and left open across a wide 100° arc on
  // the right so the two ends read as clearly separate rather than as a closed ring. The radius is
  // held back from the box edge to leave room for the arrowhead, whose base spans radially.
  const arc = doc.createElementNS(SVG_NAMESPACE, "path");
  arc.setAttribute("d", "M18.93 16A8 8 0 1 1 14.74 4.48");
  arc.setAttribute("fill", "none");
  arc.setAttribute("stroke", "currentColor");
  arc.setAttribute("stroke-width", "3.5");
  arc.setAttribute("stroke-linecap", "round");

  // The arrowhead, based on the arc's end point and pointing along its direction of travel. Wider
  // than the stroke so it still reads as a head now that the stroke itself is heavy.
  const head = doc.createElementNS(SVG_NAMESPACE, "path");
  head.setAttribute("d", "M13.37 8.24 16.11 0.72 19.81 6.33Z");
  head.setAttribute("fill", "currentColor");

  svg.append(arc, head);
  return svg;
}

/**
 * Builds the refresh button and the two state commands the view drives it through.
 *
 * The failed state re-tints the button rather than adding a second element beside it: the header
 * band is a fixed-height row (see `TOP_ROW_MIN_HEIGHT_PX`), and growing a chip into it on failure
 * would shove the whole board down at the exact moment the reader is trying to work out what
 * changed.
 */
function renderRefreshButton(doc: Document): RefreshButtonHandle {
  const element = renderBandButton(doc, "awesomeado-tracking__refresh", "", REFRESH_IDLE_LABEL);
  // Drawn as large as the shared square allows — the inner box less the border and a 1px breathing
  // gap — so the icon fills the button the `+`/`−` pair sizes; the button itself keeps the band's size.
  element.append(
    renderRefreshIcon(
      doc,
      BAND_BUTTON_SIZE_PX - 2 * (BAND_BUTTON_BORDER_PX + REFRESH_GLYPH_INSET_PX),
    ),
  );
  element.style.marginLeft = `${REFRESH_BUTTON_GAP_PX}px`;

  let busy = false;
  let failed = false;

  const paint = (): void => {
    element.disabled = busy;
    element.style.opacity = busy ? "0.5" : "1";
    element.style.cursor = busy ? "default" : "pointer";
    // A failure is reported in the theme's error color rather than by swapping the icon, so the
    // button still reads as the same control the reader just pressed.
    element.style.color = failed ? "var(--palette-error-text)" : REFRESH_IDLE_COLOR;
    element.style.borderColor = failed
      ? "var(--palette-error-text)"
      : "var(--control-border-strong)";
    const label = busy ? REFRESH_BUSY_LABEL : failed ? REFRESH_FAILED_LABEL : REFRESH_IDLE_LABEL;
    element.title = label;
    element.setAttribute("aria-label", label);
    element.setAttribute("aria-busy", busy ? "true" : "false");
  };
  paint();

  return {
    element,
    setBusy: (next) => {
      busy = next;
      paint();
    },
    setFailed: (next) => {
      failed = next;
      paint();
    },
  };
}

/** Builds the stacked title (top) and TechLead + ETA (bottom) block that anchors the tile. */
function renderInfoColumn(
  doc: Document,
  options: ProjectTrackingHeaderOptions,
): { element: HTMLElement; title: HTMLElement } {
  const info = doc.createElement("div");
  info.className = "awesomeado-tracking__header-info";
  info.style.cssText = ["display:flex", "flex-direction:column", "gap:4px"].join(";");

  const titleEl = doc.createElement("div");
  titleEl.className = "awesomeado-tracking__title";
  titleEl.textContent = options.title;
  titleEl.style.cssText = "font-size:17px;font-weight:bold";
  if (options.titleColor) {
    titleEl.style.color = options.titleColor;
  }
  const onTitleContextMenu = options.onTitleContextMenu;
  if (onTitleContextMenu) {
    titleEl.addEventListener("contextmenu", (event) => onTitleContextMenu(event));
  }
  info.append(titleEl);

  const techLeadRow = doc.createElement("div");
  techLeadRow.className = "awesomeado-tracking__techlead-row";
  techLeadRow.style.cssText = ["display:flex", "align-items:center", "gap:16px"].join(";");
  if (options.techLead) {
    techLeadRow.append(options.techLead);
  }
  if (options.eta) {
    techLeadRow.append(options.eta);
  }
  info.append(techLeadRow);

  return { element: info, title: titleEl };
}

/**
 * Renders the Project Tracking header tile. The view mounts `element` and wires the returned
 * expand/collapse buttons to the tree's twisties.
 */
export function renderProjectTrackingHeader(
  doc: Document,
  options: ProjectTrackingHeaderOptions,
): ProjectTrackingHeaderHandle {
  const header = doc.createElement("div");
  header.className = "awesomeado-tracking__header";
  // Read as a raised "card" on any theme. The callout surface plus a border and elevation shadow
  // keeps the tile visible even where its fill approaches the page background.
  // Pinned to the top of the scroll container (position:sticky + top:0) so the project title,
  // sprint picker, and expand/collapse controls stay reachable while the board's items scroll under
  // it. The card's fill is an OPAQUE surface (--callout-background-color), which is required for a
  // sticky header: a translucent fill would let scrolled rows show through. The z-index keeps the
  // card above the rows it overlaps.
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

  // The top band carries the folder trail on the left and, pinned to the right corner, the ordering
  // indicator with the write-queue status beside it. It is rendered even with no breadcrumbs,
  // because the indicator belongs in that corner whether or not the query sits in a folder.
  //
  // Its height is PINNED to the tallest thing it can hold (the write-queue chip). The status shows
  // and hides itself as saves come and go, and without a reserved row that would grow and shrink the
  // sticky header on every edit — shoving the whole board down and back while the user is reading it.
  const topRow = doc.createElement("div");
  topRow.className = "awesomeado-tracking__header-top";
  topRow.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:16px",
    `min-height:${TOP_ROW_MIN_HEIGHT_PX}px`,
  ].join(";");

  const breadcrumbs = renderBreadcrumbs(doc, {
    segments: options.breadcrumbs,
    ariaLabel: "Query folder",
  });
  if (breadcrumbs) {
    topRow.append(breadcrumbs);
  }

  // Grouped and pushed right together, so the ordering glyph keeps the same corner position whether
  // or not a save is in flight — the status grows leftward into the gap instead of displacing it.
  const corner = doc.createElement("div");
  corner.className = "awesomeado-tracking__header-corner";
  corner.style.cssText = ["display:flex", "align-items:center", "gap:8px", "margin-left:auto"].join(
    ";",
  );
  if (options.writeQueueStatus) {
    corner.append(options.writeQueueStatus);
  }
  corner.append(options.orderingPicker);
  topRow.append(corner);
  header.append(topRow);

  // The controls band shares one row with the info column and is vertically centred against it, so
  // the +/− buttons line up with the middle of the two-line title/tech-lead block.
  const mainRow = doc.createElement("div");
  mainRow.className = "awesomeado-tracking__header-main";
  mainRow.style.cssText = ["display:flex", "align-items:center", "gap:32px"].join(";");

  const info = renderInfoColumn(doc, options);
  mainRow.append(info.element);

  const expandAllButton = renderBandButton(doc, "awesomeado-tracking__expand-all", "\uFF0B");
  const collapseAllButton = renderBandButton(doc, "awesomeado-tracking__collapse-all", "\uFF0D");
  const refreshButton = renderRefreshButton(doc);
  const bandButtons = doc.createElement("div");
  bandButtons.style.cssText = ["display:flex", "align-items:center", "gap:8px"].join(";");
  // Refresh rides in the same container so it shares the band's vertical centring, but carries its
  // own wider left margin (not the container's 8px gap) to sit apart from the `+`/`−` pair.
  bandButtons.append(expandAllButton, collapseAllButton, refreshButton.element);
  mainRow.append(bandButtons);

  // Keep the two narrowing controls together at the right edge. The area selector stays compact
  // while the sprint picker grows with its current label, so the group remains easy to scan.
  const filters = doc.createElement("div");
  filters.className = "awesomeado-tracking__header-filters";
  filters.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "margin-left:auto",
  ].join(";");
  filters.append(options.areaPathFilter, options.sprintPicker);
  mainRow.append(filters);

  header.append(mainRow);

  return {
    element: header,
    setTitle: (title) => {
      info.title.textContent = title;
    },
    expandAllButton,
    collapseAllButton,
    refreshButton,
  };
}
