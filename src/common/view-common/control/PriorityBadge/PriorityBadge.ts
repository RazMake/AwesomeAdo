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
  /** Whether the popup can open. Defaults to true and may be changed through the returned handle. */
  editable?: boolean;
}

/** The rendered chip plus the handle used to reflect a committed priority change. */
export interface PriorityBadgeHandle extends HTMLElement {
  /** Update the displayed priority and its color. */
  setPriority(priority: number): void;
  /** Enable or disable priority selection without changing the displayed value. */
  setEditable(editable: boolean): void;
}

/** The host declares color-scheme, so dark chips can be deeper without changing the light paint. */
const CHIP_BACKGROUND = "var(--priority-background)";
const CHIP_BORDER = "var(--priority-border)";

/** P0/P1 keep alert colors, P2 uses primary text, and lower priorities recede. */
function textColorForPriority(priority: number | null): string {
  if (priority === 0) {
    return "var(--priority-critical-foreground)";
  }
  if (priority === 1) {
    return "var(--priority-high-foreground)";
  }
  if (priority === 2) {
    return "var(--priority-medium-foreground)";
  }
  return "var(--text-secondary-color)";
}

function fontWeightForPriority(priority: number | null): string {
  if (priority === 0 || priority === 1) {
    return "800";
  }
  return priority === 2 ? "600" : "400";
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
    `font-weight:${fontWeightForPriority(priority)}`,
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
    "background:var(--callout-background-color)",
    "border:1px solid var(--palette-neutral-20)",
    "border-radius:3px",
    "box-shadow:0 2px 8px var(--shadow-subtle)",
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
  let editable = options.editable ?? true;

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
  const applyEditability = (): void => {
    chip.disabled = !editable;
    chip.setAttribute("aria-disabled", String(!editable));
    chip.style.cursor = editable ? "pointer" : "default";
    caret.style.display = editable ? "inline" : "none";
  };
  handle.setPriority = (priority) => {
    currentPriority = priority;
    label.textContent = priorityLabel(priority);
    stylePriorityChip(chip, priority);
    applyEditability();
  };
  handle.setEditable = (next) => {
    editable = next;
    applyEditability();
  };
  applyEditability();
  return handle;
}
