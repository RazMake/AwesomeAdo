import { describe, expect, it, vi } from "vitest";

import type { AttachmentUploadResult } from "../../../ado/IAttachmentUploader";

import { renderMarkdownField } from "./MarkdownField";
import { IMAGE_NOT_UPLOADED } from "./PastedImages";
import { renderTextEditor } from "./TextEditor";

const IMAGE_URL = "https://dev.azure.com/org/proj/_apis/wit/attachments/a1";
const ATTACHMENT_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

/** An upload a test settles by hand, so the in-flight state is observable without timers. */
function pendingUpload(): {
  promise: Promise<AttachmentUploadResult>;
  settle: (result: AttachmentUploadResult) => void;
} {
  let settle!: (result: AttachmentUploadResult) => void;
  const promise = new Promise<AttachmentUploadResult>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

/** Let the upload's continuation run. */
async function flush(): Promise<void> {
  for (let tick = 0; tick < 5; tick += 1) {
    await Promise.resolve();
  }
}

/** A clipboard item standing in for one the browser hands a paste event. */
function clipboardItem(file: File): DataTransferItem {
  return { kind: "file", type: file.type, getAsFile: () => file } as unknown as DataTransferItem;
}

/** Dispatch a paste carrying `files` and, optionally, plain text; jsdom has no real clipboard. */
function pasteFiles(field: HTMLElement, files: File[], text = ""): Event {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: {
      getData: (format: string) => (format === "text/plain" ? text : ""),
      items: files.map(clipboardItem),
    },
  });
  field.dispatchEvent(event);
  return event;
}

function png(name = "image.png"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
}

/** A Markdown field over a recording uploader whose uploads the test settles one by one. */
function openField(options: { singleLine?: boolean; withImages?: boolean } = {}) {
  const uploads: Array<ReturnType<typeof pendingUpload>> = [];
  const upload = vi.fn(() => {
    const next = pendingUpload();
    uploads.push(next);
    return next.promise;
  });
  const discard = vi.fn(() => Promise.resolve(true));
  const logger = { info: vi.fn(), error: vi.fn() };
  const onInput = vi.fn();
  const handle = renderMarkdownField(document, {
    initialText: "Before ",
    singleLine: options.singleLine,
    images: options.withImages === false ? undefined : { uploader: { upload, discard }, logger },
    onInput,
  });
  document.body.append(handle.element);
  const input = handle.input as HTMLTextAreaElement;
  input.setSelectionRange(input.value.length, input.value.length);
  const status = (): HTMLElement | null =>
    handle.element.querySelector<HTMLElement>(".awesomeado-markdown-field__image-status");
  return { handle, input, upload, uploads, discard, logger, onInput, status };
}

describe("renderMarkdownField — pasting an image", () => {
  it("holds the caret's place while the image uploads, then embeds it", async () => {
    const { handle, input, upload, uploads, onInput } = openField();

    const event = pasteFiles(input, [png("shot.png")]);

    expect(event.defaultPrevented).toBe(true);
    expect(input.value).toBe("Before ![Uploading image 1…]()");
    expect(handle.uploadingImages()).toBe(true);
    expect(upload).toHaveBeenCalledWith({ fileName: "shot.png", content: expect.any(File) });
    expect(onInput).toHaveBeenCalledTimes(1);

    uploads[0]!.settle({ ok: true, url: IMAGE_URL });
    await flush();

    expect(input.value).toBe(`Before ![shot.png](${IMAGE_URL})`);
    expect(handle.storedText()).toBe(`Before ![shot.png](${IMAGE_URL})`);
    expect(handle.uploadingImages()).toBe(false);
    expect(onInput).toHaveBeenCalledTimes(2);
  });

  it("keeps the author's caret where it was while they kept typing", async () => {
    const { input, uploads } = openField();
    pasteFiles(input, [png()]);
    input.setRangeText(" after", input.value.length, input.value.length, "end");

    uploads[0]!.settle({ ok: true, url: IMAGE_URL });
    await flush();

    expect(input.value).toBe(`Before ![image.png](${IMAGE_URL}) after`);
    expect(input.selectionStart).toBe(input.value.length);
  });

  it("gives every pasted image its own placeholder and embeds each one", async () => {
    const { input, uploads, handle } = openField();

    pasteFiles(input, [png("a.png"), png("b.png")]);
    expect(input.value).toBe("Before ![Uploading image 1…]()\n![Uploading image 2…]()");

    uploads[1]!.settle({ ok: true, url: `${IMAGE_URL}b` });
    await flush();
    expect(handle.uploadingImages()).toBe(true);
    uploads[0]!.settle({ ok: true, url: `${IMAGE_URL}a` });
    await flush();

    expect(input.value).toBe(`Before ![a.png](${IMAGE_URL}a)\n![b.png](${IMAGE_URL}b)`);
    expect(handle.uploadingImages()).toBe(false);
  });
});

