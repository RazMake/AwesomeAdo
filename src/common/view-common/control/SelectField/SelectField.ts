import { createPopupHost } from "../popupHost/popupHost";

/** One value a select field offers, and how it reads to someone scanning the list. */
export interface SelectFieldChoice {
  /** The value exchanged with the caller; never abbreviated, so a pick is never ambiguous. */
  value: string;
  /** Display text for the row and, once picked, for the collapsed field. */
  label: string;
  /** The row's tooltip, for a label that had to be shortened. Defaults to the label. */
  title?: string;
  /** Style declarations the row and the collapsed field wear (e.g. a sprint's relation color). */
  declarations?: [string, string][];
}

/** Options for the themed single-select field. */
export interface SelectFieldOptions {
  /**
   * The class-name stem every element of this instance is marked with (e.g.
   * `awesomeado-new-work-item__area`), so a caller's "which field did the reader touch?" selectors
   * cannot match every select field on the surface.
   */
  classPrefix: string;
  /** What the field is called, for assistive technology and for the empty-list tooltip. */
  label: string;
  /** The values offered, in the order they are listed. */
  choices: readonly SelectFieldChoice[];
  /** The value shown initially; one nothing offers falls back to the first choice. */
  selected?: string;
  /** What the field says while it has nothing to offer. Defaults to naming the field. */
  emptyLabel?: string;
  /** Starts the field inert — for one whose values are still being read. */
  disabled?: boolean;
  /** Called with the picked value, after the field has repainted itself. */
  onChange?(value: string): void;
}

/** The mounted field plus the API its owner reads and refills it through. */
export interface SelectFieldHandle {
  element: HTMLElement;
  /** The value currently held; the empty string when nothing is offered. */
  value(): string;
  /** Replace the offered values, keeping `selected` when it is still on offer. */
  setChoices(choices: readonly SelectFieldChoice[], selected?: string): void;
  setDisabled(disabled: boolean): void;
}

/** How tall the open list grows before it scrolls — roughly eight rows. */
const POPUP_MAX_HEIGHT_PX = 240;

/**
 * The collapsed field's own declarations.
 *
 * The font is set as longhands rather than the `font` shorthand: the shorthand resets `font-weight`,
 * which would fight a choice whose declarations make it bold (the current sprint).
 */
const TRIGGER_STYLE = [
  "box-sizing:border-box",
  "display:flex",
  "align-items:center",
  "justify-content:space-between",
  "gap:6px",
  "width:100%",
  "padding:4px 6px",
  "border:1px solid var(--control-border-strong)",
  "border-radius:4px",
  "background:var(--background-color)",
  "color:var(--text-primary-color)",
  "font-family:inherit",
  "font-size:12px",
  "line-height:1.4",
  "text-align:left",
];

const ROW_STYLE = [
  "display:block",
  "box-sizing:border-box",
  "width:100%",
  "padding:5px 8px",
  "border:0",
  "border-radius:3px",
  "background:transparent",
  "color:var(--text-primary-color)",
  "font-family:inherit",
  "font-size:12px",
  "text-align:left",
  "cursor:pointer",
  "white-space:nowrap",
  "overflow:hidden",
  "text-overflow:ellipsis",
];

/**
 * A themed single-select field: a value you can pick one of, drawn by the extension rather than by
 * the browser.
 *
 * A native `<select>` is not usable here. Its collapsed box takes an author's colors but its OPEN
 * list is painted by the platform, so on a dark board the choices appear in a white system list that
 * belongs to no theme the extension ships — and the one thing a reader looks at while choosing is
 * the part that cannot be themed. Building the list out of the same tokens every other popup uses is
 * the only way the field can look like the surface it sits on.
 *
 * Values are exchanged whole while labels are display-only, so a shortened label can never become
 * the value written to Azure DevOps.
 */
