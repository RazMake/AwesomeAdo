import { createPopupHost } from "../popupHost/popupHost";
import { createSvgCanvas } from "../svgIcon/svgIcon";

/** Options for the compact area-path multi-select control. */
export interface AreaPathFilterOptions {
  /** Visible noun used by the trigger and popup. Defaults to `Area`. */
  label?: string;
  /** Full Azure DevOps area paths offered by the control. */
  areaPaths: readonly string[];
  /** Full paths selected initially. Paths absent from `areaPaths` are ignored. */
  selectedAreaPaths?: readonly string[];
  /** Called after a checkbox or Clear changes the selected full paths. */
  onChange?(selectedAreaPaths: string[]): void;
  /** Called after an open popup closes by trigger, outside pointer, Escape, or Clear. */
  onPopupClosed?(): void;
}

/** The mounted control plus its full-path selection API. */
export interface AreaPathFilterHandle {
  element: HTMLElement;
  selectedAreaPaths(): string[];
  setSelectedAreaPaths(areaPaths: readonly string[]): void;
}

const PATH_SEPARATOR = "\\";
const LABEL_SEPARATOR = " \u203A ";

/** Trim, drop blanks, and deduplicate while preserving the caller's order. */
function uniqueAreaPaths(areaPaths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of areaPaths) {
    const path = raw.trim();
    if (path.length > 0 && !seen.has(path)) {
      seen.add(path);
      result.push(path);
    }
  }
  return result;
}

/** The non-empty path parts used only for display; the full input path remains the selected value. */
function pathParts(path: string): string[] {
  const parts = path
    .split(PATH_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : [path];
}

/** Render the right-most `depth` parts of a path. */
function suffixLabel(parts: readonly string[], depth: number): string {
  return parts.slice(Math.max(parts.length - depth, 0)).join(LABEL_SEPARATOR);
}

/**
 * Find the shortest distinct display label for each full path.
 *
 * Every path starts at its leaf. Only colliding labels grow by one parent at a time, so unrelated
 * paths stay as short as possible while ambiguous leaves gain exactly the context that separates
 * them. Exact duplicate paths are represented once.
 */
export function shortestUniqueAreaPathLabels(
  areaPaths: readonly string[],
): ReadonlyMap<string, string> {
  const paths = uniqueAreaPaths(areaPaths);
  const partsByPath = new Map(paths.map((path) => [path, pathParts(path)] as const));
  const depthByPath = new Map<string, number>(paths.map((path) => [path, 1]));

  while (true) {
    const pathsByLabel = new Map<string, string[]>();
    for (const path of paths) {
      const parts = partsByPath.get(path)!;
      const label = suffixLabel(parts, depthByPath.get(path)!);
      const matches = pathsByLabel.get(label) ?? [];
      matches.push(path);
      pathsByLabel.set(label, matches);
    }

    let expanded = false;
    for (const matches of pathsByLabel.values()) {
      if (matches.length < 2) continue;
      for (const path of matches) {
        const depth = depthByPath.get(path)!;
        if (depth < partsByPath.get(path)!.length) {
          depthByPath.set(path, depth + 1);
          expanded = true;
        }
      }
    }
    if (!expanded) break;
  }

  return new Map(
    paths.map((path) => [path, suffixLabel(partsByPath.get(path)!, depthByPath.get(path)!)]),
  );
}

/** A theme-monochrome funnel: the familiar compact affordance for narrowing a list. */
function renderFilterIcon(doc: Document): SVGSVGElement {
  const svg = createSvgCanvas(doc, "display:block");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M2 3h12L9.5 8.2V12l-3 1.5V8.2z");
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  return svg;
}

/** Paint the trigger from the current selection without changing its fixed footprint. */
function paintTrigger(
  trigger: HTMLButtonElement,
  count: HTMLElement,
  selectedCount: number,
  label: string,
): void {
  const active = selectedCount > 0;
  trigger.setAttribute("aria-pressed", String(active));
  trigger.title = active
    ? `${label} filter: ${selectedCount} selected`
    : `Filter by ${label.toLowerCase()}`;
  trigger.setAttribute("aria-label", trigger.title);
  trigger.style.background = active ? "var(--communication-background)" : "transparent";
  trigger.style.color = active
    ? "var(--text-on-communication-background)"
    : "var(--text-primary-color)";
  trigger.style.borderColor = active
    ? "var(--communication-background)"
    : "var(--control-border-strong)";
  count.textContent = String(selectedCount);
  // Inline `display` outranks the browser's `[hidden]` rule, so drive this explicitly rather than
  // leaving an inactive zero badge visible beside the label.
  count.style.display = active ? "inline-flex" : "none";
}

/** Build one hoverable checkbox row while preserving the full path as its value and tooltip. */
function renderPathRow(
  doc: Document,
  path: string,
  labelText: string,
  checked: boolean,
  onToggle: (checked: boolean) => void,
): HTMLElement {
  const label = doc.createElement("label");
  label.className = "awesomeado-area-filter__option";
  label.title = path;
  label.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "padding:6px 8px",
    "border-radius:4px",
    "cursor:pointer",
    "white-space:nowrap",
  ].join(";");

  const checkbox = doc.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = path;
  checkbox.checked = checked;
  checkbox.style.cssText = "margin:0;accent-color:var(--communication-background)";
  checkbox.addEventListener("change", () => onToggle(checkbox.checked));
  label.addEventListener("mouseenter", () => {
    label.style.background = "var(--control-background-hover)";
  });
  label.addEventListener("mouseleave", () => {
    label.style.background = "transparent";
  });
  label.append(checkbox, doc.createTextNode(labelText));
  return label;
}

