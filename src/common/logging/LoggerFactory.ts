import type { ILogWriter } from "./ILogStore";
import type { ILogger } from "./ILogger";
import type { ILoggerFactory } from "./ILoggerFactory";
import { Logger } from "./Logger";

/**
 * Builds source-scoped loggers that all share one writer.
 *
 * Sharing the writer is what keeps a single context's lines in one serialized append chain (so two
 * rapid logs from different sources cannot clobber each other) while still letting each source carry
 * its own label. The clock is injected so tests can assert deterministic timestamps.
 */
export class LoggerFactory implements ILoggerFactory {
  constructor(
    private readonly writer: ILogWriter,
    private readonly now: () => number = () => Date.now(),
  ) {}

  forSource(source: string): ILogger {
    return new Logger(this.writer, source, this.now);
  }
}
