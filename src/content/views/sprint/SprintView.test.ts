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
    loadQueryDefinition: async () => ({
      wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.IterationPath] = @CurrentSprint",
      error: null,
    }),
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
    loadTeamMembers: async () => ({
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
        isPrimaryWork: true,
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

function drag(source: HTMLElement, target: HTMLElement): void {
  const values = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: "none",
    dropEffect: "none",
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? "",
  } as unknown as DataTransfer;
  for (const type of ["dragstart", "dragover", "drop"]) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
    (type === "dragstart" ? source : target).dispatchEvent(event);
  }
}

afterEach(() => document.body.replaceChildren());

describe("Sprint View breadcrumbs", () => {
  it("renders query-folder breadcrumbs at the top of the header", async () => {
    const root = await render({
      loadTree: async () => ({
        isTreeQuery: false,
        roots: defaultTree(),
        error: null,
        folderPath: [
          { label: "Delivery", path: "Shared Queries/Delivery" },
          { label: "Sprint Boards", path: "Shared Queries/Delivery/Sprint Boards" },
        ],
      }),
    });

    const header = root.querySelector(".awesomeado-sprint__header")!;
    const breadcrumbs = header.querySelector(".awesomeado-breadcrumbs")!;
    const labels = [...breadcrumbs.querySelectorAll(".awesomeado-breadcrumb")].map(
      (segment) => segment.textContent,
    );

    expect(header.firstElementChild).toBe(header.querySelector(".awesomeado-sprint__header-top"));
    expect(breadcrumbs.getAttribute("aria-label")).toBe("Query folder");
    expect(labels).toEqual(["Delivery", "Sprint Boards"]);
    expect(breadcrumbs.querySelectorAll(".awesomeado-breadcrumb-sep")).toHaveLength(1);
  });
});

describe("Sprint View header", () => {
  it("renders team members, Unassigned, and queue/active counts", async () => {
    const root = await render();
    const alice = root.querySelector('[data-person="alice@example.com"]')!;
    const bob = root.querySelector('[data-person="bob@example.com"]')!;
    const unassigned = root.querySelector('[data-person="__unassigned__"]')!;
    const sprintSelect = root.querySelector<HTMLSelectElement>(".awesomeado-sprint-picker__select");

    expect(root.querySelector(".awesomeado-sprint__title")?.textContent).toBe("Sprint View");
    expect(root.querySelector(".awesomeado-sprint-picker__button")).toBeNull();
    expect(sprintSelect?.disabled).toBe(false);
    expect(root.querySelector(".awesomeado-sprint__team")?.textContent).not.toContain("Team:");
    expect(metric(alice, "queue")).toBe("2");
    expect(metric(alice, "active")).toBe("1");
    expect(metric(bob, "queue")).toBe("0");
    expect(metric(unassigned, "queue")).toBe("1");
    expect(
      [...root.querySelectorAll<HTMLElement>(".awesomeado-sprint__person-pill")].map(
        (pill) => pill.dataset.person,
      ),
    ).toEqual(["alice@example.com", "bob@example.com", "__unassigned__"]);
    expect(root.querySelectorAll(".awesomeado-sprint__item")).toHaveLength(3);
  });
});

const CUSTOM_COLUMNS = ["Ideas", "Building", "Paused", "Shipped", "Removed"];

function workCardTree(): TrackedWorkItem[] {
  const grandchild = item(6, "Nested grandchild", { type: "Subtask" });
  const queuedChild = item(4, "Queued child", { type: "Task", children: [grandchild] });
  const doneChild = item(5, "Done child", { type: "Task", state: "Done" });
  return [
    item(1, "Parent feature", {
      type: "Feature",
      iterationPath: "Project\\Backlog",
      sprintName: "Backlog",
      children: [
        item(2, "A long queued title that wraps onto another line", {
          tags: ["Blocked", "Unrecognized"],
          children: [queuedChild],
        }),
        item(3, "Completed story", { state: "Done", children: [doneChild] }),
      ],
    }),
  ];
}

