import { describe, expect, it, vi } from "vitest";

import type { FeatureCrewReconcileRequest } from "../ado/IFeatureCrewWriter";
import type { ILogger } from "../logging/ILogger";

import { RECONCILE_FEATURE_CREW_MESSAGE } from "./FeatureCrewRequest";
import type {
  ReconcileFeatureCrewMessage,
  ReconcileFeatureCrewResponse,
} from "./FeatureCrewRequest";
import {
  MessagingFeatureCrewWriter,
  type SendReconcileRequest,
} from "./MessagingFeatureCrewWriter";

function makeLoggerSpy(): ILogger {
  return { info: vi.fn(), error: vi.fn() };
}

function makeWriter(send: SendReconcileRequest): {
  writer: MessagingFeatureCrewWriter;
  logger: ILogger;
} {
  const logger = makeLoggerSpy();
  const writer = new MessagingFeatureCrewWriter(send, logger);
  return { writer, logger };
}

function makeRequest(): FeatureCrewReconcileRequest {
  return {
    rootId: 123,
    typeName: "Epic",
    assignees: [
      { alias: "alice", fullName: "Alice Smith" },
      { alias: "bob", fullName: "Bob Jones" },
    ],
  };
}

describe("MessagingFeatureCrewWriter", () => {
  it("sends the correct message shape", async () => {
    const send = vi.fn<SendReconcileRequest>().mockResolvedValue({
      ok: true,
      changed: false,
    });
    const { writer } = makeWriter(send);
    const request = makeRequest();

    await writer.reconcile(request);

    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]?.[0] as ReconcileFeatureCrewMessage;
    expect(message.type).toBe(RECONCILE_FEATURE_CREW_MESSAGE);
    expect(message.rootId).toBe(123);
    expect(message.typeName).toBe("Epic");
    expect(message.assignees).toEqual([
      { alias: "alice", fullName: "Alice Smith" },
      { alias: "bob", fullName: "Bob Jones" },
    ]);
  });

  it("returns success and logs info when response.ok is true", async () => {
    const send = vi.fn<SendReconcileRequest>().mockResolvedValue({
      ok: true,
      changed: true,
      id: 456,
    });
    const { writer, logger } = makeWriter(send);

    const result = await writer.reconcile(makeRequest());

    expect(result).toEqual({ ok: true, changed: true, id: 456 });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      "Feature Crew reconciled for root 123: changed=true, id=456.",
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs 'none' when response.ok is true but id is undefined", async () => {
    const send = vi.fn<SendReconcileRequest>().mockResolvedValue({
      ok: true,
      changed: false,
    });
    const { writer, logger } = makeWriter(send);

    const result = await writer.reconcile(makeRequest());

    expect(result).toEqual({ ok: true, changed: false, id: undefined });
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      "Feature Crew reconciled for root 123: changed=false, id=none.",
    );
  });

  it("returns failure and logs error when response is undefined", async () => {
    const send = vi.fn<SendReconcileRequest>().mockResolvedValue(undefined);
    const { writer, logger } = makeWriter(send);

    const result = await writer.reconcile(makeRequest());

    expect(result).toEqual({ ok: false, changed: false });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Feature Crew reconcile for root 123: no response from the background worker.",
    );
  });

  it("returns failure and logs error when response is null", async () => {
    const send = vi
      .fn<SendReconcileRequest>()
      .mockResolvedValue(null as unknown as ReconcileFeatureCrewResponse);
    const { writer, logger } = makeWriter(send);

    const result = await writer.reconcile(makeRequest());

    expect(result).toEqual({ ok: false, changed: false });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Feature Crew reconcile for root 123: no response from the background worker.",
    );
  });

  it("returns failure and logs error when response.ok is false with an error message", async () => {
    const send = vi.fn<SendReconcileRequest>().mockResolvedValue({
      ok: false,
      changed: false,
      error: "network timeout",
    });
    const { writer, logger } = makeWriter(send);

    const result = await writer.reconcile(makeRequest());

    expect(result).toEqual({ ok: false, changed: false, id: undefined });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Feature Crew reconcile failed for root 123: network timeout.",
    );
  });

  it("returns failure and logs 'unknown error' when response.ok is false without error field", async () => {
    const send = vi.fn<SendReconcileRequest>().mockResolvedValue({
      ok: false,
      changed: true,
      id: 789,
    });
    const { writer, logger } = makeWriter(send);

    const result = await writer.reconcile(makeRequest());

    expect(result).toEqual({ ok: false, changed: true, id: 789 });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Feature Crew reconcile failed for root 123: unknown error.",
    );
  });

  it("returns failure and logs the thrown error when send rejects", async () => {
    const failure = new Error("connection refused");
    const send = vi.fn<SendReconcileRequest>().mockRejectedValue(failure);
    const { writer, logger } = makeWriter(send);

    const result = await writer.reconcile(makeRequest());

    expect(result).toEqual({ ok: false, changed: false });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      "Could not reconcile Feature Crew for root 123",
      failure,
    );
  });

  it("passes through changed and id when response.ok is false", async () => {
    const send = vi.fn<SendReconcileRequest>().mockResolvedValue({
      ok: false,
      changed: true,
      id: 999,
      error: "partial failure",
    });
    const { writer, logger } = makeWriter(send);

    const result = await writer.reconcile(makeRequest());

    expect(result).toEqual({ ok: false, changed: true, id: 999 });
    expect(logger.error).toHaveBeenCalledWith(
      "Feature Crew reconcile failed for root 123: partial failure.",
    );
  });
});
