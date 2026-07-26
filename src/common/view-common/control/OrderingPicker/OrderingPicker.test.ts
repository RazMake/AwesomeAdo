import { afterEach, describe, expect, it } from "vitest";

import { ORDERING_POLICIES, type OrderingPolicy } from "../../../ordering/ItemOrdering";

import { renderOrderingPicker } from "./OrderingPicker";

// Clean up the DOM created by tests (top-level hook applies to every describe below).
afterEach(() => {
  document.body.innerHTML = "";
});

/** Renders a picker mounted in the document, so its popup can be opened and measured. */
function renderMounted(
  policy: OrderingPolicy,
  onChange: (picked: OrderingPolicy) => void = () => undefined,
): HTMLElement {
  const picker = renderOrderingPicker(document, { policy, onChange });
  document.body.append(picker);
  return picker;
}

/** The picker's trigger glyph. */
const triggerOf = (picker: HTMLElement): HTMLButtonElement =>
  picker.querySelector<HTMLButtonElement>(".awesomeado-ordering__trigger")!;

/** Opens the menu and returns its rows, in the order they are offered. */
function openMenu(picker: HTMLElement): HTMLButtonElement[] {
  triggerOf(picker).click();
  return [...picker.querySelectorAll<HTMLButtonElement>(".awesomeado-ordering__option")];
}

describe("renderOrderingPicker - indicator", () => {
  it("shows a single sorting glyph", () => {
    expect(triggerOf(renderMounted("importance")).textContent).toBe("\u21C5");
  });

  it("names the policy in force in its tooltip", () => {
    const trigger = triggerOf(renderMounted("title"));

    expect(trigger.title).toBe("Ordering: By Title (a-z) (click to change)");
    expect(trigger.getAttribute("aria-label")).toBe(trigger.title);
  });

  it("stays discrete: no border or fill until hovered", () => {
    const trigger = triggerOf(renderMounted("importance"));

    expect(trigger.style.borderStyle).toBe("none");
    expect(trigger.style.backgroundColor).toBe("transparent");
    expect(trigger.style.opacity).toBe("0.7");

    trigger.dispatchEvent(new MouseEvent("mouseenter"));
    expect(trigger.style.opacity).toBe("1");
    trigger.dispatchEvent(new MouseEvent("mouseleave"));
    expect(trigger.style.opacity).toBe("0.7");
  });
});

describe("renderOrderingPicker - menu", () => {
  it("offers every policy the options page offers, in the same order", () => {
    const rows = openMenu(renderMounted("importance"));

    expect(rows.map((row) => row.dataset.policy)).toEqual(
      ORDERING_POLICIES.map((option) => option.value),
    );
    expect(rows.map((row) => row.textContent)).toEqual(
      ORDERING_POLICIES.map((option) => `\u2713${option.label}`),
    );
  });

  it("checks only the policy in force", () => {
    const rows = openMenu(renderMounted("eta"));

    const checked = rows.filter((row) => row.getAttribute("aria-checked") === "true");
    expect(checked.map((row) => row.dataset.policy)).toEqual(["eta"]);
  });

  it("hides the check mark of the policies not in force, without dropping it from the layout", () => {
    const rows = openMenu(renderMounted("eta"));

    const marks = rows.map(
      (row) => row.querySelector<HTMLElement>(".awesomeado-ordering__mark")!.style.visibility,
    );
    expect(marks).toEqual(["hidden", "hidden", "visible"]);
  });

  it("closes on Escape", () => {
    const picker = renderMounted("importance");
    openMenu(picker);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(picker.querySelector(".awesomeado-ordering__popup")).toBeNull();
  });
});

describe("renderOrderingPicker - picking", () => {
  it("reports the picked policy and closes the menu", () => {
    const picked: OrderingPolicy[] = [];
    const picker = renderMounted("importance", (policy) => picked.push(policy));

    openMenu(picker)
      .find((row) => row.dataset.policy === "title")!
      .click();

    expect(picked).toEqual(["title"]);
    expect(picker.querySelector(".awesomeado-ordering__popup")).toBeNull();
  });

  it("re-labels itself so the tooltip describes the new order", () => {
    const picker = renderMounted("importance");

    openMenu(picker)
      .find((row) => row.dataset.policy === "eta")!
      .click();

    expect(triggerOf(picker).title).toBe(
      "Ordering: By ETA (past/recent - future) (click to change)",
    );
  });

  it("moves the check mark to the newly picked policy on the next open", () => {
    const picker = renderMounted("importance");
    openMenu(picker)
      .find((row) => row.dataset.policy === "title")!
      .click();

    const checked = openMenu(picker).filter((row) => row.getAttribute("aria-checked") === "true");

    expect(checked.map((row) => row.dataset.policy)).toEqual(["title"]);
  });

  it("does not report a pick of the policy already in force", () => {
    // The caller rebuilds its rows on every change, so re-reporting the same order would collapse
    // the user's expanded items to produce the identical list.
    const picked: OrderingPolicy[] = [];
    const picker = renderMounted("title", (policy) => picked.push(policy));

    openMenu(picker)
      .find((row) => row.dataset.policy === "title")!
      .click();

    expect(picked).toEqual([]);
    expect(picker.querySelector(".awesomeado-ordering__popup")).toBeNull();
  });
});
