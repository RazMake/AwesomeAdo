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
 * The `+`/`−` expand-all / collapse-all buttons are vertically centred against the two-line
 * title/tech-lead block; the sprint picker sits on that same band but pinned to the right edge. The
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
  /** The expand-all ("+") button; the view wires it to open every twisty. */
  expandAllButton: HTMLButtonElement;
  /** The collapse-all ("−") button; the view wires it to close every twisty. */
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
  // on any theme (ADO's --palette-neutral-20 is too faint under the pinned themes, so use a fixed grey).
  // The box is trimmed via padding alone (32px -> 27.2px, 15% smaller) so the glyph stays legible at
  // the same 14px as the rest of the band.
  button.style.cssText = [
    "cursor:pointer",
    "border:1px solid rgba(128,128,128,0.5)",
    "border-radius:6px",
    "padding:5.6px 5.6px",
    "background:var(--palette-neutral-4, rgba(128,128,128,0.08))",
    "color:var(--text-primary-color, #323130)",
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

/**
 * Builds the refresh button and the two state commands the view drives it through.
 *
 * The failed state re-tints the button rather than adding a second element beside it: the header
 * band is a fixed-height row (see `TOP_ROW_MIN_HEIGHT_PX`), and growing a chip into it on failure
 * would shove the whole board down at the exact moment the reader is trying to work out what
 * changed.
 */
function renderRefreshButton(doc: Document): RefreshButtonHandle {
  const element = renderBandButton(
    doc,
    "awesomeado-tracking__refresh",
    "\u27F3",
    REFRESH_IDLE_LABEL,
  );
  // Bold reads as heavy on this glyph (it is a stroke, not a letterform) and the wider box keeps it
  // optically the same size as the `+`/`−` pair beside it.
  element.style.fontWeight = "normal";
  element.style.fontSize = "15px";
  element.style.marginLeft = `${REFRESH_BUTTON_GAP_PX}px`;

  let busy = false;
  let failed = false;

  const paint = (): void => {
    element.disabled = busy;
    element.style.opacity = busy ? "0.5" : "1";
    element.style.cursor = busy ? "default" : "pointer";
    // A failure is reported in the theme's error color rather than by swapping the glyph, so the
    // button still reads as the same control the reader just pressed.
    element.style.color = failed
      ? "var(--palette-error-text, #a4262c)"
      : "var(--text-primary-color, #323130)";
    element.style.borderColor = failed
      ? "var(--palette-error-text, #a4262c)"
      : "rgba(128,128,128,0.5)";
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
function renderInfoColumn(doc: Document, options: ProjectTrackingHeaderOptions): HTMLElement {
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

  return info;
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
  // Read as a raised "card" on any theme. In "Follow ADO" nothing is pinned, so ADO's own
  // --palette-neutral-4 (an OPAQUE near-surface color) would match the page and erase the tile;
  // painting the raised callout surface (which ADO keeps distinct from the page) plus a border and
  // elevation shadow keeps the card visible even when its fill matches the background. The border is
  // a fixed grey (not --palette-neutral-20): in "Follow ADO" that token resolves to ADO's own value,
  // which is too faint on the callout surface and made the card's outline vanish — the same reason
  // the +/- band buttons already pin a fixed grey. The pinned themes read identically to before.
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
    "background:var(--callout-background-color, var(--palette-neutral-4, rgba(128,128,128,0.08)))",
    "border:1px solid rgba(128,128,128,0.35)",
    "border-radius:6px",
    "box-shadow:0 1px 3px var(--palette-neutral-20, rgba(0,0,0,0.12))",
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

  mainRow.append(renderInfoColumn(doc, options));

  const expandAllButton = renderBandButton(doc, "awesomeado-tracking__expand-all", "\uFF0B");
  const collapseAllButton = renderBandButton(doc, "awesomeado-tracking__collapse-all", "\uFF0D");
  const refreshButton = renderRefreshButton(doc);
  const bandButtons = doc.createElement("div");
  bandButtons.style.cssText = ["display:flex", "align-items:center", "gap:8px"].join(";");
  // Refresh rides in the same container so it shares the band's vertical centring, but carries its
  // own wider left margin (not the container's 8px gap) to sit apart from the `+`/`−` pair.
  bandButtons.append(expandAllButton, collapseAllButton, refreshButton.element);
  mainRow.append(bandButtons);

  // Pin the sprint picker to the right edge of the same band, aligned with the +/− buttons.
  options.sprintPicker.style.marginLeft = "auto";
  mainRow.append(options.sprintPicker);

  header.append(mainRow);

  return { element: header, expandAllButton, collapseAllButton, refreshButton };
}