/** Build the lazily-mounted checkbox popup. */
function renderPopup(params: {
  doc: Document;
  paths: readonly string[];
  labels: ReadonlyMap<string, string>;
  selected: ReadonlySet<string>;
  toggle(path: string, checked: boolean): void;
  clear(): void;
  label: string;
}): HTMLElement {
  const { doc, paths, labels, selected } = params;
  const popup = doc.createElement("div");
  popup.className = "awesomeado-area-filter__popup";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", `Filter by ${params.label.toLowerCase()}`);
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "width:max-content",
    "min-width:220px",
    "max-width:min(420px,calc(100vw - 16px))",
    "background:var(--callout-background-color)",
    "color:var(--text-primary-color)",
    "border:1px solid var(--control-border-strong)",
    "border-radius:6px",
    "box-shadow:0 2px 8px var(--shadow-subtle)",
    "padding:8px",
    "font-size:12px",
    "z-index:1000",
  ].join(";");

  const heading = doc.createElement("div");
  heading.style.cssText = "display:flex;align-items:center;gap:12px;padding:0 4px 6px";
  const title = doc.createElement("strong");
  title.textContent = params.label;
  const clear = doc.createElement("button");
  clear.type = "button";
  clear.className = "awesomeado-area-filter__clear";
  clear.textContent = "Clear";
  clear.disabled = selected.size === 0;
  clear.style.cssText = [
    "margin-left:auto",
    "border:none",
    "background:transparent",
    "color:var(--communication-foreground)",
    "font:inherit",
    "cursor:pointer",
    "padding:2px 4px",
  ].join(";");
  clear.addEventListener("click", params.clear);
  heading.append(title, clear);

  const list = doc.createElement("div");
  list.className = "awesomeado-area-filter__list";
  list.style.cssText = "display:flex;flex-direction:column;max-height:280px;overflow:auto";
  for (const path of paths) {
    list.append(
      renderPathRow(doc, path, labels.get(path) ?? path, selected.has(path), (checked) => {
        params.toggle(path, checked);
        clear.disabled = selected.size === 0;
      }),
    );
  }
  popup.append(heading, list);
  return popup;
}

/** Build the fixed-size trigger independently from the selector's state and popup behavior. */
function renderAreaPathTrigger(
  doc: Document,
  disabled: boolean,
  label: string,
): { root: HTMLElement; trigger: HTMLButtonElement; count: HTMLElement } {
  const root = doc.createElement("span");
  root.className = "awesomeado-area-filter";
  root.style.cssText = "position:relative;display:inline-flex;align-items:center";

  const trigger = doc.createElement("button");
  trigger.type = "button";
  trigger.className = "awesomeado-area-filter__trigger";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.disabled = disabled;
  trigger.style.cssText = [
    "box-sizing:border-box",
    "height:27.2px",
    "display:inline-flex",
    "align-items:center",
    "gap:5px",
    "border:1px solid var(--control-border-strong)",
    "border-radius:6px",
    "padding:0 7px",
    "font:inherit",
    "font-size:12px",
    "font-weight:600",
    "cursor:pointer",
  ].join(";");
  if (disabled) {
    trigger.style.cursor = "default";
    trigger.style.opacity = "0.55";
  }
  trigger.append(renderFilterIcon(doc), doc.createTextNode(label));

  const count = doc.createElement("span");
  count.className = "awesomeado-area-filter__count";
  count.style.cssText = [
    "min-width:14px",
    "height:14px",
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "border-radius:7px",
    "padding:0 3px",
    "background:var(--callout-background-color)",
    "color:var(--communication-foreground)",
    "font-size:9px",
    "line-height:1",
  ].join(";");
  trigger.append(count);
  root.append(trigger);
  return { root, trigger, count };
}

/**
 * Render a button-sized area-path filter that opens a themed full-path multi-select.
 *
 * The caller exchanges full Azure DevOps paths with the control. Labels are display-only shortest
 * unique suffixes, so filtering never depends on an abbreviated or ambiguous value.
 */
export function renderAreaPathFilter(
  doc: Document,
  options: AreaPathFilterOptions,
): AreaPathFilterHandle {
  const label = options.label?.trim() || "Area";
  const paths = uniqueAreaPaths(options.areaPaths);
  const labels = shortestUniqueAreaPathLabels(paths);
  const selected = new Set(
    uniqueAreaPaths(options.selectedAreaPaths ?? []).filter((path) => paths.includes(path)),
  );
  const { root, trigger, count } = renderAreaPathTrigger(doc, paths.length === 0, label);

  const selectedValues = (): string[] => paths.filter((path) => selected.has(path));
  const changed = (): void => {
    paintTrigger(trigger, count, selected.size, label);
    options.onChange?.(selectedValues());
  };
  paintTrigger(trigger, count, selected.size, label);

  const popupHost = createPopupHost({
    doc,
    trigger,
    mountInto: root,
    interactive: paths.length > 0,
    onClosed: options.onPopupClosed,
    buildPopup: () =>
      renderPopup({
        doc,
        paths,
        labels,
        selected,
        label,
        toggle: (path, checked) => {
          if (checked) selected.add(path);
          else selected.delete(path);
          changed();
        },
        clear: () => {
          selected.clear();
          changed();
          popupHost.close();
        },
      }),
  });

  return {
    element: root,
    selectedAreaPaths: selectedValues,
    setSelectedAreaPaths: (next) => {
      selected.clear();
      for (const path of uniqueAreaPaths(next)) {
        if (paths.includes(path)) selected.add(path);
      }
      popupHost.close();
      paintTrigger(trigger, count, selected.size, label);
    },
  };
}
