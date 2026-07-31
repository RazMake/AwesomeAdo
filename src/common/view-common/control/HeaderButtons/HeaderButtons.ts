/** The refresh button plus the states its owning view drives. */
export interface RefreshButtonHandle {
  element: HTMLButtonElement;
  setBusy(busy: boolean): void;
  setFailed(failed: boolean): void;
}

const BUTTON_SIZE_PX = 27.2;
const BUTTON_BORDER_PX = 1;
const REFRESH_GLYPH_INSET_PX = 2;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/** Build one fixed-square themed header action. */
export function renderHeaderButton(
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
  button.style.cssText = [
    "cursor:pointer",
    "box-sizing:border-box",
    `width:${BUTTON_SIZE_PX}px`,
    `height:${BUTTON_SIZE_PX}px`,
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    `border:${BUTTON_BORDER_PX}px solid var(--control-border-strong)`,
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

/** Draw the refresh glyph so its ink stays centered independently of platform fonts. */
function renderRefreshIcon(doc: Document): SVGSVGElement {
  const size = BUTTON_SIZE_PX - 2 * (BUTTON_BORDER_PX + REFRESH_GLYPH_INSET_PX);
  const svg = doc.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", `${size}`);
  svg.setAttribute("height", `${size}`);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.display = "block";

  const arc = doc.createElementNS(SVG_NAMESPACE, "path");
  arc.setAttribute("d", "M18.93 16A8 8 0 1 1 14.74 4.48");
  arc.setAttribute("fill", "none");
  arc.setAttribute("stroke", "currentColor");
  arc.setAttribute("stroke-width", "3.5");
  arc.setAttribute("stroke-linecap", "round");

  const head = doc.createElementNS(SVG_NAMESPACE, "path");
  head.setAttribute("d", "M13.37 8.24 16.11 0.72 19.81 6.33Z");
  head.setAttribute("fill", "currentColor");
  svg.append(arc, head);
  return svg;
}

const REFRESH_IDLE_LABEL = "Refresh — re-read this board from Azure DevOps";
const REFRESH_BUSY_LABEL = "Refreshing…";
const REFRESH_FAILED_LABEL =
  "Couldn't refresh — this board is showing older data. Click for details.";

/** Build the shared refresh action used by every enhanced-view header. */
export function renderRefreshButton(
  doc: Document,
  className: string,
  marginLeftPx = 0,
): RefreshButtonHandle {
  const element = renderHeaderButton(doc, className, "", REFRESH_IDLE_LABEL);
  element.append(renderRefreshIcon(doc));
  element.style.marginLeft = `${marginLeftPx}px`;

  let busy = false;
  let failed = false;
  const paint = (): void => {
    element.disabled = busy;
    element.style.opacity = busy ? "0.5" : "1";
    element.style.cursor = busy ? "default" : "pointer";
    element.style.color = failed ? "var(--palette-error-text)" : "var(--success-foreground)";
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
