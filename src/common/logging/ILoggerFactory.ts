import type { ILogger } from "./ILogger";

/**
 * Mints loggers that each stamp their lines with a fixed source name.
 *
 * A single factory owns one backing log store; every logger it hands out writes to that same store
 * but records a different `source`, so the Diagnostics view can group and filter lines by the
 * component that produced them. Callers depend on this abstraction (Dependency Inversion) and choose
 * their source name — by convention the owning component folder (e.g. `content/query-page`,
 * `common/settings`), or the runtime context for composition-root wiring; the factory owns the
 * chrome-backed wiring behind it.
 */
export interface ILoggerFactory {
  /** Build a logger that stamps every line it records with `source` (by convention the component folder). */
  forSource(source: string): ILogger;
}
