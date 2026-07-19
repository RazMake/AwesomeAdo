/**
 * Presents failures to the person using the options page.
 *
 * Without this the UI is silent about errors: disabled controls just look like a page that never
 * finished loading. Surfacing the reason in the page's `role="alert"` status line makes problems
 * visible to the user (and to screen readers) while still logging full detail for diagnostics.
 */
export class StatusReporter {
  constructor(private readonly statusElement: HTMLElement) {}

  /**
   * Show an error to the user and log the full error for diagnostics. Defined as a bound field so
   * it can be handed directly to consumers that expect a plain `(error) => void` callback.
   */
  readonly report = (error: unknown): void => {
    console.error("AwesomeADO options error", error);
    this.statusElement.textContent = `Something went wrong on the options page: ${toMessage(error)}`;
  };

  /** Remove any previously shown error, e.g. once the page recovers. */
  clear(): void {
    this.statusElement.textContent = "";
  }
}

/** Extract a human-readable message from an unknown thrown value. */
function toMessage(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.length > 0) {
    return error;
  }
  return "Unexpected error";
}
