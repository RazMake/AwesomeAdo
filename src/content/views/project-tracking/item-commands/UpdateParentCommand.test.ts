import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkItemReorderResult } from "../../../../common/ado/IWorkItemReorderWriter";
import type { WorkItemTreeResult } from "../../../../common/ado/IWorkItemTreeLoader";
import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import type { EnhancedViewServices } from "../../../../common/view-common/EnhancedView";

import {
  PARENT_LOOKUP_DELAY_MS,
  buildUpdateParentCommand,
  type ParentCommandOptions,
} from "./UpdateParentCommand";

function itemOf(id: number, type: string, title: string): TrackedWorkItem {
  return {
    id,
    rev: 3,
    type,
    title,
    state: "Active",
    priority: null,
    assignedTo: null,
    areaPath: null,
    iterationPath: null,
    sprintName: null,
    createdDate: "2026-01-01T00:00:00Z",
    createdBy: null,
    changedDate: "2026-01-01T00:00:00Z",
    changedBy: null,
    stateChangeDate: "2026-01-01T00:00:00Z",
    description: "",
    noteCount: 0,
    tags: [],
    importance: 1,
    eta: null,
    children: [],
  };
}

const PARENT = itemOf(77, "Feature", "Checkout revamp");

interface Harness {
  options: ParentCommandOptions;
  loadTree: ReturnType<typeof vi.fn>;
  enqueueReorder: ReturnType<typeof vi.fn>;
  onReload: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  errors: string[];
  panel: HTMLElement;
}

function harness(
  overrides: {
    team?: string | null;
    found?: TrackedWorkItem[];
    loadError?: string | null;
    reorder?: WorkItemReorderResult;
  } = {},
): Omit<Harness, "panel"> & { open(): HTMLElement } {
  const errors: string[] = [];
  const loadTree = vi.fn((): Promise<WorkItemTreeResult> =>
    Promise.resolve({
      isTreeQuery: false,
      roots: overrides.found ?? [PARENT],
      error: overrides.loadError ?? null,
    }),
  );
  const enqueueReorder = vi.fn(() =>
    Promise.resolve(overrides.reorder ?? { ok: true, rev: 9, reparented: true }),
  );
  const onReload = vi.fn();
  const close = vi.fn();
  const services = {
    currentTeam: () => (overrides.team === undefined ? "Team A" : overrides.team),
    loadTree,
    getTypes: () => [
      { name: "Feature", color: "773b93", icon: "feature.svg", etaField: null, columns: [] },
    ],
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: (message: string) => errors.push(message),
    },
  } as unknown as EnhancedViewServices;
  const options: ParentCommandOptions = {
    doc: document,
    item: itemOf(5, "Story", "Pay by card"),
    services,
    queue: { enqueueReorder } as unknown as WorkItemWriteQueue,
    onChanged: vi.fn(),
    queryId: "query-1",
    onReload,
  };
  return {
    options,
    loadTree,
    enqueueReorder,
    onReload,
    close,
    errors,
    open: () => {
      const panel = buildUpdateParentCommand(options).panel!(close);
      document.body.append(panel);
      return panel;
    },
  };
}

function input(panel: HTMLElement): HTMLInputElement {
  return panel.querySelector<HTMLInputElement>(".awesomeado-parent-picker__input")!;
}

function button(panel: HTMLElement, label: string): HTMLButtonElement {
  return [...panel.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  )!;
}

function result(panel: HTMLElement): string {
  return panel.querySelector(".awesomeado-parent-picker__result")!.textContent ?? "";
}

function type(panel: HTMLElement, text: string): void {
  input(panel).value = text;
  input(panel).dispatchEvent(new Event("input"));
}

async function settle(): Promise<void> {
  await vi.advanceTimersByTimeAsync(PARENT_LOOKUP_DELAY_MS);
}

