import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../../../common/logging/ILogger";

import { createBoardLoader, type BoardLoaderOptions } from "./boardLoader";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let the loader's promise chain settle; it only ever waits on microtasks, never on timers. */
async function flush(): Promise<void> {
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
}

function harness() {
  const answers: Deferred<string>[] = [];
  const logger: ILogger = { info: vi.fn(), error: vi.fn() };
  const button = {
    element: document.createElement("button"),
    setBusy: vi.fn(),
    setFailed: vi.fn(),
  };
  const options: BoardLoaderOptions<string> = {
    fetch: () => {
      const answer = deferred<string>();
      answers.push(answer);
      return answer.promise;
    },
    paint: vi.fn(),
    showMessage: vi.fn(),
    loadingMessage: "Loading…",
    failureLogMessage: "Board failed to load.",
    logger,
    openDiagnosticsLog: vi.fn(),
    queue: { clearFailures: vi.fn() },
    refreshButton: () => button,
  };
  return { answers, logger, button, options, loader: createBoardLoader(options) };
}

describe("createBoardLoader first load", () => {
  it("shows the loading message, then paints the answer", async () => {
    const { answers, options, loader, button } = harness();

    loader.load(false);
    expect(options.showMessage).toHaveBeenCalledWith("Loading…");
    expect(options.queue.clearFailures).toHaveBeenCalledTimes(1);
    expect(button.setBusy).toHaveBeenCalledWith(true);
    expect(loader.data()).toBeNull();

    answers[0]!.resolve("tree");
    await flush();

    expect(loader.data()).toBe("tree");
    expect(options.paint).toHaveBeenCalledTimes(1);
  });

  it("logs a failed first load and shows the failure message", async () => {
    const { answers, options, loader, logger } = harness();
    const error = new Error("offline");

    loader.load(false);
    answers[0]!.reject(error);
    await flush();

    expect(logger.error).toHaveBeenCalledWith("Board failed to load.", error);
    expect(options.showMessage).toHaveBeenLastCalledWith("Could not load this query.");
    expect(options.paint).not.toHaveBeenCalled();
    expect(loader.refreshFailed()).toBe(false);
  });
});

describe("createBoardLoader refresh", () => {
  it("keeps the older board after a failed refresh and opens Diagnostics on the next press", async () => {
    const { answers, options, loader } = harness();
    loader.load(false);
    answers[0]!.resolve("tree");
    await flush();

    loader.refresh();
    expect(options.showMessage).toHaveBeenCalledTimes(1);
    answers[1]!.reject(new Error("offline"));
    await flush();

    expect(loader.refreshFailed()).toBe(true);
    expect(loader.data()).toBe("tree");
    expect(options.paint).toHaveBeenCalledTimes(2);

    loader.refresh();
    expect(options.openDiagnosticsLog).toHaveBeenCalledTimes(1);
    expect(loader.refreshFailed()).toBe(false);
    expect(answers).toHaveLength(2);
  });

  it("discards caches and re-reads on a discard request, even right after a failed refresh", async () => {
    const { answers, options, loader } = harness();
    const discardCaches = vi.fn();
    options.discardCaches = discardCaches;
    loader.load(false);
    answers[0]!.resolve("tree");
    await flush();
    loader.refresh();
    answers[1]!.reject(new Error("offline"));
    await flush();
    expect(loader.refreshFailed()).toBe(true);

    loader.refresh({ discardCaches: true });

    expect(discardCaches).toHaveBeenCalledTimes(1);
    expect(options.openDiagnosticsLog).not.toHaveBeenCalled();
    expect(answers).toHaveLength(3);
    answers[2]!.resolve("fresh");
    await flush();
    expect(loader.data()).toBe("fresh");
    expect(loader.refreshFailed()).toBe(false);
  });

  it("re-reads on a discard request when the board has no caches to discard", async () => {
    const { answers, loader } = harness();
    loader.load(false);

    loader.refresh({ discardCaches: true });

    expect(answers).toHaveLength(2);
  });

  it("never discards caches on a plain refresh", () => {
    const { answers, options, loader } = harness();
    const discardCaches = vi.fn();
    options.discardCaches = discardCaches;
    loader.load(false);

    loader.refresh();
    loader.refresh({ discardCaches: false });

    expect(discardCaches).not.toHaveBeenCalled();
    expect(answers).toHaveLength(3);
  });

  it("lets only the newest load paint", async () => {
    const { answers, options, loader } = harness();
    loader.load(false);
    loader.load(true);

    answers[1]!.resolve("newer");
    await flush();
    answers[0]!.resolve("older");
    answers[0]!.reject(new Error("ignored"));
    await flush();

    expect(loader.data()).toBe("newer");
    expect(options.paint).toHaveBeenCalledTimes(1);
  });

  it("ignores a failure from a load a newer one overtook", async () => {
    const { answers, logger, loader } = harness();
    loader.load(false);
    loader.load(true);

    answers[0]!.reject(new Error("stale"));
    await flush();

    expect(logger.error).not.toHaveBeenCalled();
  });
});
