import { afterEach, describe, expect, it } from "vitest";

import { renderSprintPicker } from "./SprintPicker";

describe("renderSprintPicker", () => {
  // Clean up any DOM created by tests.
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a button followed by a select", () => {
    const handle = renderSprintPicker(document, {
      sprints: [
        { path: "Team\\Sprint 1", name: "Sprint 1" },
        { path: "Team\\Sprint 2", name: "Sprint 2" },
      ],
    });

    const button = handle.element.querySelector(".awesomeado-sprint-picker__button");
    const select = handle.element.querySelector(".awesomeado-sprint-picker__select");

    expect(button).not.toBeNull();
    expect(select).not.toBeNull();

    // Button comes before select in the DOM.
    const children = Array.from(handle.element.children);
    expect(children.indexOf(button!)).toBeLessThan(children.indexOf(select!));
  });

  it("populates the select with one option per sprint", () => {
    const handle = renderSprintPicker(document, {
      sprints: [
        { path: "Team\\Sprint 1", name: "Sprint 1" },
        { path: "Team\\Sprint 2", name: "Sprint 2" },
        { path: "Team\\Sprint 3", name: "Sprint 3" },
      ],
    });

    const options = handle.element.querySelectorAll("option");
    expect(options).toHaveLength(3);
    expect(options[0]?.textContent).toBe("Sprint 1");
    expect(options[1]?.textContent).toBe("Sprint 2");
    expect(options[2]?.textContent).toBe("Sprint 3");
  });

  it("selects the sprint matching selectedName", () => {
    const handle = renderSprintPicker(document, {
      sprints: [
        { path: "Team\\Sprint 1", name: "Sprint 1" },
        { path: "Team\\Sprint 2", name: "Sprint 2" },
      ],
      selectedName: "Sprint 2",
    });

    expect(handle.selectedSprint()).toBe("Sprint 2");
  });

  it("selects the first sprint when selectedName is missing or does not match", () => {
    const handle = renderSprintPicker(document, {
      sprints: [
        { path: "Team\\Sprint 1", name: "Sprint 1" },
        { path: "Team\\Sprint 2", name: "Sprint 2" },
      ],
      selectedName: "NonExistent",
    });

    expect(handle.selectedSprint()).toBe("Sprint 1");
  });

  it("selects the first sprint when selectedName is null", () => {
    const handle = renderSprintPicker(document, {
      sprints: [
        { path: "Team\\Sprint 1", name: "Sprint 1" },
        { path: "Team\\Sprint 2", name: "Sprint 2" },
      ],
      selectedName: null,
    });

    expect(handle.selectedSprint()).toBe("Sprint 1");
  });

  it("disables both button and select when sprints is empty", () => {
    const handle = renderSprintPicker(document, { sprints: [] });

    const button = handle.element.querySelector<HTMLButtonElement>(
      ".awesomeado-sprint-picker__button",
    );
    const select = handle.element.querySelector<HTMLSelectElement>(
      ".awesomeado-sprint-picker__select",
    );

    expect(button?.disabled).toBe(true);
    expect(select?.disabled).toBe(true);
  });

  it("returns null for selectedSprint() when sprints is empty", () => {
    const handle = renderSprintPicker(document, { sprints: [] });

    expect(handle.selectedSprint()).toBeNull();
  });

  it("clicking the button flips isFilterActive() and calls onFilterToggle", () => {
    let toggleCalled = false;
    let toggleActive: boolean | null = null;
    let toggleSprintName: string | null = null;

    const handle = renderSprintPicker(document, {
      sprints: [{ path: "Team\\Sprint 1", name: "Sprint 1" }],
      filterActive: false,
      onFilterToggle: (active, sprintName) => {
        toggleCalled = true;
        toggleActive = active;
        toggleSprintName = sprintName;
      },
    });

    expect(handle.isFilterActive()).toBe(false);

    const button = handle.element.querySelector<HTMLButtonElement>(
      ".awesomeado-sprint-picker__button",
    );
    button?.click();

    expect(handle.isFilterActive()).toBe(true);
    expect(toggleCalled).toBe(true);
    expect(toggleActive).toBe(true);
    expect(toggleSprintName).toBe("Sprint 1");
  });

  it("changing the select calls onSprintChange with the new value", () => {
    let changeCalled = false;
    let changedName: string | null = null;

    const handle = renderSprintPicker(document, {
      sprints: [
        { path: "Team\\Sprint 1", name: "Sprint 1" },
        { path: "Team\\Sprint 2", name: "Sprint 2" },
      ],
      onSprintChange: (name) => {
        changeCalled = true;
        changedName = name;
      },
    });
    document.body.append(handle.element);

    const select = handle.element.querySelector<HTMLSelectElement>(
      ".awesomeado-sprint-picker__select",
    );
    select!.value = "Sprint 2";
    select?.dispatchEvent(new Event("change"));

    expect(changeCalled).toBe(true);
    expect(changedName).toBe("Sprint 2");
  });

  it("the button contains an SVG icon and no literal text label", () => {
    const handle = renderSprintPicker(document, {
      sprints: [{ path: "Team\\Sprint 1", name: "Sprint 1" }],
    });

    const button = handle.element.querySelector(".awesomeado-sprint-picker__button");
    const svg = button?.querySelector("svg");

    expect(svg).not.toBeNull();
    // The button should not have any direct text child (only the SVG).
    const textNodes = Array.from(button?.childNodes ?? []).filter(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
    );
    expect(textNodes).toHaveLength(0);
  });

  it("the button uses aria-pressed to reflect active state", () => {
    const handle = renderSprintPicker(document, {
      sprints: [{ path: "Team\\Sprint 1", name: "Sprint 1" }],
      filterActive: false,
    });

    const button = handle.element.querySelector<HTMLButtonElement>(
      ".awesomeado-sprint-picker__button",
    );

    expect(button?.getAttribute("aria-pressed")).toBe("false");

    button?.click();

    expect(button?.getAttribute("aria-pressed")).toBe("true");
  });

  it("the button and select use theme CSS variables (no hard light-only palette)", () => {
    const handle = renderSprintPicker(document, {
      sprints: [{ path: "Team\\Sprint 1", name: "Sprint 1" }],
    });

    const button = handle.element.querySelector<HTMLElement>(".awesomeado-sprint-picker__button");
    const select = handle.element.querySelector<HTMLElement>(".awesomeado-sprint-picker__select");

    // Assert theme var usage in styles.
    const buttonStyle = button?.style.cssText ?? "";
    const selectStyle = select?.style.cssText ?? "";

    expect(buttonStyle).toContain("var(--");
    expect(selectStyle).toContain("var(--");
  });

  it("the button shows a lit-up accent look when active", () => {
    const handle = renderSprintPicker(document, {
      sprints: [{ path: "Team\\Sprint 1", name: "Sprint 1" }],
      filterActive: true,
    });

    const button = handle.element.querySelector<HTMLElement>(".awesomeado-sprint-picker__button");
    const bg = button?.style.background ?? "";

    // Should light up with the accent (communication) background when active.
    expect(bg).toContain("var(--communication-background");
  });

  it("the button has transparent background when inactive", () => {
    const handle = renderSprintPicker(document, {
      sprints: [{ path: "Team\\Sprint 1", name: "Sprint 1" }],
      filterActive: false,
    });

    const button = handle.element.querySelector<HTMLElement>(".awesomeado-sprint-picker__button");
    // Assert against the raw cssText: jsdom's CSSOM drops `background:transparent`, so we check
    // for the absence of any background property when the button should be transparent.
    const style = button?.style.cssText ?? "";

    expect(style).not.toContain("background:");
    expect(style).toContain("cursor: pointer");
  });
});
