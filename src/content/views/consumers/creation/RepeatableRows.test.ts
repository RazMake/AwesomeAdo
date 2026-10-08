import { describe, expect, it, vi, type Mock } from "vitest";

import { renderRepeatableRows, type RepeatableEntry } from "./RepeatableRows";

const PREFIX = "test__detail";

/** An entry whose answer and blankness the test sets directly. */
interface FakeEntry extends RepeatableEntry<string> {
  answer: string | null;
  blank: boolean;
  control: HTMLElement;
  focus: Mock<() => void>;
}

function fakeEntry(label: string): FakeEntry {
  const control = document.createElement("span");
  control.textContent = label;
  const entry: FakeEntry = {
    answer: null,
    blank: true,
    control,
    controls: [control],
    value: () => entry.answer,
    isBlank: () => entry.blank,
    focus: vi.fn<() => void>(),
  };
  return entry;
}

/** A group whose entries are recorded as they are created. */
function group() {
  const created: FakeEntry[] = [];
  const onChange = vi.fn();
  const createEntry = vi.fn(() => {
    const entry = fakeEntry(`entry ${created.length + 1}`);
    created.push(entry);
    return entry;
  });
  const rows = renderRepeatableRows<string>({
    doc: document,
    classPrefix: PREFIX,
    addLabel: "Add detail",
    removeLabel: "Remove this detail",
    createEntry,
    onChange,
  });
  const add = rows.element.querySelector<HTMLButtonElement>(`.${PREFIX}-add`);
  if (add === null) throw new Error("The group has no add button");
  return { rows, created, createEntry, onChange, add };
}

function lines(element: HTMLElement): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>(`.${PREFIX}`)];
}

function removeButtonOf(line: HTMLElement | undefined): HTMLButtonElement {
  const button = line?.querySelector<HTMLButtonElement>(`.${PREFIX}-remove`) ?? null;
  if (button === null) throw new Error("The line has no remove button");
  return button;
}

describe("renderRepeatableRows — adding", () => {
  it("starts empty with an add button named after its label", () => {
    const { rows, add } = group();

    expect(rows.element.className).toBe(`${PREFIX}s`);
    expect(add.textContent).toBe("+ Add detail");
    expect(lines(rows.element)).toHaveLength(0);
    expect(rows.values()).toEqual([]);
    expect(rows.hasIncompleteEntry()).toBe(false);
  });

  it("adds an entry with its controls and a remove button, focuses it and reports the change", () => {
    const { rows, created, createEntry, onChange, add } = group();

    add.click();

    expect(createEntry).toHaveBeenCalledWith(onChange);
    const [line] = lines(rows.element);
    expect(line?.firstElementChild).toBe(created[0]?.control);
    expect(removeButtonOf(line).getAttribute("aria-label")).toBe("Remove this detail");
    expect(created[0]?.focus).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("renderRepeatableRows — removing", () => {
  it("removes exactly the entry whose × was clicked and reports the change", () => {
    const { rows, created, onChange, add } = group();
    add.click();
    add.click();
    add.click();
    created.forEach((entry, index) => {
      entry.answer = `value ${index + 1}`;
    });
    onChange.mockClear();

    removeButtonOf(lines(rows.element)[1]).click();

    expect(lines(rows.element).map((line) => line.firstElementChild?.textContent)).toEqual([
      "entry 1",
      "entry 3",
    ]);
    expect(rows.values()).toEqual(["value 1", "value 3"]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("renderRepeatableRows — answers", () => {
  it("lists the complete entries' values in order, leaving out the ones without a value", () => {
    const { rows, created, add } = group();
    add.click();
    add.click();
    add.click();
    created[0]!.answer = "first";
    created[2]!.answer = "third";

    expect(rows.values()).toEqual(["first", "third"]);
  });

  it("reports an incomplete entry only when it has no value and something was typed in it", () => {
    const { rows, created, add } = group();
    add.click();
    const entry = created[0]!;

    entry.answer = null;
    entry.blank = true;
    expect(rows.hasIncompleteEntry()).toBe(false);

    entry.blank = false;
    expect(rows.hasIncompleteEntry()).toBe(true);

    entry.answer = "done";
    expect(rows.hasIncompleteEntry()).toBe(false);
  });
});
