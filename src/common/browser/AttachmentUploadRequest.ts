/**
 * The content→background message contract for uploading a work item attachment.
 *
 * Same trust boundary as every other credentialed operation (see `tabRequestListener`): the content
 * script names WHAT to store — a file name and its bytes — and the worker builds WHERE it goes from
 * the sender's own tab URL. The bytes travel as base64 because both the message bus and
 * `chrome.scripting.executeScript` arguments must be JSON-serializable, and a `Blob` is not.
 */

import {
  MAX_ATTACHMENT_FILE_NAME_LENGTH,
  MAX_ATTACHMENT_UPLOAD_BYTES,
} from "../ado/IAttachmentUploader";
import { ATTACHMENT_ID } from "../ado/adoAttachment";

export const UPLOAD_ATTACHMENT_MESSAGE = "awesomeado:upload-attachment";

export interface UploadAttachmentMessage {
  type: typeof UPLOAD_ATTACHMENT_MESSAGE;
  fileName: string;
  /** The file's bytes, base64-encoded. */
  contentBase64: string;
}

export interface UploadAttachmentResponse {
  ok: boolean;
  /** ADO's answer to the upload (`{ id, url }`), parsed on the content side. */
  raw?: unknown;
  error?: string;
}

/** What the worker hands the MAIN-world upload: the URL it built, plus the bytes to send there. */
export interface UploadAttachmentConfig {
  url: string;
  contentBase64: string;
}

/** The longest base64 text `MAX_ATTACHMENT_UPLOAD_BYTES` encodes to (4 characters per 3 bytes). */
const MAX_BASE64_LENGTH = Math.ceil(MAX_ATTACHMENT_UPLOAD_BYTES / 3) * 4;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Why `value` is not a usable upload request, or null when it is one.
 *
 * A reason rather than a boolean for the same reason every request contract here carries one: the
 * worker answers a malformed message with what was wrong instead of leaving the sender to read
 * silence as "no handler". Reasons name sizes, never the file's content.
 */
export function uploadAttachmentMessageProblem(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return "message is not an object";
  }
  const candidate = value as Partial<UploadAttachmentMessage>;
  if (candidate.type !== UPLOAD_ATTACHMENT_MESSAGE) {
    return `type is "${String(candidate.type)}", expected "${UPLOAD_ATTACHMENT_MESSAGE}"`;
  }
  if (typeof candidate.fileName !== "string" || candidate.fileName.trim().length === 0) {
    return "fileName is missing or blank";
  }
  if (candidate.fileName.length > MAX_ATTACHMENT_FILE_NAME_LENGTH) {
    return (
      `fileName is ${candidate.fileName.length} characters, longer than the ` +
      `${MAX_ATTACHMENT_FILE_NAME_LENGTH} allowed`
    );
  }
  return contentProblem(candidate.contentBase64);
}

function contentProblem(content: unknown): string | null {
  if (typeof content !== "string" || content.length === 0) {
    return "contentBase64 is missing or empty";
  }
  if (content.length > MAX_BASE64_LENGTH) {
    return `contentBase64 is ${content.length} characters, longer than the ${MAX_BASE64_LENGTH} allowed`;
  }
  return BASE64.test(content) ? null : "contentBase64 is not base64";
}

export const DISCARD_ATTACHMENT_MESSAGE = "awesomeado:discard-attachment";

/**
 * Remove an upload no saved value embeds. Carries only the id: the worker builds the URL from the
 * sender's tab, so the content side can never point a permanent delete anywhere else.
 */
export interface DiscardAttachmentMessage {
  type: typeof DISCARD_ATTACHMENT_MESSAGE;
  attachmentId: string;
}

export interface DiscardAttachmentResponse {
  ok: boolean;
  error?: string;
}

/** Why `value` is not a usable discard request, or null when it is one. */
export function discardAttachmentMessageProblem(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return "message is not an object";
  }
  const candidate = value as Partial<DiscardAttachmentMessage>;
  if (candidate.type !== DISCARD_ATTACHMENT_MESSAGE) {
    return `type is "${String(candidate.type)}", expected "${DISCARD_ATTACHMENT_MESSAGE}"`;
  }
  return typeof candidate.attachmentId === "string" && ATTACHMENT_ID.test(candidate.attachmentId)
    ? null
    : "attachmentId is not an attachment GUID";
}
