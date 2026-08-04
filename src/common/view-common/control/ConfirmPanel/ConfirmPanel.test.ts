import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderConfirmPanel, type ConfirmPanelOptions } from "./ConfirmPanel";

const render = (options: Partial<ConfirmPanelOptions> = {}): HTMLElement =>
  renderConfirmPanel(document, {
    summary: 'This project will be set to "Closed".',
    choices: [{ label: "Complete", primary: true, onChoose: () => undefined }],
    onCancel: () => undefined,
    ...options,
  });

const answers = (panel: HTMLElement): HTMLButtonElement[] => [
  ...panel.querySelectorAll<HTMLButtonElement>(".awesomeado-confirm__answer"),
];

const answerLabels = (panel: HTMLElement): string[] =>
  answers(panel).map((button) => button.textContent ?? "");

describe("renderConfirmPanel", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("states the outcome rather than asking whether the reader is sure", () => {
    const panel = render();

    expect(panel.querySelector(".awesomeado-confirm__summary")?.textContent).toBe(
      'This project will be set to "Closed".',
    );
  });

  it("omits the detail line entirely when there is no second consequence", () => {
    expect(render().querySelector(".awesomeado-confirm__detail")).toBeNull();
    expect(render({ detail: null }).querySelector(".awesomeado-confirm__detail")).toBeNull();
  });

  it("shows the detail line when one is supplied", () => {
    const panel = render({ detail: "Delete its tracking query as well?" });

    expect(panel.querySelector(".awesomeado-confirm__detail")?.textContent).toBe(
      "Delete its tracking query as well?",
    );
  });

  it("offers every choice in order, with the answer that changes nothing last", () => {
    const panel = render({
      choices: [
        { label: "Complete and delete query", primary: true, onChoose: () => undefined },
        { label: "Complete", onChoose: () => undefined },
      ],
    });

    expect(answerLabels(panel)).toEqual(["Complete and delete query", "Complete", "Cancel"]);
  });

  it("lets the host reword the answer that changes nothing", () => {
    expect(answerLabels(render({ cancelLabel: "Leave it open" })).at(-1)).toBe("Leave it open");
  });

  it("accents only the primary choice, never the cancel", () => {
    const panel = render({
      choices: [
        { label: "Complete", primary: true, onChoose: () => undefined },
        { label: "Complete and delete query", onChoose: () => undefined },
      ],
    });

    const accented = answers(panel).map((button) =>
      button.style.background.includes("communication-background"),
    );
    expect(accented).toEqual([true, false, false]);
  });

  it("reports the chosen answer and nothing else", () => {
    const complete = vi.fn();
    const completeAndDelete = vi.fn();
    const onCancel = vi.fn();
    const panel = render({
      choices: [
        { label: "Complete and delete query", primary: true, onChoose: completeAndDelete },
        { label: "Complete", onChoose: complete },
      ],
      onCancel,
    });

    answers(panel)[1]?.click();

    expect(complete).toHaveBeenCalledTimes(1);
    expect(completeAndDelete).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("reports a cancel without running any choice", () => {
    const onChoose = vi.fn();
    const onCancel = vi.fn();
    const panel = render({ choices: [{ label: "Complete", onChoose }], onCancel });

    answers(panel).at(-1)?.click();

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });
});