describe("renderMarkdownField — a pasted image that does not land", () => {
  it("removes the placeholder and says why when the upload is refused", async () => {
    const { input, uploads, status, handle } = openField();
    pasteFiles(input, [png()]);

    uploads[0]!.settle({ ok: false, error: "HTTP 413" });
    await flush();

    expect(input.value).toBe("Before ");
    expect(handle.uploadingImages()).toBe(false);
    expect(status()?.hidden).toBe(false);
    expect(status()?.textContent).toBe(`${IMAGE_NOT_UPLOADED}: HTTP 413.`);

    pasteFiles(input, [png()]);
    expect(status()?.hidden).toBe(true);
  });

  it("names an unexplained refusal rather than leaving the reason blank", async () => {
    const { input, uploads, status } = openField();
    pasteFiles(input, [png()]);

    uploads[0]!.settle({ ok: true });
    await flush();

    expect(input.value).toBe("Before ");
    expect(status()?.textContent).toBe(`${IMAGE_NOT_UPLOADED}: unknown error.`);
  });

  it("logs an uploader that throws and reports it like any other failure", async () => {
    const thrown = new Error("boom");
    const logger = { info: vi.fn(), error: vi.fn() };
    const handle = renderMarkdownField(document, {
      initialText: "",
      images: {
        uploader: { upload: () => Promise.reject(thrown), discard: vi.fn() },
        logger,
      },
    });

    pasteFiles(handle.input, [png()]);
    await flush();

    expect(handle.input.value).toBe("");
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("3 bytes"), thrown);
    expect(handle.element.textContent).toBe(
      `${IMAGE_NOT_UPLOADED}: the upload failed unexpectedly.`,
    );
  });

  it("removes an image whose placeholder the author deleted while it uploaded", async () => {
    const { input, uploads, discard, logger } = openField();
    pasteFiles(input, [png()]);
    input.value = "Rewritten";

    uploads[0]!.settle({ ok: true, url: IMAGE_URL, id: ATTACHMENT_ID });
    await flush();

    expect(input.value).toBe("Rewritten");
    expect(discard).toHaveBeenCalledWith(ATTACHMENT_ID);
    expect(logger.info).not.toHaveBeenCalled();
  });
});

describe("renderMarkdownField — naming a pasted image", () => {
  it.each([
    ["a nameless PNG", new File(["x"], "", { type: "image/png" }), "image.png"],
    ["a nameless JPEG", new File(["x"], "", { type: "image/jpeg" }), "image.jpg"],
    ["an unlisted type", new File(["x"], "", { type: "image/x-icon" }), "image.xicon"],
    ["a type with no subtype", new File(["x"], "", { type: "image/" }), "image"],
    [
      "brackets in the name",
      new File(["x"], "my [shot]!.png", { type: "image/png" }),
      "my _shot__.png",
    ],
    [
      "an overlong name",
      new File(["x"], `${"a".repeat(300)}.png`, { type: "image/png" }),
      "a".repeat(255),
    ],
  ])("names %s", (_case, file, expected) => {
    const { input, upload } = openField();

    pasteFiles(input, [file]);

    expect(upload).toHaveBeenCalledWith({ fileName: expected, content: file });
  });
});

