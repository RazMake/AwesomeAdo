import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrackedUser, TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import type { SprintWindow } from "../../../common/ado/sprintWindow";
import { normalizeMarkerTags } from "../../../common/settings/ExtensionSettings";
import type { EnhancedViewServices } from "../../../common/view-common/EnhancedView";

import { sprintView } from "./SprintView";
import { sprintDefaultAreaPaths, sprintOrderingPolicy, sprintViewType } from "./sprintViewType";

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

function noInterruptAcceptance(): EnhancedViewServices["interruptAcceptance"] {
  return {
    readInterruptAcceptance: async () => ({
      acceptedWorkItemIds: [],
      failedWorkItemIds: [],
      error: null,
    }),
  };
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
    interruptAcceptance: noInterruptAcceptance(),
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

async function render(
  overrides: Partial<EnhancedViewServices> = {},
  properties: Record<string, string> = {},
): Promise<HTMLElement> {
  const root = sprintView.render({
    doc: document,
    queryId: "query-id",
    properties,
    services: services(overrides),
  });
  const host = document.createElement("div");
  host.style.overflow = "auto";
  host.append(root);
  document.body.append(host);
  await vi.waitFor(() => expect(root.querySelector(".awesomeado-sprint__header")).not.toBeNull());
  return root;
}

function metric(pill: Element, kind: string): string | null | undefined {
  return pill.querySelector(`[data-count="${kind}"]`)?.textContent;
}

function drag(source: HTMLElement, target: HTMLElement): void {
  const dataTransfer = beginDrag(source);
  dispatchDrag(target, "dragover", dataTransfer);
  dispatchDrag(target, "drop", dataTransfer);
}

function beginDrag(source: HTMLElement): DataTransfer {
  return startDrag(source).dataTransfer;
}

function startDrag(source: HTMLElement): { dataTransfer: DataTransfer; event: Event } {
  const values = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: "none",
    dropEffect: "none",
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? "",
    setDragImage: vi.fn(),
  } as unknown as DataTransfer;
  const event = dispatchDrag(source, "dragstart", dataTransfer);
  return { dataTransfer, event };
}

function dispatchDrag(
  target: HTMLElement,
  type: string,
  dataTransfer: DataTransfer,
  clientY = 0,
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  Object.defineProperty(event, "clientY", { value: clientY });
  target.dispatchEvent(event);
  return event;
}

/** The board cell that currently holds a card, so a test can name WHERE an item ended up. */
function cellOf(root: HTMLElement, itemId: number): HTMLElement | null {
  return (
    root
      .querySelector<HTMLElement>(`.awesomeado-sprint__item[data-item-id="${itemId}"]`)
      ?.closest<HTMLElement>(".awesomeado-sprint__cell") ?? null
  );
}

/**
 * Drain the microtask chain a queued write travels through. `vi.waitFor` resolves on the FIRST
 * tick a call count matches and never re-checks, so a stray SECOND write to the same item lands
 * unseen; settling here is what lets a whole-call-log assertion catch it.
 */
async function settleQueuedWrites(): Promise<void> {
  for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
}

async function stickSprintColumnHeader(root: HTMLElement): Promise<HTMLElement> {
  const boardHeader = root.querySelector<HTMLElement>(".awesomeado-sprint__board-header")!;
  await vi.waitFor(() =>
    expect(root.style.getPropertyValue("--awesomeado-sprint-column-header-top")).toBe("6px"),
  );
  root.parentElement!.getBoundingClientRect = () => ({ top: 48 }) as DOMRect;
  boardHeader.getBoundingClientRect = () => ({ top: 54, bottom: 86 }) as unknown as DOMRect;
  root.parentElement!.dispatchEvent(new Event("scroll"));
  expect(boardHeader.hasAttribute("data-stuck")).toBe(true);
  return boardHeader;
}

function expectOriginalDragBackground(dragImage: HTMLElement, target: HTMLElement): void {
  expect(dragImage.dataset.columnOrdinal).toBeUndefined();
  expect(dragImage.style.background).toContain("var(--item-row-background)");
  expect(dragImage.style.background).not.toContain(target.style.background);
}

afterEach(() => document.body.replaceChildren());

describe("Sprint View ordering configuration", () => {
  it("defaults to backlog rank and safely resolves stored policies", () => {
    expect(sprintOrderingPolicy({})).toBe("importance");
    expect(sprintOrderingPolicy({ orderingPolicy: "title" })).toBe("title");
    expect(sprintOrderingPolicy({ orderingPolicy: "retired-policy" })).toBe("importance");
    expect(sprintViewType.properties[0]?.key).toBe("orderingPolicy");
  });

  it("normalizes one default Lane path per binding-property line", () => {
    expect(
      sprintDefaultAreaPaths({
        defaultAreaPaths: " Project\\Apps\nProject\\Platform\nproject\\apps\n",
      }),
    ).toEqual(["Project\\Apps", "Project\\Platform"]);
    expect(sprintViewType.properties[2]?.key).toBe("defaultAreaPaths");
  });
});

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
    const topRow = header.querySelector(".awesomeado-sprint__header-top")!;
    const ordering = topRow.querySelector<HTMLElement>(".awesomeado-ordering")!;
    expect(topRow.lastElementChild).toBe(ordering);
    expect(ordering.style.marginLeft).toBe("auto");
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
    item(0, "Program epic", {
      type: "Epic",
      eta: "2026-08-24T12:00:00Z",
      children: [
        item(1, "Parent feature", {
          type: "Feature",
          eta: "2026-08-17T12:00:00Z",
          iterationPath: "Project\\Backlog",
          sprintName: "Backlog",
          children: [
            item(2, "A long queued title that wraps onto another line", {
              priority: 1,
              eta: "2026-08-10T12:00:00Z",
              tags: ["Blocked", "Unrecognized"],
              children: [queuedChild],
            }),
            item(3, "Completed story", {
              state: "Done",
              priority: 2,
              eta: "2026-07-30T12:00:00Z",
              children: [doneChild],
            }),
          ],
        }),
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
      name: "Epic",
      color: "#b04717",
      isPrimaryWork: false,
      etaField: "Custom.EpicETA",
      children: ["Feature"],
      columns,
    },
    {
      ...story,
      name: "Feature",
      color: "#654ea3",
      isPrimaryWork: false,
      etaField: "Custom.FeatureETA",
      children: ["Story"],
      columns,
    },
    {
      ...story,
      color: "#0078d4",
      etaField: "Custom.StoryETA",
      children: ["Task"],
      columns,
    },
    {
      ...story,
      name: "Task",
      color: "#f2cb1d",
      isPrimaryWork: false,
      etaField: "Custom.TaskETA",
      children: ["Subtask"],
    },
    { ...story, name: "Subtask", isPrimaryWork: false, children: [] },
  ];
}

function expectStickyColumnHeader(root: HTMLElement, headings: readonly HTMLElement[]): void {
  const boardHeader = root.querySelector<HTMLElement>(".awesomeado-sprint__board-header")!;
  expect(boardHeader.style.position).toBe("sticky");
  expect(boardHeader.style.top).toBe("var(--awesomeado-sprint-column-header-top,0px)");
  expect(boardHeader.style.background).toBe("transparent");
  const laneHeading = root.querySelector<HTMLElement>(".awesomeado-sprint__lane-heading")!;
  expect(laneHeading.textContent).toBe("");
  expect(laneHeading.style.background).toBe("var(--background-color)");
  expect(laneHeading.style.borderTopLeftRadius).toBe("3px");
  expect(root.querySelector<HTMLElement>(".awesomeado-sprint__filters")!.style.position).toBe("");
  expect(root.style.getPropertyValue("--awesomeado-sprint-column-header-top")).toBe("6px");
  root.parentElement!.getBoundingClientRect = () => ({ top: 48 }) as DOMRect;
  boardHeader.getBoundingClientRect = () => ({ top: 54, bottom: 86 }) as unknown as DOMRect;
  root.parentElement!.dispatchEvent(new Event("scroll"));
  expect(boardHeader.hasAttribute("data-stuck")).toBe(true);
  expect(
    headings.map((heading) => heading.style.getPropertyValue("--sprint-column-header-background")),
  ).toEqual([
    "linear-gradient(var(--status-neutral-background),var(--status-neutral-background)),var(--background-color)",
    "linear-gradient(var(--status-blue-background),var(--status-blue-background)),var(--background-color)",
    "linear-gradient(var(--status-yellow-background),var(--status-yellow-background)),var(--background-color)",
    "linear-gradient(var(--status-green-background),var(--status-green-background)),var(--background-color)",
  ]);
  expect(
    headings.map((heading) => heading.style.getPropertyValue("--sprint-column-header-opacity")),
  ).toEqual(Array.from({ length: 4 }, () => "0.9"));
}

