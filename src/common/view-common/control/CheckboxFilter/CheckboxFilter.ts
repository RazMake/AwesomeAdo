import { createPopupHost } from "../popupHost/popupHost";
import { createSvgCanvas } from "../svgIcon/svgIcon";

/** One selectable value, and how it reads to someone scanning the list. */
export interface CheckboxFilterOption {
  /** The value exchanged with the caller; never abbreviated, so filtering is never ambiguous. */
  value: string;
  /** Display text for the row. Defaults to `value`. */
  label?: string;
  /** The row's tooltip, for a label that had to be shortened. Defaults to the label. */
  title?: string;
}

/**
 * The condition the reader has built out of the offered values.
 *
 * A condition rather than a list because a list cannot say "these two but not that one": the three
 * parts are AND-ed — every excluded value must be absent, and the included ones must be present
 * either all together or one at a time.
 */
export interface CheckboxFilterSelection {
  /** Values that must be present. */
  included: string[];
  /** Values that must be absent. Always empty unless the caller enabled `combining`. */
  excluded: string[];
  /** Whether EVERY included value must be present, rather than any one of them. */
  matchAll: boolean;
}

/** Options for the compact multi-select filter. */
export interface CheckboxFilterOptions {
  /** Visible noun used by the trigger and the popup heading (e.g. `Area`, `Tags`). */
  label: string;
  /** The values offered, in the order they are listed. */
  options: readonly CheckboxFilterOption[];
  /** Values selected initially. Values absent from `options` are ignored. */
  selected?: readonly string[];
  /** Values excluded initially. Ignored unless `combining` is set. */
  excluded?: readonly string[];
  /** Whether the included values start AND-ed rather than OR-ed. Ignored unless `combining` is set. */
  matchAll?: boolean;
  /**
   * Offers the two controls that turn a list of values into a condition: a "must NOT have" state on
   * every row, and the switch between requiring any of the ticked values and requiring all of them.
   *
   * Off by default, because a filter over values an item can only hold one of (an area path, a
   * parent) has nothing to combine — every extra control there is one more thing to dismiss.
   */
  combining?: boolean;
  /**
   * The class-name stem every element of this instance is marked with (e.g. `awesomeado-tag-filter`).
   *
   * Per-instance rather than fixed because each filter is a distinct thing on screen: sharing one
   * stem would make a view's own "which filter did the user touch?" selectors match all of them.
   */
  classPrefix: string;
  /**
   * Placeholder for the quick-search box. Omit for a list short enough to read at a glance — a
   * search box over four values is a control the reader has to dismiss rather than a shortcut.
   */
  searchPlaceholder?: string;
  /** Called after a checkbox, an exclusion, the match mode, or Clear changes the condition. */
  onChange?(selection: CheckboxFilterSelection): void;
  /** Called after an open popup closes by trigger, outside pointer, Escape, or Clear. */
  onPopupClosed?(): void;
}

/** The mounted control plus its selection API. */
export interface CheckboxFilterHandle {
  element: HTMLElement;
  /** The condition currently in force. */
  selection(): CheckboxFilterSelection;
  setSelectedValues(values: readonly string[]): void;
}

/** The three states one offered value can be in. */
type OptionState = "neutral" | "include" | "exclude";

/** The live condition the popup mutates in place and the trigger is repainted from. */
interface FilterState {
  included: Set<string>;
  excluded: Set<string>;
  matchAll: boolean;
}

/** Trim, drop blanks, and deduplicate while preserving the caller's order. */
function uniqueValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (value.length > 0 && !seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  }
  return result;
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

/** What the trigger's tooltip says the filter is doing right now. */
function filterSummary(label: string, selection: CheckboxFilterSelection): string {
  const parts: string[] = [];
  if (selection.included.length > 0) {
    parts.push(`${selection.matchAll ? "all of" : "any of"} ${selection.included.join(", ")}`);
  }
  if (selection.excluded.length > 0) {
    parts.push(`none of ${selection.excluded.join(", ")}`);
  }
  // Spelled out rather than counted: "2 selected" cannot tell a required value from an excluded one,
  // and that difference is the whole reason the condition exists.
  return parts.length === 0 ? `Filter by ${label.toLowerCase()}` : `${label}: ${parts.join("; ")}`;
}