function stubClipboard(readText: () => Promise<string>): void {
  Object.defineProperty(window.navigator, "clipboard", { value: { readText }, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  stubClipboard(() => Promise.resolve(""));
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("Update parent command", () => {
  it("is disabled with a reason when no team is configured", () => {
    const command = buildUpdateParentCommand(harness({ team: null }).options);
    expect(command.label).toBe("Update parent");
    expect(command.disabledReason).toMatch(/No team is configured/);
  });

  it("keeps Set disabled and Cancel enabled until an item resolves", async () => {
    const h = harness();
    const panel = h.open();
    await settle();
    expect(button(panel, "Set").disabled).toBe(true);
    expect(button(panel, "Cancel").disabled).toBe(false);
    expect(result(panel)).toBe("Enter a work item ID or URL.");
    button(panel, "Cancel").click();
    expect(h.close).toHaveBeenCalledOnce();
  });

  it("waits for typing to pause, then shows the resolved item's type and title", async () => {
    const h = harness();
    const panel = h.open();
    type(panel, "7");
    type(panel, "77");
    await vi.advanceTimersByTimeAsync(PARENT_LOOKUP_DELAY_MS - 1);
    expect(h.loadTree).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.loadTree).toHaveBeenCalledOnce();
    expect(h.loadTree).toHaveBeenCalledWith(
      "query-1",
      "SELECT [System.Id] FROM WorkItems WHERE [System.Id] = 77",
    );
    expect(result(panel)).toBe("Checkout revamp");
    expect(panel.querySelector(".awesomeado-type-icon")).not.toBeNull();
    const title = panel.querySelector<HTMLElement>(".awesomeado-parent-picker__title")!;
    expect(title.style.color).not.toBe("");
    expect(button(panel, "Set").disabled).toBe(false);
  });

  it("pre-populates a cleaned id from a clipboard work item URL", async () => {
    stubClipboard(() => Promise.resolve("https://dev.azure.com/o/P/_workitems/edit/77"));
    const h = harness();
    const panel = h.open();
    await settle();
    expect(input(panel).value).toBe("77");
    expect(result(panel)).toContain("Checkout revamp");
  });

  it("ignores clipboard text that is not an id, and logs a refused read", async () => {
    stubClipboard(() => Promise.resolve("hello"));
    const panel = harness().open();
    await settle();
    expect(input(panel).value).toBe("");

    stubClipboard(() => Promise.reject(new Error("denied")));
    const h = harness();
    h.open();
    await settle();
    expect(h.errors).toEqual(["Update parent could not read the clipboard"]);
  });

  it("explains an unknown item, a failed lookup, and the item itself", async () => {
    const missing = harness({ found: [] });
    const panel = missing.open();
    type(panel, "123");
    await settle();
    expect(result(panel)).toBe("Item 123 was not found.");

    const failing = harness({ loadError: "boom" });
    const failedPanel = failing.open();
    type(failedPanel, "77");
    await settle();
    expect(failing.errors).toEqual(["Update parent could not look up item 77: boom"]);

    const self = harness();
    const selfPanel = self.open();
    type(selfPanel, "5");
    await settle();
    expect(result(selfPanel)).toBe("An item cannot be its own parent.");
    expect(self.loadTree).not.toHaveBeenCalled();
  });
});

describe("Update parent command — while resolving", () => {
  it("disables Set and shows a spinner from the first keystroke until the new id resolves", async () => {
    const h = harness();
    const panel = h.open();
    type(panel, "77");
    await settle();
    expect(button(panel, "Set").disabled).toBe(false);
    type(panel, "077");
    expect(button(panel, "Set").disabled).toBe(true);
    expect(button(panel, "Set").style.opacity).toBe("0.5");
    expect(panel.querySelector(".awesomeado-parent-picker__spinner")).not.toBeNull();
    expect(result(panel)).toBe("Looking up\u2026");
    // Enter during the wait must not save the previously resolved item.
    input(panel).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(h.enqueueReorder).not.toHaveBeenCalled();
    await settle();
    expect(panel.querySelector(".awesomeado-parent-picker__spinner")).toBeNull();
    expect(button(panel, "Set").style.opacity).toBe("");
  });
});

describe("Update parent command — saving", () => {
  it("re-parents through the queue, then closes and reloads the view", async () => {
    const h = harness();
    const panel = h.open();
    type(panel, "77");
    await settle();
    button(panel, "Set").click();
    await vi.advanceTimersByTimeAsync(0);
    const request = h.enqueueReorder.mock.calls[0]![0] as {
      parentId: number;
      team: string;
      currentRev(): number;
    };
    expect(request).toMatchObject({ id: 5, parentId: 77, team: "Team A", siblingIds: [5] });
    // A resolver, not a snapshot: it reads the rev the item holds when the move runs.
    expect(request.currentRev()).toBe(9);
    expect(h.options.item.rev).toBe(9);
    expect(h.close).toHaveBeenCalledOnce();
    expect(h.onReload).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open with a note when the move is refused", async () => {
    const h = harness({ reorder: { ok: false, error: "412" } });
    const panel = h.open();
    type(panel, "77");
    await settle();
    input(panel).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(h.close).not.toHaveBeenCalled();
    expect(h.onReload).not.toHaveBeenCalled();
    expect(panel.textContent).toContain("Not saved");
    expect(button(panel, "Set").disabled).toBe(false);
    input(panel).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(h.close).toHaveBeenCalledOnce();
  });
});
