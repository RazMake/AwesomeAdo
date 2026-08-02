import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ISettingsStore } from "../../common/settings/ISettingsStore";

import {
  DefaultAreaPathsController,
  type DefaultAreaPathsElements,
} from "./DefaultAreaPathsController";

function harness() {
  const elements: DefaultAreaPathsElements = {
    input: document.createElement("input"),
    addButton: document.createElement("button"),
    list: document.createElement("div"),
  };
  const write = vi.fn(async () => undefined);
  const store = { write } as unknown as ISettingsStore;
  const controller = new DefaultAreaPathsController(store, elements, vi.fn());
  controller.init();
  controller.render({
    defaultAreaPaths: ["Project\\API"],
    sprintAreaPaths: {
      "Project\\Sprint 1": {
        areaPaths: ["Project\\API", "Project\\Legacy"],
        startDate: null,
        finishDate: null,
      },
    },
  });
  return { controller, elements, write };
}

beforeEach(() => document.body.replaceChildren());

describe("DefaultAreaPathsController", () => {
  it("adds a default at the top and materializes it into existing sprint selections", () => {
    const { elements, write } = harness();
    elements.input.value = "Project\\Web";

    elements.addButton.click();

    expect(write).toHaveBeenCalledWith({
      defaultAreaPaths: ["Project\\API", "Project\\Web"],
      sprintAreaPaths: {
        "Project\\Sprint 1": {
          areaPaths: ["Project\\API", "Project\\Legacy", "Project\\Web"],
          startDate: null,
          finishDate: null,
        },
      },
    });
    expect(elements.list.querySelectorAll("input")).toHaveLength(2);
  });

  it("keeps the old path selected per sprint when a default row is edited", () => {
    const { elements, write } = harness();
    const input = elements.list.querySelector<HTMLInputElement>('input[data-index="0"]')!;
    input.value = "Project\\Services";

    input.dispatchEvent(new Event("change", { bubbles: true }));

    expect(write).toHaveBeenCalledWith({
      defaultAreaPaths: ["Project\\Services"],
      sprintAreaPaths: {
        "Project\\Sprint 1": {
          areaPaths: ["Project\\API", "Project\\Legacy", "Project\\Services"],
          startDate: null,
          finishDate: null,
        },
      },
    });
  });

  it("removes only the default and does not alter sprint selections", () => {
    const { elements, write } = harness();

    elements.list.querySelector<HTMLButtonElement>('button[data-index="0"]')!.click();

    expect(write).toHaveBeenCalledWith({ defaultAreaPaths: [] });
    expect(elements.list.querySelectorAll("input")).toHaveLength(0);
  });
});
