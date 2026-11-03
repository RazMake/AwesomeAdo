import { describe, expect, it, vi } from "vitest";

import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";

import { renderSprintBulkMoveDialog } from "./SprintBulkMoveDialog";
import { buildSprintBulkMovePlan } from "./SprintBulkMovePlan";

const BOARD = ["Queue", "Active", "Waiting", "Done", "Removed"];

const types = new Map<string, TypeCatalogEntry>([
  [
    "Story",
    {
      name: "Story",
      isPrimaryWork: true,
      columns: [
        { column: "Queue", states: ["New"] },
        { column: "Active", states: ["Active"] },
        { column: "Waiting", states: ["Waiting"] },
        { column: "Done", states: ["Done"] },
        { column: "Removed", states: ["Removed"] },
      ],
    } as TypeCatalogEntry,
  ],
]);

function item(
  id: number,
  areaPath: string,
  assignee: string | null,
  state = "Active",
): TrackedWorkItem {
  return {
    id,
    type: "Story",
    state,
    areaPath,
    assignedTo:
      assignee === null
        ? null
        : { displayName: assignee, uniqueName: `${assignee.toLowerCase()}@example.com` },
  } as TrackedWorkItem;
}

// Queue: Carol. Active: Alice, Bob, and one unassigned card. Waiting: Alice. Done: Dave.
const MIXED = [
  item(1, "Project\\API", "Alice"),
  item(2, "Project\\API", "Bob"),
  item(3, "Project\\UI", "Alice", "Waiting"),
  item(4, "Project\\UI", null),
  item(5, "Project\\API", "Carol", "New"),
  item(6, "Project\\API", "Dave", "Done"),
];

function render(items: readonly TrackedWorkItem[]) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const overlay = renderSprintBulkMoveDialog(document, {
    destinationLabel: "Current - Sprint 2",
    plan: buildSprintBulkMovePlan(items, types, BOARD),
    onConfirm,
    onCancel,
  });
  document.body.append(overlay);
  return { overlay, onConfirm, onCancel };
}

function row(overlay: HTMLElement, kind: "column" | "assignee", name: string): HTMLLabelElement {
  const rows = overlay.querySelectorAll<HTMLLabelElement>(
    `.awesomeado-sprint__bulk-dialog-${kind}`,
  );
  const found = [...rows].find(
    (candidate) => candidate.querySelector("span")?.textContent === name,
  );
  if (found === undefined) throw new Error(`No ${kind} row named ${name}`);
  return found;
}

function checkbox(choice: HTMLLabelElement): HTMLInputElement {
  return choice.querySelector("input")!;
}

function count(choice: HTMLLabelElement): string | null {
  return choice.querySelector(".awesomeado-sprint__bulk-dialog-count")!.textContent;
}

function counts(overlay: HTMLElement, kind: "column" | "assignee", names: readonly string[]) {
  return Object.fromEntries(names.map((name) => [name, count(row(overlay, kind, name))]));
}

function confirmButton(overlay: HTMLElement): HTMLButtonElement {
  return overlay.querySelector<HTMLButtonElement>(".awesomeado-sprint__bulk-dialog-confirm")!;
}

function laneSummary(overlay: HTMLElement): string | null {
  return overlay.querySelector(".awesomeado-sprint__bulk-dialog-lanes")!.textContent;
}

describe("renderSprintBulkMoveDialog defaults", () => {
  it("starts with every movable column and every assignee, summarizing what would move", () => {
    const { overlay } = render(MIXED);

    expect(overlay.querySelector("h2")!.textContent).toBe("Move 4 visible item(s)?");
    expect(overlay.textContent).toContain("Destination: Current - Sprint 2");
    expect(counts(overlay, "column", ["Queue", "Active", "Waiting"])).toEqual({
      Queue: "1",
      Active: "2",
      Waiting: "1",
    });
    expect(counts(overlay, "assignee", ["Alice", "Bob", "Carol"])).toEqual({
      Alice: "2",
      Bob: "1",
      Carol: "1",
    });
    expect(laneSummary(overlay)).toBe("By laneAPI3UI1");
    expect(overlay.querySelector(".awesomeado-sprint__bulk-dialog-excluded")!.textContent).toBe(
      "1 visible unassigned item(s) excluded.",
    );
    expect(confirmButton(overlay).textContent).toBe("Move 4 item(s)");
    expect(confirmButton(overlay).disabled).toBe(false);
  });

  it("shows Done so the reader sees it, but never lets it be chosen", () => {
    const { overlay } = render(MIXED);
    const done = row(overlay, "column", "Done");

    expect(checkbox(done).disabled).toBe(true);
    expect(checkbox(done).checked).toBe(false);
    expect(done.title).toBe("Done items are never moved.");
    expect(count(done)).toBe("");
    expect(overlay.querySelectorAll(".awesomeado-sprint__bulk-dialog-assignee")).toHaveLength(3);
  });

  it("uses shortest unique Lane labels when leaves conflict", () => {
    const { overlay } = render([
      item(1, "Project\\Platform\\API", "Alice"),
      item(2, "Project\\Commerce\\API", "Bob"),
      item(3, "Other\\API", "Carol"),
    ]);

    const laneLabels = overlay.querySelectorAll(".awesomeado-sprint__bulk-dialog-lanes dt");
    expect([...laneLabels].map((label) => label.textContent)).toEqual([
      "Commerce › API",
      "Other › API",
      "Platform › API",
    ]);
  });

  it("disables confirmation when no assigned visible item is eligible", () => {
    const { overlay } = render([item(1, "Project\\API", null)]);

    expect(confirmButton(overlay).disabled).toBe(true);
    expect(overlay.textContent).toContain("No assigned items.");
  });
});

