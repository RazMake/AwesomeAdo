import { afterEach, describe, expect, it } from "vitest";

import { renderSprintPicker } from "./SprintPicker";

// Clean up any DOM created by tests (top-level hook applies to every describe below).
afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderSprintPicker - rendering and initial selection", () => {
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

  it("shows the label as option text while reporting the raw name on selection", () => {
    const handle = renderSprintPicker(document, {
      sprints: [
        { path: "Team\\Sprint 1", name: "Sprint 1", label: "Previous - Sprint 1" },
        { path: "Team\\Sprint 2", name: "Sprint 2", label: "Current - Sprint 2" },
      ],
      selectedName: "Sprint 2",
    });

    const options = handle.element.querySelectorAll("option");
    // The decorated label is what the user sees...
    expect(options[0]?.textContent).toBe("Previous - Sprint 1");
    expect(options[1]?.textContent).toBe("Current - Sprint 2");
    // ...but the option value and the reported selection stay the raw sprint name (for filtering).
    expect(options[1]?.value).toBe("Sprint 2");
    expect(handle.selectedSprint()).toBe("Sprint 2");
  });
});

describe("renderSprintPicker - default selection and empty state", () => {
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
});

describe("renderSprintPicker - filter enable state", () => {
  it("disables the select while the filter is inactive", () => {
    const handle = renderSprintPicker(document, {
      sprints: [{ path: "Team\\Sprint 1", name: "Sprint 1" }],
      filterActive: false,
    });

    const select = handle.element.querySelector<HTMLSelectElement>(
      ".awesomeado-sprint-picker__select",
    );

    expect(select?.disabled).toBe(true);
  });

  it("enables the select when the filter starts active", () => {
    const handle = renderSprintPicker(document, {
      sprints: [{ path: "Team\\Sprint 1", name: "Sprint 1" }],
      filterActive: true,
    });

    const select = handle.element.querySelector<HTMLSelectElement>(
      ".awesomeado-sprint-picker__select",
    );

    expect(select?.disabled).toBe(false);
  });

  it("toggles the select enabled state as the filter flips", () => {
    const handle = renderSprintPicker(document, {
      sprints: [{ path: "Team\\Sprint 1", name: "Sprint 1" }],
      filterActive: false,
    });

    const button = handle.element.querySelector<HTMLButtonElement>(
      ".awesomeado-sprint-picker__button",
    );
    const select = handle.element.querySelector<HTMLSelectElement>(
      ".awesomeado-sprint-picker__select",
    );

    expect(select?.disabled).toBe(true);

    button?.click();
    expect(select?.disabled).toBe(false);

    button?.click();
    expect(select?.disabled).toBe(true);
  });
});

describe("renderSprintPicker - toggle and change callbacks", () => {
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
});

describe("renderSprintPicker - relative-time option styling", () => {
  function styledOptions(): NodeListOf<HTMLOptionElement> {
    const handle = renderSprintPicker(document, {
      sprints: [
        {
          path: "Team\\Sprint 1",
          name: "Sprint 1",
          label: "Previous - Sprint 1",
          relation: "past",
        },
        {
          path: "Team\\Sprint 2",
          name: "Sprint 2",
          label: "Current - Sprint 2",
          relation: "current",
        },
        { path: "Team\\Sprint 3", name: "Sprint 3", label: "Next - Sprint 3", relation: "future" },
      ],
    });
    return handle.element.querySelectorAll("option");
  }

  it("colors past sprints orange without bolding them", () => {
    const past = styledOptions()[0]!;

    expect(past.dataset.relation).toBe("past");
    expect(past.style.cssText).toContain("rgb(194, 108, 29)");
    expect(past.style.cssText).not.toContain("font-weight");
  });

  it("bolds the current sprint and leaves its color inherited", () => {
    const current = styledOptions()[1]!;

    expect(current.dataset.relation).toBe("current");
    expect(current.style.cssText).toContain("bold");
    expect(current.style.cssText).not.toContain("color");
  });

  it("colors future sprints with the theme accent without bolding them", () => {
    const future = styledOptions()[2]!;

    expect(future.dataset.relation).toBe("future");
    expect(future.style.cssText).toContain("var(--communication-foreground");
    expect(future.style.cssText).not.toContain("font-weight");
  });

  it("leaves options without a relation unstyled", () => {
    const handle = renderSprintPicker(document, {
      sprints: [{ path: "Team\\Sprint 1", name: "Sprint 1" }],
    });

    const option = handle.element.querySelector<HTMLOptionElement>("option");

    expect(option?.dataset.relation).toBeUndefined();
    expect(option?.style.cssText).toBe("");
  });
});

describe("renderSprintPicker - button appearance and accessibility", () => {
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
