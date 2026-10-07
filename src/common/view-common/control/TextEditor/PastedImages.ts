import {
  MAX_ATTACHMENT_FILE_NAME_LENGTH,
  type AttachmentUploadResult,
  type IAttachmentUploader,
} from "../../../ado/IAttachmentUploader";
import type { ILogger } from "../../../logging/ILogger";

/** Enables pasting images: where they are stored, and where a failed upload is reported. */
export interface TextEditorImageOptions {
  uploader: IAttachmentUploader;
  logger: ILogger;
}

/** The part of image pasting the field's own events drive. */
export interface PastedImages {
  /** Take over a paste that carries images; false leaves the paste to the field's other handling. */
  handlePaste(event: ClipboardEvent): boolean;
  /** Whether any pasted image is still on its way to Azure DevOps. */
  uploading(): boolean;
  /**
   * The value is being saved. Resolving true keeps every image uploaded so far; false keeps them
   * only while the field is still on the page to be saved again.
   */
  trackSave(save: Promise<boolean>): void;
  /** The edit was abandoned: remove every image it uploaded, including any still uploading. */
  discard(): void;
}

/** What the field's status line says when an image could not be stored. */
export const IMAGE_NOT_UPLOADED = "Image not uploaded";

/** File extensions for the image types a clipboard commonly carries, by MIME type. */
const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
  "image/svg+xml": "svg",
};

/**
 * Store each pasted image in Azure DevOps and embed it, the way ADO's own editor treats a pasted
 * screenshot.
 *
 * The upload takes a moment, so the image is first held in the text by a placeholder at the caret
 * and swapped for its Markdown once ADO returns the attachment's URL. Typing carries on meanwhile:
 * the placeholder moves with the text around it, and one the author deleted is simply not refilled.
 * Owners read `uploading()` to keep a half-uploaded value from being saved with a placeholder in it.
 *
 * Uploading on paste means an abandoned edit would leave its images behind in Azure DevOps, so each
 * one is removed again (best effort) unless a save keeps it — see `createUploadLedger`.
 */
export function createPastedImages(
  input: HTMLTextAreaElement,
  status: HTMLElement,
  options: TextEditorImageOptions,
): PastedImages {
  let pending = 0;
  let nextPlaceholder = 0;
  const ledger = createUploadLedger(input, options);

  const store = async (file: File, placeholder: string): Promise<void> => {
    const fileName = imageFileName(file);
    const result = await uploadSafely(options, fileName, file);
    pending -= 1;
    const markdown = result.ok && result.url !== undefined ? `![${fileName}](${result.url})` : null;
    const embedded = replacePlaceholder(input, placeholder, markdown ?? "");
    if (markdown === null) {
      showStatus(status, `${IMAGE_NOT_UPLOADED}: ${result.error ?? "unknown error"}.`);
    } else {
      ledger.landed(result.id, embedded);
    }
    notifyChanged(input);
  };

  return {
    handlePaste(event) {
      const files = pastedImageFiles(event);
      if (files.length === 0) {
        return false;
      }
      event.preventDefault();
      showStatus(status, null);
      const placeholders = files.map(() => {
        nextPlaceholder += 1;
        return `![Uploading image ${nextPlaceholder}…]()`;
      });
      insertAtCaret(input, placeholders.join("\n"));
      pending += files.length;
      ledger.watch();
      notifyChanged(input);
      files.forEach((file, index) => void store(file, placeholders[index] as string));
      return true;
    },
    uploading: () => pending > 0,
    trackSave: (save) => ledger.trackSave(save),
    discard: () => ledger.abandon(),
  };
}

/** The uploads one field still owns, and the moment they stop being worth keeping. */
interface UploadLedger {
  /** Start noticing the field leaving the page; called once something has been pasted. */
  watch(): void;
  /** An upload finished: kept while the edit is live and embeds it, otherwise removed at once. */
  landed(id: string | undefined, embedded: boolean): void;
  trackSave(save: Promise<boolean>): void;
  /** The edit was abandoned; while a save is in flight, its result decides instead. */
  abandon(): void;
}

/**
 * Track which uploads an edit still owns and remove them when it is abandoned.
 *
 * Abandoning is not only Cancel: an outside click dismisses a menu panel, collapsing a list unmounts
 * its composer, a navigation replaces the whole view — none of which goes through the editor. So the
 * field's own removal from the page counts as abandoning it, unless a save is in flight: a successful
 * save typically unmounts the editor BEFORE it reports success, and those images are now in use.
 */
