import { describe, expect, it, vi } from "vitest";

import { MAX_ATTACHMENT_UPLOAD_BYTES } from "../ado/IAttachmentUploader";

import {
  DISCARD_ATTACHMENT_MESSAGE,
  UPLOAD_ATTACHMENT_MESSAGE,
  type DiscardAttachmentMessage,
  type DiscardAttachmentResponse,
  type UploadAttachmentMessage,
  type UploadAttachmentResponse,
} from "./AttachmentUploadRequest";
import { MessagingAttachmentUploader } from "./MessagingAttachmentUploader";

const STORED = "https://dev.azure.com/contoso/0b1c/_apis/wit/attachments/a1";
const ATTACHMENT_GUID = "0f8fad5b-d9cb-469f-a165-70867728950e";

function createUploader(
  reply: () => Promise<UploadAttachmentResponse | undefined>,
  discardReply: () => Promise<DiscardAttachmentResponse | undefined> = () =>
    Promise.resolve({ ok: true }),
) {
  const send = vi.fn<
    (message: UploadAttachmentMessage) => Promise<UploadAttachmentResponse | undefined>
  >(() => reply());
  const sendDiscard = vi.fn<
    (message: DiscardAttachmentMessage) => Promise<DiscardAttachmentResponse | undefined>
  >(() => discardReply());
  const logger = { info: vi.fn(), error: vi.fn() };
  return {
    uploader: new MessagingAttachmentUploader(send, sendDiscard, logger),
    send,
    sendDiscard,
    logger,
  };
}

const bytes = (...values: number[]): Blob => new Blob([new Uint8Array(values)]);

describe("MessagingAttachmentUploader — a stored upload", () => {
  it("sends the bytes as base64 and returns the URL to embed", async () => {
    const { uploader, send, logger } = createUploader(() =>
      Promise.resolve({ ok: true, raw: { id: "a1", url: STORED } }),
    );

    const result = await uploader.upload({ fileName: "a.png", content: bytes(1, 2, 3) });

    expect(send).toHaveBeenCalledWith({
      type: UPLOAD_ATTACHMENT_MESSAGE,
      fileName: "a.png",
      contentBase64: "AQID",
    });
    expect(result).toEqual({ ok: true, url: `${STORED}?fileName=a.png` });
    expect(logger.info).toHaveBeenCalledWith("Attachment upload (3 bytes) stored by Azure DevOps.");
  });

  it("returns the attachment id Azure DevOps assigned, for a later clean-up", async () => {
    const { uploader } = createUploader(() =>
      Promise.resolve({ ok: true, raw: { id: ATTACHMENT_GUID, url: STORED } }),
    );

    const result = await uploader.upload({ fileName: "a.png", content: bytes(1) });

    expect(result).toEqual({ ok: true, url: `${STORED}?fileName=a.png`, id: ATTACHMENT_GUID });
  });

  it("encodes a file larger than one encoding chunk intact", async () => {
    const size = 0x8000 * 2 + 5;
    const content = new Uint8Array(size).map((_, index) => index % 251);
    const { uploader, send } = createUploader(() =>
      Promise.resolve({ ok: true, raw: { url: STORED } }),
    );

    await uploader.upload({ fileName: "big.png", content: new Blob([content]) });

    const sent = send.mock.calls[0]![0].contentBase64;
    expect(Buffer.from(sent, "base64").equals(Buffer.from(content))).toBe(true);
  });
});

describe("MessagingAttachmentUploader — a failed upload", () => {
  it("refuses a file over the size limit without sending it", async () => {
    const { uploader, send, logger } = createUploader(() => Promise.resolve({ ok: true }));
    const content = { size: MAX_ATTACHMENT_UPLOAD_BYTES + 1 } as Blob;

    const result = await uploader.upload({ fileName: "huge.png", content });

    expect(result.ok).toBe(false);
    expect(result.error).toContain(`larger than the ${MAX_ATTACHMENT_UPLOAD_BYTES} allowed`);
    expect(send).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("refused"));
  });

  it("reports a worker that did not handle the request", async () => {
    const { uploader, logger } = createUploader(() => Promise.resolve(undefined));

    const result = await uploader.upload({ fileName: "a.png", content: bytes(1) });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("did not handle the request");
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("passes on the worker's reason for a refused upload", async () => {
    const { uploader } = createUploader(() => Promise.resolve({ ok: false, error: "HTTP 413" }));

    expect(await uploader.upload({ fileName: "a.png", content: bytes(1) })).toEqual({
      ok: false,
      error: "HTTP 413",
    });
  });

  it("names a refusal the worker gave no reason for", async () => {
    const { uploader } = createUploader(() => Promise.resolve({ ok: false }));

    expect(await uploader.upload({ fileName: "a.png", content: bytes(1) })).toEqual({
      ok: false,
      error: "unknown error",
    });
  });

  it("reports a stored attachment that came back with nothing to embed", async () => {
    const { uploader, logger } = createUploader(() =>
      Promise.resolve({ ok: true, raw: { id: "a1" } }),
    );

    const result = await uploader.upload({ fileName: "a.png", content: bytes(1) });

    expect(result).toEqual({
      ok: false,
      error: "Azure DevOps stored the attachment but returned no usable URL",
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("logs a message bus that throws and never throws itself", async () => {
    const thrown = new Error("Extension context invalidated.");
    const { uploader, logger } = createUploader(() => Promise.reject(thrown));

    const result = await uploader.upload({ fileName: "a.png", content: bytes(1) });

    expect(result).toEqual({ ok: false, error: "could not reach Azure DevOps" });
    expect(logger.error).toHaveBeenCalledWith("Could not upload a 1-byte attachment", thrown);
  });
});

describe("MessagingAttachmentUploader — cleaning up an unsaved image", () => {
  const upload = () => Promise.resolve(undefined);

  it("asks the worker to delete the attachment and logs nothing when it does", async () => {
    const { uploader, sendDiscard, logger } = createUploader(upload);

    expect(await uploader.discard(ATTACHMENT_GUID)).toBe(true);

    expect(sendDiscard).toHaveBeenCalledWith({
      type: DISCARD_ATTACHMENT_MESSAGE,
      attachmentId: ATTACHMENT_GUID,
    });
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs the worker's reason when the delete is refused", async () => {
    const { uploader, logger } = createUploader(upload, () =>
      Promise.resolve({ ok: false, error: "HTTP 403" }),
    );

    expect(await uploader.discard(ATTACHMENT_GUID)).toBe(false);

    expect(logger.error).toHaveBeenCalledWith(
      `Could not clean up an unsaved pasted image ${ATTACHMENT_GUID}: HTTP 403.`,
    );
  });

  it("logs a worker that did not handle the request", async () => {
    const { uploader, logger } = createUploader(upload, () => Promise.resolve(undefined));

    expect(await uploader.discard(ATTACHMENT_GUID)).toBe(false);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("did not handle the request"),
    );
  });

  it("logs a message bus that throws and never throws itself", async () => {
    const thrown = new Error("Extension context invalidated.");
    const { uploader, logger } = createUploader(upload, () => Promise.reject(thrown));

    expect(await uploader.discard(ATTACHMENT_GUID)).toBe(false);

    expect(logger.error).toHaveBeenCalledWith(
      `Could not clean up an unsaved pasted image ${ATTACHMENT_GUID}`,
      thrown,
    );
  });
});
