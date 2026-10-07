/**
 * The largest file an upload accepts, in bytes.
 *
 * Far below Azure DevOps' own attachment limit on purpose: the bytes cross the extension's message
 * bus and the page-script injection as base64 (a third larger again), and both are bounded well
 * before ADO is. A screenshot is a fraction of this; a file this large was not meant to be pasted.
 */
export const MAX_ATTACHMENT_UPLOAD_BYTES = 20 * 1024 * 1024;

/** The longest file name an upload is filed under — Azure DevOps' own limit. */
export const MAX_ATTACHMENT_FILE_NAME_LENGTH = 255;

/** One file to store as a work item attachment. */
export interface AttachmentUploadRequest {
  /** The name Azure DevOps files the attachment under, and the image's alt text when embedded. */
  fileName: string;
  /** The file's bytes, exactly as the clipboard handed them over. */
  content: Blob;
}

/** How one upload ended. */
export interface AttachmentUploadResult {
  ok: boolean;
  /** The attachment's own URL — what Markdown embeds — when `ok` is true. */
  url?: string;
  /** The attachment's id when `ok` is true — what `discard` takes back if it is never saved. */
  id?: string;
  /** A short error description when `ok` is false. */
  error?: string;
}

/**
 * Stores files as Azure DevOps work item attachments, the way ADO's own editors store a pasted
 * screenshot before they embed it.
 *
 * Its own interface (Interface Segregation) rather than a method on the note or field writers: an
 * upload belongs to no work item yet — the item being created may not even exist — and an editor
 * that only needs to embed an image has no business depending on the ability to write a field.
 *
 * `discard` lives here rather than on an interface of its own because it is the other half of the
 * same lifecycle: whoever uploads a pasted image is the one who knows the edit was abandoned.
 */
export interface IAttachmentUploader {
  upload(request: AttachmentUploadRequest): Promise<AttachmentUploadResult>;
  /**
   * Best-effort removal of an attachment this uploader stored that no saved value embeds. Resolves
   * whether it was removed; never throws, and logs only a failure.
   */
  discard(attachmentId: string): Promise<boolean>;
}
