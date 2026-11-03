import { shortestUniqueAreaPathLabels } from "../../../common/view-common/control/AreaPathFilter/AreaPathFilter";

import type { SprintBulkMoveCandidate } from "./SprintBulkMove";
import {
  defaultSprintBulkMoveSelection,
  selectSprintBulkMoveCandidates,
  sprintBulkMoveAssignees,
  unassignedInSelection,
  type SprintBulkMoveColumn,
  type SprintBulkMovePlan,
  type SprintBulkMoveSelection,
} from "./SprintBulkMovePlan";

const NO_LANE_LABEL = "No lane";
const DONE_REFUSAL = "Done items are never moved.";
// The board's own column tones, so each choice reads as the column it names on the board.
const COLUMN_TONES = ["neutral", "blue", "yellow", "green"] as const;

export interface SprintBulkMoveDialogOptions {
  destinationLabel: string;
  plan: SprintBulkMovePlan;
  onConfirm(selection: SprintBulkMoveSelection): void;
  onCancel(): void;
}

interface DialogSelection {
  columns: Set<number>;
  assignees: Set<string>;
}

interface Choice<T> {
  key: T;
  name: Node;
  className: string;
  disabledReason: string | null;
}

interface ChoiceList<T> {
  element: HTMLElement;
  setCounts(counts: ReadonlyMap<T, number>): void;
  setAllChecked(checked: boolean): void;
}