/** Paint the trigger from the current condition without changing its fixed footprint. */
function paintTrigger(
  trigger: HTMLButtonElement,
  count: HTMLElement,
  selection: CheckboxFilterSelection,
  label: string,
): void {
  const selectedCount = selection.included.length + selection.excluded.length;
  const active = selectedCount > 0;
  trigger.setAttribute("aria-pressed", String(active));
  trigger.title = filterSummary(label, selection);
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

/** Paint the per-row "must NOT have" toggle, which reads as a warning only while it is on. */
function paintExcludeToggle(toggle: HTMLButtonElement, excluded: boolean): void {
  toggle.setAttribute("aria-pressed", String(excluded));
  toggle.style.background = excluded ? "var(--status-red-background)" : "transparent";
  toggle.style.color = excluded ? "var(--status-red-foreground)" : "var(--text-secondary-color)";
  toggle.style.borderColor = excluded ? "var(--status-red-border)" : "var(--control-border-strong)";
}

/** The per-row toggle that turns a value into "and none of this one". */
function renderExcludeToggle(
  doc: Document,
  option: CheckboxFilterOption,
  classPrefix: string,
  onToggle: () => void,
): HTMLButtonElement {
  const toggle = doc.createElement("button");
  toggle.type = "button";
  toggle.className = `${classPrefix}__exclude`;
  toggle.textContent = "not";
  toggle.title = `Keep only items WITHOUT ${option.label ?? option.value}`;
  toggle.setAttribute("aria-label", toggle.title);
  toggle.style.cssText = [
    "flex:0 0 auto",
    "border:1px solid var(--control-border-strong)",
    "border-radius:4px",
    "padding:0 5px",
    "font:inherit",
    "font-size:10px",
    "line-height:16px",
    "cursor:pointer",
  ].join(";");
  toggle.addEventListener("click", onToggle);
  return toggle;
}

/** Everything one option row needs to paint itself and report the state the reader put it in. */
interface OptionRowParams {
  classPrefix: string;
  /** Whether the row offers the "must NOT have" toggle beside its checkbox. */
  combining: boolean;
  state: OptionState;
  onChange(state: OptionState): void;
}

/** Build one hoverable option row while preserving the full value as its value and tooltip. */
function renderOptionRow(
  doc: Document,
  option: CheckboxFilterOption,
  params: OptionRowParams,
): HTMLElement {
  const row = doc.createElement("div");
  row.className = `${params.classPrefix}__option`;
  row.title = option.title ?? option.label ?? option.value;
  row.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "padding:6px 8px",
    "border-radius:4px",
    "white-space:nowrap",
  ].join(";");

  const include = doc.createElement("label");
  include.style.cssText = "display:flex;align-items:center;gap:8px;flex:1 1 auto;cursor:pointer";
  const checkbox = doc.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = option.value;
  checkbox.checked = params.state === "include";
  checkbox.style.cssText = "margin:0;accent-color:var(--communication-background)";
  include.append(checkbox, doc.createTextNode(option.label ?? option.value));
  row.append(include);

  // Required and excluded are the same question answered two ways, so setting either one clears the
  // other rather than leaving a row that claims a value must be both present and absent.
  let state = params.state;
  let toggle: HTMLButtonElement | null = null;
  const setState = (next: OptionState): void => {
    state = next;
    checkbox.checked = next === "include";
    if (toggle !== null) paintExcludeToggle(toggle, next === "exclude");
    params.onChange(next);
  };
  if (params.combining) {
    toggle = renderExcludeToggle(doc, option, params.classPrefix, () =>
      setState(state === "exclude" ? "neutral" : "exclude"),
    );
    paintExcludeToggle(toggle, state === "exclude");
    row.append(toggle);
  }

  checkbox.addEventListener("change", () => setState(checkbox.checked ? "include" : "neutral"));
  row.addEventListener("mouseenter", () => {
    row.style.background = "var(--control-background-hover)";
  });
  row.addEventListener("mouseleave", () => {
    row.style.background = "transparent";
  });
  return row;
}

