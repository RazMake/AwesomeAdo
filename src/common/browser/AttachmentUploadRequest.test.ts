import { describe, expect, it } from "vitest";

import {
  MAX_ATTACHMENT_FILE_NAME_LENGTH,
  MAX_ATTACHMENT_UPLOAD_BYTES,
} from "../ado/IAttachmentUploader";

import {
  DISCARD_ATTACHMENT_MESSAGE,
  discardAttachmentMessageProblem,
  UPLOAD_ATTACHMENT_MESSAGE,
  uploadAttachmentMessageProblem,
  type UploadAttachmentMessage,
} from "./AttachmentUploadRequest";

function message(overrides: Partial<Record<keyof UploadAttachmentMessage, unknown>> = {}): unknown {
  return {
    type: UPLOAD_ATTACHMENT_MESSAGE,
    fileName: "image.png",
    contentBase64: "AQID",
    ...overrides,
  };
}

describe("uploadAttachmentMessageProblem", () => {
  it("accepts a named file with base64 content", () => {
    expect(uploadAttachmentMessageProblem(message())).toBeNull();
    expect(uploadAttachmentMessageProblem(message({ contentBase64: "AQI=" }))).toBeNull();
  });

  it.each([
    ["a non-object", null, "message is not an object"],
    ["another message type", message({ type: "other" }), 'type is "other"'],
    ["a missing file name", message({ fileName: undefined }), "fileName is missing or blank"],
    ["a blank file name", message({ fileName: "  " }), "fileName is missing or blank"],
    [
      "an overlong file name",
      message({ fileName: "a".repeat(MAX_ATTACHMENT_FILE_NAME_LENGTH + 1) }),
      `longer than the ${MAX_ATTACHMENT_FILE_NAME_LENGTH} allowed`,
    ],
    ["missing content", message({ contentBase64: 42 }), "contentBase64 is missing or empty"],
    ["empty content", message({ contentBase64: "" }), "contentBase64 is missing or empty"],
    ["content that is not base64", message({ contentBase64: "<img>" }), "is not base64"],
    [
      "content over the size limit",
      message({ contentBase64: "A".repeat(Math.ceil(MAX_ATTACHMENT_UPLOAD_BYTES / 3) * 4 + 4) }),
      "longer than the",
    ],
  ])("rejects %s, saying why", (_case, value, reason) => {
    expect(uploadAttachmentMessageProblem(value)).toContain(reason);
  });
});

describe("discardAttachmentMessageProblem", () => {
  const ATTACHMENT = "4f76001f-8f25-4e7e-80a1-b3a3f54e9a73";

  it("accepts an attachment GUID", () => {
    expect(
      discardAttachmentMessageProblem({
        type: DISCARD_ATTACHMENT_MESSAGE,
        attachmentId: ATTACHMENT,
      }),
    ).toBeNull();
  });

  it.each([
    ["a non-object", "x", "message is not an object"],
    ["another message type", { type: "other", attachmentId: ATTACHMENT }, 'type is "other"'],
    ["a missing id", { type: DISCARD_ATTACHMENT_MESSAGE }, "not an attachment GUID"],
    [
      "an id that is not a GUID",
      { type: DISCARD_ATTACHMENT_MESSAGE, attachmentId: "../x" },
      "not an attachment GUID",
    ],
  ])("rejects %s, saying why", (_case, value, reason) => {
    expect(discardAttachmentMessageProblem(value)).toContain(reason);
  });
});
