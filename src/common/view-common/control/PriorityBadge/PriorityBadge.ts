import { createPopupHost } from "../popupHost/popupHost";

const DEFAULT_PRIORITIES: readonly number[] = [0, 1, 2, 3, 4];

/** Options for rendering an editable work-item priority chip. */
export interface PriorityBadgeOptions {
  /** The current numeric priority, or null when Azure DevOps returned no value. */
  priority: number | null;
  /** The values offered by the popup. Defaults to P0 through P4. */
  priorities?: readonly number[];
  /** Called immediately when the user chooses another priority. */
  onChange?: (priority: number) => void;
}

/** The rendered chip plus the handle used to reflect a committed priority change. */
export interface PriorityBadgeHandle extends HTMLElement {
  /** Update the displayed priority and its color. */
  setPriority(priority: number): void;
}

/** The host declares color-scheme, so dark chips can be deeper without changing the light paint. */
const CHIP_BACKGROUND = "light-dark(rgba(200, 200, 200, 0.18), rgb(39, 39, 39))";
const CHIP_BORDER = "light-dark(rgba(172, 172, 172, 0.5), rgb(54, 54, 54))";

/** P0 is literal red, P1 literal orange, and later priorities use themed primary text. */
function textColorForPriority(priority: number | null): string {
  if (priority === 0) {
    return "light-dark(rgb(182, 1, 25), rgb(255, 32, 54))";
  }
  if (priority === 1) {
    return "light-dark(rgb(210, 146, 7), rgb(255, 167, 72))";
  }
  return "var(--text-primary-color, #323130)";
}

/** Apply the one visual definition shared by the row chip and every popup choice. */
function stylePriorityChip(chip: HTMLButtonElement, priority: number | null): void {
  chip.style.cssText = [
    "cursor:pointer",
    `background:${CHIP_BACKGROUND}`,
    `color:${textColorForPriority(priority)}`,
    `border:1px solid ${CHIP_BORDER}`,
    "border-radius:3px",
    "padding:2px 6px",
    "font-family:inherit",
    "font-size:11px",
    "font-weight:800",
    "line-height:1",
    "white-space:nowrap",
    "display:inline-flex",
    "align-items:center",
    "justify-content:space-between",
    "gap:3px",
  ].join(";");
}

/** Format one priority for display without exposing an absent value as a number. */
function priorityLabel(priority: number | null): string {
  return priority === null ? "P?" : `P${priority}`;
}

/** Build the themed list of alternative priorities. */
function buildPriorityPopup(
  doc: Document,
  priorities: readonly number[],
  currentPriority: number | null,
  onChange: PriorityBadgeOptions["onChange"],
  close: () => void,
): HTMLElement {
  const popup = doc.createElement("div");
  popup.className = "awesomeado-priority__popup";
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "background:var(--callout-background-color, var(--background-color, #fff))",
    "border:1px solid var(--palette-neutral-20, #ddd)",
    "border-radius:3px",
    "box-shadow:0 2px 8px rgba(0,0,0,0.15)",
    "padding:4px",
    "z-index:1000",
    "display:flex",
    "flex-direction:column",
    "align-items:flex-start",
    "gap:4px",
  ].join(";");

  priorities
    .filter((priority) => priority !== currentPriority)
    .forEach((priority) => {
      const option = doc.createElement("button");
      option.type = "button";
      option.className = "awesomeado-priority__option";
      option.textContent = priorityLabel(priority);
      stylePriorityChip(option, priority);
      option.addEventListener("click", () => {
        onChange?.(priority);
        close();
      });
      popup.append(option);
    });

  return popup;
}

/** Render an editable priority chip and its same-styled alternative-priority popup. */
export function renderPriorityBadge(
  doc: Document,
  options: PriorityBadgeOptions,
): PriorityBadgeHandle {
  const priorities = options.priorities ?? DEFAULT_PRIORITIES;
  let currentPriority = options.priority;

  const root = doc.createElement("span");
  root.className = "awesomeado-priority";
  root.style.cssText = "position:relative;display:inline-flex;align-items:center";

  const chip = doc.createElement("button");
  chip.type = "button";
  chip.className = "awesomeado-priority__badge";
  stylePriorityChip(chip, currentPriority);

  const label = doc.createTextNode(priorityLabel(currentPriority));
  const caret = doc.createElement("span");
  caret.textContent = "▾";
  caret.style.cssText = "font-size:9px;opacity:0.7";
  chip.append(label, caret);
  root.append(chip);

  createPopupHost({
    doc,
    trigger: chip,
    mountInto: root,
    buildPopup: (close) =>
      buildPriorityPopup(doc, priorities, currentPriority, options.onChange, close),
  });

  const handle = root as PriorityBadgeHandle;
  handle.setPriority = (priority) => {
    currentPriority = priority;
    label.textContent = priorityLabel(priority);
    stylePriorityChip(chip, priority);
  };
  return handle;
}