export function renderSelectField(doc: Document, options: SelectFieldOptions): SelectFieldHandle {
  const root = doc.createElement("span");
  root.className = options.classPrefix;
  root.style.cssText = "position:relative;display:block;min-width:0";

  const trigger = doc.createElement("button");
  trigger.type = "button";
  trigger.className = `${options.classPrefix}__trigger`;
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-label", options.label);

  const text = doc.createElement("span");
  text.className = `${options.classPrefix}__value`;
  text.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";

  const caret = doc.createElement("span");
  caret.textContent = "\u25be";
  caret.setAttribute("aria-hidden", "true");
  caret.style.cssText = "flex:0 0 auto;font-size:9px;opacity:0.7";

  trigger.append(text, caret);
  root.append(trigger);

  let choices = [...options.choices];
  let current = resolveSelected(choices, options.selected);

  const paint = (): void => {
    paintTrigger(
      trigger,
      text,
      choices.find((entry) => entry.value === current),
      options,
    );
  };

  const host = createPopupHost({
    doc,
    trigger,
    mountInto: root,
    buildPopup: (close) =>
      buildPopup(doc, options.classPrefix, choices, current, (value) => {
        current = value;
        paint();
        close();
        options.onChange?.(value);
      }),
  });

  trigger.disabled = options.disabled === true;
  paint();

  return {
    element: root,
    value: () => current,
    setChoices: (next, selected) => {
      // Closed first: an open list is a snapshot of the values it was built from, and leaving it up
      // would let a reader pick one this field no longer offers.
      host.close();
      choices = [...next];
      current = resolveSelected(choices, selected ?? current);
      paint();
    },
    setDisabled: (disabled) => {
      if (disabled) host.close();
      trigger.disabled = disabled;
      paint();
    },
  };
}

/** What the collapsed field says: the picked choice, or why there is nothing to say. */
function triggerLabel(choice: SelectFieldChoice | undefined, options: SelectFieldOptions): string {
  if (choice !== undefined) return choice.label;
  return options.emptyLabel ?? `No ${options.label.toLowerCase()}`;
}

/** Show the value in force, wearing that choice's own emphasis so the field reads like its row. */
function paintTrigger(
  trigger: HTMLButtonElement,
  text: HTMLElement,
  choice: SelectFieldChoice | undefined,
  options: SelectFieldOptions,
): void {
  text.textContent = triggerLabel(choice, options);
  trigger.title = choice === undefined ? "" : (choice.title ?? choice.label);
  trigger.style.cssText = TRIGGER_STYLE.join(";");
  trigger.style.cursor = trigger.disabled ? "default" : "pointer";
  trigger.style.opacity = trigger.disabled ? "0.6" : "1";
  // Longhands rather than a `cssText` append, for the same reason the base style avoids the `font`
  // shorthand: only a longhand set afterwards reliably wins over it.
  for (const [property, value] of choice?.declarations ?? []) {
    trigger.style.setProperty(property, value);
  }
}

/** The value the field opens on: the caller's when it is offered, otherwise the first choice. */
function resolveSelected(
  choices: readonly SelectFieldChoice[],
  selected: string | undefined,
): string {
  if (selected !== undefined && choices.some((choice) => choice.value === selected)) {
    return selected;
  }
  return choices[0]?.value ?? "";
}

function buildPopup(
  doc: Document,
  classPrefix: string,
  choices: readonly SelectFieldChoice[],
  current: string,
  onPick: (value: string) => void,
): HTMLElement {
  const popup = doc.createElement("div");
  popup.className = `${classPrefix}__popup`;
  popup.setAttribute("role", "listbox");
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "min-width:100%",
    "max-width:min(420px,90vw)",
    "box-sizing:border-box",
    "background:var(--callout-background-color)",
    "border:1px solid var(--control-border-strong)",
    "border-radius:4px",
    "box-shadow:0 2px 8px var(--shadow-subtle)",
    `max-height:${POPUP_MAX_HEIGHT_PX}px`,
    "overflow-y:auto",
    "padding:4px",
    "z-index:1000",
  ].join(";");

  for (const choice of choices) {
    popup.append(renderRow(doc, classPrefix, choice, choice.value === current, onPick));
  }
  return popup;
}

function renderRow(
  doc: Document,
  classPrefix: string,
  choice: SelectFieldChoice,
  selected: boolean,
  onPick: (value: string) => void,
): HTMLButtonElement {
  const row = doc.createElement("button");
  row.type = "button";
  row.className = `${classPrefix}__option`;
  row.setAttribute("role", "option");
  row.setAttribute("aria-selected", String(selected));
  row.value = choice.value;
  row.textContent = choice.label;
  row.title = choice.title ?? choice.label;
  row.style.cssText = ROW_STYLE.join(";");
  if (selected) {
    row.style.background = "var(--control-background-subtle)";
    row.style.fontWeight = "600";
  }
  for (const [property, value] of choice.declarations ?? []) {
    row.style.setProperty(property, value);
  }
  // Hover is painted here rather than in a stylesheet: the control is built detached and mounted by
  // its caller, which may be inside a shadow root a document-level rule would never reach.
  row.addEventListener("mouseenter", () => {
    row.style.boxShadow = "inset 0 0 0 999px var(--palette-neutral-4)";
  });
  row.addEventListener("mouseleave", () => {
    row.style.boxShadow = "none";
  });
  row.addEventListener("click", () => onPick(choice.value));
  return row;
}
