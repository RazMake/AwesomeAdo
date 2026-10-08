import { describe, expect, it, vi } from "vitest";

import {
  bindFormSubmission,
  renderFormActions,
  renderFormButton,
  renderFormFailureLine,
  renderFormRemoveButton,
  renderFormRow,
  renderFormTextField,
  submitForm,
} from "./FormLayout";

const PREFIX = "test-form";
const NOT_CREATED = "Not created \u2014 see the diagnostics log.";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** Let every pending promise continuation run, without relying on a real clock. */
async function settle(): Promise<void> {
  for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

describe("renderFormRow", () => {
  it("lays out the caption and the control, naming the control by the caption", () => {
    const control = document.createElement("input");

    const row = renderFormRow(document, { classPrefix: PREFIX, caption: "Service Name", control });

    expect(row.className).toBe("test-form__row");
    expect(row.children).toHaveLength(2);
    expect(row.firstElementChild?.textContent).toBe("Service Name");
    expect(row.lastElementChild).toBe(control);
    expect(control.getAttribute("aria-label")).toBe("Service Name");
  });
});

describe("renderFormTextField", () => {
  it("applies the placeholder and length limit it was given", () => {
    const field = renderFormTextField(document, {
      className: "test-form__title",
      placeholder: "Name",
      maxLength: 12,
    });

    expect(field.type).toBe("text");
    expect(field.className).toBe("test-form__title");
    expect(field.placeholder).toBe("Name");
    expect(field.title).toBe("");
    expect(field.maxLength).toBe(12);
  });

  it("shows the guidance as ghost text and as the tooltip, in place of a placeholder", () => {
    const field = renderFormTextField(document, {
      className: "test-form__title",
      placeholder: "Name",
      help: "What the service is called",
    });

    expect(field.placeholder).toBe("What the service is called");
    expect(field.title).toBe("What the service is called");
  });

  it("leaves the browser's own placeholder and length limit when none are given", () => {
    const field = renderFormTextField(document, { className: "test-form__title" });

    expect(field.placeholder).toBe("");
    expect(field.hasAttribute("maxlength")).toBe(false);
  });
});

describe("renderFormFailureLine", () => {
  it("starts hidden and empty", () => {
    const failure = renderFormFailureLine(document, PREFIX);

    expect(failure.className).toBe("test-form__error");
    expect(failure.style.display).toBe("none");
    expect(failure.textContent).toBe("");
  });
});

describe("renderFormButton", () => {
  it("names the primary button's class after its label and gives it the call-to-action colors", () => {
    const button = renderFormButton(document, PREFIX, "Add", true);

    expect(button.type).toBe("button");
    expect(button.className).toBe("test-form__add");
    expect(button.textContent).toBe("Add");
    expect(button.getAttribute("style")).toContain("var(--communication-background)");
    expect(button.style.color).toBe("var(--text-on-communication-background)");
  });

  it("draws a secondary button in the ordinary text color, without the call-to-action fill", () => {
    const button = renderFormButton(document, PREFIX, "Cancel", false);

    expect(button.className).toBe("test-form__cancel");
    expect(button.textContent).toBe("Cancel");
    expect(button.style.color).toBe("var(--text-primary-color)");
    expect(button.getAttribute("style")).not.toContain("var(--communication-background)");
  });
});

describe("renderFormActions", () => {
  it("puts the buttons in order, then the failure line", () => {
    const add = renderFormButton(document, PREFIX, "Add", true);
    const cancel = renderFormButton(document, PREFIX, "Cancel", false);
    const failure = renderFormFailureLine(document, PREFIX);

    const actions = renderFormActions(document, PREFIX, [add, cancel], failure);

    expect(actions.className).toBe("test-form__actions");
    expect([...actions.children]).toEqual([add, cancel, failure]);
  });
});

describe("submitForm", () => {
  it("keeps the buttons disabled while the owner works and re-enables them afterwards", async () => {
    const buttons = [document.createElement("button"), document.createElement("button")];
    const failure = renderFormFailureLine(document, PREFIX);
    const owner = deferred<boolean>();

    const submission = submitForm(buttons, failure, () => owner.promise);

    expect(buttons.map((button) => button.disabled)).toEqual([true, true]);
    owner.resolve(true);
    await expect(submission).resolves.toBe(true);
    expect(buttons.map((button) => button.disabled)).toEqual([false, false]);
    expect(failure.style.display).toBe("none");
  });

  it("says the item was not created when the owner refuses, and hides that on the next attempt", async () => {
    const buttons = [document.createElement("button")];
    const failure = renderFormFailureLine(document, PREFIX);

    await expect(submitForm(buttons, failure, () => Promise.resolve(false))).resolves.toBe(false);

    expect(failure.textContent).toBe(NOT_CREATED);
    expect(failure.style.display).toBe("inline");
    expect(buttons[0]?.disabled).toBe(false);

    const retry = deferred<boolean>();
    const second = submitForm(buttons, failure, () => retry.promise);
    expect(failure.style.display).toBe("none");
    retry.resolve(true);
    await second;
    expect(failure.style.display).toBe("none");
  });

  it("re-enables the buttons and passes the error on when the owner throws", async () => {
    const buttons = [document.createElement("button")];
    const failure = renderFormFailureLine(document, PREFIX);
    const problem = new Error("boom");

    await expect(submitForm(buttons, failure, () => Promise.reject(problem))).rejects.toBe(problem);

    expect(buttons[0]?.disabled).toBe(false);
  });
});

/** A submit/cancel pair bound to a problem the test controls. */
function boundForm(run: () => Promise<boolean>) {
  const submit = renderFormButton(document, PREFIX, "Add", true);
  const cancel = renderFormButton(document, PREFIX, "Cancel", false);
  const failure = renderFormFailureLine(document, PREFIX);
  const state = { problem: "Provide a title." as string | null };
  const onCancel = vi.fn();
  const binding = bindFormSubmission({
    submit,
    cancel,
    failure,
    problem: () => state.problem,
    run,
    onCancel,
  });
  return { submit, cancel, failure, state, onCancel, binding };
}

describe("bindFormSubmission — readiness", () => {
  it("disables submit with the problem as its tooltip until refresh finds none", () => {
    const form = boundForm(() => Promise.resolve(true));

    expect(form.submit.disabled).toBe(true);
    expect(form.submit.title).toBe("Provide a title.");

    form.state.problem = null;
    form.binding.refresh();

    expect(form.submit.disabled).toBe(false);
    expect(form.submit.title).toBe("");

    form.state.problem = "Provide the ClientId.";
    form.binding.refresh();

    expect(form.submit.disabled).toBe(true);
    expect(form.submit.title).toBe("Provide the ClientId.");
  });

  it("calls onCancel when cancel is clicked", () => {
    const form = boundForm(() => Promise.resolve(true));

    form.cancel.click();

    expect(form.onCancel).toHaveBeenCalledTimes(1);
  });
});

describe("bindFormSubmission — in flight", () => {
  it("keeps submit disabled while a submission is in flight, even when a field refreshes", async () => {
    const owner = deferred<boolean>();
    const run = vi.fn(() => owner.promise);
    const form = boundForm(run);
    form.state.problem = null;
    form.binding.refresh();

    form.submit.click();
    form.binding.refresh();

    expect(run).toHaveBeenCalledTimes(1);
    expect(form.submit.disabled).toBe(true);
    expect(form.cancel.disabled).toBe(true);

    owner.resolve(true);
    await settle();

    expect(form.submit.disabled).toBe(false);
    expect(form.cancel.disabled).toBe(false);
  });

  it("re-evaluates the problem once a refused submission returns, showing the failure line", async () => {
    const form = boundForm(() => Promise.resolve(false));
    form.state.problem = null;
    form.binding.refresh();

    form.submit.click();
    form.state.problem = "Provide a title.";
    await settle();

    expect(form.failure.textContent).toBe(NOT_CREATED);
    expect(form.submit.disabled).toBe(true);
    expect(form.submit.title).toBe("Provide a title.");
  });
});

describe("renderFormRemoveButton", () => {
  it("is a named × that removes its entry when clicked", () => {
    const onRemove = vi.fn();

    const button = renderFormRemoveButton(document, {
      className: "test-form__detail-remove",
      label: "Remove this detail",
      onRemove,
    });
    button.click();

    expect(button.type).toBe("button");
    expect(button.className).toBe("test-form__detail-remove");
    expect(button.textContent).toBe("\u00d7");
    expect(button.title).toBe("Remove this detail");
    expect(button.getAttribute("aria-label")).toBe("Remove this detail");
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