function expectBoardScrolling(root: HTMLElement): void {
  const scroller = root.querySelector<HTMLElement>(".awesomeado-sprint__board-scroller")!;
  const headerGrid = root.querySelector<HTMLElement>(".awesomeado-sprint__board-header-grid")!;
  scroller.scrollLeft = 48;
  scroller.dispatchEvent(new Event("scroll"));
  expect(headerGrid.style.transform).toBe("translateX(-48px)");
  const lane = root.querySelector<HTMLElement>(".awesomeado-sprint__lane")!;
  expect(lane.style.position).toBe("sticky");
  expect(lane.style.left).toBe("");
  expect(lane.style.marginBottom).toBe("1px");
  expect(lane.style.top).toBe(
    "calc(var(--awesomeado-sprint-column-header-top,0px) + var(--awesomeado-sprint-board-header-height,0px))",
  );
  expect(lane.style.borderTop).toBe("");
  expect(lane.style.borderRight).toBe("1px solid var(--control-border)");
  expect(lane.style.borderBottom).toBe("");
  expect(lane.style.boxShadow).toBe("");
  expect(lane.closest(".awesomeado-sprint__lane-row")).not.toBeNull();
  expect(lane.querySelector(".awesomeado-sprint__lane-name")?.textContent).toBe("Platform");
  expect(lane.querySelector(".awesomeado-sprint__lane-count")?.textContent).toBe("2 items");
  expect(lane.querySelector<HTMLElement>(".awesomeado-sprint__lane-name")!.style.fontSize).toBe(
    "13.2px",
  );
  expect(lane.querySelector<HTMLElement>(".awesomeado-sprint__lane-count")!.style.opacity).toBe(
    "0.65",
  );
  expect(root.querySelector<HTMLElement>(".awesomeado-sprint__lane-grid")!.style.transform).toBe(
    "translateX(-48px)",
  );
}

function expectParentHierarchyPopup(card: HTMLElement): void {
  const parent = card.querySelector<HTMLElement>(".awesomeado-sprint-card__parent")!;
  expect(parent.querySelector(".awesomeado-type-icon")).not.toBeNull();
  expect(parent.querySelector(".awesomeado-sprint-card__parent-title")?.textContent).toBe(
    "Parent feature",
  );
  const trigger = parent.querySelector<HTMLButtonElement>(
    ".awesomeado-sprint-card__parent-trigger",
  )!;
  expect(trigger.style.color).toBe("color-mix(in srgb, #654ea3 62%, var(--text-primary-color))");
  expect(parent.style.marginTop).toBe("3px");
  expect(card.textContent).not.toContain("Parent:");
  expect(card.textContent).not.toContain("#1");
  trigger.click();
  const rows = [...parent.querySelectorAll<HTMLElement>(".awesomeado-sprint-card__parent-row")];
  expect(rows.map((row) => row.dataset.itemId)).toEqual(["0", "1"]);
  expect(rows.map((row) => row.textContent)).toEqual([
    "Program epicETA 08/24/2026",
    "Parent featureETA 08/17/2026",
  ]);
  expect(
    rows.map(
      (row) =>
        row.querySelector<HTMLElement>(".awesomeado-sprint-card__parent-identity")!.style.color,
    ),
  ).toEqual([
    "color-mix(in srgb, #b04717 62%, var(--text-primary-color))",
    "color-mix(in srgb, #654ea3 62%, var(--text-primary-color))",
  ]);
}

function expectWorkCards(root: HTMLElement): void {
  const headings = [...root.querySelectorAll<HTMLElement>(".awesomeado-sprint__column-title")];
  expect(headings.map((heading) => heading.textContent)).toEqual(CUSTOM_COLUMNS.slice(0, 4));
  expect(headings.map((heading) => heading.style.color)).toEqual([
    "var(--status-neutral-foreground)",
    "var(--status-blue-foreground)",
    "var(--status-yellow-foreground)",
    "var(--status-green-foreground)",
  ]);
  expect(headings.map((heading) => heading.style.background)).toEqual(
    Array.from({ length: 4 }, () => "transparent"),
  );
  const backdrops = headings.map((heading) =>
    heading.querySelector<HTMLElement>(".awesomeado-sprint__column-title-backdrop")!,
  );
  const highlights = headings.map((heading) =>
    heading.querySelector<HTMLElement>(".awesomeado-sprint__column-title-highlight")!,
  );
  expect(backdrops.map((backdrop) => backdrop.style.background)).toEqual(
    Array.from({ length: 4 }, () => "var(--sprint-column-header-background)"),
  );
  expect(backdrops.map((backdrop) => backdrop.style.opacity)).toEqual(
    Array.from({ length: 4 }, () => "var(--sprint-column-header-opacity)"),
  );
  expect(highlights.map((highlight) => highlight.style.zIndex)).toEqual(
    Array.from({ length: 4 }, () => "2"),
  );
  expect(highlights.map((highlight) => highlight.style.borderColor)).toEqual(
    Array.from({ length: 4 }, () => "transparent"),
  );
  expect(
    headings.map((heading) => heading.style.getPropertyValue("--sprint-column-header-background")),
  ).toEqual([
    "color-mix(in srgb,var(--status-neutral-background) 75%,transparent)",
    "color-mix(in srgb,var(--status-blue-background) 75%,transparent)",
    "color-mix(in srgb,var(--status-yellow-background) 75%,transparent)",
    "color-mix(in srgb,var(--status-green-background) 75%,transparent)",
  ]);
  expect(
    headings.map((heading) => heading.style.getPropertyValue("--sprint-column-header-opacity")),
  ).toEqual(Array.from({ length: 4 }, () => "1"));
  expectStickyColumnHeader(root, headings);
  expectBoardScrolling(root);
  const queued = root.querySelector<HTMLElement>('[data-item-id="2"]')!;
  expect(queued.dataset.size).toBe("large");
  expect(
    [...root.querySelectorAll<HTMLElement>(".awesomeado-sprint__item")].every(
      (card) => card.draggable,
    ),
  ).toBe(true);
  const meta = queued.querySelector<HTMLElement>(".awesomeado-sprint-card__meta")!;
  expect(queued.firstElementChild).toBe(meta);
  expect(meta.querySelector(".awesomeado-sprint-card__id")?.textContent).toBe("#2");
  expect(meta.querySelector(".awesomeado-priority__badge")?.textContent).toContain("P1");
  expect(meta.querySelector(".awesomeado-assigned__name")?.textContent).toBe("Alice");
  expect(meta.querySelector(".awesomeado-tag-pill")).toBeNull();
  expect(queued.textContent).toContain("Blocked");
  expect(queued.textContent).not.toContain("Unrecognized");
  const title = queued.querySelector(".awesomeado-sprint-card__title")!;
  const footer = queued.querySelector<HTMLElement>(".awesomeado-sprint-card__footer")!;
  expect(title.nextElementSibling).toBe(footer);
  expect(footer.firstElementChild?.textContent).toBe("ETA 08/10/2026");
  expect(footer.lastElementChild?.textContent).toBe("0 / 1");
  expect(footer.lastElementChild?.getAttribute("style")).toContain("margin-left: auto");
  expectParentHierarchyPopup(queued);
  expect(queued.style.getPropertyValue("--sprint-item-type-color")).toBe("#0078d4");
  expect(root.querySelectorAll(".awesomeado-sprint__item")).toHaveLength(2);
  for (const id of [0, 1, 4, 5]) {
    expect(root.querySelector(`.awesomeado-sprint__item[data-item-id="${id}"]`)).toBeNull();
  }
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
  const meta = done.querySelector<HTMLElement>(".awesomeado-sprint-card__meta")!;
  expect(done.dataset.size).toBe("compact");
  expect(done.firstElementChild).toBe(meta);
  expect(meta.querySelector(".awesomeado-sprint-card__id")?.textContent).toBe("#3");
  const priority = meta.querySelector<HTMLButtonElement>(".awesomeado-priority__badge")!;
  expect(priority.textContent).toContain("P2");
  expect(priority.disabled).toBe(true);
  priority.click();
  expect(done.querySelector(".awesomeado-priority__popup")).toBeNull();
  expect(meta.querySelector(".awesomeado-assigned__name")?.textContent).toBe("Alice");
  expect(done.querySelector(".awesomeado-sprint-card__eta")?.textContent).toBe("ETA 07/30/2026");
  const childBadge = done.querySelector<HTMLElement>(".awesomeado-child-items")!;
  expect(childBadge.textContent).toBe("1 / 1");
  expect(childBadge.style.display).toBe("none");
  expect(details.style.display).toBe("none");
  const assignee = done.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")!;
  const eta = done.querySelector<HTMLElement>(".awesomeado-sprint-card__eta")!;
  assignee.click();
  eta.querySelector<HTMLElement>(".awesomeado-eta__label")!.click();
  expect(assignee.disabled).toBe(true);
  expect(eta.getAttribute("aria-disabled")).toBe("true");
  expect(done.querySelector(".awesomeado-assigned__popup")).toBeNull();
  expect(done.querySelector(".awesomeado-eta__popup")).toBeNull();
  done.click();
  expect(done.dataset.size).toBe("large");
  expect(details.style.display).toBe("flex");
  expect(childBadge.style.display).toBe("inline-flex");
  expect(assignee.disabled).toBe(false);
  expect(eta.getAttribute("aria-disabled")).toBe("false");
  expect(priority.disabled).toBe(false);
  priority.click();
  expect(done.querySelector(".awesomeado-priority__popup")).not.toBeNull();
  document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
  done.querySelector<HTMLButtonElement>(".awesomeado-sprint-card__parent-trigger")!.click();
  expect(done.dataset.size).toBe("large");
  const parentPopup = done.querySelector<HTMLElement>(".awesomeado-sprint-card__parent-popup")!;
  expect(parentPopup).not.toBeNull();
  const parentEta = parentPopup.querySelector<HTMLElement>(".awesomeado-eta")!;
  expect(parentEta.style.cursor).toBe("default");
  parentEta.querySelector<HTMLElement>(".awesomeado-eta__label")!.click();
  expect(parentPopup.querySelector(".awesomeado-eta__popup")).toBeNull();
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

  it("persists assignee and ETA changes through the card controls", async () => {
    const writeField = vi
      .fn<EnhancedViewServices["writeField"]>()
      .mockResolvedValueOnce({ ok: true, rev: 2 })
      .mockResolvedValueOnce({ ok: true, rev: 3 });
    const root = await render({
      loadTree: async () => ({ isTreeQuery: false, roots: [item(1, "Editable")], error: null }),
      getTypes: () =>
        services()
          .getTypes()
          .map((type) => ({ ...type, etaField: "Custom.StoryETA" })),
      writeField,
    });

    const assignee = root.querySelector<HTMLElement>(".awesomeado-sprint-card__assignee")!;
    const assigneeName = assignee.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")!;
    expect(assignee.style.overflow).toBe("visible");
    expect(assigneeName.style.textOverflow).toBe("ellipsis");
    assigneeName.click();
    expect(assignee.querySelector<HTMLElement>(".awesomeado-assigned__popup")!.style.position).toBe(
      "absolute",
    );
    const bob = [
      ...root.querySelectorAll<HTMLButtonElement>(".awesomeado-assigned__results button"),
    ].find((button) => button.textContent?.includes("Bob"))!;
    bob.click();
    await vi.waitFor(() => expect(writeField).toHaveBeenCalledTimes(1));
    expect(writeField).toHaveBeenNthCalledWith(1, {
      id: 1,
      rev: 1,
      field: "System.AssignedTo",
      value: "bob@example.com",
    });

    root.querySelector<HTMLElement>(".awesomeado-sprint-card__eta .awesomeado-eta__label")!.click();
    const date = root.querySelector<HTMLInputElement>(".awesomeado-eta__date")!;
    date.value = "2026-08-14";
    date.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(writeField).toHaveBeenCalledTimes(2));
    expect(writeField).toHaveBeenNthCalledWith(2, {
      id: 1,
      rev: 2,
      field: "Custom.StoryETA",
      value: "2026-08-14T12:00:00Z",
    });
  });
});

