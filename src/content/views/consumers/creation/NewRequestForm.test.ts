import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { IAttachmentUploader } from "../../../../common/ado/IAttachmentUploader";

import {
  renderNewRequestForm,
  REQUEST_TITLE_HELP,
  TARGET_DATE_HELP,
  type NewRequestValues,
} from "./NewRequestForm";

const PREFIX = "awesomeado-new-request";

function type(input: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input"));
}

function element<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (found === null) throw new Error(`Nothing matches ${selector}`);
  return found;
}

interface FormOptions {
  targetDateUnavailable?: string | null;
  onSubmit?: (values: NewRequestValues) => Promise<boolean>;
}

/** The form mounted in the document, with its controls found by class. */
function form(options: FormOptions = {}) {
  const submit = vi.fn(options.onSubmit ?? (async () => true));
  const onCancel = vi.fn();
  const uploader: IAttachmentUploader = {
    upload: vi.fn(async () => ({ ok: false, error: "not in tests" })),
    discard: vi.fn(async () => true),
  };
  const root = renderNewRequestForm({
    doc: document,
    userDirectory: { search: async () => [], resolve: async () => null },
    attachmentUploader: uploader,
    logger: { info: vi.fn(), error: vi.fn() },
    targetDateUnavailable: options.targetDateUnavailable ?? null,
    onSubmit: submit,
    onCancel,
  });
  document.body.append(root);
  return {
    root,
    submit,
    onCancel,
    uploader,
    title: element<HTMLInputElement>(root, `.${PREFIX}__title`),
    description: element<HTMLTextAreaElement>(root, `.${PREFIX}__description`),
    targetDate: element<HTMLInputElement>(root, `.${PREFIX}__target-date`),
    add: element<HTMLButtonElement>(root, `.${PREFIX}__add`),
    cancel: element<HTMLButtonElement>(root, `.${PREFIX}__cancel`),
    failure: element<HTMLElement>(root, `.${PREFIX}__error`),
  };
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("renderNewRequestForm — layout", () => {
  it("shows the guidance for the title and the target date in the fields themselves", () => {
    const view = form();

    expect(view.root.querySelector(`.${PREFIX}__help`)).toBeNull();
    expect(view.title.placeholder).toBe(REQUEST_TITLE_HELP);
    expect(view.title.title).toBe(REQUEST_TITLE_HELP);
    // A date box has no ghost text, so its guidance is the tooltip.
    expect(view.targetDate.title).toBe(TARGET_DATE_HELP);
    expect(view.description.getAttribute("aria-label")).toBe("Description");
  });

  it("focuses the title once mounted", async () => {
    const view = form();
    await settle();

    expect(document.activeElement).toBe(view.title);
  });

  it("offers the target date when the request type can store one", () => {
    const view = form();

    expect(view.targetDate.type).toBe("date");
    expect(view.targetDate.disabled).toBe(false);
    expect(view.targetDate.title).toBe(TARGET_DATE_HELP);
  });

  it("disables the target date, saying why, when the request type cannot store one", () => {
    const view = form({ targetDateUnavailable: "Request has no ETA field configured." });

    expect(view.targetDate.disabled).toBe(true);
    expect(view.targetDate.title).toBe("Request has no ETA field configured.");
  });
});

describe("renderNewRequestForm — submitting", () => {
  it("keeps Add disabled, saying why, until a title is typed", () => {
    const view = form();
    expect(view.add.disabled).toBe(true);
    expect(view.add.title).toBe("Provide a title.");

    type(view.title, "   ");
    expect(view.add.disabled).toBe(true);

    type(view.title, "Raise the quota");
    expect(view.add.disabled).toBe(false);
    expect(view.add.title).toBe("");
  });

  it("hands the trimmed title, the description and the picked date to the owner", async () => {
    const view = form();
    type(view.title, "  Raise the quota ");
    type(view.description, "We need **more**.");
    view.targetDate.value = "2026-11-01";

    view.add.click();
    await settle();

    expect(view.submit).toHaveBeenCalledWith({
      title: "Raise the quota",
      description: "We need **more**.",
      targetDate: "2026-11-01",
    });
  });

  it("hands a null date to the owner when none was picked", async () => {
    const view = form();
    type(view.title, "Raise the quota");

    view.add.click();
    await settle();

    expect(view.submit).toHaveBeenCalledWith({
      title: "Raise the quota",
      description: "",
      targetDate: null,
    });
  });

  it("keeps the form and says so when the owner could not create the request", async () => {
    const view = form({ onSubmit: async () => false });
    type(view.title, "Raise the quota");

    view.add.click();
    await settle();

    expect(view.failure.style.display).toBe("inline");
    expect(view.title.value).toBe("Raise the quota");
    expect(view.add.disabled).toBe(false);
  });

  it("calls onCancel when Cancel is clicked, without creating anything", () => {
    const view = form();

    view.cancel.click();

    expect(view.onCancel).toHaveBeenCalledTimes(1);
    expect(view.submit).not.toHaveBeenCalled();
    expect(view.uploader.discard).not.toHaveBeenCalled();
  });
});

/** Paste one PNG into the field the way a browser would; jsdom has no real clipboard. */
function pastePng(field: HTMLElement): void {
  const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: () => "",
      items: [{ kind: "file", type: file.type, getAsFile: () => file }],
    },
  });
  field.dispatchEvent(event);
}

describe("renderNewRequestForm — pasted images", () => {
  it("holds Add back while a pasted image uploads, and discards it when cancelled", async () => {
    let finishUpload: (result: { ok: boolean; url: string; id: string }) => void = () => {};
    const view = form();
    vi.mocked(view.uploader.upload).mockImplementation(
      () =>
        new Promise((resolve) => {
          finishUpload = resolve;
        }),
    );
    type(view.title, "Raise the quota");

    pastePng(view.description);
    expect(view.add.disabled).toBe(true);
    expect(view.add.title).toBe("Wait for the pasted image to finish uploading.");

    finishUpload({ ok: true, url: "https://dev.azure.com/a/shot.png", id: "att-1" });
    await settle();
    expect(view.add.disabled).toBe(false);

    view.cancel.click();
    expect(view.uploader.discard).toHaveBeenCalledWith("att-1");
    expect(view.onCancel).toHaveBeenCalledTimes(1);
  });
});