function workCardTypes() {
  const story = services().getTypes()[0]!;
  const columns = story.columns.map((column, index) => ({
    ...column,
    column: CUSTOM_COLUMNS[index]!,
  }));
  return [
    {
      ...story,
      name: "Feature",
      color: "#654ea3",
      isPrimaryWork: false,
      children: ["Story"],
      columns,
    },
    { ...story, color: "#0078d4", children: ["Task"], columns },
    { ...story, name: "Task", color: "#f2cb1d", isPrimaryWork: false, children: ["Subtask"] },
    { ...story, name: "Subtask", isPrimaryWork: false, children: [] },
  ];
}

function expectWorkCards(root: HTMLElement): void {
  expect(
    [...root.querySelectorAll(".awesomeado-sprint__column-title")].map(
      (heading) => heading.textContent,
    ),
  ).toEqual(CUSTOM_COLUMNS.slice(0, 4));
  const queued = root.querySelector<HTMLElement>('[data-item-id="2"]')!;
  expect(queued.dataset.size).toBe("large");
  expect(
    [...root.querySelectorAll<HTMLElement>(".awesomeado-sprint__item")].every(
      (card) => card.draggable,
    ),
  ).toBe(true);
  expect(queued.textContent).toContain("#2");
  expect(queued.textContent).toContain("Alice");
  expect(queued.textContent).toContain("Blocked");
  expect(queued.textContent).not.toContain("Unrecognized");
  expect(queued.textContent).toContain("Parent feature");
  expect(queued.style.getPropertyValue("--sprint-item-type-color")).toBe("#0078d4");
  expect(root.querySelectorAll(".awesomeado-sprint__item")).toHaveLength(2);
  for (const id of [1, 4, 5]) expect(root.querySelector(`[data-item-id="${id}"]`)).toBeNull();
}

function expectDirectChildBadge(root: HTMLElement): void {
  const queued = root.querySelector<HTMLElement>('[data-item-id="2"]')!;
  expect(queued.querySelector(".awesomeado-child-items__badge")?.textContent).toBe("0 / 1");
  queued.querySelector<HTMLButtonElement>(".awesomeado-child-items__badge")!.click();
  const popupText = queued.querySelector(".awesomeado-child-items__popup")?.textContent;
  expect(popupText).toContain("Queued child");
  expect(popupText).not.toContain("Nested grandchild");
}

function expectCompactDoneCard(root: HTMLElement): void {
  const done = root.querySelector<HTMLElement>('[data-item-id="3"]')!;
  const details = done.querySelector<HTMLElement>(".awesomeado-sprint-card__details")!;
  expect(done.dataset.size).toBe("compact");
  expect(done.querySelector(".awesomeado-child-items__badge")?.textContent).toBe("1 / 1");
  expect(details.style.display).toBe("none");
  done.click();
  expect(done.dataset.size).toBe("large");
  expect(details.style.display).toBe("flex");
}

async function verifyWorkCardRendering(): Promise<void> {
  const roots = workCardTree();
  const root = await render({
    loadTree: async () => ({ isTreeQuery: true, roots, error: null }),
    getBoardColumns: () => CUSTOM_COLUMNS,
    getTypes: workCardTypes,
  });
  expectWorkCards(root);
  expectDirectChildBadge(root);
  expectCompactDoneCard(root);
}

describe("Sprint View board", () => {
  it(
    "renders only work-flagged cards and direct children in the shared badge",
    verifyWorkCardRendering,
  );
});

describe("Sprint View board drag and drop", () => {
  it("writes a diagonal state-and-lane drop as one atomic field request", async () => {
    const writeField = vi.fn<EnhancedViewServices["writeField"]>().mockResolvedValue({
      ok: true,
      rev: 2,
    });
    const roots = [item(1, "Move me"), item(2, "Apps", { areaPath: "Project\\Apps" })];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
      writeField,
    });
    const source = root.querySelector<HTMLElement>('[data-item-id="1"]')!;
    const target = [...root.querySelectorAll<HTMLElement>(".awesomeado-sprint__cell")].find(
      (cell) => cell.dataset.areaPath === "Project\\Apps" && cell.dataset.columnOrdinal === "1",
    )!;

    drag(source, target);
    await vi.waitFor(() => expect(writeField).toHaveBeenCalledOnce());

    expect(writeField).toHaveBeenCalledWith({
      id: 1,
      rev: 1,
      field: "System.State",
      value: "Active",
      additionalFields: [{ field: "System.AreaPath", value: "Project\\Apps" }],
      multilineFormat: undefined,
      comment: undefined,
      baseValue: undefined,
    });
    await vi.waitFor(() => {
      const moved = root.querySelector<HTMLElement>('[data-item-id="1"]')!;
      expect(moved.closest<HTMLElement>(".awesomeado-sprint__cell")?.dataset.areaPath).toBe(
        "Project\\Apps",
      );
      expect(moved.closest<HTMLElement>(".awesomeado-sprint__cell")?.dataset.columnOrdinal).toBe(
        "1",
      );
    });
  });
});