/** The quick-search field that narrows a long option list to what the reader is typing. */
function renderSearchBox(
  doc: Document,
  classPrefix: string,
  placeholder: string,
  onInput: (text: string) => void,
): HTMLInputElement {
  const search = doc.createElement("input");
  search.type = "search";
  search.className = `${classPrefix}__search`;
  search.placeholder = placeholder;
  search.setAttribute("aria-label", placeholder);
  search.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "margin:0 0 6px",
    "padding:4px 6px",
    "border:1px solid var(--control-border-strong)",
    "border-radius:4px",
    // Transparent rather than an input-background token: the view pins a complete palette, and that
    // token is not part of it, so on a dark theme over a light ADO page the field painted white.
    "background:transparent",
    "color:var(--text-primary-color)",
    "font:inherit",
    "font-size:12px",
  ].join(";");
  search.addEventListener("input", () => onInput(search.value));
  return search;
}

/** Everything the lazily-built popup needs; grouped so the builder stays one readable argument. */
interface PopupParams {
  doc: Document;
  options: readonly CheckboxFilterOption[];
  /** The live condition, mutated in place so the caller keeps the single source of truth. */
  state: FilterState;
  label: string;
  classPrefix: string;
  searchPlaceholder: string | undefined;
  combining: boolean;
  /** Records the state the reader put one value in and reports the new condition. */
  set(value: string, state: OptionState): void;
  /** Flips between requiring any ticked value and requiring all of them. */
  setMatchAll(matchAll: boolean): void;
  clear(): void;
}

/** How many values the condition names, in either direction. */
function conditionSize(state: FilterState): number {
  return state.included.size + state.excluded.size;
}

/** The switch that decides whether the ticked values are OR-ed or AND-ed. */
function renderMatchModeToggle(params: PopupParams): HTMLButtonElement {
  const toggle = params.doc.createElement("button");
  toggle.type = "button";
  toggle.className = `${params.classPrefix}__match-mode`;
  toggle.style.cssText = [
    "border:1px solid var(--control-border-strong)",
    "border-radius:4px",
    "background:transparent",
    "color:var(--text-primary-color)",
    "font:inherit",
    "font-size:11px",
    "padding:1px 6px",
    "cursor:pointer",
  ].join(";");
  const paint = (): void => {
    toggle.textContent = params.state.matchAll ? "All" : "Any";
    toggle.title = params.state.matchAll
      ? "Every ticked value must be present. Click to require any one instead."
      : "Any one ticked value is enough. Click to require all of them instead.";
    toggle.setAttribute("aria-label", toggle.title);
  };
  paint();
  toggle.addEventListener("click", () => {
    params.setMatchAll(!params.state.matchAll);
    paint();
  });
  return toggle;
}

/** The popup's heading band: the noun on the left, the Clear shortcut on the right. */
function renderHeading(params: PopupParams): [HTMLElement, HTMLButtonElement] {
  const { doc, classPrefix } = params;
  const heading = doc.createElement("div");
  heading.style.cssText = "display:flex;align-items:center;gap:12px;padding:0 4px 6px";
  const title = doc.createElement("strong");
  title.textContent = params.label;
  const clear = doc.createElement("button");
  clear.type = "button";
  clear.className = `${classPrefix}__clear`;
  clear.textContent = "Clear";
  clear.disabled = conditionSize(params.state) === 0;
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
  heading.append(title);
  if (params.combining) heading.append(renderMatchModeToggle(params));
  heading.append(clear);
  return [heading, clear];
}

/** Which state the popup should open one offered value in. */
function stateOf(state: FilterState, value: string): OptionState {
  if (state.included.has(value)) return "include";
  return state.excluded.has(value) ? "exclude" : "neutral";
}

