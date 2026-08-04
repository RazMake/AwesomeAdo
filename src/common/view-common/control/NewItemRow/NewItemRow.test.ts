import { afterEach, describe, expect, it, vi } from "vitest";

import { renderNewItemRow, type NewItemRowOptions } from "./NewItemRow";

function mount(overrides: Partial<NewItemRowOptions> = {}): HTMLElement {
  const row = renderNewItemRow({
    doc: document,
    typeName: "Feature",
    iconUrl: "feature.svg",
    color: "#ff6b6b",
    summary: 'Created as a Feature under "Payments".',
    onSubmit: async () => true,
    onCancel: () => undefined,
    ...overrides,
  });
  document.body.append(row);
  return row;
}

function input(row: HTMLElement): HTMLInputElement {
  const field = row.querySelector("input");
  if (field === null) throw new Error("The new item row has no title box.");
  return field;
}

function button(row: HTMLElement, label: string): HTMLButtonElement {
  const found = [...row.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (found === undefined) throw new Error(`Missing "${label}" button.`);
  return found;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderNewItemRow", () => {
  it("asks only for the title, naming the type it will create", () => {
    const row = mount();

    expect(input(row).placeholder).toBe("New Feature title");
    expect(button(row, "Add Feature")).toBeTruthy();
  });

  it("states the caller's sentence about everything it is not asking for", () => {
    const row = mount();

    expect(row.querySelector(".awesomeado-new-item__summary")?.textContent).toBe(
      'Created as a Feature under "Payments".',
    );
  });

  it("refuses a title past the field's own limit rather than letting the server do it", () => {
    expect(input(mount()).maxLength).toBe(255);
  });

  it("creates the item with the typed title", async () => {
    const onSubmit = vi.fn(async () => true);
    const row = mount({ onSubmit });

    input(row).value = "Phase 1";
    input(row).dispatchEvent(new Event("input", { bubbles: true }));
    button(row, "Add Feature").click();

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Phase 1"));
  });

  it("abandons the row when the reader cancels", () => {
    const onCancel = vi.fn();

    button(mount({ onCancel }), "Cancel").click();

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("puts the caret where the answer goes, so the command that opened it is enough", async () => {
    const row = mount();

    await vi.waitFor(() => expect(document.activeElement).toBe(input(row)));
  });
});