describe("Sprint View one-axis card drops", () => {
  it.each([
    {
      name: "state",
      areaPath: "Project\\Platform",
      ordinal: "1",
      field: "System.State",
      value: "Active",
      baseValue: "New",
    },
    {
      name: "area path",
      areaPath: "Project\\Apps",
      ordinal: "0",
      field: "System.AreaPath",
      value: "Project\\Apps",
      baseValue: "Project\\Platform",
    },
  ])("writes only $name when the other axis is unchanged", async (expected) => {
    const writeField = vi.fn<EnhancedViewServices["writeField"]>().mockResolvedValue({
      ok: true,
      rev: 2,
    });
    const roots = [item(1, "Move me"), item(2, "Apps", { areaPath: "Project\\Apps" })];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
      writeField,
    });
    const source = root.querySelector<HTMLElement>('[data-item-id="1"]')!;
    const target = [...root.querySelectorAll<HTMLElement>(".awesomeado-sprint__cell")].find(
      (cell) =>
        cell.dataset.areaPath === expected.areaPath &&
        cell.dataset.columnOrdinal === expected.ordinal,
    )!;

    drag(source, target);
    await vi.waitFor(() => expect(writeField).toHaveBeenCalledOnce());

    expect(writeField).toHaveBeenCalledWith(
      expect.objectContaining({
        field: expected.field,
        value: expected.value,
        baseValue: expected.baseValue,
        additionalFields: undefined,
      }),
    );
  });
});

describe("Sprint View team counts", () => {
  it("counts only primary work and its descendants for members and Unassigned", async () => {
    const roots = [
      item(1, "Alice planning context", { type: "Feature", state: "Active" }),
      item(2, "Alice primary work", { state: "Active" }),
      item(3, "Alice implementation detail", { type: "Task" }),
      item(4, "Unassigned planning context", { type: "Feature", assignedTo: null }),
      item(5, "Unassigned primary work", { assignedTo: null }),
      item(6, "Unassigned implementation detail", {
        type: "Task",
        state: "Active",
        assignedTo: null,
      }),
    ];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
      getTypes: () => [
        {
          ...services().getTypes()[0]!,
          name: "Feature",
          isPrimaryWork: false,
          children: ["Story"],
        },
        { ...services().getTypes()[0]!, name: "Story", isPrimaryWork: true, children: ["Task"] },
        { ...services().getTypes()[0]!, name: "Task", isPrimaryWork: false, children: [] },
      ],
    });
    const alice = root.querySelector('[data-person="alice@example.com"]')!;
    const unassigned = root.querySelector('[data-person="__unassigned__"]')!;

    expect(metric(alice, "queue")).toBe("2");
    expect(metric(alice, "active")).toBe("1");
    expect(metric(unassigned, "queue")).toBe("2");
    expect(metric(unassigned, "active")).toBe("1");
  });
});

describe("Sprint View header", () => {
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
  it("offers only leaf area paths as Lanes", async () => {
    const roots = [
      item(1, "Project root", { areaPath: "Project" }),
      item(2, "Platform root", { areaPath: "Project\\Platform" }),
      item(3, "Platform API", { areaPath: "Project\\Platform\\API" }),
      item(4, "Apps", { areaPath: "Project\\Apps" }),
    ];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
    });

    root.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.click();
    const lanes = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map(
      (input) => input.value,
    );

    expect(lanes).toEqual(["Project\\Apps", "Project\\Platform\\API"]);
  });

  it("filters the item queue from a team-member pill", async () => {
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
    expect(
      [...root.querySelectorAll(".awesomeado-sprint__lane")].map((lane) => lane.textContent),
    ).toEqual(["Apps"]);
  });
});

