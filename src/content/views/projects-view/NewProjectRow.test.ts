import { afterEach, describe, expect, it, vi } from "vitest";

import type { TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";

import { renderNewProjectRow, type NewProjectRowOptions } from "./NewProjectRow";

const EPIC: TypeCatalogEntry = {
  name: "Epic",
  color: "ff6b6b",
  icon: "epic.svg",
  etaField: null,
  children: [],
  columns: [{ column: "Active", states: ["Active"] }],
};

function mount(overrides: Partial<NewProjectRowOptions> = {}): HTMLElement {
  const row = renderNewProjectRow({
    doc: document,
    typeName: "Epic",
    typeEntry: EPIC,
    tags: ["Catalog"],
    areaPath: "Fabrikam\\Core",
    iterationPath: "Fabrikam",
    onSubmit: async () => true,
    onCancel: () => undefined,
    ...overrides,
  });
  document.body.append(row);
  return row;
}

function input(row: HTMLElement): HTMLInputElement {
  const field = row.querySelector("input");
  if (field === null) throw new Error("The new project row has no title box.");
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

describe("renderNewProjectRow", () => {
  it("asks only for the title, naming the type it will create", () => {
    const row = mount();

    expect(input(row).placeholder).toBe("New Epic title");
    expect(button(row, "Add Epic")).toBeTruthy();
  });

  it("states everything the reader is not being asked to type", () => {
    const row = mount();

    // These values come from the binding and are what make the new project a member of THIS
    // catalog, so they are stated rather than offered for editing.
    expect(row.textContent).toContain(
      "Created as a Epic tagged Catalog, under Fabrikam\\Core, in iteration Fabrikam.",
    );
  });

  it("warns when nothing will tag the project into this query", () => {
    const row = mount({ tags: [] });

    expect(row.textContent).toContain("this query may not return it");
  });

  it("omits the area path from the summary when the project default applies", () => {
    const row = mount({ areaPath: null });

    expect(row.textContent).not.toContain("under");
  });

  it("omits the iteration path from the summary when the project default cannot be resolved", () => {
    const row = mount({ iterationPath: null });

    expect(row.textContent).not.toContain("in iteration");
  });

  it("creates the project with the typed title", async () => {
    const onSubmit = vi.fn(async () => true);
    const row = mount({ onSubmit });

    input(row).value = "Payments";
    input(row).dispatchEvent(new Event("input", { bubbles: true }));
    button(row, "Add Epic").click();

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith("Payments"));
  });

  it("abandons the row when the reader cancels", () => {
    const onCancel = vi.fn();
    const row = mount({ onCancel });

    button(row, "Cancel").click();

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("puts the caret where the answer goes, so the command that opened it is enough", async () => {
    const row = mount();

    await vi.waitFor(() => expect(document.activeElement).toBe(input(row)));
  });
});
