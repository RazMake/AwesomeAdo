import type { RefreshButtonHandle } from "../../../common/view-common/control/HeaderButtons/HeaderButtons";

export interface SprintHeaderOptions {
  sprintPicker: HTMLElement;
  laneFilter: HTMLElement;
  projectFilter: HTMLElement;
  refresh: RefreshButtonHandle;
  queueStatus: HTMLElement;
  teamPills: readonly HTMLElement[];
}

/** Render Sprint View's fixed-title, two-band themed header card. */
export function renderSprintHeader(doc: Document, options: SprintHeaderOptions): HTMLElement {
  const header = doc.createElement("header");
  header.className = "awesomeado-sprint__header";
  header.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "gap:10px",
    "padding:10px 16px",
    "margin-bottom:12px",
    "background:var(--callout-background-color)",
    "border:1px solid var(--control-border)",
    "border-radius:6px",
    "box-shadow:0 1px 3px var(--palette-neutral-20)",
    "position:sticky",
    "top:0",
    "z-index:2",
  ].join(";");

  const controls = doc.createElement("div");
  controls.className = "awesomeado-sprint__header-controls";
  controls.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "min-height:28px",
    "flex-wrap:wrap",
  ].join(";");

  const title = doc.createElement("h1");
  title.className = "awesomeado-view__title awesomeado-sprint__title";
  title.textContent = "Sprint View";
  title.style.cssText = "margin:0 8px 0 0;font-size:17px;font-weight:700";
  controls.append(
    title,
    options.sprintPicker,
    options.laneFilter,
    options.projectFilter,
    options.refresh.element,
  );

  const statusSlot = doc.createElement("span");
  statusSlot.className = "awesomeado-sprint__queue-status";
  statusSlot.style.cssText =
    "display:inline-flex;align-items:center;margin-left:auto;min-height:24px";
  statusSlot.append(options.queueStatus);
  controls.append(statusSlot);

  const divider = doc.createElement("hr");
  divider.style.cssText = "width:100%;margin:0;border:0;border-top:1px solid var(--control-border)";

  const team = doc.createElement("div");
  team.className = "awesomeado-sprint__team";
  team.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:28px";
  const label = doc.createElement("span");
  label.textContent = "Team:";
  label.style.cssText = "font-size:11px;font-weight:600;color:var(--text-secondary-color)";
  team.append(label, ...options.teamPills);
  if (options.teamPills.length === 0) {
    const empty = doc.createElement("span");
    empty.textContent = "No capacity members";
    empty.style.cssText = "font-size:12px;color:var(--text-secondary-color)";
    team.append(empty);
  }

  header.append(controls, divider, team);
  return header;
}