describe("Sprint View Project filter", () => {
  it("offers only configured parents of primary work that lead to shown sprint items", async () => {
    const shownChild = item(4, "Shown child", { type: "Task" });
    const primaryWork = item(3, "Primary work", {
      children: [shownChild],
    });
    const otherSprintChild = item(5, "Other sprint child", {
      iterationPath: "Project\\Sprint 2",
      sprintName: "Sprint 2",
    });
    const shownParent = item(2, "Shown parent", {
      type: "Feature",
      iterationPath: "Project\\Backlog",
      sprintName: "Backlog",
      children: [primaryWork],
    });
    const otherParent = item(6, "Other parent", {
      type: "Feature",
      iterationPath: "Project\\Backlog",
      sprintName: "Backlog",
      children: [otherSprintChild],
    });
    const roots = [
      item(1, "Portfolio", {
        type: "Epic",
        iterationPath: "Project\\Backlog",
        sprintName: "Backlog",
        children: [shownParent, otherParent],
      }),
    ];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: true, roots, error: null }),
      getTypes: () => [
        { ...services().getTypes()[0]!, name: "Epic", color: "112233", children: ["Feature"] },
        { ...services().getTypes()[0]!, name: "Feature", color: "445566", children: ["Story"] },
        {
          ...services().getTypes()[0]!,
          name: "Story",
          isPrimaryWork: true,
          children: ["Task"],
        },
        { ...services().getTypes()[0]!, name: "Task", isPrimaryWork: false, children: [] },
      ],
    });

    root.querySelector<HTMLButtonElement>(".awesomeado-hierarchy-filter__trigger")!.click();
    const options = root.querySelectorAll<HTMLElement>(".awesomeado-hierarchy-filter__option");
    expect([...options].map((option) => option.dataset.itemId)).toEqual(["", "1", "2"]);
    expect(options[1]?.style.color).toBe("rgb(17, 34, 51)");
    expect(options[2]?.style.color).toBe("rgb(68, 85, 102)");

    const parentRadio = root.querySelector<HTMLInputElement>(
      '.awesomeado-hierarchy-filter__option[data-item-id="2"] input',
    )!;
    parentRadio.checked = true;
    parentRadio.dispatchEvent(new Event("change"));

    const shownTitles = [...root.querySelectorAll(".awesomeado-sprint__item")].map(
      (row) => row.textContent,
    );
    expect(shownTitles).toEqual([expect.stringContaining("Primary work")]);
    expect(root.querySelector('[data-item-id="4"]')).toBeNull();
    root.querySelector<HTMLButtonElement>(".awesomeado-child-items__badge")!.click();
    expect(root.querySelector(".awesomeado-child-items__popup")?.textContent).toContain(
      "Shown child",
    );
  });
});

