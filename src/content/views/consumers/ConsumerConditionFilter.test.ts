import { afterEach, describe, expect, it, vi } from "vitest";

import { renderConsumerConditionFilter } from "./ConsumerConditionFilter";

function open(root: HTMLElement): void {
  root.querySelector<HTMLButtonElement>(".awesomeado-consumer-condition-filter__trigger")!.click();
}

function pick(label: string): void {
  [...document.querySelectorAll<HTMLElement>(".awesomeado-consumer-condition-filter__option")]
    .find((row) => row.textContent?.includes(label))!
    .click();
}

afterEach(() => document.body.replaceChildren());

describe("renderConsumerConditionFilter", () => {
  it("offers the three consumer conditions", () => {
    const root = renderConsumerConditionFilter(document, {
      condition: "all",
      onChange: () => undefined,
    });
    document.body.append(root);

    open(root);

    expect(
      [...document.querySelectorAll(".awesomeado-consumer-condition-filter__option")].map((row) =>
        row.textContent?.trim(),
      ),
    ).toEqual(["Waiting for answers", "With untriaged requests", "With committed requests"]);
  });

  it("picks one condition, closes, and names it in the tooltip", () => {
    const onChange = vi.fn();
    const root = renderConsumerConditionFilter(document, { condition: "all", onChange });
    document.body.append(root);
    const trigger = root.querySelector<HTMLButtonElement>(
      ".awesomeado-consumer-condition-filter__trigger",
    )!;

    expect(trigger.textContent).toContain("By state");
    open(root);
    pick("With committed requests");

    expect(onChange).toHaveBeenCalledWith("committedRequests");
    expect(document.querySelector(".awesomeado-consumer-condition-filter__popup")).toBeNull();
    expect(trigger.title).toBe("Consumers with committed requests");
    expect(trigger.getAttribute("aria-pressed")).toBe("true");
  });

  it("clears an active condition when the trigger is pressed", () => {
    const onChange = vi.fn();
    const root = renderConsumerConditionFilter(document, {
      condition: "waitingForAnswers",
      onChange,
    });
    document.body.append(root);
    expect(root.querySelector<HTMLElement>("button")!.title).toBe("Consumers waiting for answers");

    open(root);

    expect(onChange).toHaveBeenCalledWith("all");
    expect(document.querySelector(".awesomeado-consumer-condition-filter__popup")).toBeNull();
  });
});
