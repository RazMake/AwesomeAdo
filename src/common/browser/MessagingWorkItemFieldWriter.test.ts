import { describe, expect, it, vi } from "vitest";

import type { WorkItemFieldWriteRequest } from "../ado/IWorkItemFieldWriter";
import type { ILogger } from "../logging/ILogger";

import {
  MessagingWorkItemFieldWriter,
  type SendUpdateFieldRequest,
} from "./MessagingWorkItemFieldWriter";
import { UPDATE_WORK_ITEM_FIELD_MESSAGE } from "./WorkItemFieldRequest";
import type { UpdateWorkItemFieldMessage } from "./WorkItemFieldRequest";
import { UNHANDLED_BY_WORKER } from "./workerReply";

function makeLoggerSpy(): ILogger {
  return { info: vi.fn(), error: vi.fn() };
}

function makeWriter(send: SendUpdateFieldRequest): {
  writer: MessagingWorkItemFieldWriter;
  logger: ILogger;
} {
  const logger = makeLoggerSpy();
  const writer = new MessagingWorkItemFieldWriter(send, logger);
  return { writer, logger };
}

function makeRequest(): WorkItemFieldWriteRequest {
  return {
    id: 123,
    rev: 5,
    field: "System.State",
    value: "Active",
  };
}

describe("MessagingWorkItemFieldWriter - success paths", () => {
  it("sends the correct message shape", async () => {
    const send = vi.fn<SendUpdateFieldRequest>().mockResolvedValue({
      ok: true,
      rev: 6,
    });
    const { writer } = makeWriter(send);
    const request = makeRequest();

    await writer.writeField(request);

    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]?.[0] as UpdateWorkItemFieldMessage;
    expect(message.type).toBe(UPDATE_WORK_ITEM_FIELD_MESSAGE);
    expect(message.id).toBe(123);
    expect(message.rev).toBe(5);
    expect(message.field).toBe("System.State");
    expect(message.value).toBe("Active");
  });

  it("forwards additional fields in the same message", async () => {
    const send = vi.fn<SendUpdateFieldRequest>().mockResolvedValue({ ok: true, rev: 6 });
    const { writer } = makeWriter(send);

    await writer.writeField({
      ...makeRequest(),
      additionalFields: [{ field: "System.AreaPath", value: "Project\\Apps" }],
    });

    expect(send.mock.calls[0]?.[0].additionalFields).toEqual([
      { field: "System.AreaPath", value: "Project\\Apps" },
    ]);
  });

  it("carries a cleared value (null) through the message", async () => {
    const send = vi.fn<SendUpdateFieldRequest>().mockResolvedValue({ ok: true, rev: 6 });
    const { writer } = makeWriter(send);

    await writer.writeField({
      id: 9,
      rev: 2,
      field: "Microsoft.VSTS.Scheduling.TargetDate",
      value: null,
    });

    const message = send.mock.calls[0]?.[0] as UpdateWorkItemFieldMessage;
    expect(message.field).toBe("Microsoft.VSTS.Scheduling.TargetDate");
    expect(message.value).toBeNull();
  });

  it("returns success and logs info when response.ok is true", async () => {
    const send = vi.fn<SendUpdateFieldRequest>().mockResolvedValue({
      ok: true,
      rev: 6,
    });
    const { writer, logger } = makeWriter(send);

    const result = await writer.writeField(makeRequest());

    expect(result).toEqual({ ok: true, rev: 6 });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("Work item 123 field System.State written, rev=6.");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs 'none' when response.ok is true but rev is undefined", async () => {
    const send = vi.fn<SendUpdateFieldRequest>().mockResolvedValue({
      ok: true,
    });
    const { writer, logger } = makeWriter(send);

    const result = await writer.writeField(makeRequest());

    expect(result).toEqual({ ok: true, rev: undefined });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("Work item 123 field System.State written, rev=none.");
  });
});

describe("MessagingWorkItemFieldWriter - failure paths", () => {
  it("returns failure and logs error when response is undefined", async () => {
    const send = vi.fn<SendUpdateFieldRequest>().mockResolvedValue(undefined);
    const { writer, logger } = makeWriter(send);

    const result = await writer.writeField(makeRequest());

    expect(result).toEqual({ ok: false });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(`Work item 123 field write: ${UNHANDLED_BY_WORKER}.`);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("returns failure and logs error when response is null", async () => {
    const send = vi.fn<SendUpdateFieldRequest>().mockResolvedValue(null as never);
    const { writer, logger } = makeWriter(send);

    const result = await writer.writeField(makeRequest());

    expect(result).toEqual({ ok: false });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(`Work item 123 field write: ${UNHANDLED_BY_WORKER}.`);
  });

  it("returns failure and logs error when response.ok is false", async () => {
    const send = vi.fn<SendUpdateFieldRequest>().mockResolvedValue({
      ok: false,
      error: "HTTP 409",
    });
    const { writer, logger } = makeWriter(send);

    const result = await writer.writeField(makeRequest());

    expect(result).toEqual({ ok: false, rev: undefined, error: "HTTP 409" });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("Work item 123 field write failed: HTTP 409.");
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("logs 'unknown error' when response.ok is false but error is undefined", async () => {
    const send = vi.fn<SendUpdateFieldRequest>().mockResolvedValue({
      ok: false,
    });
    const { writer, logger } = makeWriter(send);

    const result = await writer.writeField(makeRequest());

    expect(result).toEqual({ ok: false, rev: undefined, error: undefined });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("Work item 123 field write failed: unknown error.");
  });

  it("returns failure and logs error when send throws", async () => {
    const thrownError = new Error("Network failure");
    const send = vi.fn<SendUpdateFieldRequest>().mockRejectedValue(thrownError);
    const { writer, logger } = makeWriter(send);

    const result = await writer.writeField(makeRequest());

    expect(result).toEqual({ ok: false });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Could not write field System.State for work item 123",
      thrownError,
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});
