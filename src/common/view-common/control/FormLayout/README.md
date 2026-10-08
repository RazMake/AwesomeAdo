# FormLayout

The building blocks every creation form shares, so two forms can never look — or submit — like two
different forms: labelled rows, text boxes whose guidance is ghost text, the Add/Cancel row, the
failure line, and the red × that removes one entry of a repeatable group.

## API

```typescript
/** The declarations every text field wears. */
const FORM_FIELD_STYLE: string;

/** Caption, then the control; the caption becomes its aria-label. */
function renderFormRow(
  doc: Document,
  options: { classPrefix: string; caption: string; control: HTMLElement },
): HTMLElement;

/**
 * `help` is shown inside the empty box as its placeholder, replaced as soon as the reader types,
 * and repeated as the tooltip so a long line truncated by the box can still be read. It wins over
 * `placeholder` when both are given.
 */
function renderFormTextField(
  doc: Document,
  options: { className: string; placeholder?: string; help?: string; maxLength?: number },
): HTMLInputElement;

/** `${classPrefix}__error`, hidden until a submission is refused. */
function renderFormFailureLine(doc: Document, classPrefix: string): HTMLElement;

/** `${classPrefix}__${label.toLowerCase()}`; the primary button wears the call-to-action colors. */
function renderFormButton(
  doc: Document,
  classPrefix: string,
  label: string,
  primary: boolean,
): HTMLButtonElement;

/** `${classPrefix}__actions`: the buttons in order, then the failure line. */
function renderFormActions(
  doc: Document,
  classPrefix: string,
  buttons: readonly HTMLButtonElement[],
  failure: HTMLElement,
): HTMLElement;

/** One submission: buttons inert meanwhile, "Not created — see the diagnostics log." on false. */
function submitForm(
  buttons: readonly HTMLButtonElement[],
  failure: HTMLElement,
  submit: () => Promise<boolean>,
): Promise<boolean>;

/**
 * Wires submit and cancel. The submit button is disabled, with `problem()` as its tooltip, while
 * the form cannot be submitted and for the whole submission; fields call `refresh()` on change.
 */
function bindFormSubmission(options: {
  submit: HTMLButtonElement;
  cancel: HTMLButtonElement;
  failure: HTMLElement;
  problem(): string | null;
  run(): Promise<boolean>;
  onCancel(): void;
}): { refresh(): void };

/** The red × removing one entry; `label` is its tooltip and accessible name. */
function renderFormRemoveButton(
  doc: Document,
  options: { className: string; label: string; onRemove(): void },
): HTMLButtonElement;
```

## Usage

```typescript
const title = renderFormTextField(doc, {
  className: "my-form__title",
  help: "Provide a short title",
  maxLength: 255,
});
const add = renderFormButton(doc, "my-form", "Add", true);
const cancel = renderFormButton(doc, "my-form", "Cancel", false);
const failure = renderFormFailureLine(doc, "my-form");
const { refresh } = bindFormSubmission({
  submit: add,
  cancel,
  failure,
  problem: () => (title.value.trim() === "" ? "Provide a title." : null),
  run: () => create(title.value.trim()),
  onCancel: close,
});
title.addEventListener("input", refresh);
form.append(
  renderFormRow(doc, { classPrefix: "my-form", caption: "Title", control: title }),
  renderFormActions(doc, "my-form", [add, cancel], failure),
);
```

The owner keeps the form mounted when `run` resolves `false`, so everything typed survives another
attempt.