function countsBy<T>(
  candidates: readonly SprintBulkMoveCandidate[],
  key: (candidate: SprintBulkMoveCandidate) => T,
): Map<T, number> {
  const counts = new Map<T, number>();
  for (const candidate of candidates) {
    const value = key(candidate);
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function laneCounts(candidates: readonly SprintBulkMoveCandidate[]) {
  const labels = shortestUniqueAreaPathLabels(
    candidates.flatMap((candidate) => (candidate.areaPath === null ? [] : [candidate.areaPath])),
  );
  const counts = countsBy(candidates, (candidate) =>
    candidate.areaPath === null
      ? NO_LANE_LABEL
      : (labels.get(candidate.areaPath) ?? candidate.areaPath),
  );
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function groupHeader(doc: Document, title: string, ...actions: Node[]): HTMLElement {
  const header = doc.createElement("div");
  header.style.cssText = "display:flex;align-items:baseline;gap:10px;margin:0 0 6px";
  const heading = doc.createElement("h3");
  heading.textContent = title;
  heading.style.cssText = "margin:0;font-size:12px;font-weight:700";
  header.append(heading, ...actions);
  return header;
}

function emptyNote(doc: Document, text: string): HTMLElement {
  const note = doc.createElement("p");
  note.textContent = text;
  note.style.cssText = "margin:0;color:var(--text-secondary-color);font-size:11px";
  return note;
}

function countList(
  doc: Document,
  entries: readonly { label: string; count: number }[],
): HTMLElement {
  const list = doc.createElement("dl");
  list.style.cssText =
    "display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px 14px;margin:0";
  for (const entry of entries) {
    const label = doc.createElement("dt");
    label.textContent = entry.label;
    label.title = entry.label;
    label.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
    const count = doc.createElement("dd");
    count.textContent = String(entry.count);
    count.style.cssText = "margin:0;font-weight:700;text-align:right";
    list.append(label, count);
  }
  return list;
}

function laneSummary(doc: Document, candidates: readonly SprintBulkMoveCandidate[]): HTMLElement {
  const group = doc.createElement("section");
  group.className = "awesomeado-sprint__bulk-dialog-lanes";
  const entries = laneCounts(candidates);
  group.append(
    groupHeader(doc, "By lane"),
    entries.length === 0 ? emptyNote(doc, "No items selected.") : countList(doc, entries),
  );
  return group;
}

function choiceRow<T>(
  doc: Document,
  choice: Choice<T>,
  checked: boolean,
  onToggle: (checked: boolean) => void,
): { element: HTMLLabelElement; checkbox: HTMLInputElement; count: HTMLElement } {
  const row = doc.createElement("label");
  row.className = choice.className;
  row.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0;cursor:pointer";
  const checkbox = doc.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = checked;
  checkbox.style.cssText = "flex:0 0 auto;margin:0;accent-color:var(--communication-background)";
  const count = doc.createElement("span");
  count.className = "awesomeado-sprint__bulk-dialog-count";
  count.style.cssText = "margin-left:auto;padding-left:8px;font-weight:700";
  if (choice.disabledReason !== null) {
    checkbox.disabled = true;
    row.title = choice.disabledReason;
    row.style.cursor = "default";
    row.style.opacity = "0.6";
  }
  checkbox.addEventListener("change", () => onToggle(checkbox.checked));
  row.append(checkbox, choice.name, count);
  return { element: row, checkbox, count };
}

function toggle<T>(selected: Set<T>, key: T, checked: boolean): void {
  if (checked) selected.add(key);
  else selected.delete(key);
}

/** Rows are built once and only re-counted, so a click is never lost to a rebuilt checkbox. */
function choiceList<T>(
  doc: Document,
  choices: readonly Choice<T>[],
  selected: Set<T>,
  layout: string,
  onChange: () => void,
): ChoiceList<T> {
  const list = doc.createElement("div");
  list.style.cssText = layout;
  const rows = choices.map((choice) => {
    const row = choiceRow(doc, choice, selected.has(choice.key), (checked) => {
      toggle(selected, choice.key, checked);
      onChange();
    });
    list.append(row.element);
    return { key: choice.key, ...row };
  });
  return {
    element: list,
    setCounts: (counts) => {
      for (const row of rows) {
        row.count.textContent = row.checkbox.disabled ? "" : String(counts.get(row.key) ?? 0);
      }
    },
    setAllChecked: (checked) => {
      for (const row of rows.filter(({ checkbox }) => !checkbox.disabled)) {
        row.checkbox.checked = checked;
        toggle(selected, row.key, checked);
      }
      onChange();
    },
  };
}

function columnChip(doc: Document, column: SprintBulkMoveColumn): HTMLElement {
  const tone = COLUMN_TONES[column.ordinal] ?? "neutral";
  const chip = doc.createElement("span");
  chip.textContent = column.label;
  chip.style.cssText = [
    "padding:0 6px",
    `border:1px solid var(--status-${tone}-border)`,
    "border-radius:8px",
    `background:var(--status-${tone}-background)`,
    `color:var(--status-${tone}-foreground)`,
    "font-size:11px",
    "font-weight:600",
    "line-height:1.6",
    "white-space:nowrap",
  ].join(";");
  return chip;
}

function columnSection(
  doc: Document,
  plan: SprintBulkMovePlan,
  selection: DialogSelection,
  onChange: () => void,
): { element: HTMLElement; list: ChoiceList<number> } {
  const list = choiceList(
    doc,
    plan.columns.map((column) => ({
      key: column.ordinal,
      name: columnChip(doc, column),
      className: "awesomeado-sprint__bulk-dialog-column",
      disabledReason: column.movable ? null : DONE_REFUSAL,
    })),
    selection.columns,
    "display:flex;flex-wrap:wrap;gap:6px 16px",
    onChange,
  );
  const section = doc.createElement("section");
  section.className = "awesomeado-sprint__bulk-dialog-columns";
  section.append(groupHeader(doc, "From columns"), list.element);
  return { element: section, list };
}

function linkButton(doc: Document, label: string, onClick: () => void): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.cssText =
    "padding:0;border:0;background:transparent;color:var(--communication-foreground);font:inherit;font-size:11px;cursor:pointer";
  button.addEventListener("click", onClick);
  return button;
}

function assigneeName(doc: Document, label: string): HTMLElement {
  const name = doc.createElement("span");
  name.textContent = label;
  name.title = label;
  name.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  return name;
}

function assigneeSection(
  doc: Document,
  plan: SprintBulkMovePlan,
  selection: DialogSelection,
  onChange: () => void,
): { element: HTMLElement; list: ChoiceList<string> } {
  const choices = sprintBulkMoveAssignees(plan).map(({ value, label }) => ({
    key: value,
    name: assigneeName(doc, label),
    className: "awesomeado-sprint__bulk-dialog-assignee",
    disabledReason: null,
  }));
  const list = choiceList(doc, choices, selection.assignees, "display:grid;gap:4px", onChange);
  if (choices.length === 0) list.element.append(emptyNote(doc, "No assigned items."));
  const section = doc.createElement("section");
  section.className = "awesomeado-sprint__bulk-dialog-assignees";
  section.append(
    groupHeader(
      doc,
      "Assignees",
      linkButton(doc, "All", () => list.setAllChecked(true)),
      linkButton(doc, "None", () => list.setAllChecked(false)),
    ),
    list.element,
  );
  return { element: section, list };
}

/** The pickers, live counts, and lane summary; `onChosen` reports how many items would move. */
function renderDialogContent(
  doc: Document,
  options: SprintBulkMoveDialogOptions,
  selection: DialogSelection,
  onChosen: (count: number) => void,
): Node[] {
  const { plan } = options;
  const title = doc.createElement("h2");
  title.id = "awesomeado-sprint-bulk-title";
  title.style.cssText = "margin:0 0 6px;font-size:16px;font-weight:700";
  const destination = doc.createElement("p");
  destination.textContent = `Destination: ${options.destinationLabel}`;
  destination.style.cssText = "margin:0 0 14px;color:var(--text-secondary-color);font-size:12px";
  const columns = columnSection(doc, plan, selection, () => refresh());
  const assignees = assigneeSection(doc, plan, selection, () => refresh());
  const lanes = doc.createElement("div");
  const summaries = doc.createElement("div");
  summaries.style.cssText =
    "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:14px";
  summaries.append(assignees.element, lanes);
  const excluded = doc.createElement("p");
  excluded.className = "awesomeado-sprint__bulk-dialog-excluded";
  excluded.style.cssText = "margin:14px 0 0;color:var(--text-secondary-color);font-size:11px";
  // Each picker counts against the OTHER picker's choice, so a number always says how many items
  // ticking that box would move.
  function refresh(): void {
    const chosen = selectSprintBulkMoveCandidates(plan, selection);
    title.textContent = `Move ${chosen.length} visible item(s)?`;
    columns.list.setCounts(
      countsBy(
        plan.candidates.filter((candidate) => selection.assignees.has(candidate.assigneeValue)),
        (candidate) => candidate.column,
      ),
    );
    assignees.list.setCounts(
      countsBy(
        plan.candidates.filter((candidate) => selection.columns.has(candidate.column)),
        (candidate) => candidate.assigneeValue,
      ),
    );
    lanes.replaceChildren(laneSummary(doc, chosen));
    excluded.textContent = `${unassignedInSelection(plan, selection)} visible unassigned item(s) excluded.`;
    onChosen(chosen.length);
  }
  refresh();
  return [title, destination, columns.element, summaries, excluded];
}

function dialogButton(doc: Document, label: string, primary: boolean): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.cssText = [
    "padding:6px 12px",
    "border:1px solid var(--control-border-strong)",
    "border-radius:4px",
    primary
      ? "background:var(--communication-background)"
      : "background:var(--control-background-subtle)",
    primary ? "color:var(--text-on-communication-background)" : "color:var(--text-primary-color)",
    "font:inherit",
    "font-size:12px",
    "font-weight:600",
    "cursor:pointer",
  ].join(";");
  return button;
}

function paintConfirm(confirm: HTMLButtonElement, chosen: number): void {
  confirm.textContent = `Move ${chosen} item(s)`;
  confirm.disabled = chosen === 0;
  confirm.style.cursor = confirm.disabled ? "default" : "pointer";
  confirm.style.opacity = confirm.disabled ? "0.6" : "";
}

function dialogOverlay(doc: Document): HTMLElement {
  const overlay = doc.createElement("div");
  overlay.className = "awesomeado-sprint__bulk-dialog-overlay";
  overlay.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:2147483646",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:16px",
    "box-sizing:border-box",
    "background:color-mix(in srgb, var(--background-color) 54%, transparent)",
  ].join(";");
  return overlay;
}

