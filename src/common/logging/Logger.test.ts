import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ILogWriter } from "./ILogStore";
import type { LogEntry } from "./LogEntry";
import { Logger } from "./Logger";

class FakeWriter implements ILogWriter {
  readonly entries: LogEntry[] = [];
  rejectWith: unknown = null;

  append(entry: LogEntry): Promise<void> {
    this.entries.push(entry);
    return this.rejectWith === null ? Promise.resolve() : Promise.reject(this.rejectWith);
  }
}

describe("Logger", () => {
  let writer: FakeWriter;
  let logger: Logger;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writer = new FakeWriter();
    logger = new Logger(writer, () => 12345);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("records an info message with the injected clock and no console noise", () => {
    logger.info("started");

    expect(writer.entries).toEqual([{ timestamp: 12345, level: "info", message: "started" }]);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("records an error with its serialized detail and mirrors it to the console", () => {
    const error = new Error("boom");
    error.stack = "Error: boom\n    at here";

    logger.error("failed", error);

    expect(writer.entries).toEqual([
      { timestamp: 12345, level: "error", message: "failed", detail: "Error: boom\n    at here" },
    ]);
    expect(consoleError).toHaveBeenCalledWith("AwesomeADO: failed", error);
  });

  it("records an error without a thrown value and logs the message alone", () => {
    logger.error("standalone failure");

    expect(writer.entries).toEqual([
      { timestamp: 12345, level: "error", message: "standalone failure" },
    ]);
    expect(consoleError).toHaveBeenCalledWith("AwesomeADO: standalone failure");
  });

  it("never throws when the writer rejects (fire-and-forget)", async () => {
    writer.rejectWith = new Error("storage down");

    expect(() => logger.error("failed anyway")).not.toThrow();
    // Let the swallowed rejection settle so an unhandled rejection would surface if it escaped.
    await Promise.resolve();
    expect(writer.entries).toHaveLength(1);
  });
});