describe("Sprint View card priority and details", () => {
  it("persists priority changes through the shared card control", async () => {
    const writeField = vi
      .fn<EnhancedViewServices["writeField"]>()
      .mockResolvedValue({ ok: true, rev: 2 });
    const root = await render({
      loadTree: async () => ({
        isTreeQuery: false,
        roots: [item(1, "Prioritized", { priority: 2 })],
        error: null,
      }),
      writeField,
    });

    root.querySelector<HTMLButtonElement>(".awesomeado-priority__badge")!.click();
    const p1 = [...root.querySelectorAll<HTMLButtonElement>(".awesomeado-priority__option")].find(
      (option) => option.textContent === "P1",
    )!;
    p1.click();

    await vi.waitFor(() => expect(writeField).toHaveBeenCalledTimes(1));
    await settleQueuedWrites();
    expect(writeField.mock.calls).toEqual([
      [
        {
          id: 1,
          rev: 1,
          field: "Microsoft.VSTS.Common.Priority",
          value: "1",
          baseValue: "2",
        },
      ],
    ]);
    expect(root.querySelector(".awesomeado-priority__badge")?.textContent).toContain("P1");
  });

  it("shows lifecycle and description details from both large and compact cards", async () => {
    const roots = [
      item(1, "Active details", { description: "Active card description" }),
      item(2, "Done details", { state: "Done", description: "Done card description" }),
    ];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
    });

    const active = root.querySelector<HTMLElement>('[data-item-id="1"]')!;
    active.querySelector<HTMLButtonElement>(".awesomeado-sprint-card__describe")!.click();
    const activePopup = active.querySelector<HTMLElement>(
      ".awesomeado-sprint-card__description-popup",
    )!;
    expect(activePopup.textContent).toContain("Created on:");
    expect(activePopup.textContent).toContain("Last Modified on:");
    expect(activePopup.textContent).toContain("Active card description");
    expect(activePopup.style.width).toBe("380px");
    expect(activePopup.style.minWidth).toBe("280px");
    expect(activePopup.style.overflowX).toBe("hidden");
    expect(activePopup.style.overflowY).toBe("auto");
    expect(activePopup.style.overflowWrap).toBe("anywhere");

    const done = root.querySelector<HTMLElement>('[data-item-id="2"]')!;
    expect(done.dataset.size).toBe("compact");
    done.querySelector<HTMLButtonElement>(".awesomeado-sprint-card__describe")!.click();
    expect(done.dataset.size).toBe("compact");
    expect(done.querySelector(".awesomeado-sprint-card__description-popup")?.textContent).toContain(
      "Done card description",
    );
  });
});

function openContextMenu(target: Element): HTMLButtonElement[] {
  target.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 30 }),
  );
  return [...document.querySelectorAll<HTMLButtonElement>(".awesomeado-item-menu__command")];
}

function menuCommand(label: string): HTMLButtonElement {
  const command = [
    ...document.querySelectorAll<HTMLButtonElement>(".awesomeado-item-menu__command"),
  ].find((row) => row.getAttribute("aria-label") === label || row.textContent?.trim() === label);
  if (command === undefined) throw new Error(`Missing menu command "${label}".`);
  return command;
}

