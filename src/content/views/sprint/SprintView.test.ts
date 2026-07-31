import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrackedUser, TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import { normalizeMarkerTags } from "../../../common/settings/ExtensionSettings";
import type { EnhancedViewServices } from "../../../common/view-common/EnhancedView";

import { sprintView } from "./SprintView";

function user(displayName: string): TrackedUser {
  return {
    displayName,
    uniqueName: `${displayName.toLocaleLowerCase()}@example.com`,
    imageUrl: null,
  };
}

function item(
  id: number,
  title: string,
  overrides: Partial<TrackedWorkItem> = {},
): TrackedWorkItem {
  return {
    id,
    rev: 1,
    type: "Story",
    title,
    state: "New",
    priority: null,
    assignedTo: user("Alice"),
    areaPath: "Project\\Platform",
    iterationPath: "Project\\Sprint 1",
    sprintName: "Sprint 1",
    createdDate: "2026-07-31T10:00:00Z",
    createdBy: null,
    changedDate: "2026-07-31T10:00:00Z",
    changedBy: null,
    stateChangeDate: "2026-07-31T10:00:00Z",
    description: "",
    noteCount: 0,
    tags: [],
    importance: id,
    eta: null,
    children: [],
    ...overrides,
  };
}

function defaultTree(): TrackedWorkItem[] {
  return [
    item(1, "Active blocked", { state: "Active", tags: ["Blocked"] }),
    item(2, "Queued"),
    item(3, "Unowned", { assignedTo: null, tags: ["Interrupt"] }),
    item(4, "Next sprint", {
      assignedTo: user("Bob"),
      iterationPath: "Project\\Sprint 2",
      sprintName: "Sprint 2",
    }),
  ];
}

function services(overrides: Partial<EnhancedViewServices> = {}): EnhancedViewServices {
  return {
    loadTree: async () => ({ isTreeQuery: false, roots: defaultTree(), error: null }),
    loadSprintWindow: async () => ({
      entries: [
        {
          id: "sprint-1",
          path: "Project\\Sprint 1",
          name: "Sprint 1",
          label: "Current - Sprint 1",
          relation: "current",
        },
        {
          id: "sprint-2",
          path: "Project\\Sprint 2",
          name: "Sprint 2",
          label: "Next - Sprint 2",
          relation: "future",
        },
      ],
      currentName: "Sprint 1",
    }),
    loadSprintCapacity: async () => ({
      members: [
        {
          id: "alice-id",
          displayName: "Alice",
          uniqueName: "alice@example.com",
          imageUrl: null,
        },
        { id: "bob-id", displayName: "Bob", uniqueName: "bob@example.com", imageUrl: null },
      ],
      error: null,
    }),
    getTypes: () => [
      {
        name: "Story",
        color: "#0078d4",
        icon: "icon",
        etaField: null,
        columns: [
          { column: "Queue", states: ["New"] },
          { column: "Active", states: ["Active"] },
          { column: "Waiting", states: ["Waiting"] },
          { column: "Done", states: ["Done"] },
          { column: "Removed", states: ["Removed"] },
        ],
      },
    ],
    getBoardColumns: () => ["Queue", "Active", "Waiting", "Done", "Removed"],
    markerTags: () => normalizeMarkerTags(undefined),
    now: () => new Date("2026-07-31T12:00:00Z"),
    logger: { info: vi.fn(), error: vi.fn() },
    noteActivity: { readNoteActivity: async () => ({ activity: [], error: null }) },
    noteLoader: { loadNotes: async () => ({ notes: [], currentUser: null, error: null }) },
    noteWriter: {
      addNote: async () => ({ ok: true }),
      editNote: async () => ({ ok: true }),
    },
    userDirectory: { search: async () => [], resolve: async () => null },
    mentionDirectory: {
      resolveNames: async () => new Map<string, string>(),
      knownNames: () => new Map<string, string>(),
    },
    featureCrew: { reconcile: async () => ({ ok: true, changed: false }) },
    writeField: async () => ({ ok: true }),
    reorderItem: async () => ({ ok: true }),
    currentTeam: () => "team-id",
    openDiagnosticsLog: vi.fn(),
    ...overrides,
  };
}

async function render(overrides: Partial<EnhancedViewServices> = {}): Promise<HTMLElement> {
  const root = sprintView.render({
    doc: document,
    queryId: "query-id",
    properties: {},
    services: services(overrides),
  });
  document.body.append(root);
  await vi.waitFor(() => expect(root.querySelector(".awesomeado-sprint__header")).not.toBeNull());
  return root;
}

function metric(pill: Element, kind: string): string | null | undefined {
  return pill.querySelector(`[data-count="${kind}"]`)?.textContent;
}

