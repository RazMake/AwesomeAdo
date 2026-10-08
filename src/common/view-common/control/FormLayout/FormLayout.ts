/** One shared declaration list for every text field, so two forms can never look like two forms. */
export const FORM_FIELD_STYLE =
  "box-sizing:border-box;width:100%;padding:4px 6px;border:1px solid var(--control-border-strong);" +
  "border-radius:4px;background:transparent;color:var(--text-primary-color);font:inherit;font-size:12px";

/** What one labelled row says about the control it holds. */
export interface FormRowOptions {
  /** The class every element of the form carries, e.g. `awesomeado-new-work-item`. */
  classPrefix: string;
  /** The row's caption, which is also the control's accessible name. */
  caption: string;
  control: HTMLElement;
}

/** One labelled row: the field's name, then the control that answers it. */
export function renderFormRow(doc: Document, options: FormRowOptions): HTMLElement {
  const row = doc.createElement("div");
  row.className = `${options.classPrefix}__row`;
  row.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0";
  const name = doc.createElement("span");
  name.textContent = options.caption;
  name.style.cssText = "font-size:11px;font-weight:600;color:var(--text-secondary-color)";
  row.append(name, options.control);
  options.control.setAttribute("aria-label", options.caption);
  return row;
}

/** What a one-line text box is called and how much it accepts. */
export interface FormTextFieldOptions {
  className: string;
  /** Short ghost text, e.g. what the box is for; `help` replaces it when both are given. */
  placeholder?: string;
  /**
   * Guidance shown as ghost text until the reader types. It is also the tooltip, because a
   * sentence of guidance outgrows a one-line box and would otherwise be cut off unread.
   */
  help?: string;
  /** Omitted leaves the browser's own (unbounded) limit. */
  maxLength?: number;
}

export function renderFormTextField(
  doc: Document,
  options: FormTextFieldOptions,
): HTMLInputElement {
  const field = doc.createElement("input");
  field.type = "text";
  field.className = options.className;
  if (options.placeholder !== undefined) field.placeholder = options.placeholder;
  if (options.help !== undefined) {
    field.placeholder = options.help;
    field.title = options.help;
  }
  if (options.maxLength !== undefined) field.maxLength = options.maxLength;
  field.style.cssText = FORM_FIELD_STYLE;
  return field;
}

/**
 * The line a form shows when its owner refused the submission. Hidden until then, because the
 * caller keeps the form mounted on failure and the reader must not be left looking at everything
 * they typed behind buttons that appeared to do nothing.
 */
export function renderFormFailureLine(doc: Document, classPrefix: string): HTMLElement {
  const failure = doc.createElement("span");
  failure.className = `${classPrefix}__error`;
  failure.style.cssText = "display:none;font-size:11px;color:var(--error)";
  return failure;
}

/** The message every creation form shows when its owner reported the creation failed. */
const NOT_CREATED_MESSAGE = "Not created \u2014 see the diagnostics log.";

function showFormFailure(failure: HTMLElement, message: string): void {
  failure.textContent = message;
  failure.style.display = "inline";
}

function hideFormFailure(failure: HTMLElement): void {
  failure.style.display = "none";
}

/** A form button; the primary one wears the theme's call-to-action colors. */
export function renderFormButton(
  doc: Document,
  classPrefix: string,
  label: string,
  primary: boolean,
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = `${classPrefix}__${label.toLowerCase()}`;
  button.textContent = label;
  button.style.cssText = [
    "border:1px solid var(--control-border-strong)",
    "border-radius:4px",
    "padding:3px 12px",
    "font:inherit",
    "font-size:12px",
    "cursor:pointer",
    primary
      ? "background:var(--communication-background);color:var(--text-on-communication-background)"
      : "background:transparent;color:var(--text-primary-color)",
  ].join(";");
  return button;
}

/** The form's closing row: its buttons in order, then the failure line beside them. */
export function renderFormActions(
  doc: Document,
  classPrefix: string,
  buttons: readonly HTMLButtonElement[],
  failure: HTMLElement,
): HTMLElement {
  const actions = doc.createElement("div");
  actions.className = `${classPrefix}__actions`;
  actions.style.cssText = "display:flex;align-items:center;gap:6px";
  actions.append(...buttons, failure);
  return actions;
}

/**
 * Run one submission: the buttons are inert while the owner works, and a refusal is said in place.
 *
 * The buttons are disabled for the whole round-trip because a second click on a creation form
 * creates a second item; the owner keeps the form mounted on failure, so everything typed survives
 * for another attempt.
 */
export async function submitForm(
  buttons: readonly HTMLButtonElement[],
  failure: HTMLElement,
  submit: () => Promise<boolean>,
): Promise<boolean> {
  hideFormFailure(failure);
  for (const button of buttons) button.disabled = true;
  let accepted: boolean;
  try {
    accepted = await submit();
  } finally {
    // An owner that throws instead of resolving false must not leave the form locked.
    for (const button of buttons) button.disabled = false;
  }
  if (!accepted) showFormFailure(failure, NOT_CREATED_MESSAGE);
  return accepted;
}

/** What `bindFormSubmission` wires together. */
export interface FormSubmissionOptions {
  submit: HTMLButtonElement;
  cancel: HTMLButtonElement;
  failure: HTMLElement;
  /** Why the form cannot be submitted yet — shown as the submit button's tooltip — or null. */
  problem(): string | null;
  /** Hands the answers to the owner; resolving false keeps the form open. */
  run(): Promise<boolean>;
  onCancel(): void;
}

/**
 * Wire a form's submit and cancel buttons, returning the `refresh` its fields call on every change.
 *
 * The in-flight flag is what keeps a field's input event — a pasted image landing, a directory
 * match filling an alias — from re-enabling the button mid-submission and creating a duplicate.
 */
export function bindFormSubmission(options: FormSubmissionOptions): { refresh(): void } {
  let submitting = false;
  const refresh = (): void => {
    const problem = options.problem();
    options.submit.disabled = submitting || problem !== null;
    options.submit.title = problem ?? "";
  };
  options.submit.addEventListener("click", () => {
    submitting = true;
    void submitForm([options.submit, options.cancel], options.failure, options.run).finally(() => {
      submitting = false;
      refresh();
    });
  });
  options.cancel.addEventListener("click", () => options.onCancel());
  refresh();
  return { refresh };
}

/**
 * The red × that removes one entry of a repeatable group (a detail, a contact).
 *
 * Red through the theme's own removal token so it reads as destructive on every scheme, and named
 * for assistive technology because the glyph alone announces nothing.
 */
export function renderFormRemoveButton(
  doc: Document,
  options: { className: string; label: string; onRemove(): void },
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = options.className;
  button.textContent = "\u00d7";
  button.title = options.label;
  button.setAttribute("aria-label", options.label);
  button.style.cssText =
    "flex:0 0 auto;align-self:center;border:0;padding:0 4px;background:none;cursor:pointer;" +
    "color:var(--remove-control-color);font:inherit;font-size:16px;font-weight:700;line-height:1";
  button.addEventListener("click", options.onRemove);
  return button;
}