function bulkMoveSprintWindow(): SprintWindow {
  return {
    entries: [
      {
        id: "sprint-0",
        path: "Project\\Sprint 0",
        name: "Sprint 0",
        label: "Previous - Sprint 0",
        relation: "past",
      },
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
  };
}

function boardItemIds(root: HTMLElement): number[] {
  return [...root.querySelectorAll<HTMLElement>(".awesomeado-sprint__item")]
    .map((card) => Number(card.dataset.itemId))
    .sort((left, right) => left - right);
}

/**
 * Switch sprints and wait for the board that switch produced. Waiting for "anything but the
 * loading text" would also accept an error banner, a half-painted board, or the PREVIOUS sprint
 * still on screen because the picker ignored the change — so the wait names the sprint's items.
 */
async function selectSprint(
  root: HTMLElement,
  name: string,
  expectedItemIds: readonly number[],
): Promise<void> {
  const select = root.querySelector<HTMLSelectElement>(".awesomeado-sprint-picker__select")!;
  select.value = name;
  select.dispatchEvent(new Event("change"));
  await vi.waitFor(() => {
    expect(root.querySelector<HTMLSelectElement>(".awesomeado-sprint-picker__select")?.value).toBe(
      name,
    );
    expect(boardItemIds(root)).toEqual([...expectedItemIds]);
  });
}

function expectCopyOnlyTitleMenu(root: HTMLElement): void {
  const rows = openContextMenu(root.querySelector(".awesomeado-sprint__title")!);
  expect(rows.map((row) => row.textContent)).toEqual(["Copy ADO Url", "Reset lanes to default"]);
  expect(rows[1]?.disabled).toBe(true);
  expect(rows[1]?.title).toBe("No default area paths are configured.");
}

function openBulkConfirmation(root: HTMLElement): HTMLElement {
  const titleRows = openContextMenu(root.querySelector(".awesomeado-sprint__title")!);
  expect(titleRows.map((row) => row.getAttribute("aria-label") ?? row.textContent)).toEqual([
    "Copy ADO Url",
    "Reset lanes to default",
    "Move all non-DONE items to",
  ]);
  const done = titleRows[2]!.querySelector("span") as HTMLElement;
  expect(done.textContent).toBe("DONE");
  expect(done.style.background).toBe("var(--status-green-background)");
  expect(done.style.color).toBe("var(--completion-foreground)");
  titleRows[2]!.click();
  const next = [
    ...document.querySelectorAll<HTMLButtonElement>(".awesomeado-item-menu__submenu button"),
  ].find((row) => row.textContent === "Next - Sprint 2")!;
  next.click();
  return root.querySelector<HTMLElement>(".awesomeado-sprint__bulk-dialog")!;
}

function confirmBulkDialog(dialog: HTMLElement): void {
  expect(dialog.textContent).toContain("Move 2 visible item(s)?");
  expect(dialog.querySelector("section")?.textContent).toBe("By laneApps1Platform1");
  expect(dialog.querySelectorAll("section")[1]?.textContent).toBe("By assigneeAlice1Bob1");
  expect(dialog.textContent).toContain("1 visible unassigned item(s) excluded.");
  dialog.querySelector<HTMLButtonElement>(".awesomeado-sprint__bulk-dialog-confirm")!.click();
}

function pastSprintMove(id: number, areaPath: string, assignee: string) {
  return {
    id,
    rev: 1,
    field: "System.IterationPath",
    value: "Project\\Sprint 2",
    baseValue: "Project\\Sprint 0",
    preconditions: [
      { field: "System.State", value: "New" },
      { field: "System.AreaPath", value: areaPath },
      { field: "System.AssignedTo", value: assignee },
    ],
  };
}

async function verifyPastSprintBulkMove(): Promise<void> {
  const writeField = vi
    .fn<EnhancedViewServices["writeField"]>()
    .mockResolvedValue({ ok: true, rev: 2 });
  const past = { iterationPath: "Project\\Sprint 0", sprintName: "Sprint 0" };
  const roots = [
    item(1, "Move me", past),
    item(2, "Leave done", { state: "Done", ...past }),
    item(3, "Leave unassigned", { assignedTo: null, ...past }),
    item(4, "Move me too", { assignedTo: user("Bob"), areaPath: "Project\\Apps", ...past }),
    item(5, "Next sprint work", {
      iterationPath: "Project\\Sprint 2",
      sprintName: "Sprint 2",
    }),
  ];
  const root = await render({
    loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
    loadSprintWindow: async () => bulkMoveSprintWindow(),
    writeField,
  });
  const title = root.querySelector<HTMLElement>(".awesomeado-sprint__title")!;
  expect(title.style.cursor).toBe("context-menu");
  expect(title.title).toBe("");
  expectCopyOnlyTitleMenu(root);
  await selectSprint(root, "Sprint 2", [5]);
  expect(root.querySelector('[data-item-id="5"]')?.textContent).toContain("Next sprint work");
  expectCopyOnlyTitleMenu(root);
  await selectSprint(root, "Sprint 0", [1, 2, 3, 4]);
  confirmBulkDialog(openBulkConfirmation(root));
  await vi.waitFor(() => expect(writeField).toHaveBeenCalledTimes(2));
  await settleQueuedWrites();

  // Every non-Done ASSIGNED card is guarded on its OWN lane and assignee; the Done card, the
  // unassigned one, and the card that already sits in the destination are never written at all.
  expect(writeField.mock.calls.map(([request]) => request)).toEqual([
    pastSprintMove(4, "Project\\Apps", "bob@example.com"),
    pastSprintMove(1, "Project\\Platform", "alice@example.com"),
  ]);
  expect(writeField).not.toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
}

describe("Sprint View title context menu", () => {
  it(
    "offers bulk move only for a past sprint, guarding each non-Done assigned item and excluding unassigned work",
    verifyPastSprintBulkMove,
  );

  it("replaces the selected sprint's saved lanes with configured defaults", async () => {
    const save = vi.fn(async () => true);
    const roots = [item(1, "Platform item"), item(2, "Apps item", { areaPath: "Project\\Apps" })];
    const root = await render(
      {
        loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
        sprintAreaPaths: {
          read: async () => ({
            sprintAreaPaths: {
              "Project\\Sprint 1": {
                areaPaths: ["Project\\Platform"],
                startDate: null,
                finishDate: null,
              },
            },
          }),
          save,
        },
      },
      { defaultAreaPaths: "Project\\Area\\Apps" },
    );

    const rows = openContextMenu(root.querySelector(".awesomeado-sprint__title")!);
    const reset = rows.find((row) => row.textContent === "Reset lanes to default")!;
    expect(reset.disabled).toBe(false);
    reset.click();

    expect(save).toHaveBeenCalledWith({
      "Project\\Sprint 1": {
        areaPaths: ["Project\\Apps"],
        startDate: null,
        finishDate: null,
      },
    });
    expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain("Apps item");
    const lane = root.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!;
    expect(lane.disabled).toBe(false);
    expect(lane.style.opacity).toBe("");
    expect(lane.textContent).toBe("Lanes1");
    expect(lane.getAttribute("aria-pressed")).toBe("true");
    expect(lane.style.background).toBe("var(--communication-background)");
    expect(lane.style.color).toBe("var(--text-on-communication-background)");
  });
});

describe("Sprint View item context menus", () => {
  it("offers the same item commands on cards and direct child rows", async () => {
    const parent = item(1, "Parent", { children: [item(2, "Child")] });
    const root = await render({
      loadTree: async () => ({ isTreeQuery: true, roots: [parent], error: null }),
    });
    const expected = [
      "Copy Item ID",
      "Copy ADO Url",
      "Open in ADO",
      "Update title",
      "Update description",
      "Move to another sprint",
      "Change area path",
      "View all notes",
      "Tag with Blocked (internal)",
      "Tag with Blocked by another team",
      "Tag with Interrupt",
    ];

    const cardRows = openContextMenu(root.querySelector('[data-item-id="1"]')!);
    expect(
      cardRows.map(
        (row) => row.getAttribute("aria-label") ?? row.textContent?.replace("›", "").trim(),
      ),
    ).toEqual(expected);
    root.querySelector<HTMLButtonElement>(".awesomeado-child-items__badge")!.click();
    const childRows = openContextMenu(root.querySelector(".awesomeado-child-items__row")!);
    expect(
      childRows.map(
        (row) => row.getAttribute("aria-label") ?? row.textContent?.replace("›", "").trim(),
      ),
    ).toEqual(expected);
  });
});

describe("Sprint View item marker notes", () => {
  it("opens a card marker pill on only the notes carrying that marker token", async () => {
    const loadNotes = vi.fn(() =>
      Promise.resolve({
        notes: [
          {
            id: 1,
            workItemId: 1,
            text: "[BLOCKED] Waiting on the API team.",
            renderedHtml: null,
            createdDate: "2026-07-31T10:00:00Z",
            author: { id: "author", displayName: "Ada", uniqueName: "ada@example.com" },
          },
          {
            id: 2,
            workItemId: 1,
            text: "An unrelated note.",
            renderedHtml: null,
            createdDate: "2026-07-31T11:00:00Z",
            author: { id: "author", displayName: "Ada", uniqueName: "ada@example.com" },
          },
        ],
        currentUser: null,
        error: null,
      }),
    );
    const root = await render({
      loadTree: async () => ({
        isTreeQuery: false,
        roots: [item(1, "Queued", { tags: ["Blocked"], noteCount: 2 })],
        error: null,
      }),
      noteLoader: { loadNotes },
    });
    const selector =
      '[data-item-id="1"] .awesomeado-sprint-card__markers button[data-marker="blocked"]';
    await vi.waitFor(() => expect(root.querySelector(selector)).not.toBeNull());
    const pill = root.querySelector<HTMLButtonElement>(selector)!;

    expect(pill.title).toBe("");
    pill.click();
    await vi.waitFor(() =>
      expect(root.querySelector(".awesomeado-marker-reasons__popup")?.textContent).toContain(
        "Waiting on the API team.",
      ),
    );

    expect(loadNotes).toHaveBeenCalledTimes(1);
    expect(root.querySelector(".awesomeado-marker-reasons__popup")?.textContent).not.toContain(
      "An unrelated note.",
    );
  });
});

describe("Sprint View new Interrupt command", () => {
  it("tags a new Interrupt as accepted in one patch when its checkbox is selected", async () => {
    const writeField = vi
      .fn<EnhancedViewServices["writeField"]>()
      .mockResolvedValue({ ok: true, rev: 2 });
    const root = await render({ writeField });
    openContextMenu(root.querySelector('[data-item-id="2"]')!);
    const command = menuCommand("Tag with Interrupt");
    const accepted = document.querySelector<HTMLInputElement>(
      '.awesomeado-item-menu__checkbox-command input[type="checkbox"]',
    )!;
    expect(accepted.checked).toBe(false);
    expect(command.querySelector('[data-marker="interrupt"]')?.getAttribute("data-accepted")).toBe(
      "false",
    );
    expect(document.querySelector(".awesomeado-item-command__panel")).toBeNull();

    accepted.click();
    expect(accepted.checked).toBe(true);
    expect(command.querySelector('[data-marker="interrupt"]')?.getAttribute("data-accepted")).toBe(
      "true",
    );
    expect(document.querySelector(".awesomeado-item-menu")).not.toBeNull();
    command.click();

    const editor = document.querySelector<HTMLElement>(".awesomeado-text-editor")!;
    const input = editor.querySelector<HTMLTextAreaElement>("textarea")!;
    const acceptButton = [...editor.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Accept",
    )!;
    expect(document.querySelector(".awesomeado-item-command__title")?.textContent).toBe("Queued");
    expect(input.placeholder).toBe("Why is the interrupt accepted in the sprint?");
    expect(acceptButton.disabled).toBe(true);
    input.value = "Needed to meet the sprint goal.";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(acceptButton.disabled).toBe(false);
    acceptButton.click();

    await vi.waitFor(() => expect(writeField).toHaveBeenCalledTimes(1));
    await settleQueuedWrites();
    // The tag and the reason must be ONE patch: a trailing second write would be a stale-rev bug,
    // and only the whole call log can say that the second write is absent.
    expect(writeField.mock.calls).toEqual([
      [
        {
          id: 2,
          rev: 1,
          field: "System.Tags",
          value: "Interrupt",
          baseValue: "",
          comment: "[ACCEPTED] Needed to meet the sprint goal.",
        },
      ],
    ]);
    expect(
      root
        .querySelector('[data-item-id="2"] [data-marker="interrupt"]')
        ?.getAttribute("data-accepted"),
    ).toBe("true");
  });
});

describe("Sprint View existing Interrupt commands", () => {
  it("offers Clear and Accept for an unaccepted Interrupt", async () => {
    const writeField = vi
      .fn<EnhancedViewServices["writeField"]>()
      .mockResolvedValue({ ok: true, rev: 2 });
    const root = await render({
      loadTree: async () => ({
        isTreeQuery: false,
        roots: [item(1, "Interrupt", { tags: ["Interrupt"] })],
        error: null,
      }),
      writeField,
    });
    openContextMenu(root.querySelector('[data-item-id="1"]')!);
    expect(menuCommand("Clear Interrupt")).not.toBeNull();
    menuCommand("Accept interrupt").click();

    const editor = document.querySelector<HTMLElement>(".awesomeado-text-editor")!;
    const input = editor.querySelector<HTMLTextAreaElement>("textarea")!;
    const acceptButton = [...editor.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent === "Accept",
    )!;
    input.value = "The team committed to delivering it.";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    acceptButton.click();

    await vi.waitFor(() => expect(writeField).toHaveBeenCalledTimes(1));
    await settleQueuedWrites();
    expect(writeField.mock.calls).toEqual([
      [
        {
          id: 1,
          rev: 1,
          field: "System.Tags",
          value: "Interrupt",
          baseValue: "Interrupt",
          comment: "[ACCEPTED] The team committed to delivering it.",
        },
      ],
    ]);
  });

  it("offers only an accepted Clear command for an accepted Interrupt", async () => {
    const writeField = vi
      .fn<EnhancedViewServices["writeField"]>()
      .mockResolvedValue({ ok: true, rev: 2 });
    const root = await render({
      loadTree: async () => ({
        isTreeQuery: false,
        roots: [item(1, "Accepted", { tags: ["Interrupt"] })],
        error: null,
      }),
      interruptAcceptance: {
        readInterruptAcceptance: async () => ({
          acceptedWorkItemIds: [1],
          failedWorkItemIds: [],
          error: null,
        }),
      },
      writeField,
    });
    openContextMenu(root.querySelector('[data-item-id="1"]')!);
    const clear = menuCommand("Clear Interrupt");
    expect(clear.querySelector('[data-marker="interrupt"]')?.getAttribute("data-accepted")).toBe(
      "true",
    );
    expect(
      [...document.querySelectorAll(".awesomeado-item-menu__command")].some(
        (row) => row.getAttribute("aria-label") === "Accept interrupt",
      ),
    ).toBe(false);
    clear.click();

    await vi.waitFor(() => expect(writeField).toHaveBeenCalledTimes(1));
    await settleQueuedWrites();
    expect(writeField.mock.calls).toEqual([
      [{ id: 1, rev: 1, field: "System.Tags", value: "", baseValue: "Interrupt" }],
    ]);
  });
});

describe("Sprint View ordering", () => {
  it("defaults to backlog rank and applies a session picker to cards and children", async () => {
    const parent = item(10, "Parent", {
      importance: 1,
      children: [
        item(12, "Alpha child", {
          type: "Task",
          importance: 20,
          eta: "2026-08-10T12:00:00Z",
        }),
        item(11, "Zulu child", {
          type: "Task",
          importance: 10,
          eta: "2026-08-20T12:00:00Z",
        }),
      ],
    });
    const laterCard = item(2, "Alpha card", {
      importance: 20,
      eta: "2026-08-10T12:00:00Z",
    });
    const earlierCard = item(1, "Zulu card", {
      importance: 10,
      eta: "2026-08-20T12:00:00Z",
    });
    const root = await render({
      loadTree: async () => ({
        isTreeQuery: false,
        roots: [laterCard, parent, earlierCard],
        error: null,
      }),
      getTypes: workCardTypes,
    });

    const cards = [...root.querySelectorAll<HTMLElement>(".awesomeado-sprint__item")];
    expect(cards.map((card) => card.dataset.itemId)).toEqual(["10", "1", "2"]);
    cards[0]!.querySelector<HTMLButtonElement>(".awesomeado-child-items__badge")!.click();
    expect(
      [...cards[0]!.querySelectorAll(".awesomeado-child-items__title-text")].map(
        (title) => title.textContent,
      ),
    ).toEqual(["Zulu child", "Alpha child"]);

    const ordering = root.querySelector<HTMLButtonElement>(".awesomeado-ordering__trigger")!;
    expect(ordering.title).toContain("By Importance");
    ordering.click();
    root.querySelector<HTMLButtonElement>('[data-policy="title"]')!.click();
    const titleCards = [...root.querySelectorAll<HTMLElement>(".awesomeado-sprint__item")];
    expect(titleCards.map((card) => card.dataset.itemId)).toEqual(["2", "10", "1"]);
    titleCards[1]!.querySelector<HTMLButtonElement>(".awesomeado-child-items__badge")!.click();
    expect(
      [...titleCards[1]!.querySelectorAll(".awesomeado-child-items__title-text")].map(
        (title) => title.textContent,
      ),
    ).toEqual(["Alpha child", "Zulu child"]);

    root.querySelector<HTMLButtonElement>(".awesomeado-ordering__trigger")!.click();
    root.querySelector<HTMLButtonElement>('[data-policy="eta"]')!.click();
    expect(
      [...root.querySelectorAll<HTMLElement>(".awesomeado-sprint__item")].map(
        (card) => card.dataset.itemId,
      ),
    ).toEqual(["2", "1", "10"]);
  });
});

async function verifyChildFieldEditing(): Promise<void> {
  const writeField = vi
    .fn<EnhancedViewServices["writeField"]>()
    .mockResolvedValueOnce({ ok: true, rev: 2 })
    .mockResolvedValueOnce({ ok: true, rev: 3 });
  const parent = item(10, "Parent", {
    children: [item(11, "Editable child", { type: "Task" })],
  });
  const root = await render({
    loadTree: async () => ({ isTreeQuery: true, roots: [parent], error: null }),
    getTypes: workCardTypes,
    writeField,
  });
  root.querySelector<HTMLButtonElement>(".awesomeado-child-items__badge")!.click();
  const popup = root.querySelector<HTMLElement>(".awesomeado-child-items__popup")!;
  popup.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")!.click();
  const bob = [
    ...popup.querySelectorAll<HTMLButtonElement>(".awesomeado-assigned__results button"),
  ].find((button) => button.textContent?.includes("Bob"))!;
  bob.click();
  await vi.waitFor(() => expect(writeField).toHaveBeenCalledTimes(1));
  expect(writeField).toHaveBeenNthCalledWith(1, {
    id: 11,
    rev: 1,
    field: "System.AssignedTo",
    value: "bob@example.com",
  });
  await vi.waitFor(() =>
    expect(root.querySelector(".awesomeado-child-items__popup")).not.toBeNull(),
  );
  root.querySelector<HTMLElement>(".awesomeado-child-items__popup .awesomeado-eta__label")!.click();
  const date = root.querySelector<HTMLInputElement>(
    ".awesomeado-child-items__popup input[type=date]",
  )!;
  date.value = "2026-08-21";
  date.dispatchEvent(new Event("change"));
  await vi.waitFor(() => expect(writeField).toHaveBeenCalledTimes(2));
  expect(writeField).toHaveBeenNthCalledWith(2, {
    id: 11,
    rev: 2,
    field: "Custom.TaskETA",
    value: "2026-08-21T12:00:00Z",
  });
}

async function verifyChildDragReorder(): Promise<void> {
  const reorderItem = vi.fn<EnhancedViewServices["reorderItem"]>().mockResolvedValue({
    ok: true,
    ranks: [
      { id: 12, rank: 0 },
      { id: 11, rank: 1 },
    ],
  });
  const parent = item(10, "Parent", {
    children: [
      item(11, "Earlier child", { type: "Task", importance: 10 }),
      item(12, "Later child", { type: "Task", importance: 20 }),
    ],
  });
  const root = await render({
    loadTree: async () => ({ isTreeQuery: true, roots: [parent], error: null }),
    getTypes: workCardTypes,
    reorderItem,
  });
  const card = root.querySelector<HTMLElement>('[data-item-id="10"]')!;
  card.querySelector<HTMLButtonElement>(".awesomeado-child-items__badge")!.click();
  const titles = [...card.querySelectorAll<HTMLElement>(".awesomeado-child-items__title")];
  const rows = [...card.querySelectorAll<HTMLElement>(".awesomeado-child-items__row")];
  const { dataTransfer, event } = startDrag(titles[1]!);
  expect(event.defaultPrevented).toBe(false);
  dispatchDrag(rows[0]!, "dragover", dataTransfer);
  dispatchDrag(rows[0]!, "drop", dataTransfer);
  await vi.waitFor(() => expect(reorderItem).toHaveBeenCalledOnce());
  expect(reorderItem).toHaveBeenCalledWith({
    id: 12,
    rev: 1,
    parentId: 10,
    currentParentId: 10,
    previousId: 0,
    nextId: 11,
    siblingIds: [12, 11],
    team: "team-id",
  });
  await vi.waitFor(() =>
    expect(
      [...root.querySelectorAll(".awesomeado-child-items__title-text")].map(
        (title) => title.textContent,
      ),
    ).toEqual(["Later child", "Earlier child"]),
  );
}

async function verifyChildPopupCardDragLifecycle(): Promise<void> {
  const root = await render({
    loadTree: async () => ({ isTreeQuery: true, roots: workCardTree(), error: null }),
    getTypes: workCardTypes,
  });
  const card = root.querySelector<HTMLElement>('[data-item-id="3"]')!;
  const badge = card.querySelector<HTMLButtonElement>(".awesomeado-child-items__badge")!;
  expect(card.draggable).toBe(true);
  badge.click();
  expect(card.draggable).toBe(false);
  expect(
    card.querySelector<HTMLButtonElement>(
      ".awesomeado-child-items__popup .awesomeado-assigned__name",
    )!.disabled,
  ).toBe(true);
  expect(
    card
      .querySelector(".awesomeado-child-items__popup .awesomeado-eta")
      ?.getAttribute("aria-disabled"),
  ).toBe("true");
  badge.click();
  expect(card.draggable).toBe(true);
  card.querySelector<HTMLElement>(".awesomeado-sprint-card__title")!.click();
  badge.click();
  expect(card.draggable).toBe(false);
  expect(
    card.querySelector<HTMLButtonElement>(
      ".awesomeado-child-items__popup .awesomeado-assigned__name",
    )!.disabled,
  ).toBe(true);
  expect(
    card.querySelector<HTMLElement>(".awesomeado-child-items__popup .awesomeado-assigned__name")!
      .style.cursor,
  ).toBe("default");
  expect(
    card.querySelector<HTMLElement>(".awesomeado-child-items__popup .awesomeado-eta")!.style.cursor,
  ).toBe("default");
  expect(card.querySelector<HTMLButtonElement>(".awesomeado-child-items__check")!.disabled).toBe(
    true,
  );
  expect(
    [...card.querySelectorAll<HTMLElement>(".awesomeado-child-items__title")].every(
      (title) => !title.draggable,
    ),
  ).toBe(true);
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  expect(card.draggable).toBe(true);
}

describe("Sprint View child panel", () => {
  it("edits the child assignee and ETA", verifyChildFieldEditing);
  it("completes and reopens a child from an active card", async () => {
    const writeField = vi.fn<EnhancedViewServices["writeField"]>().mockResolvedValue({
      ok: true,
      rev: 2,
    });
    const parent = item(10, "Parent", {
      children: [item(11, "Open child", { type: "Task", state: "Active" })],
    });
    const root = await render({
      loadTree: async () => ({ isTreeQuery: true, roots: [parent], error: null }),
      getTypes: workCardTypes,
      writeField,
    });
    root.querySelector<HTMLButtonElement>(".awesomeado-child-items__badge")!.click();
    root.querySelector<HTMLButtonElement>(".awesomeado-child-items__check")!.click();

    await vi.waitFor(() => expect(writeField).toHaveBeenCalledOnce());
    expect(writeField).toHaveBeenCalledWith({
      id: 11,
      rev: 1,
      field: "System.State",
      value: "Done",
      baseValue: "Active",
    });
    await vi.waitFor(() =>
      expect(
        root.querySelector(".awesomeado-child-items__check")?.getAttribute("aria-checked"),
      ).toBe("true"),
    );
    const reopen = root.querySelector<HTMLButtonElement>(".awesomeado-child-items__check")!;
    reopen.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    reopen.click();
    await vi.waitFor(() => expect(writeField).toHaveBeenCalledTimes(2));
    expect(writeField).toHaveBeenNthCalledWith(2, {
      id: 11,
      rev: 2,
      field: "System.State",
      value: "Active",
      baseValue: "Done",
    });
    await vi.waitFor(() =>
      expect(root.querySelector(".awesomeado-child-items__popup")).not.toBeNull(),
    );
  });
  it("persists child title drag order by rank", verifyChildDragReorder);
  it("suspends card dragging and follows compact editability", verifyChildPopupCardDragLifecycle);
});

describe("Sprint View board drag and drop", () => {
  it("rejects cross-lane drops", async () => {
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
    expect(writeField).not.toHaveBeenCalled();
    expect(root.querySelector(".awesomeado-sprint-card__drop-shadow")).toBeNull();
  });
});

describe("Sprint View column drag and drop", () => {
  it("highlights an empty destination column and writes its state under a derived sort", async () => {
    const writeField = vi.fn<EnhancedViewServices["writeField"]>().mockResolvedValue({
      ok: true,
      rev: 2,
    });
    const roots = [item(1, "Move me"), item(2, "Stay here")];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
      writeField,
    });
    root.querySelector<HTMLButtonElement>(".awesomeado-ordering__trigger")!.click();
    root.querySelector<HTMLButtonElement>('[data-policy="title"]')!.click();
    const source = root.querySelector<HTMLElement>('[data-item-id="1"]')!;
    const target = [...root.querySelectorAll<HTMLElement>(".awesomeado-sprint__cell")].find(
      (cell) => cell.dataset.areaPath === "Project\\Platform" && cell.dataset.columnOrdinal === "1",
    )!;
    await stickSprintColumnHeader(root);

    const dataTransfer = beginDrag(source);
    const dragImage = root.ownerDocument.querySelector<HTMLElement>(
      ".awesomeado-sprint-card__drag-image",
    )!;
    expect(source.style.opacity).toBe("0.9");
    expect(dragImage.style.opacity).toBe("0.9");
    expect(dragImage.style.position).toBe("fixed");
    const originalDragBackground = dragImage.style.background;
    dispatchDrag(target, "dragover", dataTransfer);
    const columnTitle = root.querySelector<HTMLElement>(
      ".awesomeado-sprint__column-title:nth-child(2)",
    )!;
    expect(columnTitle.style.getPropertyValue("--sprint-column-header-opacity")).toBe("0.9");
    expect(source.style.opacity).toBe("0.9");
    expect(dragImage.style.background).toBe(originalDragBackground);
    expectOriginalDragBackground(dragImage, target);
    expect(target.querySelector(".awesomeado-sprint-card__drop-shadow")).toBeNull();
    expect(columnTitle.dataset.dropTarget).toBe("true");
    const highlight = columnTitle.querySelector<HTMLElement>(
      ".awesomeado-sprint__column-title-highlight",
    )!;
    expect(highlight.style.borderColor).toBe(columnTitle.style.color);
    expect(highlight.style.borderColor).toBe("var(--status-blue-foreground)");
    expect(highlight.previousElementSibling).toBe(
      columnTitle.querySelector(".awesomeado-sprint__column-title-label"),
    );
    dispatchDrag(target, "drop", dataTransfer);
    await vi.waitFor(() => expect(writeField).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(cellOf(root, 1)?.dataset).toMatchObject({
        areaPath: "Project\\Platform",
        columnOrdinal: "1",
      }),
    );
    await settleQueuedWrites();

    // Both fixture cards are "New", so a handler that wrote the WRONG card would produce a
    // byte-identical body without the id/rev — the one drag failure a reader can never see.
    expect(writeField.mock.calls).toEqual([
      [
        {
          id: 1,
          rev: 1,
          field: "System.State",
          value: "Active",
          baseValue: "New",
          additionalFields: undefined,
        },
      ],
    ]);
    expect(cellOf(root, 2)?.dataset).toMatchObject({
      areaPath: "Project\\Platform",
      columnOrdinal: "0",
    });
    expect(source.style.opacity).toBe("");
    expect(columnTitle.dataset.dropTarget).toBeUndefined();
    expect(highlight.style.borderColor).toBe("transparent");
    expect(root.ownerDocument.querySelector(".awesomeado-sprint-card__drag-image")).toBeNull();
    expect(root.querySelector(".awesomeado-sprint-card__drop-shadow")).toBeNull();
  });
});

