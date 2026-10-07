import {
  MAX_ATTACHMENT_UPLOAD_BYTES,
  type AttachmentUploadRequest,
  type AttachmentUploadResult,
  type IAttachmentUploader,
} from "../ado/IAttachmentUploader";
import { parseUploadedAttachmentId, parseUploadedAttachmentUrl } from "../ado/adoAttachment";
import type { ILogger } from "../logging/ILogger";

import {
  DISCARD_ATTACHMENT_MESSAGE,
  UPLOAD_ATTACHMENT_MESSAGE,
  type DiscardAttachmentMessage,
  type DiscardAttachmentResponse,
  type UploadAttachmentMessage,
  type UploadAttachmentResponse,
} from "./AttachmentUploadRequest";

/** Sends an upload request and resolves the background worker's reply, if any. */
export type SendAttachmentUploadRequest = (
  message: UploadAttachmentMessage,
) => Promise<UploadAttachmentResponse | undefined>;

/** Sends a discard request and resolves the background worker's reply, if any. */
export type SendAttachmentDiscardRequest = (
  message: DiscardAttachmentMessage,
) => Promise<DiscardAttachmentResponse | undefined>;

/**
 * How many bytes are turned into characters per `String.fromCharCode` call.
 *
 * Bounded because the call spreads its arguments onto the stack: a multi-megabyte screenshot in one
 * call overflows it.
 */
const ENCODE_CHUNK_BYTES = 0x8000;

/**
 * Uploads attachments by messaging the background service worker.
 *
 * A content script cannot reach the credentialed Azure DevOps REST API itself (see
 * `AttachmentUploadRequest`), so this encodes the bytes, hands them to the worker, and turns ADO's
 * reply into the URL an editor embeds. Both senders are injected so this class never touches
 * `chrome.runtime` (Dependency Inversion). It never throws, and never logs a file's content.
 */
export class MessagingAttachmentUploader implements IAttachmentUploader {
  constructor(
    private readonly send: SendAttachmentUploadRequest,
    private readonly sendDiscard: SendAttachmentDiscardRequest,
    private readonly logger: ILogger,
  ) {}

  async upload(request: AttachmentUploadRequest): Promise<AttachmentUploadResult> {
    const size = request.content.size;
    if (size > MAX_ATTACHMENT_UPLOAD_BYTES) {
      const error = `the file is ${size} bytes, larger than the ${MAX_ATTACHMENT_UPLOAD_BYTES} allowed`;
      this.logger.error(`Attachment upload refused: ${error}.`);
      return { ok: false, error };
    }
    try {
      const contentBase64 = await encodeBase64(request.content);
      const response = await this.send({
        type: UPLOAD_ATTACHMENT_MESSAGE,
        fileName: request.fileName,
        contentBase64,
      });
      return this.interpret(response, request.fileName, size);
    } catch (error) {
      this.logger.error(`Could not upload a ${size}-byte attachment`, error);
      return { ok: false, error: "could not reach Azure DevOps" };
    }
  }

  private interpret(
    response: UploadAttachmentResponse | undefined,
    fileName: string,
    size: number,
  ): AttachmentUploadResult {
    if (response === undefined || response === null) {
      // No listener claimed the message: the worker runs older code than this page, or never started.
      const error =
        "the background worker did not handle the request — it is running older code than this " +
        "page (reload the ADO tab) or failed to start (check the extension's service worker)";
      this.logger.error(`Attachment upload (${size} bytes): ${error}.`);
      return { ok: false, error };
    }
    if (!response.ok) {
      const error = response.error ?? "unknown error";
      this.logger.error(`Attachment upload (${size} bytes) failed: ${error}.`);
      return { ok: false, error };
    }
    const url = parseUploadedAttachmentUrl(response.raw, fileName);
    if (url === null) {
      // Stored, but with nothing to embed — reported as a failure because the editor cannot use it.
      const error = "Azure DevOps stored the attachment but returned no usable URL";
      this.logger.error(`Attachment upload (${size} bytes): ${error}.`);
      return { ok: false, error };
    }
    this.logger.info(`Attachment upload (${size} bytes) stored by Azure DevOps.`);
    const id = parseUploadedAttachmentId(response.raw);
    return id === null ? { ok: true, url } : { ok: true, url, id };
  }

  // Only a failure is logged: a successful clean-up is the expected, silent end of an abandoned edit.
  async discard(attachmentId: string): Promise<boolean> {
    try {
      const response = await this.sendDiscard({
        type: DISCARD_ATTACHMENT_MESSAGE,
        attachmentId,
      });
      if (response?.ok === true) {
        return true;
      }
      const error = response?.error ?? "the background worker did not handle the request";
      this.logger.error(`Could not clean up an unsaved pasted image ${attachmentId}: ${error}.`);
    } catch (error) {
      this.logger.error(`Could not clean up an unsaved pasted image ${attachmentId}`, error);
    }
    return false;
  }
}

/** The blob's bytes as base64 — the only shape the message bus and page injection can carry. */
async function encodeBase64(content: Blob): Promise<string> {
  const bytes = new Uint8Array(await content.arrayBuffer());
  let binary = "";
  for (let start = 0; start < bytes.length; start += ENCODE_CHUNK_BYTES) {
    binary += String.fromCharCode(...bytes.subarray(start, start + ENCODE_CHUNK_BYTES));
  }
  return btoa(binary);
}
