import { afterEach, describe, expect, it, vi } from "vitest";

import type { TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { SprintWindow } from "../../../common/ado/sprintWindow";
import type { EnhancedViewServices } from "../../../common/view-common/EnhancedView";

import { renderNewProjectRow, type NewProjectRowOptions } from "./NewProjectRow";

const EPIC: TypeCatalogEntry = {
  name: "Epic",
  color: "ff6b6b",
  icon: "epic.svg",
  etaField: null,
  children: [],
  columns: [{ column: "Active", states: ["Active"] }],
};

const SPRINTS: SprintWindow = {
  entries: [
    { path: "Fabrikam\\Sprint 9", name: "Sprint 9", label: "Sprint 9", relation: "past" },
    { path: "Fabrikam\\Sprint 10", name: "Sprint 10", label: "Sprint 10", relation: "current" },
    { path: "Fabrikam\\Sprint 11", name: "Sprint 11", label: "Sprint 11", relation: "future" },
  ],
  currentName: "Sprint 10",
};

/** Only the one capability this row reads; the rest of the surface never reaches it. */
function services(window: SprintWindow = SPRINTS): EnhancedViewServices {
  return { loadSprintWindow: async () => window } as unknown as EnhancedViewServices;
}

function mount(overrides: Partial<NewProjectRowOptions> = {}): HTMLElement {
  const row = renderNewProjectRow({
    doc: document,
    typeName: "Epic",
    typeEntry: EPIC,
    tags: ["Catalog"],
    areaPath: "Fabrikam\\Core",
    services: services(),
    defaultIterationPath: "Fabrikam",
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

function sprintTrigger(row: HTMLElement): HTMLButtonElement {
  const trigger = row.querySelector<HTMLButtonElement>(".awesomeado-projects__new-sprint__trigger");
  if (trigger === null) throw new Error("The new project row has no sprint field.");
  return trigger;
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
  it("asks for the title and the sprint, naming the type it will create", () => {
    const row = mount();

    expect(input(row).placeholder).toBe("New Epic title");
    expect(button(row, "Add Epic")).toBeTruthy();
    expect(sprintTrigger(row)).toBeTruthy();
  });

  it("states everything the reader is not being asked to type", () => {
    const row = mount();

    // These values come from the binding and are what make the new project a member of THIS
    // catalog, so they are stated rather than offered for editing.
    expect(row.textContent).toContain("Created as a Epic tagged Catalog, under Fabrikam\\Core.");
  });

  it("warns when nothing will tag the project into this query", () => {
    const row = mount({ tags: [] });

    expect(row.textContent).toContain("this query may not return it");
  });

  it("omits the area path from the summary when the project default applies", () => {
    const row = mount({ areaPath: null });

    expect(row.textContent).not.toContain("under");
  });

  it("opens on the team's current sprint once the window lands", async () => {
    const row = mount();

    await vi.waitFor(() => expect(sprintTrigger(row).textContent).toContain("Sprint 10"));
    expect(sprintTrigger(row).disabled).toBe(false);
  });

  it("stands on the project's own default until then, and when there are no sprints", async () => {
    const row = mount({ services: services({ entries: [], currentName: null }) });

    expect(sprintTrigger(row).textContent).toContain("Fabrikam");
    // Re-enabled even with nothing to offer, so the field never reads as still loading.
    await vi.waitFor(() => expect(sprintTrigger(row).disabled).toBe(false));
  });

  it("creates the project with the typed title and the chosen sprint", async () => {
    const onSubmit = vi.fn(async () => true);
    const row = mount({ onSubmit });
    await vi.waitFor(() => expect(sprintTrigger(row).disabled).toBe(false));

    input(row).value = "Payments";
    input(row).dispatchEvent(new Event("input", { bubbles: true }));
    button(row, "Add Epic").click();

    await vi.waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith("Payments", "Fabrikam\\Sprint 10"),
    );
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