/** Build the lazily-mounted checkbox popup. */
function renderPopup(params: PopupParams): HTMLElement {
  const { doc, classPrefix } = params;
  const popup = doc.createElement("div");
  popup.className = `${classPrefix}__popup`;
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

  const [heading, clear] = renderHeading(params);

  const list = doc.createElement("div");
  list.className = `${classPrefix}__list`;
  list.style.cssText = "display:flex;flex-direction:column;max-height:280px;overflow:auto";
  const rows = params.options.map((option) => {
    const row = renderOptionRow(doc, option, {
      classPrefix,
      combining: params.combining,
      state: stateOf(params.state, option.value),
      onChange: (next) => {
        params.set(option.value, next);
        clear.disabled = conditionSize(params.state) === 0;
      },
    });
    list.append(row);
    return { option, row };
  });

  popup.append(heading);
  if (params.searchPlaceholder !== undefined) {
    // Filter by the visible label AND the underlying value: a shortened label hides the very text a
    // reader who knows the full value would type.
    popup.append(
      renderSearchBox(doc, classPrefix, params.searchPlaceholder, (text) => {
        const needle = text.trim().toLowerCase();
        for (const { option, row } of rows) {
          const haystack = `${option.label ?? option.value}\n${option.value}`.toLowerCase();
          row.style.display = haystack.includes(needle) ? "flex" : "none";
        }
      }),
    );
  }
  popup.append(list);
  return popup;
}

/** Build the fixed-size trigger independently from the selection state and popup behavior. */
function renderTrigger(
  doc: Document,
  classPrefix: string,
  disabled: boolean,
  label: string,
): { root: HTMLElement; trigger: HTMLButtonElement; count: HTMLElement } {
  const root = doc.createElement("span");
  root.className = classPrefix;
  root.style.cssText = "position:relative;display:inline-flex;align-items:center";

  const trigger = doc.createElement("button");
  trigger.type = "button";
  trigger.className = `${classPrefix}__trigger`;
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
  count.className = `${classPrefix}__count`;
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
 * Render a button-sized filter that opens a themed multi-select of checkboxes.
 *
 * The control deliberately knows nothing about what a value MEANS — it exchanges opaque strings, so
 * the same compact affordance serves area paths, tags, and anything else a view narrows by, and the
 * trigger, popup, dismissal, and empty-list behaviour cannot drift between them. Values are always
 * exchanged in full; a shortened `label` is display-only, so filtering never depends on an
 * abbreviated or ambiguous value.
 */
export function renderCheckboxFilter(
  doc: Document,
  options: CheckboxFilterOptions,
): CheckboxFilterHandle {
  const { label, classPrefix } = options;
  const combining = options.combining === true;
  const known = new Map(options.options.map((option) => [option.value, option] as const));
  const values = [...known.keys()];
  const offered = (candidates: readonly string[] | undefined): Set<string> =>
    new Set(uniqueValues(candidates ?? []).filter((value) => known.has(value)));
  const state: FilterState = {
    included: offered(options.selected),
    excluded: combining ? offered(options.excluded) : new Set(),
    matchAll: combining && options.matchAll === true,
  };
  // A value can be required or excluded, never both, so a caller seeding it twice is resolved once
  // here rather than leaving the popup and the condition disagreeing about that row.
  for (const value of state.included) state.excluded.delete(value);
  const { root, trigger, count } = renderTrigger(doc, classPrefix, values.length === 0, label);

  const selection = (): CheckboxFilterSelection => ({
    included: values.filter((value) => state.included.has(value)),
    excluded: values.filter((value) => state.excluded.has(value)),
    matchAll: state.matchAll,
  });
  const changed = (): void => {
    paintTrigger(trigger, count, selection(), label);
    options.onChange?.(selection());
  };
  paintTrigger(trigger, count, selection(), label);

  const popupHost = createPopupHost({
    doc,
    trigger,
    mountInto: root,
    interactive: values.length > 0,
    onClosed: options.onPopupClosed,
    buildPopup: () =>
      renderPopup({
        doc,
        options: [...known.values()],
        state,
        label,
        classPrefix,
        combining,
        searchPlaceholder: options.searchPlaceholder,
        set: (value, next) => {
          state.included.delete(value);
          state.excluded.delete(value);
          if (next === "include") state.included.add(value);
          if (next === "exclude") state.excluded.add(value);
          changed();
        },
        setMatchAll: (matchAll) => {
          state.matchAll = matchAll;
          changed();
        },
        clear: () => {
          state.included.clear();
          state.excluded.clear();
          changed();
          popupHost.close();
        },
      }),
  });

  return {
    element: root,
    selection,
    setSelectedValues: (next) => {
      state.included = offered(next);
      for (const value of state.included) state.excluded.delete(value);
      popupHost.close();
      paintTrigger(trigger, count, selection(), label);
    },
  };
}
