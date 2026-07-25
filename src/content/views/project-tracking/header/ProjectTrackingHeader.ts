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
 *   Folder / Folder / …                                             (clickable breadcrumbs)
 *                                                    Saving N changes… (write-queue status, right)
 *   Title                         + −                               Sprint Picker
 *   TechLead  ETA
 *
 * The `+`/`−` expand-all / collapse-all buttons are vertically centred against the two-line
 * title/tech-lead block; the sprint picker sits on that same band but pinned to the right edge.
 */

import {
  renderBreadcrumbs,
  type BreadcrumbSegment,
} from "../../../../common/view-common/control/Breadcrumbs/Breadcrumbs";
import { renderEtaBadge } from "../../../../common/view-common/control/EtaBadge/EtaBadge";

/** Everything the header tile needs to render, injected so the control never fetches ADO data. */
export interface ProjectTrackingHeaderOptions {
  /**
   * The query's parent-folder trail, ordered outermost → nearest folder. Each segment is a link;
   * an empty array hides the breadcrumb row entirely.
   */
  breadcrumbs: BreadcrumbSegment[];
  /** The project (root item) title. */
  title: string;
  /** Hex color for the title (the root type's color), or null to keep the themed default. */
  titleColor: string | null;
  /**
   * The Tech Lead control (the root's "TechLead:" label + Assigned To picker), built by the view so
   * this control stays free of the user directory. Null when view services are unavailable.
   */
  techLead: HTMLElement | null;
  /** The root item's ETA (ISO 8601), or null when unset. */
  eta: string | null;
  /** Reference "now" for the ETA countdown, injected for deterministic rendering. */
  now: Date;
  /** The sprint picker control element, pinned to the right of the controls band. */
  sprintPicker: HTMLElement;
  /**
   * The write-queue status indicator, mounted on its own row directly above the sprint picker so it
   * reports in-flight saves without disturbing the title band. Null/omitted hides the row entirely.
   */
  writeQueueStatus?: HTMLElement | null;
}

/** The mounted header plus the two board-wide controls the view still needs to wire to the tree. */
export interface ProjectTrackingHeaderHandle {
  /** The header tile to mount at the top of the board. */
  element: HTMLElement;
  /** The expand-all ("+") button; the view wires it to open every twisty. */
  expandAllButton: HTMLButtonElement;
  /** The collapse-all ("−") button; the view wires it to close every twisty. */
  collapseAllButton: HTMLButtonElement;
}

/** Builds one themed expand/collapse button carrying the class the board's wiring queries by. */
function renderBandButton(doc: Document, className: string, glyph: string): HTMLButtonElement {
  const button = doc.createElement("button");
  button.className = className;
  button.type = "button";
  button.textContent = glyph;
  // Subtle themed affordance: neutral fill + a clearly visible rounded border so it reads as a button
  // on any theme (ADO's --palette-neutral-20 is too faint under the pinned themes, so use a fixed grey).
  button.style.cssText = [
    "cursor:pointer",
    "border:1px solid rgba(128,128,128,0.5)",
    "border-radius:6px",
    "padding:8px 8px",
    "background:var(--palette-neutral-4, rgba(128,128,128,0.08))",
    "color:var(--text-primary-color, #323130)",
    "font-size:14px",
    "font-weight:bold",
    "line-height:1",
  ].join(";");
  return button;
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
  const etaBadge = renderEtaBadge(doc, { eta: options.eta, now: options.now });
  techLeadRow.append(etaBadge);
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
  header.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "gap:8px",
    "padding:16px",
    "background:var(--callout-background-color, var(--palette-neutral-4, rgba(128,128,128,0.08)))",
    "border:1px solid rgba(128,128,128,0.35)",
    "border-radius:6px",
    "box-shadow:0 1px 3px var(--palette-neutral-20, rgba(0,0,0,0.12))",
    "margin-bottom:16px",
  ].join(";");

  const breadcrumbs = renderBreadcrumbs(doc, {
    segments: options.breadcrumbs,
    ariaLabel: "Query folder",
  });
  if (breadcrumbs) {
    header.append(breadcrumbs);
  }

  // A dedicated row directly above the controls band so the "Saving…" indicator appears over the
  // sprint picker without reflowing the title/tech-lead layout. Right-aligned to line up with the
  // sprint picker it reports on; the indicator hides itself while idle, so the row reserves no
  // visible space until a save is actually in flight.
  if (options.writeQueueStatus) {
    const writeStatusRow = doc.createElement("div");
    writeStatusRow.className = "awesomeado-tracking__write-status-row";
    writeStatusRow.style.cssText = ["display:flex", "justify-content:flex-end"].join(";");
    writeStatusRow.append(options.writeQueueStatus);
    header.append(writeStatusRow);
  }

  // The controls band shares one row with the info column and is vertically centred against it, so
  // the +/− buttons line up with the middle of the two-line title/tech-lead block.
  const mainRow = doc.createElement("div");
  mainRow.className = "awesomeado-tracking__header-main";
  mainRow.style.cssText = ["display:flex", "align-items:center", "gap:32px"].join(";");

  mainRow.append(renderInfoColumn(doc, options));

  const expandAllButton = renderBandButton(doc, "awesomeado-tracking__expand-all", "\uFF0B");
  const collapseAllButton = renderBandButton(doc, "awesomeado-tracking__collapse-all", "\uFF0D");
  const bandButtons = doc.createElement("div");
  bandButtons.style.cssText = ["display:flex", "align-items:center", "gap:8px"].join(";");
  bandButtons.append(expandAllButton, collapseAllButton);
  mainRow.append(bandButtons);

  // Pin the sprint picker to the right edge of the same band, aligned with the +/− buttons.
  options.sprintPicker.style.marginLeft = "auto";
  mainRow.append(options.sprintPicker);

  header.append(mainRow);

  return { element: header, expandAllButton, collapseAllButton };
}