describe("Sprint View work-item filters", () => {
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
  it("replaces both query items and the team roster on refresh", async () => {
    const loadTree = vi
      .fn<EnhancedViewServices["loadTree"]>()
      .mockResolvedValueOnce({ isTreeQuery: false, roots: defaultTree(), error: null })
      .mockResolvedValue({
        isTreeQuery: false,
        roots: [item(9, "Carol item", { assignedTo: user("Carol") })],
        error: null,
      });
    const loadTeamMembers = vi
      .fn<EnhancedViewServices["loadTeamMembers"]>()
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
    const root = await render({ loadTree, loadTeamMembers });

    root.querySelector<HTMLButtonElement>(".awesomeado-sprint__refresh")!.click();
    await vi.waitFor(() =>
      expect(root.querySelector('[data-person="carol@example.com"]')).not.toBeNull(),
    );

    expect(root.querySelector('[data-person="alice@example.com"]')).toBeNull();
    expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain("Carol item");
    expect(loadTree).toHaveBeenCalledTimes(2);
    expect(loadTeamMembers).toHaveBeenCalledTimes(2);
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

function sprintTree(prefix: "Initial" | "Next"): TrackedWorkItem[] {
  const next = prefix === "Next";
  const areaPath = next ? "Project\\Apps" : "Project\\Platform";
  const parentSprint = next ? { iterationPath: "Project\\Backlog", sprintName: "Backlog" } : {};
  return [
    item(next ? 10 : 1, `${prefix} epic`, {
      type: "Epic",
      areaPath,
      ...parentSprint,
      children: [
        item(next ? 20 : 2, `${prefix} feature`, {
          type: "Feature",
          areaPath,
          ...parentSprint,
          children: [
            item(next ? 30 : 3, `${prefix} story`, {
              areaPath,
              ...(next
                ? { iterationPath: "Project\\Sprint 2", sprintName: "Sprint 2" }
                : { tags: ["Blocked"] }),
            }),
          ],
        }),
      ],
    }),
  ];
}

async function renderSprintSwitch() {
  const loadTree = vi.fn<EnhancedViewServices["loadTree"]>((_queryId, wiql) =>
    Promise.resolve({
      isTreeQuery: true,
      roots: sprintTree(wiql?.includes("+ 1") === true ? "Next" : "Initial"),
      error: null,
    }),
  );
  const loadQueryDefinition = vi.fn<NonNullable<EnhancedViewServices["loadQueryDefinition"]>>(
    async () => ({
      wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.IterationPath] = @CurrentSprint",
      error: null,
    }),
  );
  const loadTeamMembers = vi.fn<EnhancedViewServices["loadTeamMembers"]>(async () => ({
    members: [
      { id: "alice", displayName: "Alice", uniqueName: "alice@example.com", imageUrl: null },
    ],
    error: null,
  }));
  const root = await render({
    loadTree,
    loadQueryDefinition,
    loadTeamMembers,
    getTypes: () => [
      { ...services().getTypes()[0]!, name: "Epic", children: ["Feature"] },
      { ...services().getTypes()[0]!, name: "Feature", children: ["Story"] },
      { ...services().getTypes()[0]!, name: "Story", isPrimaryWork: true, children: [] },
    ],
  });
  return { root, loadTree, loadQueryDefinition, loadTeamMembers };
}

describe("Sprint View sprint loading lifecycle", () => {
  it("shows the loading message and does not execute WIQL until team members and query definition load", async () => {
    let resolveTeamMembers!: (
      value: Awaited<ReturnType<EnhancedViewServices["loadTeamMembers"]>>,
    ) => void;
    let resolveDefinition!: (value: { wiql: string | null; error: string | null }) => void;
    const loadTeamMembers = vi.fn<EnhancedViewServices["loadTeamMembers"]>(
      () => new Promise((resolve) => (resolveTeamMembers = resolve)),
    );
    const loadQueryDefinition = vi.fn<NonNullable<EnhancedViewServices["loadQueryDefinition"]>>(
      () => new Promise((resolve) => (resolveDefinition = resolve)),
    );
    const loadTree = vi.fn<EnhancedViewServices["loadTree"]>().mockResolvedValue({
      isTreeQuery: false,
      roots: defaultTree(),
      error: null,
    });

    const root = sprintView.render({
      doc: document,
      queryId: "query-id",
      properties: {},
      services: services({ loadTeamMembers, loadQueryDefinition, loadTree }),
    });
    document.body.append(root);

    expect(root.textContent).toBe("Loading spring data...");
    await vi.waitFor(() => expect(loadTeamMembers).toHaveBeenCalledOnce());
    expect(loadQueryDefinition).toHaveBeenCalledOnce();
    expect(loadTree).not.toHaveBeenCalled();

    resolveDefinition({
      wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.IterationPath] = @CurrentSprint",
      error: null,
    });
    await Promise.resolve();
    expect(loadTree).not.toHaveBeenCalled();
    resolveTeamMembers({ members: [], error: null });

    await vi.waitFor(() => expect(loadTree).toHaveBeenCalledOnce());
  });

  it("loads only roster-assigned or unassigned work and their parent chains", async () => {
    const roots = [
      item(1, "Parent outside roster", {
        assignedTo: user("Bob"),
        children: [item(2, "Alice child")],
      }),
      item(3, "Bob orphan", { assignedTo: user("Bob") }),
      item(4, "Unassigned", { assignedTo: null }),
    ];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: true, roots, error: null }),
      loadTeamMembers: async () => ({
        members: [
          { id: "alice", displayName: "Alice", uniqueName: "alice@example.com", imageUrl: null },
        ],
        error: null,
      }),
    });

    const titles = [...root.querySelectorAll(".awesomeado-sprint__item")].map(
      (row) => row.textContent,
    );
    expect(titles).toEqual([
      expect.stringContaining("Parent outside roster"),
      expect.stringContaining("Alice child"),
      expect.stringContaining("Unassigned"),
    ]);
  });
});

