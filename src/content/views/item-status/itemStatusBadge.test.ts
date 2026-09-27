import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkItemFieldWriteResult } from "../../../common/ado/IWorkItemFieldWriter";
import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";

import { renderItemStatusBadge, widestStatusLabelLength } from "./itemStatusBadge";

const REQUEST_TYPE: TypeCatalogEntry = {
  name: "Request",
  color: "009ccc",
  icon: "",
  etaField: null,
  columns: [
    { column: "Proposed", states: ["New"] },
    { column: "In Progress", states: ["Active"] },
    { column: "Delivered", states: ["Closed"] },
    { column: "Unmapped", states: [] },
  ],
};

function item(overrides: Partial<TrackedWorkItem> & { id: number }): TrackedWorkItem {
  return {
    rev: 1,
    type: "Request",
    title: `Item ${overrides.id}`,
    state: "New",
    priority: null,
    assignedTo: null,
    areaPath: null,
    iterationPath: null,
    sprintName: null,
    createdDate: "",
    createdBy: null,
    changedDate: "",
    changedBy: null,
    stateChangeDate: "",
    description: "",
    noteCount: 0,
    tags: [],
    importance: 0,
    eta: null,
    children: [],
    ...overrides,
  };
}

async function flush(): Promise<void> {
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
}

function mountBadge(target: TrackedWorkItem, result: WorkItemFieldWriteResult) {
  const enqueue = vi.fn<(request: unknown) => Promise<typeof result>>(async () => result);
  const onCommitted = vi.fn();
  const badge = renderItemStatusBadge({
    doc: document,
    item: target,
    entry: REQUEST_TYPE,
    boardColumns: ["Proposed", "In Progress", "Delivered"],
    queue: { enqueue } as unknown as WorkItemWriteQueue,
    minWidthCh: 12,
    now: () => new Date("2026-07-15T00:00:00Z"),
    onCommitted,
  });
  document.body.append(badge);
  return { badge, enqueue, onCommitted };
}

const badgeLabel = (badge: HTMLElement): string | null | undefined =>
  badge.querySelector(".awesomeado-status__badge")?.childNodes[0]?.textContent;

function pick(badge: HTMLElement, column: string): void {
  badge.querySelector<HTMLElement>(".awesomeado-status__badge")!.click();
  const rows = [...document.querySelectorAll<HTMLButtonElement>(".awesomeado-status__row")];
  rows.find((row) => row.textContent === column)!.click();
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("renderItemStatusBadge", () => {
  it("shows the mapped column label and offers only columns with states", () => {
    const { badge } = mountBadge(item({ id: 1, state: "Active" }), { ok: true, rev: 2 });

    expect(badgeLabel(badge)).toBe("In Progress");
    badge.querySelector<HTMLElement>(".awesomeado-status__badge")!.click();
    const offered = [...document.querySelectorAll(".awesomeado-status__row")].map(
      (row) => row.textContent,
    );
    expect(offered).toEqual(["Proposed", "Delivered"]);
  });

  it("writes the column's primary state and reflects it only after ADO accepts", async () => {
    const target = item({ id: 1 });
    const { badge, enqueue, onCommitted } = mountBadge(target, { ok: true, rev: 7 });

    pick(badge, "Delivered");
    const request = enqueue.mock.calls[0]![0] as {
      field: string;
      value: string;
      currentRev(): number;
    };
    expect(request).toMatchObject({ id: 1, field: "System.State", value: "Closed" });
    expect(request.currentRev()).toBe(1);
    expect(badgeLabel(badge)).toBe("Proposed");

    await flush();

    expect(target).toMatchObject({
      state: "Closed",
      rev: 7,
      stateChangeDate: "2026-07-15T00:00:00.000Z",
    });
    expect(badgeLabel(badge)).toBe("Delivered");
    expect(onCommitted).toHaveBeenCalledTimes(1);
  });

  it("leaves the item and label alone when the write is refused", async () => {
    const target = item({ id: 1 });
    const { badge, onCommitted } = mountBadge(target, { ok: false, error: "conflict" });

    pick(badge, "Delivered");
    await flush();

    expect(target.state).toBe("New");
    expect(badgeLabel(badge)).toBe("Proposed");
    expect(onCommitted).not.toHaveBeenCalled();
  });
});

describe("widestStatusLabelLength", () => {
  it("covers every column label and every displayed status, descendants included", () => {
    const types = new Map([["Request", REQUEST_TYPE]]);
    const items = [item({ id: 1, children: [item({ id: 2, state: "Awaiting sign-off" })] })];

    expect(widestStatusLabelLength(items, types)).toBe("Awaiting sign-off".length);
    expect(widestStatusLabelLength([], types)).toBe("In Progress".length);
  });
});
