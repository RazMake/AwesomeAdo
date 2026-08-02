import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import { identityFieldValue } from "../../../common/ado/adoApi";
import { shortestUniqueAreaPathLabels } from "../../../common/view-common/control/AreaPathFilter/AreaPathFilter";

import { sprintItemStateOrdinal, type SprintBulkMoveCandidate } from "./SprintBulkMove";

const DONE_COLUMN_ORDINAL = 3;
const NO_LANE_LABEL = "No lane";

export interface SprintBulkMovePlan {
  candidates: SprintBulkMoveCandidate[];
  unassignedExcluded: number;
}

export interface SprintBulkMoveDialogOptions {
  destinationLabel: string;
  plan: SprintBulkMovePlan;
  onConfirm(): void;
  onCancel(): void;
}

/** Snapshot only the assigned, visible Primary-work cards that are not Done or Removed. */
export function buildSprintBulkMovePlan(
  visibleItems: readonly TrackedWorkItem[],
  types: ReadonlyMap<string, TypeCatalogEntry>,
): SprintBulkMovePlan {
  const candidates: SprintBulkMoveCandidate[] = [];
  let unassignedExcluded = 0;
  for (const item of visibleItems) {
    const type = types.get(item.type);
    if (type?.isPrimaryWork !== true) continue;
    const ordinal = sprintItemStateOrdinal(item, type);
    if (ordinal < 0 || ordinal >= DONE_COLUMN_ORDINAL) continue;
    if (item.assignedTo === null) {
      unassignedExcluded += 1;
      continue;
    }
    candidates.push({
      id: item.id,
      areaPath: item.areaPath,
      assigneeValue: identityFieldValue(item.assignedTo),
      assigneeLabel: item.assignedTo.displayName,
    });
  }
  return { candidates, unassignedExcluded };
}

function countsBy(
  candidates: readonly SprintBulkMoveCandidate[],
  key: (candidate: SprintBulkMoveCandidate) => string,
): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const candidate of candidates) {
    const label = key(candidate);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function laneCounts(candidates: readonly SprintBulkMoveCandidate[]) {
  const labels = shortestUniqueAreaPathLabels(
    candidates.flatMap((candidate) => (candidate.areaPath === null ? [] : [candidate.areaPath])),
  );
  return countsBy(candidates, (candidate) =>
    candidate.areaPath === null
      ? NO_LANE_LABEL
      : (labels.get(candidate.areaPath) ?? candidate.areaPath),
  );
}

function summaryGroup(
  doc: Document,
  title: string,
  entries: readonly { label: string; count: number }[],
): HTMLElement {
  const group = doc.createElement("section");
  const heading = doc.createElement("h3");
  heading.textContent = title;
  heading.style.cssText = "margin:0 0 6px;font-size:12px;font-weight:700";
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
  group.append(heading, list);
  return group;
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

function dialogSummary(doc: Document, options: SprintBulkMoveDialogOptions): Node[] {
  const title = doc.createElement("h2");
  title.id = "awesomeado-sprint-bulk-title";
  title.textContent = `Move ${options.plan.candidates.length} visible item(s)?`;
  title.style.cssText = "margin:0 0 6px;font-size:16px;font-weight:700";
  const destination = doc.createElement("p");
  destination.textContent = `Destination: ${options.destinationLabel}`;
  destination.style.cssText = "margin:0 0 14px;color:var(--text-secondary-color);font-size:12px";
  const summaries = doc.createElement("div");
  summaries.style.cssText = "display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px";
  summaries.append(
    summaryGroup(doc, "By lane", laneCounts(options.plan.candidates)),
    summaryGroup(
      doc,
      "By assignee",
      countsBy(options.plan.candidates, (candidate) => candidate.assigneeLabel),
    ),
  );
  const excluded = doc.createElement("p");
  excluded.className = "awesomeado-sprint__bulk-dialog-excluded";
  excluded.textContent = `${options.plan.unassignedExcluded} visible unassigned item(s) excluded.`;
  excluded.style.cssText = "margin:14px 0 0;color:var(--text-secondary-color);font-size:11px";
  return [title, destination, summaries, excluded];
}

/** Build a modal confirmation summarizing the fixed visible-card snapshot before any write starts. */
export function renderSprintBulkMoveDialog(
  doc: Document,
  options: SprintBulkMoveDialogOptions,
): HTMLElement {
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
  const dialog = doc.createElement("div");
  dialog.className = "awesomeado-sprint__bulk-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "awesomeado-sprint-bulk-title");
  dialog.tabIndex = -1;
  dialog.style.cssText = [
    "width:min(520px,calc(100vw - 32px))",
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
  const actions = doc.createElement("div");
  actions.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:16px";
  const cancel = dialogButton(doc, "Cancel", false);
  const confirm = dialogButton(doc, `Move ${options.plan.candidates.length} item(s)`, true);
  confirm.className = "awesomeado-sprint__bulk-dialog-confirm";
  confirm.disabled = options.plan.candidates.length === 0;
  if (confirm.disabled) confirm.style.cursor = "default";
  const close = (confirmed: boolean): void => {
    overlay.remove();
    if (confirmed) options.onConfirm();
    else options.onCancel();
  };
  cancel.addEventListener("click", () => close(false));
  confirm.addEventListener("click", () => close(true));
  overlay.addEventListener("pointerdown", (event) => {
    if (event.target === overlay) close(false);
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") close(false);
  });
  actions.append(cancel, confirm);
  dialog.append(...dialogSummary(doc, options), actions);
  overlay.append(dialog);
  queueMicrotask(() => dialog.focus());
  return overlay;
}