describe("Sprint View team-filtered options", () => {
  it("derives Lane and Project choices only from team-filtered work", async () => {
    const includedProject = item(2, "Included project", {
      type: "Feature",
      assignedTo: user("Bob"),
      areaPath: "Project\\Included",
      iterationPath: "Project\\Backlog",
      sprintName: "Backlog",
      children: [item(3, "Alice story", { areaPath: "Project\\Included" })],
    });
    const excludedProject = item(4, "Excluded project", {
      type: "Feature",
      assignedTo: user("Bob"),
      areaPath: "Project\\Excluded",
      iterationPath: "Project\\Backlog",
      sprintName: "Backlog",
      children: [item(5, "Bob story", { assignedTo: user("Bob"), areaPath: "Project\\Excluded" })],
    });
    const roots = [
      item(1, "Portfolio", {
        type: "Epic",
        assignedTo: user("Bob"),
        iterationPath: "Project\\Backlog",
        sprintName: "Backlog",
        children: [includedProject, excludedProject],
      }),
    ];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: true, roots, error: null }),
      loadTeamMembers: async () => ({
        members: [
          { id: "alice", displayName: "Alice", uniqueName: "alice@example.com", imageUrl: null },
        ],
        error: null,
      }),
      getTypes: () => [
        { ...services().getTypes()[0]!, name: "Epic", children: ["Feature"] },
        { ...services().getTypes()[0]!, name: "Feature", children: ["Story"] },
        {
          ...services().getTypes()[0]!,
          name: "Story",
          isPrimaryWork: true,
          children: [],
        },
      ],
    });

    expect(root.textContent).toContain("Alice story");
    expect(root.textContent).not.toContain("Bob story");
    root.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.click();
    const lanes = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map(
      (input) => input.value,
    );
    expect(lanes).toContain("Project\\Included");
    expect(lanes).not.toContain("Project\\Excluded");

    root.querySelector<HTMLButtonElement>(".awesomeado-hierarchy-filter__trigger")!.click();
    const projects = [
      ...root.querySelectorAll<HTMLElement>(".awesomeado-hierarchy-filter__option"),
    ].map((option) => option.textContent);
    expect(projects).toEqual(expect.arrayContaining([expect.stringContaining("Included project")]));
    expect(projects).not.toEqual(
      expect.arrayContaining([expect.stringContaining("Excluded project")]),
    );
  });
});

describe("Sprint View sprint switching", () => {
  it("reloads WIQL, team members, filters, Lane options, and Project options on sprint change", async () => {
    const { root, loadTree, loadQueryDefinition, loadTeamMembers } = await renderSprintSwitch();

    root.querySelector<HTMLButtonElement>('[data-marker="blocked"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-activity="created"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-person="alice@example.com"]')!.click();
    root.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.click();
    const lane = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (input) => input.value === "Project\\Platform",
    )!;
    lane.checked = true;
    lane.dispatchEvent(new Event("change"));

    const select = root.querySelector<HTMLSelectElement>(".awesomeado-sprint-picker__select")!;
    select.value = "Sprint 2";
    select.dispatchEvent(new Event("change"));

    expect(root.textContent).toBe("Loading spring data...");
    await vi.waitFor(() =>
      expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain("Next story"),
    );
    expect(loadQueryDefinition).toHaveBeenCalledTimes(2);
    expect(loadTeamMembers).toHaveBeenCalledTimes(2);
    expect(loadTeamMembers).toHaveBeenLastCalledWith();
    expect(loadTree).toHaveBeenLastCalledWith(
      "query-id",
      "SELECT [System.Id] FROM WorkItems WHERE [System.IterationPath] = @CurrentSprint + 1",
    );
    expect(root.querySelector('[data-marker="blocked"]')?.getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(root.querySelector('[data-activity="created"]')?.getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(
      root.querySelector('[data-person="alice@example.com"]')?.getAttribute("aria-pressed"),
    ).toBe("false");

    root.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.click();
    expect(
      [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].map(
        (input) => input.value,
      ),
    ).toEqual(["Project\\Apps"]);
    root.querySelector<HTMLButtonElement>(".awesomeado-hierarchy-filter__trigger")!.click();
    expect(
      [...root.querySelectorAll<HTMLElement>(".awesomeado-hierarchy-filter__option")].map(
        (option) => option.textContent,
      ),
    ).toEqual(["All projects", "Epic: Next epic", "Feature: Next feature"]);
  });
});
