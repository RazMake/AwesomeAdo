/**
 * The logging surface every source depends on (Dependency Inversion).
 *
 * Fire-and-forget by design: methods return void so callers never await logging, and a logging
 * failure can never break the feature that logged. Errors are recorded separately from plain
 * messages so the Diagnostics view can filter down to just the exceptions the extension caught.
 */
export interface ILogger {
  /** Record a routine, non-error message. */
  info(message: string): void;

  /** Record a caught exception/error. Pass the thrown value so its stack/detail is captured. */
  error(message: string, error?: unknown): void;
}
