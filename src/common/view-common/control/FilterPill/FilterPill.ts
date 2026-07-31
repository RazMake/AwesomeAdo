/** The two queue metrics displayed at the end of a person filter pill. */
export interface FilterPillCounts {
  total: number;
  active: number;
}

/** One count displayed at the end of a filter pill. */
export interface FilterPillCount {
  value: number;
  kind: string;
  label: string;
  background: string;
  color: string;
}

/** One semantic family displayed in a shared filter row. */
export interface FilterPillFamily {
  name: string;
  pills: readonly HTMLElement[];
}

/** Build filter pills at the same compact scale as Project Tracking's Feature Crew tags. */
export function filterPillStyle(options: {
  background: string;
  color: string;
  selected: boolean;
}): string {
  return [
    "display:inline-flex",
    "align-items:center",
    "vertical-align:middle",
    "gap:3px",
    "border-radius:9px",
    "padding:1px 8px",
    "font-size:9px",
    "font-weight:600",
    "line-height:1.6",
    "white-space:nowrap",
    "cursor:pointer",
    `color:${options.color}`,
    `background:${options.background}`,
    options.selected
      ? "border:2px solid var(--tag-selected-border)"
      : "border:2px solid transparent",
    "opacity:1",
  ].join(";");
}

/** Group pills by meaning while preserving wrapping within each family. */
export function renderFilterPillFamilies(
  doc: Document,
  families: readonly FilterPillFamily[],
): HTMLElement {
  const container = doc.createElement("div");
  container.className = "awesomeado-filter-pill-families";
  container.style.cssText = [
    "display:flex",
    "flex-wrap:wrap",
    "align-items:center",
    "gap:16px",
  ].join(";");
  for (const { name, pills } of families) {
    if (pills.length === 0) continue;
    const family = doc.createElement("div");
    family.className = "awesomeado-filter-pill-family";
    family.dataset.filterPillFamily = name;
    family.style.cssText = ["display:flex", "flex-wrap:wrap", "align-items:center", "gap:6px"].join(
      ";",
    );
    family.append(...pills);
    container.append(family);
  }
  return container;
}

/** Append the total and active circular counters used by person pills. */
export function appendFilterPillCounts(
  doc: Document,
  pill: HTMLElement,
  counts: FilterPillCounts,
): void {
  pill.append(
    renderFilterPillCount(doc, {
      value: counts.total,
      kind: "queue",
      label: "Queue",
      background: "var(--palette-neutral-20)",
      color: "var(--text-primary-color)",
    }),
    renderFilterPillCount(doc, {
      value: counts.active,
      kind: "active",
      label: "Active",
      background: "var(--communication-background)",
      color: "var(--text-on-communication-background)",
    }),
  );
}

/** Build one fixed-size metric circle without allowing larger values to resize its pill. */
export function renderFilterPillCount(doc: Document, options: FilterPillCount): HTMLElement {
  const count = doc.createElement("span");
  count.className = `awesomeado-filter-pill__count awesomeado-filter-pill__count--${options.kind}`;
  count.dataset.count = options.kind;
  count.textContent = String(Math.max(0, Math.floor(options.value)));
  count.setAttribute("aria-label", `${options.label}: ${count.textContent}`);
  count.style.cssText = [
    "box-sizing:border-box",
    "min-width:14px",
    "height:14px",
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "border-radius:7px",
    "padding:0 3px",
    `background:${options.background}`,
    `color:${options.color}`,
    "font-size:8px",
    "font-weight:700",
    "line-height:1",
  ].join(";");
  return count;
}
