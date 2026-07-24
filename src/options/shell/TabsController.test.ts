import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TabsController } from "./TabsController";

function req<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Test fixture is missing element: ${selector}`);
  }
  return element;
}

interface Fixture {
  controller: TabsController;
  tabA: HTMLElement;
  tabB: HTMLElement;
  panelA: HTMLElement;
  panelB: HTMLElement;
}

function build(): Fixture {
  document.body.innerHTML = `
    <div role="tablist">
      <button id="tab-a" role="tab" aria-controls="panel-a" aria-selected="true">A</button>
      <button id="tab-b" role="tab" aria-controls="panel-b" aria-selected="false">B</button>
    </div>
    <section id="panel-a" role="tabpanel">A body</section>
    <section id="panel-b" role="tabpanel" hidden>B body</section>
  `;
  const controller = new TabsController(document);
  controller.init();
  return {
    controller,
    tabA: req<HTMLElement>("#tab-a"),
    tabB: req<HTMLElement>("#tab-b"),
    panelA: req<HTMLElement>("#panel-a"),
    panelB: req<HTMLElement>("#panel-b"),
  };
}

describe("TabsController", () => {
  let fixture: Fixture;

  beforeEach(() => {
    fixture = build();
  });

  afterEach(() => {
    fixture.controller.dispose();
    document.body.innerHTML = "";
  });

  it("shows the clicked tab's panel and hides the rest", () => {
    fixture.tabB.dispatchEvent(new Event("click"));
    expect(fixture.tabA.getAttribute("aria-selected")).toBe("false");
    expect(fixture.tabB.getAttribute("aria-selected")).toBe("true");
    expect(fixture.panelA.hidden).toBe(true);
    expect(fixture.panelB.hidden).toBe(false);
  });

  it("switches back to the first tab when clicked again", () => {
    fixture.tabB.dispatchEvent(new Event("click"));
    fixture.tabA.dispatchEvent(new Event("click"));
    expect(fixture.tabA.getAttribute("aria-selected")).toBe("true");
    expect(fixture.panelA.hidden).toBe(false);
    expect(fixture.panelB.hidden).toBe(true);
  });

  it("stops responding to clicks after dispose", () => {
    fixture.controller.dispose();
    fixture.tabB.dispatchEvent(new Event("click"));
    expect(fixture.tabA.getAttribute("aria-selected")).toBe("true");
    expect(fixture.panelB.hidden).toBe(true);
  });

  it("activates a tab by id (deep-linking into a panel)", () => {
    fixture.controller.activate("tab-b");
    expect(fixture.tabB.getAttribute("aria-selected")).toBe("true");
    expect(fixture.panelA.hidden).toBe(true);
    expect(fixture.panelB.hidden).toBe(false);
  });

  it("ignores activate for an unknown tab id", () => {
    fixture.controller.activate("tab-missing");
    expect(fixture.tabA.getAttribute("aria-selected")).toBe("true");
    expect(fixture.panelA.hidden).toBe(false);
    expect(fixture.panelB.hidden).toBe(true);
  });
});
