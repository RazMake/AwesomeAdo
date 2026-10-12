import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkItemFieldWriteResult } from "../../../common/ado/IWorkItemFieldWriter";
import type { TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import type { WorkItemStateTransitions } from "../../../common/ado/WorkItemStateTransitions";
import type {
  QueuedFieldWrite,
  WorkItemWriteQueue,
} from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";

import { renderRequestStatusBadge } from "./RequestStatusBadge";
import { requestStateMapping } from "./requestStates";

function item(state: string): TrackedWorkItem {
  return {
    id: 7,
    rev: 3,
    type: "User Story",
    title: "Request",
    state,
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
    importance: 1,
    eta: null,
    children: [],
  };
}

const FULL_MAPPING = {
  requestStateMapping: JSON.stringify([
    {
      type: "User Story",
      states: {
        new: ["Proposed"],
        needsClarification: ["Needs Info"],
        accepted: ["Triaged", "Active"],
        rejected: ["Declined"],
        done: ["Closed"],
      },
    },
  ]),
};

/** A process where Needs Info is only reachable through Active. */
const ROUTED_PROCESS: WorkItemStateTransitions = new Map([
  ["proposed", ["Active", "Declined"]],
  ["active", ["Needs Info", "Closed", "Proposed"]],
  ["needs info", ["Active"]],
  ["triaged", ["Proposed", "Active"]],
]);

async function flush(): Promise<void> {
  for (let tick = 0; tick < 20; tick += 1) await Promise.resolve();
}

interface HarnessOptions {
  state?: string;
  properties?: Record<string, string>;
  transitions?: WorkItemStateTransitions | null;
  results?: WorkItemFieldWriteResult[];
}

function harness(options: HarnessOptions = {}) {
  const target = item(options.state ?? "Triaged");
  const sentRevs: number[] = [];
  const results = [...(options.results ?? [{ ok: true, rev: 4 }])];
  const enqueue = vi.fn((request: QueuedFieldWrite) => {
    sentRevs.push(request.currentRev());
    return Promise.resolve(results.shift() ?? { ok: true, rev: request.currentRev() + 1 });
  });
  const onCommitted = vi.fn();
  const logger = { info: vi.fn(), error: vi.fn() };
  const badge = renderRequestStatusBadge({
    doc: document,
    item: target,
    mapping: requestStateMapping(options.properties ?? FULL_MAPPING),
    queue: { enqueue } as unknown as WorkItemWriteQueue,
    transitions:
      options.transitions === undefined
        ? undefined
        : { load: () => Promise.resolve(options.transitions ?? null) },
    logger,
    minWidthCh: 19,
    now: () => new Date("2026-10-12T12:00:00Z"),
    onCommitted,
  });
  document.body.append(badge);
  const written = () => enqueue.mock.calls.map(([request]) => request.value);
  return { target, enqueue, written, sentRevs, onCommitted, logger, badge };
}

function label(badge: HTMLElement): string | null | undefined {
  return badge.querySelector(".awesomeado-status__badge")?.childNodes[0]?.textContent;
}

function offered(badge: HTMLElement): (string | null)[] {
  badge.querySelector<HTMLElement>(".awesomeado-status__badge")!.click();
  const rows = [...document.querySelectorAll(".awesomeado-status__row")];
  badge.querySelector<HTMLElement>(".awesomeado-status__badge")!.click();
  return rows.map((row) => row.textContent);
}

function pick(badge: HTMLElement, state: string): void {
  badge.querySelector<HTMLElement>(".awesomeado-status__badge")!.click();
  [...document.querySelectorAll<HTMLButtonElement>(".awesomeado-status__row")]
    .find((row) => row.textContent === state)!
    .click();
}

afterEach(() => document.body.replaceChildren());

describe("renderRequestStatusBadge", () => {
  it("shows the fixed semantic label with its requested color", () => {
    const { badge } = harness();
    const chip = badge.querySelector<HTMLElement>(".awesomeado-status__badge")!;

    expect(label(badge)).toBe("Accepted");
    expect(chip.style.background).toBe("var(--status-blue-background)");
  });

  it("offers every other status, whatever the mapping or the current state", () => {
    expect(offered(harness().badge)).toEqual(["New", "Needs Clarification", "Rejected", "Done"]);
    expect(offered(harness({ state: "Custom", properties: {} }).badge)).toEqual([
      "New",
      "Needs Clarification",
      "Accepted",
      "Rejected",
      "Done",
    ]);
  });

  it("writes the selected mapping's primary ADO state and repaints after acceptance", async () => {
    const { badge, target, written, sentRevs, onCommitted } = harness({
      results: [{ ok: true, rev: 8 }],
    });

    pick(badge, "Needs Clarification");
    expect(label(badge)).toBe("Accepted");
    await flush();

    expect(written()).toEqual(["Needs Info"]);
    expect(sentRevs).toEqual([3]);
    expect(target).toMatchObject({
      state: "Needs Info",
      rev: 8,
      stateChangeDate: "2026-10-12T12:00:00.000Z",
    });
    expect(label(badge)).toBe("Needs Clarification");
    expect(onCommitted).toHaveBeenCalledOnce();
  });

  it("leaves the request unchanged when Azure DevOps refuses the write", async () => {
    const { badge, target, onCommitted } = harness({ results: [{ ok: false, error: "conflict" }] });

    pick(badge, "New");
    await flush();

    expect(target).toMatchObject({ state: "Triaged", rev: 3 });
    expect(label(badge)).toBe("Accepted");
    expect(onCommitted).not.toHaveBeenCalled();
  });
});

describe("renderRequestStatusBadge routed changes", () => {
  it("moves through the intermediary state ADO requires, showing only the final status", async () => {
    const { badge, target, written, sentRevs, onCommitted } = harness({
      state: "Proposed",
      transitions: ROUTED_PROCESS,
      results: [
        { ok: true, rev: 4 },
        { ok: true, rev: 5 },
      ],
    });

    pick(badge, "Needs Clarification");
    await flush();

    expect(written()).toEqual(["Active", "Needs Info"]);
    expect(sentRevs).toEqual([3, 4]);
    expect(target).toMatchObject({ state: "Needs Info", rev: 5 });
    expect(label(badge)).toBe("Needs Clarification");
    expect(onCommitted).toHaveBeenCalledOnce();
  });

  it("shows where the request stopped when a later hop is refused", async () => {
    const { badge, target, onCommitted, logger } = harness({
      state: "Proposed",
      transitions: ROUTED_PROCESS,
      results: [
        { ok: true, rev: 4 },
        { ok: false, error: "HTTP 400" },
      ],
    });

    pick(badge, "Needs Clarification");
    await flush();

    expect(target).toMatchObject({ state: "Active", rev: 4 });
    expect(label(badge)).toBe("Accepted");
    expect(onCommitted).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('"Active"'));
  });

  it("routes between whatever states a different mapping names", async () => {
    const { badge, target, written } = harness({
      state: "To Do",
      properties: {
        requestStateMapping: JSON.stringify([
          {
            type: "User Story",
            states: { new: ["To Do"], needsClarification: ["Blocked"], done: ["Done"] },
          },
        ]),
      },
      transitions: new Map([
        ["to do", ["Doing"]],
        ["doing", ["Blocked", "Done"]],
      ]),
    });

    pick(badge, "Needs Clarification");
    await flush();

    expect(written()).toEqual(["Doing", "Blocked"]);
    expect(target.state).toBe("Blocked");
    expect(label(badge)).toBe("Needs Clarification");
  });
});
