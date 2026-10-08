import { describe, expect, it, vi } from "vitest";

import type { ItemContextMenuCommand } from "../../../../common/view-common/control/ItemContextMenu/ItemContextMenu";

import {
  NO_GROUPING_REASON,
  REQUESTS_MODE_REASON,
  renderAddConsumerButton,
  type AddConsumerButtonOptions,
} from "./AddConsumerButton";

const COMMAND: ItemContextMenuCommand = {
  label: "Add new consumer",
  panel: () => document.createElement("div"),
};

function button(overrides: Partial<AddConsumerButtonOptions> = {}) {
  const openPanel = vi.fn();
  const element = renderAddConsumerButton({
    doc: document,
    className: "test__add-consumer",
    showConsumers: true,
    command: COMMAND,
    openPanel,
    ...overrides,
  });
  return { element, openPanel };
}

describe("renderAddConsumerButton", () => {
  it("opens the Add new consumer form beneath itself while the consumers are shown", () => {
    const { element, openPanel } = button();

    expect(element.textContent).toBe("Add Consumer");
    expect(element.className).toBe("test__add-consumer");
    expect(element.disabled).toBe(false);
    element.click();
    expect(openPanel).toHaveBeenCalledWith(element, COMMAND);
  });

  it("is disabled, saying why, while the board shows only the requests", () => {
    const { element } = button({ showConsumers: false });

    expect(element.disabled).toBe(true);
    expect(element.title).toBe(REQUESTS_MODE_REASON);
  });

  it("is disabled when the query has no grouping item to add under", () => {
    const { element, openPanel } = button({ command: null });

    expect(element.disabled).toBe(true);
    expect(element.title).toBe(NO_GROUPING_REASON);
    element.click();
    expect(openPanel).not.toHaveBeenCalled();
  });

  it("carries the command's own reason when no consumer type is known", () => {
    const { element } = button({
      command: { label: "Add new consumer", disabledReason: "No consumer type." },
    });

    expect(element.disabled).toBe(true);
    expect(element.title).toBe("No consumer type.");
  });
});