describe("renderSprintBulkMoveDialog narrowing", () => {
  it("counts each picker against the other picker's choice", () => {
    const { overlay } = render(MIXED);

    checkbox(row(overlay, "column", "Active")).click();

    expect(overlay.querySelector("h2")!.textContent).toBe("Move 2 visible item(s)?");
    expect(counts(overlay, "assignee", ["Alice", "Bob", "Carol"])).toEqual({
      Alice: "1",
      Bob: "0",
      Carol: "1",
    });
    // The unassigned card sits in Active, so unticking Active stops it counting as "excluded".
    expect(overlay.querySelector(".awesomeado-sprint__bulk-dialog-excluded")!.textContent).toBe(
      "0 visible unassigned item(s) excluded.",
    );

    checkbox(row(overlay, "assignee", "Alice")).click();

    expect(counts(overlay, "column", ["Queue", "Active", "Waiting"])).toEqual({
      Queue: "1",
      Active: "1",
      Waiting: "0",
    });
    expect(laneSummary(overlay)).toBe("By laneAPI1");
    expect(confirmButton(overlay).textContent).toBe("Move 1 item(s)");
  });

  it("confirms with exactly the columns and assignees left ticked", () => {
    const { overlay, onConfirm } = render(MIXED);
    checkbox(row(overlay, "column", "Queue")).click();
    checkbox(row(overlay, "assignee", "Bob")).click();

    confirmButton(overlay).click();

    expect(onConfirm).toHaveBeenCalledWith({
      columns: new Set([1, 2]),
      assignees: new Set(["alice@example.com", "carol@example.com"]),
    });
    expect(overlay.isConnected).toBe(false);
  });

  it("ticks and unticks every assignee at once, blocking an empty move", () => {
    const { overlay } = render(MIXED);
    const [all, none] = overlay.querySelectorAll<HTMLButtonElement>(
      ".awesomeado-sprint__bulk-dialog-assignees h3 ~ button",
    );

    none!.click();

    expect(
      [...overlay.querySelectorAll(".awesomeado-sprint__bulk-dialog-assignee input")].some(
        (input) => (input as HTMLInputElement).checked,
      ),
    ).toBe(false);
    expect(confirmButton(overlay).disabled).toBe(true);
    expect(laneSummary(overlay)).toBe("By laneNo items selected.");

    all!.click();

    expect(confirmButton(overlay).textContent).toBe("Move 4 item(s)");
    expect(confirmButton(overlay).disabled).toBe(false);
  });
});

describe("renderSprintBulkMoveDialog dismissal", () => {
  it("focuses the dialog once it is mounted", async () => {
    const { overlay } = render(MIXED);

    await Promise.resolve();

    expect(document.activeElement).toBe(overlay.querySelector(".awesomeado-sprint__bulk-dialog"));
  });

  it.each([
    [
      "Cancel",
      (overlay: HTMLElement) =>
        [...overlay.querySelectorAll("button")]
          .find((button) => button.textContent === "Cancel")!
          .click(),
    ],
    [
      "Escape",
      (overlay: HTMLElement) =>
        overlay
          .querySelector(".awesomeado-sprint__bulk-dialog")!
          .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    ],
    [
      "a backdrop press",
      (overlay: HTMLElement) => overlay.dispatchEvent(new Event("pointerdown", { bubbles: true })),
    ],
  ])("cancels without confirming on %s", (_label, dismiss) => {
    const { overlay, onConfirm, onCancel } = render(MIXED);

    dismiss(overlay);

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(overlay.isConnected).toBe(false);
  });

  it("keeps the dialog open when a press lands inside it", () => {
    const { overlay, onCancel } = render(MIXED);

    overlay
      .querySelector(".awesomeado-sprint__bulk-dialog")!
      .dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(overlay.isConnected).toBe(true);
  });
});