async function renderCrossColumnPlacement() {
  const writeField = vi.fn<EnhancedViewServices["writeField"]>().mockResolvedValue({ ok: true });
  const reorderItem = vi.fn<EnhancedViewServices["reorderItem"]>().mockResolvedValue({
    ok: true,
    order: 5,
    rev: 2,
    stateChanged: true,
  });
  const root = await render({
    loadTree: async () => ({
      isTreeQuery: false,
      roots: [
        item(1, "Move me", { importance: 30 }),
        item(2, "First active", { state: "Active", importance: 10 }),
        item(3, "Second active", { state: "Active", importance: 20 }),
      ],
      error: null,
    }),
    writeField,
    reorderItem,
  });
  const source = root.querySelector<HTMLElement>('[data-item-id="1"]')!;
  const first = root.querySelector<HTMLElement>('[data-item-id="2"]')!;
  const second = root.querySelector<HTMLElement>('[data-item-id="3"]')!;
  const cell = first.closest<HTMLElement>(".awesomeado-sprint__cell")!;
  first.getBoundingClientRect = () => ({ top: 100, height: 80 }) as DOMRect;
  second.getBoundingClientRect = () => ({ top: 188, height: 80 }) as DOMRect;
  return { root, source, first, second, cell, writeField, reorderItem };
}

