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

/** Options for the compact multi-select filter. */
export interface CheckboxFilterOptions {
  /** Visible noun used by the trigger and the popup heading (e.g. `Area`, `Tags`). */
  label: string;
  /** The values offered, in the order they are listed. */
  options: readonly CheckboxFilterOption[];
  /** Values selected initially. Values absent from `options` are ignored. */
  selected?: readonly string[];
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
  /** Called after a checkbox or Clear changes the selection. */
  onChange?(selected: string[]): void;
  /** Called after an open popup closes by trigger, outside pointer, Escape, or Clear. */
  onPopupClosed?(): void;
}

/** The mounted control plus its selection API. */
export interface CheckboxFilterHandle {
  element: HTMLElement;
  selectedValues(): string[];
  setSelectedValues(values: readonly string[]): void;
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

/** Build one hoverable checkbox row while preserving the full value as its value and tooltip. */
function renderOptionRow(
  doc: Document,
  option: CheckboxFilterOption,
  classPrefix: string,
  checked: boolean,
  onToggle: (checked: boolean) => void,
): HTMLElement {
  const row = doc.createElement("label");
  row.className = `${classPrefix}__option`;
  row.title = option.title ?? option.label ?? option.value;
  row.style.cssText = [
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
  checkbox.value = option.value;
  checkbox.checked = checked;
  checkbox.style.cssText = "margin:0;accent-color:var(--communication-background)";
  checkbox.addEventListener("change", () => onToggle(checkbox.checked));
  row.addEventListener("mouseenter", () => {
    row.style.background = "var(--control-background-hover)";
  });
  row.addEventListener("mouseleave", () => {
    row.style.background = "transparent";
  });
  row.append(checkbox, doc.createTextNode(option.label ?? option.value));
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
  selected: ReadonlySet<string>;
  label: string;
  classPrefix: string;
  searchPlaceholder: string | undefined;
  toggle(value: string, checked: boolean): void;
  clear(): void;
}

/** The popup's heading band: the noun on the left, the Clear shortcut on the right. */
function renderHeading(
  params: PopupParams,
  selectedCount: number,
): [HTMLElement, HTMLButtonElement] {
  const { doc, classPrefix } = params;
  const heading = doc.createElement("div");
  heading.style.cssText = "display:flex;align-items:center;gap:12px;padding:0 4px 6px";
  const title = doc.createElement("strong");
  title.textContent = params.label;
  const clear = doc.createElement("button");
  clear.type = "button";
  clear.className = `${classPrefix}__clear`;
  clear.textContent = "Clear";
  clear.disabled = selectedCount === 0;
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
  return [heading, clear];
}

/** Build the lazily-mounted checkbox popup. */
function renderPopup(params: PopupParams): HTMLElement {
  const { doc, selected, classPrefix } = params;
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

  const [heading, clear] = renderHeading(params, selected.size);

  const list = doc.createElement("div");
  list.className = `${classPrefix}__list`;
  list.style.cssText = "display:flex;flex-direction:column;max-height:280px;overflow:auto";
  const rows = params.options.map((option) => {
    const row = renderOptionRow(doc, option, classPrefix, selected.has(option.value), (checked) => {
      params.toggle(option.value, checked);
      clear.disabled = selected.size === 0;
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
  const known = new Map(options.options.map((option) => [option.value, option] as const));
  const values = [...known.keys()];
  const selected = new Set(
    uniqueValues(options.selected ?? []).filter((value) => known.has(value)),
  );
  const { root, trigger, count } = renderTrigger(doc, classPrefix, values.length === 0, label);

  const selectedValues = (): string[] => values.filter((value) => selected.has(value));
  const changed = (): void => {
    paintTrigger(trigger, count, selected.size, label);
    options.onChange?.(selectedValues());
  };
  paintTrigger(trigger, count, selected.size, label);

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
        selected,
        label,
        classPrefix,
        searchPlaceholder: options.searchPlaceholder,
        toggle: (value, checked) => {
          if (checked) selected.add(value);
          else selected.delete(value);
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
    selectedValues,
    setSelectedValues: (next) => {
      selected.clear();
      for (const value of uniqueValues(next)) {
        if (known.has(value)) selected.add(value);
      }
      popupHost.close();
      paintTrigger(trigger, count, selected.size, label);
    },
  };
}
