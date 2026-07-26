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

/** Picks `policy` from the menu, as a user would. */
function pick(picker: HTMLElement, policy: OrderingPolicy): void {
  openMenu(picker)
    .find((row) => row.dataset.policy === policy)!
    .click();
}

/** Renders a picker whose owning view reports when drag-to-reorder is off under a given policy. */
function renderWithReorderRule(
  policy: OrderingPolicy,
  dragReorderUnavailable: (policy: OrderingPolicy) => string | null,
): HTMLElement {
  const picker = renderOrderingPicker(document, {
    policy,
    onChange: () => undefined,
    dragReorderUnavailable,
  });
  document.body.append(picker);
  return picker;
}

/** The rule a board that only honours a manual drag under "By Importance" would supply. */
const onlyUnderImportance = (policy: OrderingPolicy): string | null =>
  policy === "importance" ? null : "drag to reorder is only available under By Importance";

describe("renderOrderingPicker - indicator", () => {
  it("shows a single sorting glyph", () => {
    expect(triggerOf(renderMounted("importance")).textContent).toBe("\u21C5");
  });

  it("names the policy in force in its tooltip", () => {
    const trigger = triggerOf(renderMounted("title"));

    expect(trigger.title).toBe("Ordering: By Title (a-z)");
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

    expect(triggerOf(picker).title).toBe("Ordering: By ETA (past/recent - future)");
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

describe("renderOrderingPicker - drag-reorder status", () => {
  it("stays in its resting state when the view supplies no reorder rule", () => {
    const trigger = triggerOf(renderMounted("importance"));

    expect(trigger.dataset.dragReorder).toBe("available");
    expect(trigger.style.color).toBe("var(--text-secondary-color, #8a8886)");
    expect(trigger.style.opacity).toBe("0.7");
  });

  it("stays in its resting state while the rule reports no blocker", () => {
    const trigger = triggerOf(renderWithReorderRule("importance", onlyUnderImportance));

    expect(trigger.dataset.dragReorder).toBe("available");
    expect(trigger.style.color).toBe("var(--text-secondary-color, #8a8886)");
    expect(trigger.style.opacity).toBe("0.7");
    expect(trigger.title).toBe("Ordering: By Importance (most important first)");
  });

  it("names the blocker in red, faintly enough to inform rather than alarm", () => {
    const trigger = triggerOf(renderWithReorderRule("title", onlyUnderImportance));

    expect(trigger.dataset.dragReorder).toBe("unavailable");
    expect(trigger.style.color).toBe("var(--status-error-text, #c50f1f)");
    expect(trigger.style.opacity).toBe("0.25");
  });

  it("appends the reason to both the tooltip and the assistive label", () => {
    const trigger = triggerOf(renderWithReorderRule("title", onlyUnderImportance));

    expect(trigger.title).toBe(
      "Ordering: By Title (a-z) \u2014 drag to reorder is only available under By Importance",
    );
    expect(trigger.getAttribute("aria-label")).toBe(trigger.title);
  });

  it("re-asks the rule after every pick, so the glyph flips without the view re-rendering it", () => {
    const picker = renderWithReorderRule("importance", onlyUnderImportance);
    const trigger = triggerOf(picker);

    pick(picker, "title");

    expect(trigger.dataset.dragReorder).toBe("unavailable");
    expect(trigger.style.opacity).toBe("0.25");
    expect(trigger.title).toContain("only available under By Importance");

    pick(picker, "importance");

    expect(trigger.dataset.dragReorder).toBe("available");
    expect(trigger.style.opacity).toBe("0.7");
    expect(trigger.title).toBe("Ordering: By Importance (most important first)");
  });

  it("brightens on hover in either state, then settles back to that state's own opacity", () => {
    // The tooltip carries the reason, so the glyph has to be readable while the pointer rests on it
    // — but leaving must not strand it at full strength once reordering is off.
    const picker = renderWithReorderRule("importance", onlyUnderImportance);
    const trigger = triggerOf(picker);

    trigger.dispatchEvent(new MouseEvent("mouseenter"));
    expect(trigger.style.opacity).toBe("1");
    trigger.dispatchEvent(new MouseEvent("mouseleave"));
    expect(trigger.style.opacity).toBe("0.7");

    pick(picker, "title");

    trigger.dispatchEvent(new MouseEvent("mouseenter"));
    expect(trigger.style.opacity).toBe("1");
    trigger.dispatchEvent(new MouseEvent("mouseleave"));
    expect(trigger.style.opacity).toBe("0.25");
  });
});
