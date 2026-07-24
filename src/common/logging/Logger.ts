import type { ILogWriter } from "./ILogStore";
import type { ILogger } from "./ILogger";
import { describeError, type LogEntry, type LogLevel } from "./LogEntry";

/**
 * Timestamps each message, stamps it with its owning source, and persists it through the injected
 * writer.
 *
 * One Logger belongs to exactly one source — the class or module that owns it — so every line it
 * records carries that source's name for the Diagnostics filter, and a source never has to remember
 * to pass its own name on each call. Logging is fire-and-forget: a rejected write is swallowed
 * because there is nowhere left to report a logging failure, and it must never break the feature that
 * logged. Errors are additionally mirrored to `console.error` so they stay visible in devtools
 * exactly as before this log existed; plain messages are recorded to the local log only (no console
 * noise). The clock is injected so tests are deterministic.
 */
export class Logger implements ILogger {
  constructor(
    private readonly writer: ILogWriter,
    private readonly source: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  info(message: string): void {
    this.record("info", message);
  }

  error(message: string, error?: unknown): void {
    this.record("error", message, error);
  }

  private record(level: LogLevel, message: string, error?: unknown): void {
    const entry: LogEntry = { timestamp: this.now(), level, message, source: this.source };
    if (error !== undefined) {
      entry.detail = describeError(error);
    }
    if (level === "error") {
      // Keep errors in devtools as well as the log; the source prefix mirrors the stored line so a
      // console reader sees the same origin, and the extra argument preserves the stack there.
      if (error === undefined) {
        console.error(`AwesomeADO [${this.source}]: ${message}`);
      } else {
        console.error(`AwesomeADO [${this.source}]: ${message}`, error);
      }
    }
    void this.writer.append(entry).catch(() => undefined);
  }
}
