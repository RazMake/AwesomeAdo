import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../logging/ILogger";

import { tabRequestListener, type TabRequestHandler } from "./tabRequestListener";

interface Request {
  type: "test";
  id: number;
}

interface Reply {
  ok: boolean;
  error?: string;
}

function createLogger(): ILogger {
  return { info: vi.fn(), error: vi.fn() };
}

function createHandler(overrides: Partial<TabRequestHandler<Request, Reply>> = {}) {
  const serve = vi.fn(async () => ({ ok: true }) as Reply);
  const handler: TabRequestHandler<Request, Reply> = {
    claims: (message) => (message as Partial<Request>)?.type === "test",
    unscriptable: (message) => ({
      log: `Cannot serve ${message.id}: no sender tab.`,
      response: { ok: false, error: "no sender tab" },
    }),
    serve,
    ...overrides,
  };
  return { handler, serve };
}

const ADO_TAB = { tab: { id: 7, url: "https://dev.azure.com/org/project" } };

describe("tabRequestListener", () => {
  it("leaves a message it does not claim for the next listener", () => {
    const logger = createLogger();
    const { handler, serve } = createHandler();
    const sendResponse = vi.fn();

    const kept = tabRequestListener(logger, handler)({ type: "other" }, ADO_TAB, sendResponse);

    expect(kept).toBeUndefined();
    expect(sendResponse).not.toHaveBeenCalled();
    expect(serve).not.toHaveBeenCalled();
  });

  it("holds the message channel open while the request is served", async () => {
    const logger = createLogger();
    const { handler, serve } = createHandler();
    const sendResponse = vi.fn();

    const kept = tabRequestListener(logger, handler)(
      { type: "test", id: 1 },
      ADO_TAB,
      sendResponse,
    );

    expect(kept).toBe(true);
    expect(serve).toHaveBeenCalledWith({ type: "test", id: 1 }, 7, ADO_TAB.tab.url);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true }));
  });

  it("refuses to serve a claimed message that did not arrive from a scriptable tab", () => {
    const logger = createLogger();
    const { handler, serve } = createHandler();
    const sendResponse = vi.fn();

    const kept = tabRequestListener(logger, handler)({ type: "test", id: 4 }, {}, sendResponse);

    expect(kept).toBeUndefined();
    expect(serve).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: "no sender tab" });
    expect(logger.error).toHaveBeenCalledWith("Cannot serve 4: no sender tab.");
  });

  it("refuses to serve a tab whose url the sender did not report", () => {
    const logger = createLogger();
    const { handler, serve } = createHandler();
    const sendResponse = vi.fn();

    tabRequestListener(logger, handler)({ type: "test", id: 5 }, { tab: { id: 7 } }, sendResponse);

    expect(serve).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: "no sender tab" });
  });

  it("answers a claimed but malformed message instead of leaving the caller in silence", () => {
    const logger = createLogger();
    const { handler, serve } = createHandler({
      malformed: () => ({ log: "Rejected a malformed request.", response: { ok: false } }),
    });
    const sendResponse = vi.fn();

    const kept = tabRequestListener(logger, handler)(
      { type: "test", id: 2 },
      ADO_TAB,
      sendResponse,
    );

    expect(kept).toBeUndefined();
    expect(serve).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({ ok: false });
    expect(logger.error).toHaveBeenCalledWith("Rejected a malformed request.");
  });

  it("serves a claimed message its validator passed", () => {
    const logger = createLogger();
    const { handler, serve } = createHandler({ malformed: () => null });
    const sendResponse = vi.fn();

    tabRequestListener(logger, handler)({ type: "test", id: 3 }, ADO_TAB, sendResponse);

    expect(serve).toHaveBeenCalledTimes(1);
  });

  it("records the announcement of an accepted request before serving it", () => {
    const logger = createLogger();
    const { handler } = createHandler({ announce: (message) => `Serving ${message.id}.` });
    tabRequestListener(logger, handler)({ type: "test", id: 9 }, ADO_TAB, vi.fn());

    expect(logger.info).toHaveBeenCalledWith("Serving 9.");
  });

  it("stays quiet about an accepted request that declares no announcement", () => {
    const logger = createLogger();
    const { handler } = createHandler();
    tabRequestListener(logger, handler)({ type: "test", id: 9 }, ADO_TAB, vi.fn());

    expect(logger.info).not.toHaveBeenCalled();
  });
});