function createUploadLedger(
  input: HTMLTextAreaElement,
  options: TextEditorImageOptions,
): UploadLedger {
  let owned: Array<string | undefined> = [];
  let abandoned = false;
  let saving: Promise<boolean> | null = null;
  let abandonedWhileSaving = false;
  let watcher: MutationObserver | null = null;

  const stopWatching = (): void => {
    watcher?.disconnect();
    watcher = null;
  };
  const discardAll = (): void => {
    abandoned = true;
    stopWatching();
    const ids = owned;
    owned = [];
    ids.forEach((id) => discardSafely(options, id));
  };
  const abandon = (): void => {
    stopWatching();
    if (saving === null) discardAll();
    else abandonedWhileSaving = true;
  };
  const settle = (save: Promise<boolean>, saved: boolean): void => {
    if (saving === save) saving = null;
    if (saved) {
      owned = [];
      stopWatching();
    } else if (abandonedWhileSaving) {
      discardAll();
    }
  };

  return {
    watch() {
      if (watcher !== null || !input.isConnected) return;
      watcher = new MutationObserver(() => {
        if (!input.isConnected) abandon();
      });
      watcher.observe(input.ownerDocument.documentElement, { childList: true, subtree: true });
    },
    landed(id, embedded) {
      if (abandoned || !embedded) discardSafely(options, id);
      else owned.push(id);
    },
    trackSave(save) {
      saving = save;
      void save.then(
        (saved) => settle(save, saved),
        (error: unknown) => {
          options.logger.error("Saving a value with pasted images failed", error);
          settle(save, false);
        },
      );
    },
    abandon,
  };
}

/** Remove one unsaved upload; failures are logged by the uploader, or here when it cannot be tried. */
function discardSafely(options: TextEditorImageOptions, id: string | undefined): void {
  if (id === undefined) {
    options.logger.error("Could not clean up an unsaved pasted image: it has no attachment id.");
    return;
  }
  void options.uploader.discard(id).catch((error: unknown) => {
    options.logger.error(`Could not clean up an unsaved pasted image ${id}`, error);
  });
}

/** The status line a field reports failed uploads on, hidden until it has something to say. */
export function createImageStatus(doc: Document): HTMLElement {
  const status = doc.createElement("div");
  status.className = "awesomeado-markdown-field__image-status";
  status.setAttribute("role", "status");
  status.hidden = true;
  status.style.cssText = "font-size:11px;margin-top:2px;color:var(--status-error-text)";
  return status;
}

/** The upload's result, with a rejecting uploader turned into a logged failure like any other. */
async function uploadSafely(
  options: TextEditorImageOptions,
  fileName: string,
  file: File,
): Promise<AttachmentUploadResult> {
  try {
    return await options.uploader.upload({ fileName, content: file });
  } catch (error) {
    options.logger.error(`Pasted image upload (${file.size} bytes) failed unexpectedly`, error);
    return { ok: false, error: "the upload failed unexpectedly" };
  }
}

/**
 * The images a paste carries, or none when it also carries plain text.
 *
 * Office and many other apps put a picture of the copied content on the clipboard next to the text
 * itself; what the author meant to paste there is the text, so the paste is left to the browser.
 */
function pastedImageFiles(event: ClipboardEvent): File[] {
  const data = event.clipboardData;
  if (data === null || data.getData("text/plain").trim().length > 0) {
    return [];
  }
  return Array.from(data.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

/**
 * The name the image is filed under and described by.
 *
 * Reduced to plain characters because it is also the image's Markdown alt text, where a bracket
 * would end the description early. A screenshot often has no name at all, so its type supplies one.
 */
function imageFileName(file: File): string {
  const named = file.name.trim().replace(/[^\w.\- ]/g, "_");
  if (named.length > 0) {
    return named.slice(0, MAX_ATTACHMENT_FILE_NAME_LENGTH);
  }
  const extension =
    IMAGE_EXTENSIONS[file.type] ?? (file.type.split("/")[1] ?? "").replace(/\W/g, "");
  return extension.length > 0 ? `image.${extension}` : "image";
}

/** Insert `text` over the selection, leaving the caret after it. */
function insertAtCaret(input: HTMLTextAreaElement, text: string): void {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(text, start, end, "end");
}

/** Swap the placeholder for `text`, keeping the author's caret where it was relative to their text. */
function replacePlaceholder(
  input: HTMLTextAreaElement,
  placeholder: string,
  text: string,
): boolean {
  const start = input.value.indexOf(placeholder);
  if (start < 0) {
    return false;
  }
  input.setRangeText(text, start, start + placeholder.length, "preserve");
  return true;
}

/** Show `message` on the status line, or hide the line for null. */
function showStatus(status: HTMLElement, message: string | null): void {
  status.textContent = message ?? "";
  status.hidden = message === null;
}

/** Tell the field's listeners the text changed, as typing would: mentions repaint, owners re-check. */
function notifyChanged(input: HTMLTextAreaElement): void {
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