afterEach(() => document.body.replaceChildren());

describe("Sprint View header", () => {
  it("renders capacity members, Unassigned, and queue/active counts", async () => {
    const root = await render();
    const alice = root.querySelector('[data-person="alice@example.com"]')!;
    const bob = root.querySelector('[data-person="bob@example.com"]')!;
    const unassigned = root.querySelector('[data-person="__unassigned__"]')!;
    const sprintSelect = root.querySelector<HTMLSelectElement>(".awesomeado-sprint-picker__select");

    expect(root.querySelector(".awesomeado-sprint__title")?.textContent).toBe("Sprint View");
    expect(root.querySelector(".awesomeado-sprint-picker__button")).toBeNull();
    expect(sprintSelect?.disabled).toBe(false);
    expect(metric(alice, "queue")).toBe("2");
    expect(metric(alice, "active")).toBe("1");
    expect(metric(bob, "queue")).toBe("0");
    expect(metric(unassigned, "queue")).toBe("1");
    expect(root.querySelectorAll(".awesomeado-sprint__item")).toHaveLength(3);
  });

  it("uses full-opacity compact pills and separates marker and activity families", async () => {
    const root = await render();
    const person = root.querySelector<HTMLElement>(".awesomeado-sprint__person-pill")!;
    const marker = root.querySelector<HTMLElement>(".awesomeado-marker-pill")!;
    const activity = root.querySelector<HTMLElement>(".awesomeado-activity-pill")!;

    for (const pill of [person, marker, activity]) {
      expect(pill.style.fontSize).toBe("9px");
      expect(pill.style.padding).toBe("1px 8px");
      expect(pill.style.borderRadius).toBe("9px");
      expect(pill.style.lineHeight).toBe("1.6");
    }
    expect(activity.style.background).toContain("--activity-created-background");
    expect(person.style.opacity).toBe("1");
    expect(marker.style.opacity).toBe("1");
    expect(activity.style.opacity).toBe("1");
    const families = root.querySelector<HTMLElement>(".awesomeado-filter-pill-families")!;
    expect(families.style.gap).toBe("16px");
    expect(families.querySelectorAll(".awesomeado-filter-pill-family")).toHaveLength(2);
    expect(
      families.querySelector<HTMLElement>('[data-filter-pill-family="other"]')?.style.gap,
    ).toBe("6px");
    expect(
      families.querySelector<HTMLElement>('[data-filter-pill-family="activity"]')?.style.gap,
    ).toBe("6px");
    expect(metric(marker, "total")).toBe("1");
    expect(marker.querySelectorAll(".awesomeado-filter-pill__count")).toHaveLength(1);
    expect(marker.querySelector<HTMLElement>('[data-count="total"]')?.style.height).toBe("14px");
  });

  it("splits unaccepted and accepted Interrupts, then collapses when none are unaccepted", async () => {
    const roots = [
      item(1, "Accepted interrupt", { tags: ["Interrupt"] }),
      item(2, "Unaccepted interrupt", {
        tags: ["Interrupt"],
        iterationPath: "Project\\Backlog",
        sprintName: "Backlog",
      }),
    ];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
    });
    const interrupt = root.querySelector('[data-marker="interrupt"]')!;

    expect(metric(interrupt, "unaccepted")).toBe("1");
    expect(metric(interrupt, "accepted")).toBe("1");
    expect(metric(interrupt, "total")).toBeUndefined();

    const acceptedOnly = await render({
      loadTree: async () => ({ isTreeQuery: false, roots: [roots[0]!], error: null }),
    });
    const collapsed = acceptedOnly.querySelector('[data-marker="interrupt"]')!;
    expect(metric(collapsed, "total")).toBe("1");
    expect(collapsed.querySelectorAll(".awesomeado-filter-pill__count")).toHaveLength(1);
  });
});

