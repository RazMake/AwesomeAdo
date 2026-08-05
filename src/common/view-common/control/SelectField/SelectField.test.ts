import { afterEach, describe, expect, it, vi } from "vitest";

import { renderSelectField, type SelectFieldChoice } from "./SelectField";

const CHOICES: SelectFieldChoice[] = [
  { value: "past", label: "Previous - Sprint 4", title: "Team\\Sprint 4" },
  { value: "current", label: "Current - Sprint 5", declarations: [["font-weight", "bold"]] },
  { value: "next", label: "Next - Sprint 6" },
];

function mount(overrides: Partial<Parameters<typeof renderSelectField>[1]> = {}) {
  const onChange = vi.fn();
  const field = renderSelectField(document, {
    classPrefix: "test-select",
    label: "Sprint",
    choices: CHOICES,
    selected: "current",
    onChange,
    ...overrides,
  });
  document.body.append(field.element);
  return { field, onChange };
}

const trigger = (): HTMLButtonElement => document.querySelector(".test-select__trigger")!;
const shown = (): string => document.querySelector(".test-select__value")!.textContent ?? "";
const rows = (): HTMLButtonElement[] => [
  ...document.querySelectorAll<HTMLButtonElement>(".test-select__option"),
];

afterEach(() => {
  document.body.replaceChildren();
});

describe("renderSelectField - what it shows", () => {
  it("opens on the caller's value and names it for assistive technology", () => {
    mount();

    expect(shown()).toBe("Current - Sprint 5");
    expect(trigger().getAttribute("aria-label")).toBe("Sprint");
  });

  it("falls back to the first choice when the caller's value is not on offer", () => {
    const { field } = mount({ selected: "retired" });

    expect(field.value()).toBe("past");
    expect(shown()).toBe("Previous - Sprint 4");
  });

  it("says so rather than showing an empty box when nothing is offered", () => {
    const { field } = mount({ choices: [], emptyLabel: "No sprints" });

    expect(field.value()).toBe("");
    expect(shown()).toBe("No sprints");
  });

  it("shows the full value behind a shortened label as the tooltip", () => {
    mount({ selected: "past" });

    expect(trigger().title).toBe("Team\\Sprint 4");
  });
});

describe("renderSelectField - picking", () => {
  it("lists every choice, marking the one in force", () => {
    mount();

    trigger().click();

    expect(rows().map((row) => row.value)).toEqual(["past", "current", "next"]);
    expect(rows().map((row) => row.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
  });

  it("reports the picked value, shows it, and closes the list", () => {
    const { field, onChange } = mount();
    trigger().click();

    rows()
      .find((row) => row.value === "next")!
      .click();

    expect(field.value()).toBe("next");
    expect(shown()).toBe("Next - Sprint 6");
    expect(onChange).toHaveBeenCalledWith("next");
    expect(rows()).toHaveLength(0);
  });

  it("wears the picked choice's own emphasis, so the collapsed field reads like its row", () => {
    mount({ selected: "past" });
    trigger().click();

    rows()
      .find((row) => row.value === "current")!
      .click();

    expect(trigger().style.fontWeight).toBe("bold");
  });
});

describe("renderSelectField - refilling and disabling", () => {
  it("replaces the offered values and selects the caller's new one", () => {
    const { field } = mount();

    field.setChoices([{ value: "later", label: "Sprint 9" }], "later");

    expect(field.value()).toBe("later");
    expect(shown()).toBe("Sprint 9");
  });

  it("takes down an open list, so nothing it no longer offers can be picked", () => {
    const { field } = mount();
    trigger().click();
    expect(rows()).not.toHaveLength(0);

    field.setChoices([{ value: "later", label: "Sprint 9" }], "later");

    expect(rows()).toHaveLength(0);
  });

  it("is inert while its values are still being read", () => {
    const { field } = mount({ disabled: true });
    expect(trigger().disabled).toBe(true);

    trigger().click();
    expect(rows()).toHaveLength(0);

    field.setDisabled(false);
    trigger().click();
    expect(rows()).not.toHaveLength(0);
  });
});