describe("Sprint View cross-column positioned card placement", () => {
  it("keeps a shadow target visible while dragging upward through card gaps", async () => {
    const { root, source, second, cell, writeField, reorderItem } =
      await renderCrossColumnPlacement();

    const dataTransfer = beginDrag(source);
    dispatchDrag(cell, "dragover", dataTransfer, 250);
    let shadow = cell.querySelector<HTMLElement>(".awesomeado-sprint-card__drop-shadow")!;
    expect(shadow.previousElementSibling).toBe(second);

    dispatchDrag(cell, "dragover", dataTransfer, 90);
    shadow = cell.querySelector<HTMLElement>(".awesomeado-sprint-card__drop-shadow")!;
    expect(cell.firstElementChild).toBe(shadow);
    expect(
      root.querySelector<HTMLElement>(".awesomeado-sprint__column-title:nth-child(2)")!.dataset
        .dropTarget,
    ).toBe("true");

    dispatchDrag(cell, "drop", dataTransfer, 90);
    await vi.waitFor(() => expect(reorderItem).toHaveBeenCalledOnce());
    expect(writeField).not.toHaveBeenCalled();
    expect(reorderItem).toHaveBeenCalledWith({
      id: 1,
      rev: 1,
      parentId: 0,
      currentParentId: 0,
      previousId: 0,
      nextId: 2,
      siblingIds: [1, 2, 3],
      team: "team-id",
      stateName: "Active",
      stateBaseName: "New",
    });
    await vi.waitFor(() => {
      const moved = root.querySelector<HTMLElement>('[data-item-id="1"]')!;
      expect(moved.closest<HTMLElement>(".awesomeado-sprint__cell")?.dataset.columnOrdinal).toBe(
        "1",
      );
    });
    expect(root.querySelector(".awesomeado-sprint-card__drop-shadow")).toBeNull();
  });
});

