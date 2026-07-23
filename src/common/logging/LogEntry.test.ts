import { describe, expect, it } from "vitest";

import {
  describeError,
  formatLogEntry,
  formatTimestamp,
  type LogEntry,
  normalizeLogEntries,
  orderByTimestamp,
} from "./LogEntry";

describe("describeError", () => {
  it("returns an Error's stack when present", () => {
    const error = new Error("boom");
    error.stack = "Error: boom\n    at somewhere";

    expect(describeError(error)).toBe("Error: boom\n    at somewhere");
  });

  it("falls back to name and message when the stack is empty", () => {
    const error = new TypeError("nope");
    error.stack = "";

    expect(describeError(error)).toBe("TypeError: nope");
  });

  it("returns a string thrown value verbatim", () => {
    expect(describeError("plain failure")).toBe("plain failure");
  });

  it("serializes a plain object", () => {
    expect(describeError({ code: 42 })).toBe('{"code":42}');
  });

  it("describes a value that cannot be serialized to JSON", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(describeError(circular)).toBe("[object Object]");
  });

  it("describes a value JSON.stringify returns undefined for", () => {
    expect(describeError(undefined)).toBe("undefined");
  });
});

describe("formatTimestamp", () => {
  it("formats epoch milliseconds as ISO-8601 UTC", () => {
    expect(formatTimestamp(0)).toBe("1970-01-01T00:00:00.000Z");
  });
});

describe("formatLogEntry", () => {
  it("formats an info entry without detail", () => {
    const entry: LogEntry = { timestamp: 0, level: "info", message: "started" };

    expect(formatLogEntry(entry)).toBe("[1970-01-01T00:00:00.000Z] INFO started");
  });

  it("formats an error entry and indents each detail line", () => {
    const entry: LogEntry = {
      timestamp: 0,
      level: "error",
      message: "failed",
      detail: "line 1\nline 2",
    };

    expect(formatLogEntry(entry)).toBe(
      "[1970-01-01T00:00:00.000Z] ERROR failed\n    line 1\n    line 2",
    );
  });
});

describe("orderByTimestamp", () => {
  it("orders entries oldest to newest without mutating the input", () => {
    const input: LogEntry[] = [
      { timestamp: 30, level: "info", message: "c" },
      { timestamp: 10, level: "info", message: "a" },
      { timestamp: 20, level: "info", message: "b" },
    ];

    const ordered = orderByTimestamp(input);

    expect(ordered.map((entry) => entry.message)).toEqual(["a", "b", "c"]);
    expect(input.map((entry) => entry.message)).toEqual(["c", "a", "b"]);
  });

  it("keeps insertion order for equal timestamps (stable sort)", () => {
    const input: LogEntry[] = [
      { timestamp: 5, level: "info", message: "first" },
      { timestamp: 5, level: "info", message: "second" },
    ];

    expect(orderByTimestamp(input).map((entry) => entry.message)).toEqual(["first", "second"]);
  });
});

describe("normalizeLogEntries", () => {
  it("returns an empty list for a non-array value", () => {
    expect(normalizeLogEntries(undefined)).toEqual([]);
    expect(normalizeLogEntries("nope")).toEqual([]);
  });

  it("keeps valid entries and drops malformed ones", () => {
    const raw = [
      { timestamp: 1, level: "info", message: "ok" },
      { timestamp: 2, level: "error", message: "bad", detail: "stack" },
      null,
      { timestamp: Number.NaN, level: "info", message: "nan" },
      { timestamp: 3, level: "warn", message: "unknown level" },
      { timestamp: 4, level: "info", message: 99 },
      "not an object",
    ];

    expect(normalizeLogEntries(raw)).toEqual([
      { timestamp: 1, level: "info", message: "ok" },
      { timestamp: 2, level: "error", message: "bad", detail: "stack" },
    ]);
  });

  it("drops a non-string detail but keeps the entry", () => {
    const raw = [{ timestamp: 1, level: "info", message: "ok", detail: 5 }];

    expect(normalizeLogEntries(raw)).toEqual([{ timestamp: 1, level: "info", message: "ok" }]);
  });
});