describe("renderMarkdownField — pastes that are not images", () => {
  it("leaves a paste that also carries text to the browser", () => {
    const { input, upload } = openField();

    const event = pasteFiles(input, [png()], "Cell A1");

    expect(event.defaultPrevented).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it("leaves a pasted file that is not an image to the browser", () => {
    const { input, upload } = openField();
    const pdf = new File(["x"], "spec.pdf", { type: "application/pdf" });

    const event = pasteFiles(input, [pdf]);

    expect(event.defaultPrevented).toBe(false);
    expect(upload).not.toHaveBeenCalled();
  });

  it("still turns a pasted link into Markdown when images are enabled", () => {
    const { input } = openField();

    pasteFiles(input, [], "https://example.com/doc");

    expect(input.value).toBe("Before [](https://example.com/doc)");
  });

  it("offers nothing to a field whose owner gave no uploader", () => {
    const { handle, input } = openField({ withImages: false });

    const event = pasteFiles(input, [png()]);

    expect(event.defaultPrevented).toBe(false);
    expect(handle.uploadingImages()).toBe(false);
    expect(handle.element).toBe(input.parentElement);
  });

  it("offers nothing to a one-line field", () => {
    const { handle, input, upload } = openField({ singleLine: true });

    pasteFiles(input, [png()]);

    expect(upload).not.toHaveBeenCalled();
    expect(handle.element.querySelector(".awesomeado-markdown-field__image-status")).toBeNull();
  });
});

describe("renderTextEditor — saving around a pasted image", () => {
  it("holds Save, and Ctrl+Enter, until every pasted image is in", async () => {
    const upload = pendingUpload();
    const onSubmit = vi.fn(() => Promise.resolve(true));
    const root = renderTextEditor(document, {
      initialText: "Notes ",
      submitLabel: "Save",
      images: {
        uploader: { upload: () => upload.promise, discard: vi.fn() },
        logger: { info: vi.fn(), error: vi.fn() },
      },
      onSubmit,
      onCancel: vi.fn(),
    });
    const input = root.querySelector<HTMLTextAreaElement>("textarea")!;
    const save = root.querySelector<HTMLButtonElement>("button")!;
    input.setSelectionRange(input.value.length, input.value.length);

    pasteFiles(input, [png()]);
    expect(save.disabled).toBe(true);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true }));
    expect(onSubmit).not.toHaveBeenCalled();

    upload.settle({ ok: true, url: IMAGE_URL });
    await flush();
    expect(save.disabled).toBe(false);
    save.click();

    expect(onSubmit).toHaveBeenCalledWith(`Notes ![image.png](${IMAGE_URL})`);
  });
});

/** A mounted editor whose one pasted image has already landed, so it owns one upload. */
async function editorWithLandedImage(
  onSubmit: () => Promise<boolean> = () => Promise.resolve(true),
) {
  const upload = pendingUpload();
  const discard = vi.fn(() => Promise.resolve(true));
  const logger = { info: vi.fn(), error: vi.fn() };
  const onCancel = vi.fn();
  const root = renderTextEditor(document, {
    initialText: "Notes ",
    submitLabel: "Save",
    images: { uploader: { upload: () => upload.promise, discard }, logger },
    onSubmit: vi.fn(onSubmit),
    onCancel,
  });
  document.body.append(root);
  const input = root.querySelector<HTMLTextAreaElement>("textarea")!;
  const [save, cancel] = [...root.querySelectorAll<HTMLButtonElement>("button")];
  input.setSelectionRange(input.value.length, input.value.length);
  pasteFiles(input, [png()]);
  upload.settle({ ok: true, url: IMAGE_URL, id: ATTACHMENT_ID });
  await flush();
  const escape = (): boolean =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", cancelable: true }));
  return { root, input, save: save!, cancel: cancel!, discard, logger, onCancel, escape };
}