describe("Sprint View cross-column empty placement", () => {
  it("places a drop last when the destination has no visible cards", async () => {
    const reorderItem = vi
      .fn<EnhancedViewServices["reorderItem"]>()
      .mockResolvedValue({ ok: true, stateChanged: true });
    const root = await render({
      loadTree: async () => ({
        isTreeQuery: false,
        roots: [item(1, "Move me")],
        error: null,
      }),
      reorderItem,
    });
    const source = root.querySelector<HTMLElement>('[data-item-id="1"]')!;
    const cell = [...root.querySelectorAll<HTMLElement>(".awesomeado-sprint__cell")].find(
      (candidate) => candidate.dataset.columnOrdinal === "1",
    )!;

    const dataTransfer = beginDrag(source);
    dispatchDrag(cell, "dragover", dataTransfer, 100);
    expect(cell.querySelector(".awesomeado-sprint-card__drop-shadow")).toBeNull();
    expect(
      root.querySelector<HTMLElement>(".awesomeado-sprint__column-title:nth-child(2)")!.dataset
        .dropTarget,
    ).toBe("true");
    dispatchDrag(cell, "drop", dataTransfer, 100);

    await vi.waitFor(() => expect(reorderItem).toHaveBeenCalledOnce());
    // The id/rev name WHICH card the board moved; without them a move of another card reads the same.
    expect(reorderItem).toHaveBeenCalledWith({
      id: 1,
      rev: 1,
      parentId: 0,
      currentParentId: 0,
      previousId: 0,
      nextId: 0,
      siblingIds: [1],
      team: "team-id",
      stateName: "Active",
      stateBaseName: "New",
    });
  });
});

describe("Sprint View same-column card reordering", () => {
  it("shows an insertion line and persists same-cell backlog rank", async () => {
    const reorderItem = vi.fn<EnhancedViewServices["reorderItem"]>().mockResolvedValue({
      ok: true,
      ranks: [
        { id: 2, rank: 0 },
        { id: 1, rank: 1 },
      ],
    });
    const root = await render({
      loadTree: async () => ({
        isTreeQuery: false,
        roots: [item(1, "First", { importance: 10 }), item(2, "Second", { importance: 20 })],
        error: null,
      }),
      reorderItem,
    });
    const source = root.querySelector<HTMLElement>('[data-item-id="2"]')!;
    const target = root.querySelector<HTMLElement>('[data-item-id="1"]')!;
    const dataTransfer = beginDrag(source);
    dispatchDrag(target, "dragover", dataTransfer);
    // The line's only job is to say WHERE the card lands, so it has to sit exactly where the
    // asserted previousId/nextId puts it: nothing before it, the target row right after it.
    const line = root.querySelector<HTMLElement>(".awesomeado-tracking__drop-line")!;
    expect(line.parentElement).toBe(target.parentElement);
    expect(line.previousElementSibling).toBeNull();
    expect(line.nextElementSibling).toBe(target);
    expect(line.dataset.dropKind).toBe("reorder");
    dispatchDrag(target, "drop", dataTransfer);
    await vi.waitFor(() => expect(reorderItem).toHaveBeenCalledOnce());
    expect(reorderItem).toHaveBeenCalledWith({
      id: 2,
      rev: 1,
      parentId: 0,
      currentParentId: 0,
      previousId: 0,
      nextId: 1,
      siblingIds: [2, 1],
      team: "team-id",
    });
    expect(root.querySelector(".awesomeado-tracking__drop-line")).toBeNull();
  });

  it("disables card and child reordering outside backlog-rank mode", async () => {
    const reorderItem = vi
      .fn<EnhancedViewServices["reorderItem"]>()
      .mockResolvedValue({ ok: true });
    const parent = item(1, "Parent", {
      children: [item(11, "One", { type: "Task" }), item(12, "Two", { type: "Task" })],
    });
    const root = await render({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [parent, item(2, "Second")],
        error: null,
      }),
      getTypes: workCardTypes,
      reorderItem,
    });
    root.querySelector<HTMLButtonElement>(".awesomeado-ordering__trigger")!.click();
    root.querySelector<HTMLButtonElement>('[data-policy="title"]')!.click();
    const cards = [...root.querySelectorAll<HTMLElement>(".awesomeado-sprint__item")];
    drag(cards[1]!, cards[0]!);
    expect(reorderItem).not.toHaveBeenCalled();
    expect(root.querySelector(".awesomeado-tracking__drop-line")).toBeNull();
    root.querySelector<HTMLButtonElement>(".awesomeado-child-items__badge")!.click();
    expect(
      [...root.querySelectorAll<HTMLElement>(".awesomeado-child-items__title")].every(
        (title) => !title.draggable,
      ),
    ).toBe(true);
  });
});

