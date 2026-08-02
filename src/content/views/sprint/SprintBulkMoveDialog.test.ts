import { describe, expect, it, vi } from "vitest";

import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";

import { buildSprintBulkMovePlan, renderSprintBulkMoveDialog } from "./SprintBulkMoveDialog";

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

describe("buildSprintBulkMovePlan", () => {
  it("snapshots only assigned visible non-Done Primary-work cards", () => {
    const plan = buildSprintBulkMovePlan(
      [
        item(1, "Project\\API", "Alice"),
        item(2, "Project\\UI", null),
        item(3, "Project\\API", "Bob", "Done"),
      ],
      types,
    );

    expect(plan.candidates).toEqual([
      {
        id: 1,
        areaPath: "Project\\API",
        assigneeValue: "alice@example.com",
        assigneeLabel: "Alice",
      },
    ]);
    expect(plan.unassignedExcluded).toBe(1);
  });
});

describe("renderSprintBulkMoveDialog", () => {
  it("summarizes eligible items by lane and assignee before confirmation", () => {
    const onConfirm = vi.fn();
    const dialog = renderSprintBulkMoveDialog(document, {
      destinationLabel: "Current - Sprint 2",
      plan: buildSprintBulkMovePlan(
        [
          item(1, "Project\\API", "Alice"),
          item(2, "Project\\API", "Bob"),
          item(3, "Project\\UI", "Alice"),
          item(4, "Project\\UI", null),
        ],
        types,
      ),
      onConfirm,
      onCancel: vi.fn(),
    });
    document.body.append(dialog);

    expect(dialog.textContent).toContain("Move 3 visible item(s)?");
    expect(dialog.textContent).toContain("Destination: Current - Sprint 2");
    expect(dialog.textContent).toContain("API2");
    expect(dialog.textContent).toContain("UI1");
    expect(dialog.textContent).toContain("Alice2");
    expect(dialog.textContent).toContain("1 visible unassigned item(s) excluded.");
    dialog.querySelector<HTMLButtonElement>(".awesomeado-sprint__bulk-dialog-confirm")!.click();
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(dialog.isConnected).toBe(false);
  });

  it("uses shortest unique Lane labels when leaves conflict", () => {
    const dialog = renderSprintBulkMoveDialog(document, {
      destinationLabel: "Sprint 2",
      plan: buildSprintBulkMovePlan(
        [
          item(1, "Project\\Platform\\API", "Alice"),
          item(2, "Project\\Commerce\\API", "Bob"),
          item(3, "Other\\API", "Carol"),
        ],
        types,
      ),
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });

    const laneLabels = [...dialog.querySelectorAll("section")][0]!.querySelectorAll("dt");
    expect([...laneLabels].map((label) => label.textContent)).toEqual([
      "Commerce › API",
      "Other › API",
      "Platform › API",
    ]);
  });

  it("disables confirmation when no assigned visible item is eligible", () => {
    const dialog = renderSprintBulkMoveDialog(document, {
      destinationLabel: "Sprint 2",
      plan: buildSprintBulkMovePlan([item(1, "Project\\API", null)], types),
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
    });

    expect(
      dialog.querySelector<HTMLButtonElement>(".awesomeado-sprint__bulk-dialog-confirm")!.disabled,
    ).toBe(true);
  });
});