function dialogPanel(doc: Document): HTMLElement {
  const dialog = doc.createElement("div");
  dialog.className = "awesomeado-sprint__bulk-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "awesomeado-sprint-bulk-title");
  dialog.tabIndex = -1;
  dialog.style.cssText = [
    "width:min(560px,calc(100vw - 32px))",
    "max-height:calc(100vh - 32px)",
    "overflow-y:auto",
    "padding:16px",
    "box-sizing:border-box",
    "background:var(--callout-background-color)",
    "border:1px solid var(--control-border-strong)",
    "border-radius:6px",
    "box-shadow:0 8px 24px var(--popup-shadow-strong)",
    "color:var(--text-primary-color)",
  ].join(";");
  return dialog;
}

/**
 * Build a modal that lets the reader narrow the fixed visible-card snapshot by board column and
 * assignee, summarizing what would move before any write starts.
 */
export function renderSprintBulkMoveDialog(
  doc: Document,
  options: SprintBulkMoveDialogOptions,
): HTMLElement {
  const overlay = dialogOverlay(doc);
  const dialog = dialogPanel(doc);
  const defaults = defaultSprintBulkMoveSelection(options.plan);
  const selection: DialogSelection = {
    columns: new Set(defaults.columns),
    assignees: new Set(defaults.assignees),
  };
  const actions = doc.createElement("div");
  actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:16px";
  const cancel = dialogButton(doc, "Cancel", false);
  const confirm = dialogButton(doc, "", true);
  confirm.className = "awesomeado-sprint__bulk-dialog-confirm";
  const close = (confirmed: boolean): void => {
    overlay.remove();
    if (!confirmed) options.onCancel();
    else {
      options.onConfirm({
        columns: new Set(selection.columns),
        assignees: new Set(selection.assignees),
      });
    }
  };
  cancel.addEventListener("click", () => close(false));
  confirm.addEventListener("click", () => close(true));
  overlay.addEventListener("pointerdown", (event) => {
    if (event.target === overlay) close(false);
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close(false);
  });
  const content = renderDialogContent(doc, options, selection, (chosen) =>
    paintConfirm(confirm, chosen),
  );
  actions.append(cancel, confirm);
  dialog.append(...content, actions);
  overlay.append(dialog);
  queueMicrotask(() => dialog.focus());
  return overlay;
}