/** A save the test settles by hand, to observe what happens while it is in flight. */
function pendingSave(): { promise: Promise<boolean>; settle: (saved: boolean) => void } {
  let settle!: (saved: boolean) => void;
  const promise = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

describe("renderTextEditor — cleaning up images of an abandoned edit", () => {
  it("removes the uploaded image when the edit is cancelled", async () => {
    const editor = await editorWithLandedImage();

    editor.cancel.click();
    await flush();

    expect(editor.discard).toHaveBeenCalledExactlyOnceWith(ATTACHMENT_ID);
    expect(editor.onCancel).toHaveBeenCalledTimes(1);
    expect(editor.logger.error).not.toHaveBeenCalled();
  });

  it("removes the uploaded image when Esc cancels the edit", async () => {
    const editor = await editorWithLandedImage();

    editor.escape();

    expect(editor.discard).toHaveBeenCalledWith(ATTACHMENT_ID);
    expect(editor.onCancel).toHaveBeenCalledTimes(1);
  });

  it("removes the uploaded image when the editor leaves the page without a save", async () => {
    const editor = await editorWithLandedImage();

    editor.root.remove();
    await flush();

    expect(editor.discard).toHaveBeenCalledExactlyOnceWith(ATTACHMENT_ID);
  });

  it("removes an image only once however the edit is abandoned", async () => {
    const editor = await editorWithLandedImage();

    editor.cancel.click();
    editor.root.remove();
    await flush();
    editor.escape();

    expect(editor.discard).toHaveBeenCalledTimes(1);
  });

  it("removes an image that lands after the edit was cancelled", async () => {
    const upload = pendingUpload();
    const discard = vi.fn(() => Promise.resolve(true));
    const root = renderTextEditor(document, {
      initialText: "",
      submitLabel: "Save",
      images: {
        uploader: { upload: () => upload.promise, discard },
        logger: { info: vi.fn(), error: vi.fn() },
      },
      onSubmit: vi.fn(() => Promise.resolve(true)),
      onCancel: () => root.remove(),
    });
    document.body.append(root);
    pasteFiles(root.querySelector("textarea")!, [png()]);

    root.querySelectorAll("button")[1]!.click();
    expect(discard).not.toHaveBeenCalled();
    upload.settle({ ok: true, url: IMAGE_URL, id: ATTACHMENT_ID });
    await flush();

    expect(discard).toHaveBeenCalledExactlyOnceWith(ATTACHMENT_ID);
  });
});

describe("renderTextEditor — keeping images a save put to use", () => {
  it("keeps the image when the save succeeds, even though the editor then unmounts", async () => {
    const editor = await editorWithLandedImage(() => {
      editor.root.remove();
      return Promise.resolve(true);
    });

    editor.save.click();
    await flush();

    expect(editor.discard).not.toHaveBeenCalled();
  });

  it("still owns the image after a failed save, so a later cancel removes it", async () => {
    const editor = await editorWithLandedImage(() => Promise.resolve(false));

    editor.save.click();
    await flush();
    expect(editor.discard).not.toHaveBeenCalled();

    editor.cancel.click();
    expect(editor.discard).toHaveBeenCalledWith(ATTACHMENT_ID);
  });

  it("lets an in-flight save decide an Esc pressed meanwhile: a success keeps the image", async () => {
    const save = pendingSave();
    const editor = await editorWithLandedImage(() => save.promise);

    editor.save.click();
    editor.escape();
    save.settle(true);
    await flush();

    expect(editor.discard).not.toHaveBeenCalled();
  });

  it("removes the image once a save in flight when the editor unmounted then fails", async () => {
    const save = pendingSave();
    const editor = await editorWithLandedImage(() => save.promise);

    editor.save.click();
    editor.root.remove();
    await flush();
    expect(editor.discard).not.toHaveBeenCalled();
    save.settle(false);
    await flush();

    expect(editor.discard).toHaveBeenCalledWith(ATTACHMENT_ID);
  });

  it("logs a save that throws and treats it as not saved", async () => {
    const thrown = new Error("boom");
    const { handle, input, uploads, discard, logger } = openField();
    pasteFiles(input, [png()]);
    uploads[0]!.settle({ ok: true, url: IMAGE_URL, id: ATTACHMENT_ID });
    await flush();

    handle.trackSave(Promise.reject(thrown));
    handle.element.remove();
    await flush();

    expect(logger.error).toHaveBeenCalledWith("Saving a value with pasted images failed", thrown);
    expect(discard).toHaveBeenCalledWith(ATTACHMENT_ID);
  });
});

describe("renderMarkdownField — a clean-up that cannot be done", () => {
  it("logs an uploader whose clean-up throws", async () => {
    const thrown = new Error("gone");
    const { handle, input, uploads, discard, logger } = openField();
    discard.mockImplementation(() => Promise.reject(thrown));
    pasteFiles(input, [png()]);
    uploads[0]!.settle({ ok: true, url: IMAGE_URL, id: ATTACHMENT_ID });
    await flush();

    handle.discardImages();
    await flush();

    expect(logger.error).toHaveBeenCalledWith(
      `Could not clean up an unsaved pasted image ${ATTACHMENT_ID}`,
      thrown,
    );
  });

  it("logs an image that cannot be removed because it came back without an id", async () => {
    const { handle, input, uploads, discard, logger } = openField();
    pasteFiles(input, [png()]);
    uploads[0]!.settle({ ok: true, url: IMAGE_URL });
    await flush();

    handle.discardImages();

    expect(discard).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("no attachment id"));
  });

  it("does nothing for a field that offers no images", () => {
    const { handle } = openField({ withImages: false });

    expect(() => {
      handle.trackSave(Promise.resolve(true));
      handle.discardImages();
    }).not.toThrow();
  });
});
