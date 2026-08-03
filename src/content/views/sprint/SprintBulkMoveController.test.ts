import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkItemFieldWriteResult } from "../../../common/ado/IWorkItemFieldWriter";
import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { QueuedFieldWrite } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import type { SprintWindowEntry } from "../../../common/ado/sprintWindow";
import type { ILogger } from "../../../common/logging/ILogger";

import { SprintBulkMoveController, type SprintBulkMoveRequest } from "./SprintBulkMoveController";

const SOURCE = "Project\\Sprint 1";
const DESTINATION = "Project\\Sprint 2";

function sprint(path: string, relation: SprintWindowEntry["relation"]): SprintWindowEntry {
  return { path, name: path, label: path, relation };
}

function types(): TypeCatalogEntry[] {
  return [
    {
      name: "Story",
      color: "#0078d4",
      icon: "",
      isPrimaryWork: true,
      etaField: null,
      children: [],
      columns: [
        { column: "Queue", states: ["New"] },
        { column: "Active", states: ["Active"] },
        { column: "Waiting", states: ["Waiting"] },
        { column: "Done", states: ["Done"] },
      ],
    },
  ];
}

function item(id: number): TrackedWorkItem {
  return {
    id,
    rev: 1,
    type: "Story",
    state: "Active",
    iterationPath: SOURCE,
    sprintName: "Sprint 1",
    areaPath: "Project\\API",
    assignedTo: { displayName: "Alice", uniqueName: "alice@example.com", imageUrl: null },
    children: [],
  } as unknown as TrackedWorkItem;
}

interface Harness {
  status: HTMLElement;
  releaseWrite(): void;
  /** Resolves once the run has released its document-wide guards. */
  settled: Promise<void>;
  openDiagnosticsLog: ReturnType<typeof vi.fn>;
}

/**
 * Starts a confirmed run whose LAST write is held open, so the status bar can be inspected and
 * clicked while the operation is still in flight — the only moment its interaction guards are armed.
 */
function harness(failedWrites = 0): Harness {
  let releaseWrite = (): void => undefined;
  const settledResults: WorkItemFieldWriteResult[] = Array.from({ length: failedWrites }, () => ({
    ok: false,
    error: "HTTP 400",
  }));
  const enqueue = vi.fn<(request: QueuedFieldWrite) => Promise<WorkItemFieldWriteResult>>(() => {
    const settled = settledResults.shift();
    if (settled !== undefined) return Promise.resolve(settled);
    return new Promise<WorkItemFieldWriteResult>((resolve) => {
      releaseWrite = () => resolve({ ok: true, rev: 2 });
    });
  });
  const openDiagnosticsLog = vi.fn();
  const mountInto = document.createElement("div");
  const status = document.createElement("span");
  status.className = "awesomeado-sprint__bulk-move-status";
  document.body.append(mountInto, status);
  const logger: ILogger = { info: vi.fn(), error: vi.fn() };
  const controller = new SprintBulkMoveController({
    doc: document,
    mountInto,
    writes: { enqueue },
    logger,
    openDiagnosticsLog,
  });
  controller.attachStatus(status);
  const items = [...Array.from({ length: failedWrites }, (_, index) => item(index + 2)), item(1)];
  let markSettled = (): void => undefined;
  const settled = new Promise<void>((resolve) => {
    markSettled = resolve;
  });
  const request: SprintBulkMoveRequest = {
    source: sprint(SOURCE, "past"),
    destination: sprint(DESTINATION, "future"),
    visibleItems: items,
    types: types(),
    loadRoots: async () => items,
    onSettled: () => markSettled(),
  };
  controller.open(request);
  mountInto.querySelector<HTMLButtonElement>(".awesomeado-sprint__bulk-dialog-confirm")!.click();
  return { status, releaseWrite: () => releaseWrite(), settled, openDiagnosticsLog };
}

function summaryOf(status: HTMLElement): Promise<HTMLElement> {
  return vi.waitFor(() => {
    const element = status.querySelector<HTMLElement>(".awesomeado-sprint__bulk-move-summary");
    expect(element).not.toBeNull();
    return element!;
  });
}

function cancelOf(status: HTMLElement): Promise<HTMLButtonElement> {
  return vi.waitFor(() => {
    const button = status.querySelector<HTMLButtonElement>(".awesomeado-sprint__cancel-bulk");
    expect(button).not.toBeNull();
    return button!;
  });
}

describe("SprintBulkMoveController status controls", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("keeps the same controls across the repaint every write triggers", async () => {
    const { status, releaseWrite, settled } = harness();
    const summary = await summaryOf(status);
    const cancel = await cancelOf(status);
    expect(cancel.textContent).toBe("Cancel");

    releaseWrite();
    await settled;

    // A rebuilt control drops any click that started before the repaint, which is what made
    // cancelling and opening the log take several attempts during a busy run.
    expect(summary.textContent).toContain("1 moved");
    expect(status.querySelector(".awesomeado-sprint__bulk-move-summary")).toBe(summary);
  });

  it("accepts a cancel click while the run blocks the rest of the view", async () => {
    const { status, releaseWrite, settled } = harness();
    const cancel = await cancelOf(status);

    const blocked = new MouseEvent("click", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);

    const allowed = new MouseEvent("click", { bubbles: true, cancelable: true });
    cancel.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);
    expect(cancel.textContent).toBe("Cancelling…");
    expect(cancel.disabled).toBe(true);

    releaseWrite();
    await settled;
  });

  it("opens Diagnostics from the failure summary during the run", async () => {
    const { status, releaseWrite, settled, openDiagnosticsLog } = harness(1);
    const summary = await vi.waitFor(async () => {
      const element = await summaryOf(status);
      expect(element.localName).toBe("button");
      return element;
    });

    summary.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(summary.title).toBe("HTTP 400");
    expect(openDiagnosticsLog).toHaveBeenCalledTimes(1);

    releaseWrite();
    await settled;
  });
});