describe("Sprint View card drag initiation", () => {
  it("does not start the owning card drag from its parent hierarchy control", async () => {
    const writeField = vi.fn<EnhancedViewServices["writeField"]>().mockResolvedValue({ ok: true });
    const root = await render({
      loadTree: async () => ({ isTreeQuery: true, roots: workCardTree(), error: null }),
      getTypes: workCardTypes,
      writeField,
    });
    const card = root.querySelector<HTMLElement>('[data-item-id="2"]')!;
    const parentTrigger = card.querySelector<HTMLElement>(
      ".awesomeado-sprint-card__parent-trigger",
    )!;
    const target = [...root.querySelectorAll<HTMLElement>(".awesomeado-sprint__cell")].find(
      (cell) => cell.dataset.areaPath === "Project\\Platform" && cell.dataset.columnOrdinal === "1",
    )!;

    parentTrigger.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    const dataTransfer = beginDrag(card);
    dispatchDrag(target, "dragover", dataTransfer);
    dispatchDrag(target, "drop", dataTransfer);

    expect(writeField).not.toHaveBeenCalled();
    expect(root.querySelector(".awesomeado-sprint-card__drop-shadow")).toBeNull();
    expect(card.dataset.dragging).toBeUndefined();
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
      interruptAcceptance: {
        readInterruptAcceptance: async () => ({
          acceptedWorkItemIds: [1],
          failedWorkItemIds: [],
          error: null,
        }),
      },
    });
    const interrupt = root.querySelector('[data-marker="interrupt"]')!;

    expect(metric(interrupt, "unaccepted")).toBe("1");
    expect(metric(interrupt, "accepted")).toBe("1");
    expect(metric(interrupt, "total")).toBeUndefined();

    const acceptedOnly = await render({
      loadTree: async () => ({ isTreeQuery: false, roots: [roots[0]!], error: null }),
      interruptAcceptance: {
        readInterruptAcceptance: async () => ({
          acceptedWorkItemIds: [1],
          failedWorkItemIds: [],
          error: null,
        }),
      },
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

    expect(root.querySelector(".awesomeado-area-filter__popup")).not.toBeNull();
    expect(root.querySelectorAll(".awesomeado-sprint__item")).toHaveLength(2);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(root.querySelectorAll(".awesomeado-sprint__item")).toHaveLength(1);
    expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain("Apps item");
    expect(
      [...root.querySelectorAll(".awesomeado-sprint__lane-name")].map((lane) => lane.textContent),
    ).toEqual(["Apps"]);
  });
});

describe("Sprint View shared Lane defaults and publishing", () => {
  it("uses this sprint's shared paths instead of the binding defaults", async () => {
    const save = vi.fn(async () => true);
    const roots = [item(1, "Platform item"), item(2, "Apps item", { areaPath: "Project\\Apps" })];
    const root = await render(
      {
        loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
        sprintAreaPaths: {
          read: async () => ({
            sprintAreaPaths: {
              "Project\\Sprint 1": {
                areaPaths: ["Project\\Platform"],
                startDate: null,
                finishDate: null,
              },
            },
          }),
          save,
        },
      },
      { defaultAreaPaths: "Project\\Apps" },
    );

    root.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.click();
    const selected = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
      .filter((input) => input.checked)
      .map((input) => input.value)
      .sort();
    expect(selected).toEqual(["Project\\Platform"]);
    expect(save).not.toHaveBeenCalled();
  });

  it("uses binding defaults without publishing when the sprint has no shared selection", async () => {
    const save = vi.fn(async () => true);
    const roots = [item(1, "Platform item"), item(2, "Apps item", { areaPath: "Project\\Apps" })];
    const root = await render(
      {
        loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
        sprintAreaPaths: {
          read: async () => ({ sprintAreaPaths: {} }),
          save,
        },
      },
      { defaultAreaPaths: "Project\\Apps" },
    );

    expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain("Apps item");
    expect(save).not.toHaveBeenCalled();
  });

  it("publishes each Lane-filter change under the selected sprint path", async () => {
    const save = vi.fn(async () => true);
    const roots = [item(1, "Platform item"), item(2, "Apps item", { areaPath: "Project\\Apps" })];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
      sprintAreaPaths: {
        read: async () => ({
          sprintAreaPaths: {
            "Project\\Sprint 1": { areaPaths: [], startDate: null, finishDate: null },
          },
        }),
        save,
      },
    });
    save.mockClear();

    root.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.click();
    const apps = [...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
      (input) => input.value === "Project\\Apps",
    )!;
    apps.checked = true;
    apps.dispatchEvent(new Event("change"));

    expect(save).toHaveBeenCalledWith({
      "Project\\Sprint 1": {
        areaPaths: ["Project\\Apps"],
        startDate: null,
        finishDate: null,
      },
    });
  });
});

describe("Sprint View shared Lane reloads", () => {
  it("reloads the selected paths from shared configuration on refresh", async () => {
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        sprintAreaPaths: {
          "Project\\Sprint 1": {
            areaPaths: ["Project\\Platform"],
            startDate: null,
            finishDate: null,
          },
        },
      })
      .mockResolvedValueOnce({
        sprintAreaPaths: {
          "Project\\Sprint 1": {
            areaPaths: ["Project\\Apps"],
            startDate: null,
            finishDate: null,
          },
        },
      });
    const roots = [item(1, "Platform item"), item(2, "Apps item", { areaPath: "Project\\Apps" })];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
      sprintAreaPaths: { read, save: async () => true },
    });
    expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain("Platform item");

    root.querySelector<HTMLButtonElement>(".awesomeado-sprint__refresh")!.click();
    await vi.waitFor(() =>
      expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain("Apps item"),
    );
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("loads the selection stored for each sprint when the sprint changes", async () => {
    const read = vi.fn(async () => ({
      sprintAreaPaths: {
        "Project\\Sprint 1": {
          areaPaths: ["Project\\Platform"],
          startDate: null,
          finishDate: null,
        },
        "Project\\Sprint 2": {
          areaPaths: ["Project\\Apps"],
          startDate: null,
          finishDate: null,
        },
      },
    }));
    const roots = [
      item(1, "Current platform"),
      item(2, "Future apps", {
        areaPath: "Project\\Apps",
        iterationPath: "Project\\Sprint 2",
        sprintName: "Sprint 2",
      }),
    ];
    const root = await render({
      loadTree: async () => ({ isTreeQuery: false, roots, error: null }),
      sprintAreaPaths: { read, save: async () => true },
    });
    expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain(
      "Current platform",
    );

    await selectSprint(root, "Sprint 2", [2]);

    expect(root.querySelector(".awesomeado-sprint__item")?.textContent).toContain("Future apps");
    expect(read).toHaveBeenCalledTimes(2);
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
    expect(options[1]?.style.color).toBe(
      "color-mix(in srgb, #112233 60%, var(--text-primary-color))",
    );
    expect(options[2]?.style.color).toBe(
      "color-mix(in srgb, #445566 60%, var(--text-primary-color))",
    );

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

    root.querySelector<HTMLButtonElement>(".awesomeado-hierarchy-filter__trigger")!.click();

    expect(
      root
        .querySelector<HTMLButtonElement>(".awesomeado-hierarchy-filter__trigger")
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
    expect(root.querySelector(".awesomeado-hierarchy-filter__popup")).toBeNull();

    root.querySelector<HTMLButtonElement>(".awesomeado-hierarchy-filter__trigger")!.click();

    expect(root.querySelector(".awesomeado-hierarchy-filter__popup")).not.toBeNull();
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
    ).toEqual(["All projects", "Next epic", "Next feature"]);
  });
});
