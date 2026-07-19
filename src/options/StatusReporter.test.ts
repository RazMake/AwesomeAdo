import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StatusReporter } from "./StatusReporter";

describe("StatusReporter", () => {
  let element: HTMLElement;
  let reporter: StatusReporter;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    element = document.createElement("p");
    reporter = new StatusReporter(element);
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it("shows an Error's message to the user and logs the full error", () => {
    const error = new Error("boom");

    reporter.report(error);

    expect(element.textContent).toContain("boom");
    expect(consoleError).toHaveBeenCalledWith(expect.any(String), error);
  });

  it("shows a non-empty string error verbatim", () => {
    reporter.report("network unavailable");

    expect(element.textContent).toContain("network unavailable");
  });

  it("falls back to a generic message when the Error has no message", () => {
    reporter.report(new Error(""));

    expect(element.textContent).toContain("Unexpected error");
  });

  it("falls back to a generic message for a non-error, non-string value", () => {
    reporter.report({ unexpected: true });

    expect(element.textContent).toContain("Unexpected error");
  });

  it("clears a previously shown error", () => {
    reporter.report("oops");

    reporter.clear();

    expect(element.textContent).toBe("");
  });

  it("works when passed as a detached callback reference", () => {
    const report = reporter.report;

    report(new Error("detached"));

    expect(element.textContent).toContain("detached");
  });
});