describe("Sprint View filters", () => {
  it("filters the item queue from a capacity-member pill", async () => {
    const root = await render();
    root.querySelector<HTMLButtonElement>('[data-person="__unassigned__"]')!.click();

    expect(root.querySelectorAll(".awesomeado-sprint__item")).toHaveLength(1);
    expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain("Unowned");
  });

  it("filters the queue from the Lane full-path selector", async () => {
    const roots = [item(1, "Platform item"), item(2, "Apps item", { areaPath: "Project\\Apps" })];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
    });

    root.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.click();
    const checkbox = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (input) => input.value === "Project\\Apps",
    )!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event("change"));

    expect(root.querySelectorAll(".awesomeado-sprint__item")).toHaveLength(1);
    expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain("Apps item");
  });

  it("offers only ancestors of items shown in the selected sprint", async () => {
    const shownChild = item(3, "Shown child");
    const otherSprintChild = item(5, "Other sprint child", {
      iterationPath: "Project\\Sprint 2",
      sprintName: "Sprint 2",
    });
    const shownParent = item(2, "Shown parent", {
      iterationPath: "Project\\Backlog",
      sprintName: "Backlog",
      children: [shownChild],
    });
    const otherParent = item(4, "Other parent", {
      iterationPath: "Project\\Backlog",
      sprintName: "Backlog",
      children: [otherSprintChild],
    });
    const roots = [
      item(1, "Portfolio", {
        iterationPath: "Project\\Backlog",
        sprintName: "Backlog",
        children: [shownParent, otherParent],
      }),
    ];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: true, roots, error: null }),
    });

    root.querySelector<HTMLButtonElement>(".awesomeado-hierarchy-filter__trigger")!.click();
    const options = root.querySelectorAll<HTMLElement>(".awesomeado-hierarchy-filter__option");
    expect([...options].map((option) => option.dataset.itemId)).toEqual(["", "1", "2"]);

    const parentRadio = root.querySelector<HTMLInputElement>(
      '.awesomeado-hierarchy-filter__option[data-item-id="2"] input',
    )!;
    parentRadio.checked = true;
    parentRadio.dispatchEvent(new Event("change"));

    expect(root.querySelectorAll(".awesomeado-sprint__item")).toHaveLength(1);
    expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain("Shown child");
  });

  it("filters the queue from a marker pill", async () => {
    const root = await render();
    root.querySelector<HTMLButtonElement>('[data-marker="blocked"]')!.click();

    expect(root.querySelectorAll(".awesomeado-sprint__item")).toHaveLength(1);
    expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain("Active blocked");
  });

  it("filters the queue from a recent-activity pill", async () => {
    const roots = [
      item(1, "Recent item"),
      item(2, "Old item", {
        createdDate: "2026-07-01T10:00:00Z",
        changedDate: "2026-07-01T10:00:00Z",
      }),
    ];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
    });

    root.querySelector<HTMLButtonElement>('[data-activity="created"]')!.click();

    expect(root.querySelectorAll(".awesomeado-sprint__item")).toHaveLength(1);
    expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain("Recent item");
  });
});

describe("Sprint View refresh", () => {
  it("replaces both query items and the capacity roster on refresh", async () => {
    const loadTree = vi
      .fn<EnhancedViewServices["loadTree"]>()
      .mockResolvedValueOnce({ isTreeQuery: false, roots: defaultTree(), error: null })
      .mockResolvedValue({
        isTreeQuery: false,
        roots: [item(9, "Carol item", { assignedTo: user("Carol") })],
        error: null,
      });
    const loadSprintCapacity = vi
      .fn<EnhancedViewServices["loadSprintCapacity"]>()
      .mockResolvedValueOnce({
        members: [
          { id: "alice", displayName: "Alice", uniqueName: "alice@example.com", imageUrl: null },
        ],
        error: null,
      })
      .mockResolvedValue({
        members: [
          { id: "carol", displayName: "Carol", uniqueName: "carol@example.com", imageUrl: null },
        ],
        error: null,
      });
    const root = await render({ loadTree, loadSprintCapacity });

    root.querySelector<HTMLButtonElement>(".awesomeado-sprint__refresh")!.click();
    await vi.waitFor(() =>
      expect(root.querySelector('[data-person="carol@example.com"]')).not.toBeNull(),
    );

    expect(root.querySelector('[data-person="alice@example.com"]')).toBeNull();
    expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain("Carol item");
    expect(loadTree).toHaveBeenCalledTimes(2);
    expect(loadSprintCapacity).toHaveBeenCalledTimes(2);
  });

  it("opens Diagnostics when the failed refresh control is clicked again", async () => {
    const openDiagnosticsLog = vi.fn();
    const loadTree = vi
      .fn<EnhancedViewServices["loadTree"]>()
      .mockResolvedValueOnce({ isTreeQuery: false, roots: defaultTree(), error: null })
      .mockResolvedValue({ isTreeQuery: false, roots: [], error: "refresh failed" });
    const root = await render({ loadTree, openDiagnosticsLog });

    root.querySelector<HTMLButtonElement>(".awesomeado-sprint__refresh")!.click();
    await vi.waitFor(() =>
      expect(
        root.querySelector<HTMLButtonElement>(".awesomeado-sprint__refresh")?.style.color,
      ).toBe("var(--palette-error-text)"),
    );
    root.querySelector<HTMLButtonElement>(".awesomeado-sprint__refresh")!.click();

    expect(openDiagnosticsLog).toHaveBeenCalledOnce();
  });
});
