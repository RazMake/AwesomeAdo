import { describe, expect, it, vi } from "vitest";

import type { WorkItemStateWriteRequest } from "../ado/IWorkItemStateWriter";
import type { ILogger } from "../logging/ILogger";

import {
  MessagingWorkItemStateWriter,
  type SendUpdateStateRequest,
} from "./MessagingWorkItemStateWriter";
import { UPDATE_WORK_ITEM_STATE_MESSAGE } from "./WorkItemStateRequest";
import type { UpdateWorkItemStateMessage } from "./WorkItemStateRequest";

function makeLoggerSpy(): ILogger {
  return { info: vi.fn(), error: vi.fn() };
}

function makeWriter(send: SendUpdateStateRequest): {
  writer: MessagingWorkItemStateWriter;
  logger: ILogger;
} {
  const logger = makeLoggerSpy();
  const writer = new MessagingWorkItemStateWriter(send, logger);
  return { writer, logger };
}

function makeRequest(): WorkItemStateWriteRequest {
  return {
    id: 123,
    rev: 5,
    state: "Active",
  };
}

describe("MessagingWorkItemStateWriter", () => {
  it("sends the correct message shape", async () => {
    const send = vi.fn<SendUpdateStateRequest>().mockResolvedValue({
      ok: true,
      rev: 6,
    });
    const { writer } = makeWriter(send);
    const request = makeRequest();

    await writer.writeState(request);

    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]?.[0] as UpdateWorkItemStateMessage;
    expect(message.type).toBe(UPDATE_WORK_ITEM_STATE_MESSAGE);
    expect(message.id).toBe(123);
    expect(message.rev).toBe(5);
    expect(message.state).toBe("Active");
  });

  it("returns success and logs info when response.ok is true", async () => {
    const send = vi.fn<SendUpdateStateRequest>().mockResolvedValue({
      ok: true,
      rev: 6,
    });
    const { writer, logger } = makeWriter(send);

    const result = await writer.writeState(makeRequest());

    expect(result).toEqual({ ok: true, rev: 6 });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("Work item 123 state written to Active, rev=6.");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs 'none' when response.ok is true but rev is undefined", async () => {
    const send = vi.fn<SendUpdateStateRequest>().mockResolvedValue({
      ok: true,
    });
    const { writer, logger } = makeWriter(send);

    const result = await writer.writeState(makeRequest());

    expect(result).toEqual({ ok: true, rev: undefined });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith("Work item 123 state written to Active, rev=none.");
  });

  it("returns failure and logs error when response is undefined", async () => {
    const send = vi.fn<SendUpdateStateRequest>().mockResolvedValue(undefined);
    const { writer, logger } = makeWriter(send);

    const result = await writer.writeState(makeRequest());

    expect(result).toEqual({ ok: false });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Work item 123 state write: no response from background.",
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("returns failure and logs error when response is null", async () => {
    const send = vi.fn<SendUpdateStateRequest>().mockResolvedValue(null as never);
    const { writer, logger } = makeWriter(send);

    const result = await writer.writeState(makeRequest());

    expect(result).toEqual({ ok: false });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Work item 123 state write: no response from background.",
    );
  });

  it("returns failure and logs error when response.ok is false", async () => {
    const send = vi.fn<SendUpdateStateRequest>().mockResolvedValue({
      ok: false,
      error: "HTTP 409",
    });
    const { writer, logger } = makeWriter(send);

    const result = await writer.writeState(makeRequest());

    expect(result).toEqual({ ok: false, rev: undefined, error: "HTTP 409" });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("Work item 123 state write failed: HTTP 409.");
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("logs 'unknown error' when response.ok is false but error is undefined", async () => {
    const send = vi.fn<SendUpdateStateRequest>().mockResolvedValue({
      ok: false,
    });
    const { writer, logger } = makeWriter(send);

    const result = await writer.writeState(makeRequest());

    expect(result).toEqual({ ok: false, rev: undefined, error: undefined });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith("Work item 123 state write failed: unknown error.");
  });

  it("returns failure and logs error when send throws", async () => {
    const thrownError = new Error("Network failure");
    const send = vi.fn<SendUpdateStateRequest>().mockRejectedValue(thrownError);
    const { writer, logger } = makeWriter(send);

    const result = await writer.writeState(makeRequest());

    expect(result).toEqual({ ok: false });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Could not write state for work item 123",
      thrownError,
    );
    expect(logger.info).not.toHaveBeenCalled();
  });
});
