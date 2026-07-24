import { describe, expect, it } from "vitest";

import type { ILogWriter } from "./ILogStore";
import type { LogEntry } from "./LogEntry";
import { LoggerFactory } from "./LoggerFactory";

class FakeWriter implements ILogWriter {
  readonly entries: LogEntry[] = [];

  append(entry: LogEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

describe("LoggerFactory", () => {
  it("stamps each logger's lines with its own source while sharing one writer", () => {
    const writer = new FakeWriter();
    const factory = new LoggerFactory(writer, () => 42);

    factory.forSource("QueryPageController").info("in content");
    factory.forSource("BrowserSyncSettingsStore").info("in settings");

    // The shared writer keeps both sources' lines in one serialized append chain, each carrying its
    // own source label from the same factory.
    expect(writer.entries).toEqual([
      { timestamp: 42, level: "info", message: "in content", source: "QueryPageController" },
      {
        timestamp: 42,
        level: "info",
        message: "in settings",
        source: "BrowserSyncSettingsStore",
      },
    ]);
  });

  it("defaults to a real clock when none is injected", () => {
    const writer = new FakeWriter();
    const before = Date.now();

    new LoggerFactory(writer).forSource("background").info("tick");

    const entry = writer.entries[0];
    expect(entry?.source).toBe("background");
    expect(entry?.timestamp).toBeGreaterThanOrEqual(before);
    expect(entry?.timestamp).toBeLessThanOrEqual(Date.now());
  });
});
