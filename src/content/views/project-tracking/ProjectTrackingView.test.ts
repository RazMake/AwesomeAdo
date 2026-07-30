import { describe, expect, it, vi } from "vitest";

import type { FeatureCrewAssignee } from "../../../common/ado/FeatureCrew";
import type { FeatureCrewReconcileRequest } from "../../../common/ado/IFeatureCrewWriter";
import type { WorkItemFieldWriteRequest } from "../../../common/ado/IWorkItemFieldWriter";
import type {
  TrackedUser,
  TrackedWorkItem,
  TypeCatalogEntry,
} from "../../../common/ado/TrackedWorkItem";
import type { WorkItemNote } from "../../../common/ado/WorkItemNote";
import { normalizeMarkerTags } from "../../../common/settings/ExtensionSettings";
import type {
  EnhancedViewContext,
  EnhancedViewServices,
} from "../../../common/view-common/EnhancedView";

import { projectTrackingView } from "./ProjectTrackingView";

/**
 * The fixture's work item type hierarchy (Epic → Feature → Story), with the board columns each type
 * routes its ADO states onto. Module-scope because it never varies between tests — a test that needs
 * a different catalog overrides `getTypes` outright.
 */
const FIXTURE_TYPES: TypeCatalogEntry[] = [
  {
    name: "Epic",
    color: "ff6b6b",
    icon: "epic.svg",
    etaField: "Custom.EpicETA",
    children: ["Feature"],
    columns: [
      { column: "Active", states: ["Active", "New"] },
      { column: "Done", states: ["Closed"] },
    ],
  },
  {
    name: "Feature",
    color: "6bcf7f",
    icon: "feature.svg",
    etaField: "Custom.FeatureETA",
    children: ["Story"],
    columns: [
      { column: "Active", states: ["Active"] },
      { column: "Done", states: ["Closed"] },
    ],
  },
  {
    name: "Story",
    color: "4fc3f7",
    icon: "story.svg",
    etaField: null,
    children: [],
    columns: [
      { column: "Active", states: ["Active", "New"] },
      { column: "Done", states: ["Closed"] },
    ],
  },
];

/** The fixture's sprint window: the current sprint and the next one. */
const FIXTURE_SPRINT_WINDOW = {
  entries: [
    {
      path: "Project\\Sprint 1",
      name: "Sprint 1",
      label: "Current - Sprint 1",
      relation: "current",
    },
    {
      path: "Project\\Sprint 2",
      name: "Sprint 2",
      label: "Next - Sprint 2",
      relation: "future",
    },
  ],
  currentName: "Sprint 1",
} as const;

/**
 * Creates a fake EnhancedViewServices for testing with controlled return values.
 */
function createFakeServices(overrides?: Partial<EnhancedViewServices>): EnhancedViewServices {
  return {
    loadTree: async () => ({
      isTreeQuery: true,
      roots: [],
      error: null,
    }),
    featureCrew: {
      reconcile: async () => ({ ok: true, changed: false }),
    },
    noteLoader: {
      loadNotes: async () => ({ notes: [], currentUser: null, error: null }),
    },
    // Nothing in the fixtures has been commented on, so the default answers "read fine, no dates" —
    // which is what lets a test assert the "New notes" pill empties the board without also having to
    // rule out a failed read. The tests that light that pill override this with canned dates.
    noteActivity: {
      readNoteActivity: async () => ({ activity: [], error: null }),
    },
    noteWriter: {
      addNote: async () => ({ ok: true }),
      editNote: async () => ({ ok: true }),
    },
    userDirectory: {
      search: async () => [],
      resolve: async () => null,
    },
    // No mentions in the fixtures by default, so the directory has nothing to name; the tests that
    // exercise `@`-mention rendering override this with a populated one.
    mentionDirectory: {
      resolveNames: async () => new Map<string, string>(),
      knownNames: () => new Map<string, string>(),
    },
    getTypes: () => FIXTURE_TYPES,
    getBoardColumns: () => ["Queue", "Active", "Waiting", "Done", "Removed"],
    // The shipped defaults, so the marker commands and pills are configured in every fixture; tests
    // covering the "nothing configured" degradation override this with blank tags.
    markerTags: () => normalizeMarkerTags(undefined),
    loadSprintWindow: async () => ({
      entries: [...FIXTURE_SPRINT_WINDOW.entries],
      currentName: FIXTURE_SPRINT_WINDOW.currentName,
    }),
    now: () => new Date("2026-07-24T12:00:00Z"),
    // A no-op logger by default: nothing here could read a recorded call, and a recorder no test can
    // reach is dead state. Tests that care about logging override this with their own.
    logger: {
      info: () => undefined,
      error: () => undefined,
    },
    writeField: async () => ({ ok: true, rev: 1 }),
    reorderItem: async () => ({ ok: true }),
    // A configured team by default, so drag-to-reorder is available in the fixtures that exercise it.
    // Tests covering the "no team" degradation override this with null.
    currentTeam: () => "team-guid",
    openDiagnosticsLog: () => undefined,
    ...overrides,
  };
}

/**
 * Creates a fake TrackedUser.
 */
function createUser(name: string): TrackedUser {
  return {
    displayName: name,
    uniqueName: `${name.toLowerCase().replace(" ", ".")}@example.com`,
    imageUrl: `https://example.com/avatar/${name.toLowerCase().replace(" ", "")}.png`,
  };
}

/**
 * The two Features under the fixture epic: an Active one on the current sprint carrying a Story, and
 * a New one on the next sprint. Split from `createFixtureTree` so neither builder outgrows a screen.
 */
function createFixtureFeatures(bob: TrackedUser, carol: TrackedUser, alice: TrackedUser) {
  return [
    {
      id: 2,
      rev: 2,
      type: "Feature",
      title: "User Authentication",
      state: "Active",
      priority: 1,
      assignedTo: bob,
      iterationPath: "Project\\Sprint 1",
      sprintName: "Sprint 1",
      createdDate: "2026-01-15T09:00:00Z",
      createdBy: bob,
      changedDate: "2026-07-22T10:15:00Z",
      changedBy: carol,
      stateChangeDate: "2026-07-22T10:15:00Z",
      description: "Implement OAuth2 authentication.",
      tags: [],
      importance: 100,
      // The one fixture item ADO says has a discussion, so the "has notes" icon state is exercised.
      noteCount: 2,
      eta: "2026-08-15T00:00:00Z",
      children: [
        {
          id: 3,
          rev: 1,
          type: "Story",
          title: "Login UI",
          state: "New",
          priority: 2,
          assignedTo: carol,
          iterationPath: "Project\\Sprint 2",
          sprintName: "Sprint 2",
          createdDate: "2026-01-20T10:00:00Z",
          createdBy: carol,
          changedDate: "2026-01-20T10:00:00Z",
          changedBy: carol,
          stateChangeDate: "2026-01-20T10:00:00Z",
          description: "Design and implement the login screen.",
          tags: [],
          importance: 100,
          noteCount: 0,
          eta: null,
          children: [],
        },
      ],
    },
    {
      id: 4,
      rev: 1,
      type: "Feature",
      title: "Data Migration",
      state: "New",
      priority: 0,
      assignedTo: null,
      iterationPath: "Project\\Sprint 2",
      sprintName: "Sprint 2",
      createdDate: "2026-01-18T11:00:00Z",
      createdBy: alice,
      changedDate: "2026-01-18T11:00:00Z",
      changedBy: alice,
      stateChangeDate: "2026-01-18T11:00:00Z",
      description: "Migrate legacy data to new schema.",
      tags: [],
      importance: 200,
      noteCount: 0,
      eta: null,
      children: [],
    },
  ] satisfies TrackedWorkItem[];
}

/**
 * Creates a fake TrackedWorkItem tree.
 */
function createFixtureTree(): TrackedWorkItem {
  const alice = createUser("Alice Smith");
  const bob = createUser("Bob Jones");
  const carol = createUser("Carol White");

  const epic: TrackedWorkItem = {
    id: 1,
    rev: 3,
    type: "Epic",
    title: "Platform Modernization",
    state: "In Progress",
    priority: 2,
    assignedTo: alice,
    iterationPath: "Project\\Sprint 1",
    sprintName: "Sprint 1",
    createdDate: "2026-01-10T08:00:00Z",
    createdBy: alice,
    changedDate: "2026-07-20T14:30:00Z",
    changedBy: bob,
    stateChangeDate: "2026-07-20T14:30:00Z",
    description: "Modernize the platform infrastructure.",
    tags: [],
    importance: 100,
    noteCount: 0,
    eta: "2026-12-31T00:00:00Z",
    children: createFixtureFeatures(bob, carol, alice),
  };

  return epic;
}

function marginRightOf(element: Element | null | undefined): string {
  return element instanceof HTMLElement ? element.style.marginRight : "";
}

describe("ProjectTrackingView — services & load errors", () => {
  it("should show unavailable message when services are undefined", async () => {
    const doc = document;

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services: undefined,
    };

    const root = projectTrackingView.render(context);
    expect(root.className).toContain("awesomeado-view");
    // Title is rendered synchronously, message follows
    expect(root.textContent).toContain("Project Tracking");
    expect(root.textContent).toContain("Data services are unavailable");
  });

  it("should show loading initially then render error when result.error is set", async () => {
    const doc = document;

    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [],
        error: "Query execution failed.",
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    expect(root.textContent).toContain("Loading…");

    await Promise.resolve();
    await Promise.resolve();

    expect(root.textContent).toContain("Query execution failed");
  });

  it("should show error when query is not a tree query", async () => {
    const doc = document;

    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: false,
        roots: [],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    expect(root.textContent).toContain("requires a tree");
  });
});

describe("ProjectTrackingView — query shape errors", () => {
  it("should show error when query returns no items", async () => {
    const doc = document;

    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    expect(root.textContent).toContain("returned no items");
  });

  it("should show error when query returns multiple roots", async () => {
    const doc = document;

    const epic1 = createFixtureTree();
    const epic2 = { ...epic1, id: 999, title: "Second Epic" };

    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic1, epic2],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    expect(root.textContent).toContain("exactly one root");
  });

  it("should show error when root type does not match first type", async () => {
    const doc = document;

    const wrongRoot = { ...createFixtureTree(), type: "Feature" };

    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [wrongRoot],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    expect(root.textContent).toContain("must be a Epic");
  });
});

describe("ProjectTrackingView — header & tech lead", () => {
  it("should render header with root title and type color", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const titleEl = root.querySelector(".awesomeado-tracking__title");
    expect(titleEl?.textContent).toBe("Platform Modernization");
    // Browser normalizes hex colors to rgb(), so check for either format
    const style = titleEl?.getAttribute("style") ?? "";
    expect(style.includes("#ff6b6b") || style.includes("rgb(255, 107, 107)")).toBe(true);
  });

  it("should render TechLead with epic assignee name", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const techLead = root.querySelector(".awesomeado-tracking__techlead");
    expect(techLead?.textContent).toContain("TechLead:");
    expect(techLead?.textContent).toContain("Alice Smith");
  });

  it("should render root ETA badge on tech lead line", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    // The root ETA badge should be present in the header.
    const etaBadges = root.querySelectorAll(".awesomeado-eta");
    expect(etaBadges.length).toBeGreaterThan(0);
    // The first ETA badge in the header is the root's.
    const headerEta = root.querySelector(".awesomeado-tracking__header .awesomeado-eta");
    expect(headerEta).toBeTruthy();
  });
});

describe("ProjectTrackingView — tree rows", () => {
  it("should render tree rows for each item", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    // With Sprint 1 filter ON by default only User Authentication (a Sprint 1 item) is shown.
    // Turn filter OFF to see every item; the epic is no longer a tree row (it is in the header).
    const toggle = root.querySelector(".awesomeado-sprint-picker__button") as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    toggle.click();
    // The picker toggles internally and triggers a re-render via setTimeout; wait for it.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await Promise.resolve();

    const allRows = root.querySelectorAll(".awesomeado-tracking__row");
    // 2 Features + 1 Story = 3 rows (the epic is summarized in the header, not listed as a row).
    expect(allRows.length).toBe(3);
  });

  it("should render child row under parent in tree structure", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const childrenContainers = root.querySelectorAll(".awesomeado-tracking__children");
    expect(childrenContainers.length).toBeGreaterThan(0);
  });
});

/** Renders a board over `tree` and waits for its two settle ticks. Shared by the outline tests. */
async function renderOutlineBoard(tree: TrackedWorkItem): Promise<HTMLElement> {
  const services = createFakeServices({
    loadTree: async () => ({ isTreeQuery: true, roots: [tree], error: null }),
  });
  const context: EnhancedViewContext = {
    doc: document,
    queryId: "q1",
    properties: {},
    services,
  };
  const root = projectTrackingView.render(context);
  await Promise.resolve();
  await Promise.resolve();
  return root;
}

/** The children container belonging to a twisty's own row. */
const childrenOf = (twisty: HTMLElement): HTMLElement =>
  twisty
    .closest(".awesomeado-tracking__row")
    ?.parentElement?.querySelector(".awesomeado-tracking__children") as HTMLElement;

/** The stripe sequence currently assigned to visible item wrappers. */
const visibleRowStripes = (root: HTMLElement): string[] =>
  [...root.querySelectorAll<HTMLElement>("[data-row-stripe]")].map(
    (row) => row.dataset.rowStripe ?? "",
  );

describe("ProjectTrackingView — row backgrounds", () => {
  it("keeps visible rows alternately striped as branches collapse and expand", async () => {
    const root = await renderOutlineBoard(
      createItem({
        id: 1,
        type: "Epic",
        children: [
          createItem({
            id: 2,
            type: "Feature",
            children: [createItem({ id: 3, type: "Story" })],
          }),
          createItem({ id: 4, type: "Feature" }),
        ],
      }),
    );

    expect(visibleRowStripes(root)).toEqual(["base", "alternate", "base"]);
    const twisty = root.querySelector(".awesomeado-tracking__twisty") as HTMLButtonElement;
    twisty.click();
    expect(visibleRowStripes(root)).toEqual(["base", "alternate"]);

    twisty.click();
    expect(visibleRowStripes(root)).toEqual(["base", "alternate", "base"]);
    expect(root.querySelector("style")?.textContent).toContain("--item-row-hover-background");
  });

  it("strengthens the row and its expanded details while Ctrl+Shift is held", async () => {
    const root = await renderOutlineBoard(createFixtureTree());
    document.body.append(root);
    const item = root.querySelector<HTMLElement>(".awesomeado-tracking__item")!;
    item.querySelector<HTMLButtonElement>(".awesomeado-tracking__notes-toggle")!.click();
    item.querySelector<HTMLButtonElement>(".awesomeado-tracking__describe")!.click();

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Shift", ctrlKey: true, shiftKey: true }),
    );
    expect(root.classList.contains("awesomeado-tracking--modifier-highlight")).toBe(true);
    expect(item.querySelector<HTMLElement>(":scope > .awesomeado-notes")?.style.display).toBe(
      "block",
    );
    expect(
      item.querySelector<HTMLElement>(":scope > .awesomeado-tracking__description")?.style.display,
    ).toBe("block");
    const styles = root.querySelector("style")?.textContent ?? "";
    expect(styles).toContain("> .awesomeado-notes");
    expect(styles).toContain("> .awesomeado-tracking__description");

    document.dispatchEvent(new KeyboardEvent("keyup", { key: "Shift", ctrlKey: true }));
    expect(root.classList.contains("awesomeado-tracking--modifier-highlight")).toBe(false);
    root.remove();
  });
});

describe("ProjectTrackingView — expand & collapse", () => {
  it("should toggle twisty to collapse and expand children", async () => {
    const root = await renderOutlineBoard(createFixtureTree());

    const twisty = root.querySelector(".awesomeado-tracking__twisty") as HTMLButtonElement;
    expect(twisty).toBeTruthy();
    expect(twisty.getAttribute("aria-expanded")).toBe("true");
    expect(twisty.textContent).toBe("▼\uFE0E");

    twisty.click();
    expect(twisty.getAttribute("aria-expanded")).toBe("false");
    expect(twisty.textContent).toBe("▶\uFE0E");
    expect(childrenOf(twisty).style.display).toBe("none");

    twisty.click();
    expect(twisty.getAttribute("aria-expanded")).toBe("true");
    expect(childrenOf(twisty).style.display).toBe("block");
  });

  it("should expand all nodes when expand-all clicked", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    // First collapse a node manually.
    const twisties = root.querySelectorAll(
      ".awesomeado-tracking__twisty",
    ) as NodeListOf<HTMLButtonElement>;
    if (twisties.length > 0 && twisties[0]) {
      twisties[0].click();
      expect(twisties[0].getAttribute("aria-expanded")).toBe("false");
    }

    const expandAll = root.querySelector(".awesomeado-tracking__expand-all") as HTMLButtonElement;
    expandAll.click();

    twisties.forEach((tw) => {
      expect(tw.getAttribute("aria-expanded")).toBe("true");
      expect(tw.textContent).toBe("▼\uFE0E");
      // The glyph must stay inside its own small-font span: writing the button's textContent would
      // drop the span and leave the triangle at the button's much larger inherited size.
      const glyph = tw.querySelector<HTMLElement>(".awesomeado-tracking__twisty-glyph");
      expect(glyph?.textContent).toBe("▼\uFE0E");
      expect(glyph?.style.fontSize).toBe("8px");
    });

    const notes = root.querySelectorAll<HTMLButtonElement>(".awesomeado-tracking__notes-toggle");
    notes.forEach((toggle) => expect(toggle.getAttribute("aria-expanded")).toBe("false"));
  });

  it("expands every notes panel when all parent rows are already expanded", async () => {
    const root = await renderOutlineBoard(createFixtureTree());

    (root.querySelector(".awesomeado-tracking__expand-all") as HTMLButtonElement).click();

    const notes = root.querySelectorAll<HTMLButtonElement>(".awesomeado-tracking__notes-toggle");
    expect(notes.length).toBeGreaterThan(0);
    notes.forEach((toggle) => expect(toggle.getAttribute("aria-expanded")).toBe("true"));
  });
});

describe("ProjectTrackingView — the outline survives a repaint", () => {
  it("keeps a collapsed row collapsed when the board repaints", async () => {
    const root = await renderOutlineBoard(createFixtureTree());

    const collapsed = root.querySelector(".awesomeado-tracking__twisty") as HTMLButtonElement;
    collapsed.click();
    expect(collapsed.getAttribute("aria-expanded")).toBe("false");

    await turnSprintFilterOff(root);

    // A repaint (here the sprint filter; a drag-reorder and a re-sort take the same path) throws the
    // old rows away, so the outline only survives if the collapsed state is remembered outside the
    // DOM — otherwise every branch the reader closed springs back open under them.
    const repainted = root.querySelector(".awesomeado-tracking__twisty") as HTMLButtonElement;
    expect(repainted).not.toBe(collapsed);
    expect(repainted.getAttribute("aria-expanded")).toBe("false");
    expect(repainted.textContent).toBe("▶\uFE0E");
    expect(childrenOf(repainted).style.display).toBe("none");
  });

  it("keeps every other row expanded when one is collapsed", async () => {
    // Two expandable branches, which the shared fixtures do not have: the point of the test is that
    // the memory is per row, not a single board-wide flag.
    const root = await renderOutlineBoard(
      createItem({
        id: 1,
        type: "Epic",
        title: "Epic",
        children: [
          createItem({
            id: 2,
            type: "Feature",
            title: "First",
            children: [createItem({ id: 3, title: "First child" })],
          }),
          createItem({
            id: 4,
            type: "Feature",
            title: "Second",
            children: [createItem({ id: 5, title: "Second child" })],
          }),
        ],
      }),
    );
    await turnSprintFilterOff(root);

    const before = [...root.querySelectorAll<HTMLButtonElement>(".awesomeado-tracking__twisty")];
    expect(before).toHaveLength(2);
    before[0]!.click();

    await turnSprintFilterOff(root);

    // Only the row the reader closed is remembered as collapsed; the rest keep the default.
    const after = [...root.querySelectorAll<HTMLButtonElement>(".awesomeado-tracking__twisty")];
    expect(after.map((twisty) => twisty.getAttribute("aria-expanded"))).toEqual(["false", "true"]);
  });

  it("keeps a row collapsed by collapse-all collapsed across a repaint", async () => {
    const root = await renderOutlineBoard(createFixtureTree());

    (root.querySelector(".awesomeado-tracking__collapse-all") as HTMLButtonElement).click();
    await turnSprintFilterOff(root);

    // collapse-all has to record what it did for the same reason a single toggle does.
    const repainted = root.querySelector(".awesomeado-tracking__twisty") as HTMLButtonElement;
    expect(repainted.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("ProjectTrackingView — staged collapse", () => {
  it("collapses notes and descriptions before collapsing parent rows", async () => {
    const root = await renderOutlineBoard(createFixtureTree());
    const note = root.querySelector(".awesomeado-tracking__notes-toggle") as HTMLButtonElement;
    const description = root.querySelector(".awesomeado-tracking__describe") as HTMLButtonElement;
    const twisty = root.querySelector(".awesomeado-tracking__twisty") as HTMLButtonElement;
    const collapseAll = root.querySelector(
      ".awesomeado-tracking__collapse-all",
    ) as HTMLButtonElement;
    note.click();
    description.click();

    collapseAll.click();

    expect(note.getAttribute("aria-expanded")).toBe("false");
    expect(description.getAttribute("aria-expanded")).toBe("false");
    expect(twisty.getAttribute("aria-expanded")).toBe("true");

    collapseAll.click();
    expect(twisty.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("ProjectTrackingView — collapse all & description", () => {
  it("should collapse all nodes when collapse-all clicked", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const collapseAll = root.querySelector(
      ".awesomeado-tracking__collapse-all",
    ) as HTMLButtonElement;
    collapseAll.click();

    const twisties = root.querySelectorAll(
      ".awesomeado-tracking__twisty",
    ) as NodeListOf<HTMLButtonElement>;
    twisties.forEach((tw) => {
      expect(tw.getAttribute("aria-expanded")).toBe("false");
      expect(tw.textContent).toBe("▶\uFE0E");
      const glyph = tw.querySelector<HTMLElement>(".awesomeado-tracking__twisty-glyph");
      expect(glyph?.textContent).toBe("▶\uFE0E");
      expect(glyph?.style.fontSize).toBe("8px");
    });
  });

  it("should toggle description panel when ? button clicked", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const descButton = root.querySelector(".awesomeado-tracking__describe") as HTMLButtonElement;
    expect(descButton).toBeTruthy();
    expect(descButton.getAttribute("aria-expanded")).toBe("false");

    // Find the description panel which is a sibling of the row containing the button
    const rowWrapper = descButton.closest("div")?.parentElement;
    const descPanel = rowWrapper?.querySelector(".awesomeado-tracking__description") as HTMLElement;
    expect(descPanel).toBeTruthy();
    expect(descPanel.style.display).toBe("none");

    descButton.click();
    expect(descButton.getAttribute("aria-expanded")).toBe("true");
    expect(descPanel.style.display).toBe("block");

    descButton.click();
    expect(descButton.getAttribute("aria-expanded")).toBe("false");
    expect(descPanel.style.display).toBe("none");
  });
});

describe("ProjectTrackingView — the row's leading controls", () => {
  it("leads with status, priority, the ? disc, type icon, then title", async () => {
    const root = await renderBoardForTree(
      epicOver([createItem({ id: 2, type: "Feature", title: "User Authentication" })]),
    );

    const content = root.querySelector(".awesomeado-tracking__content")!;
    const order = [...content.children].map((child) => child.className.split(" ")[0]);
    // Leading-edge controls, so every row's ? sits in the same column instead of at whatever point
    // the title happens to end on.
    expect(order.slice(0, 6)).toEqual([
      "awesomeado-status",
      "awesomeado-priority",
      "awesomeado-tracking__describe",
      "awesomeado-tracking__notes-toggle",
      "awesomeado-tracking__item-title",
      "awesomeado-assigned",
    ]);
  });

  it("gives the assignee twice the air the ? disc keeps from the type icon", async () => {
    const root = await renderBoardForTree(
      epicOver([createItem({ id: 2, type: "Feature", title: "User Authentication" })]),
    );

    // Asserted as a RATIO against the leading gap, not as a second hard-coded number: the assignee
    // is meant to move with that rhythm, so retuning one must not silently desynchronize the pair.
    const disc = root.querySelector<HTMLElement>(".awesomeado-tracking__describe")!;
    const assignee = root.querySelector<HTMLElement>(
      ".awesomeado-tracking__content .awesomeado-assigned",
    )!;
    const leadingGap = Number.parseFloat(disc.style.marginRight);
    expect(Number.parseFloat(assignee.style.marginLeft)).toBe(leadingGap * 2);
  });

  it("centers the title against the controls it shares a line with", async () => {
    const root = await renderBoardForTree(
      epicOver([createItem({ id: 2, type: "Feature", title: "User Authentication" })]),
    );

    // The disc, the type icon and the assignee are atomic inline boxes centred on the text line; a
    // baseline-aligned title sat visibly low against all three.
    const title = root.querySelector<HTMLElement>(".awesomeado-tracking__item-title")!;
    const disc = root.querySelector<HTMLElement>(".awesomeado-tracking__describe")!;
    expect(title.style.verticalAlign).toBe("middle");
    expect(title.style.verticalAlign).toBe(disc.style.verticalAlign);
  });
});

describe("ProjectTrackingView — the description disc's shade", () => {
  /** The board's first ? disc, over a single Feature with (or without) a description. */
  async function discOver(description: string): Promise<HTMLButtonElement> {
    const root = await renderBoardForTree(
      epicOver([createItem({ id: 2, type: "Feature", title: "User Authentication", description })]),
    );
    return root.querySelector<HTMLButtonElement>(".awesomeado-tracking__describe")!;
  }

  // The Feature type's configured color (6bcf7f), which is what the disc must borrow.
  const FEATURE_COLOR = "#6bcf7f";
  const COLLAPSED_FEATURE_COLOR = `light-dark(color-mix(in srgb, ${FEATURE_COLOR} 14%, var(--type-tint-background)), color-mix(in srgb, ${FEATURE_COLOR} 50%, var(--type-tint-background)))`;
  const EXPANDED_FEATURE_COLOR = `light-dark(color-mix(in srgb, ${FEATURE_COLOR} 24%, var(--type-tint-background)), color-mix(in srgb, ${FEATURE_COLOR} 80%, var(--type-tint-background)))`;

  it("uses an almost-white neutral fill on light themes when there is no description", async () => {
    const disc = await discOver("   ");

    // Whitespace is not a description: a disc promising text that turns out to be blank is worse
    // than one that never promised any.
    expect(disc.style.background).toBe("var(--description-neutral-background)");
    // The tooltip names the ACTION, not the state: the panel still carries the created/modified
    // line, so the disc is worth pressing on this row too.
    expect(disc.title).toBe("Show description");
  });

  it("uses an almost-white tint of the work item type on light themes", async () => {
    const disc = await discOver("Implement OAuth2 authentication.");

    expect(disc.style.background).toBe(COLLAPSED_FEATURE_COLOR);
    expect(disc.title).toBe("Show description");
  });

  it("strengthens the same type-color tint while expanded", async () => {
    const disc = await discOver("Implement OAuth2 authentication.");

    disc.click();
    expect(disc.style.background).toBe(EXPANDED_FEATURE_COLOR);
    expect(disc.title).toBe("Hide description");

    disc.click();
    expect(disc.style.background).toBe(COLLAPSED_FEATURE_COLOR);
  });

  it("changes only the neutral intensity when an empty description is expanded", async () => {
    const disc = await discOver("");

    disc.click();

    // The type color is the board's "there is something written here" signal; an open but empty
    // panel must not spend it on nothing.
    expect(disc.style.background).toBe("var(--description-neutral-active-background)");
  });

  it("centers the question mark in a fixed circle without native button padding", async () => {
    const disc = await discOver("Implement OAuth2 authentication.");

    expect(disc.style.display).toBe("inline-flex");
    expect(disc.style.alignItems).toBe("center");
    expect(disc.style.justifyContent).toBe("center");
    expect(disc.style.padding).toBe("0px");
    expect(disc.style.lineHeight).toBe("1");
  });
});

describe("ProjectTrackingView — meta line", () => {
  it("should render meta line with Created and Last Modified", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const descButton = root.querySelector(".awesomeado-tracking__describe") as HTMLButtonElement;
    descButton.click();

    const meta = root.querySelector(".awesomeado-tracking__meta");
    expect(meta?.textContent).toContain("Created on:");
    expect(meta?.textContent).toContain("Last Modified on:");

    // The actor names now live in the "By <name>" tooltip of each event label, not the visible text.
    const eventLabels = meta?.querySelectorAll<HTMLElement>(".awesomeado-lifecycle__event");
    const tooltips = Array.from(eventLabels ?? []).map((label) => label.title);
    expect(tooltips).toContain("By Bob Jones");
    expect(tooltips).toContain("By Carol White");
  });

  it("should render two DateLabel spans in meta line", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const descButton = root.querySelector(".awesomeado-tracking__describe") as HTMLButtonElement;
    descButton.click();

    const meta = root.querySelector(".awesomeado-tracking__meta");
    const dateLabels = meta?.querySelectorAll(".awesomeado-date");
    expect(dateLabels?.length).toBe(2);
  });
});

describe("ProjectTrackingView — item title & ETA", () => {
  it("should render item title with type color", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    // Turn the sprint filter OFF so every tree item is visible in a deterministic order.
    const toggle = root.querySelector(".awesomeado-sprint-picker__button") as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    toggle.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await Promise.resolve();

    const titles = root.querySelectorAll(".awesomeado-tracking__item-title");
    // Browser normalizes hex colors to rgb(), so check for either format.
    // The tree starts at the epic's children: first row is a Feature.
    if (titles[0]) {
      const style0 = titles[0].getAttribute("style") ?? "";
      expect(style0.includes("#6bcf7f") || style0.includes("rgb(107, 207, 127)")).toBe(true);
    }
    // Its nested child is a Story.
    if (titles[1]) {
      const style1 = titles[1].getAttribute("style") ?? "";
      expect(style1.includes("#4fc3f7") || style1.includes("rgb(79, 195, 247)")).toBe(true);
    }
  });

  it("should render ETA badge for items with eta", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const etaBadges = root.querySelectorAll(".awesomeado-eta");
    // Epic and one Feature have eta set
    expect(etaBadges.length).toBeGreaterThan(0);
  });
});

describe("ProjectTrackingView — sprint filter", () => {
  it("should default sprint filter to ON when sprints exist", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const toggle = root.querySelector(".awesomeado-sprint-picker__button") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    const select = root.querySelector(".awesomeado-sprint-picker__select") as HTMLSelectElement;
    expect(select.disabled).toBe(false);
  });

  it("should filter rows to selected sprint when filter ON", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const select = root.querySelector(".awesomeado-sprint-picker__select") as HTMLSelectElement;
    select.value = "Sprint 1";
    select.dispatchEvent(new Event("change"));

    await Promise.resolve();

    // Feature "User Authentication" is Sprint 1; the Story and Feature "Data Migration" are Sprint 2.
    // The epic is summarized in the header, not listed as a tree row. With Sprint 1 selected the
    // tree shows User Authentication (matches) and hides the Sprint 2-only items.
    const titles = root.querySelectorAll(".awesomeado-tracking__item-title");
    const titleTexts = Array.from(titles).map((t) => t.textContent);
    expect(titleTexts).not.toContain("Platform Modernization");
    expect(titleTexts).toContain("User Authentication");
    // Sprint 2 items without ancestors in Sprint 1 should be hidden
    expect(titleTexts).not.toContain("Data Migration");
  });

  it("should not show sprint pills when filter ON", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const pills = root.querySelectorAll(".awesomeado-tracking__sprint-pill");
    expect(pills.length).toBe(0);
  });
});

describe("ProjectTrackingView — status badge", () => {
  it("should render status badge with editable state per row", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const statusBadges = root.querySelectorAll(".awesomeado-status");
    expect(statusBadges.length).toBeGreaterThan(0);
    // The badge should have a caret affordance indicating it's interactive.
    const firstBadge = statusBadges[0];
    expect(firstBadge?.textContent).toContain("▾");
    // The first row (Feature, ADO State "Active") maps to the "Active" board column (ordinal 1),
    // so its chip carries the blue ordinal tint keyed off that position.
    const firstChip = root.querySelector<HTMLElement>(".awesomeado-status__badge");
    expect(firstChip?.style.background).toBe("var(--status-blue-background)");
  });

  it("should call writeField when status badge is changed", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const writeFieldCalls: Array<{ id: number; rev: number; field: string; value: string | null }> =
      [];
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
      writeField: async (request) => {
        writeFieldCalls.push(request);
        return { ok: true, rev: request.rev + 1 };
      },
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    // Click the first status badge to open the dropdown.
    const firstBadge = root.querySelector(".awesomeado-status__badge") as HTMLElement;
    firstBadge.click();
    await Promise.resolve();

    // Select a different column (the first row in the popup).
    const firstRow = root.querySelector(".awesomeado-status__row") as HTMLButtonElement;
    firstRow.click();
    await Promise.resolve();

    // Exact shape AND exact count: asserting only `length > 0` would pass a regression that
    // enqueues the same edit twice. The first badge is the Feature (id 2, rev 2, ADO State
    // "Active"); its only alternative Status is "Done", whose primary ADO State is "Closed".
    expect(writeFieldCalls).toEqual([{ id: 2, rev: 2, field: "System.State", value: "Closed" }]);
  });
});

describe("ProjectTrackingView — priority badge", () => {
  it("renders immediately after status and writes a selected alternative", async () => {
    const epic = createFixtureTree();
    const writes: WorkItemFieldWriteRequest[] = [];
    const services = createFakeServices({
      loadTree: async () => ({ isTreeQuery: true, roots: [epic], error: null }),
      writeField: async (request) => {
        writes.push(request);
        return { ok: true, rev: request.rev + 1 };
      },
    });
    const root = projectTrackingView.render({
      doc: document,
      queryId: "q1",
      properties: {},
      services,
    });
    await Promise.resolve();
    await Promise.resolve();

    const content = root.querySelector(".awesomeado-tracking__content");
    const status = content?.querySelector(".awesomeado-status");
    const priority = content?.querySelector(".awesomeado-priority");
    expect(status?.nextElementSibling).toBe(priority);
    expect(priority?.textContent).toContain("P1");
    expect(marginRightOf(status)).toBe("2px");
    expect(marginRightOf(priority)).toBe("3px");

    priority?.querySelector<HTMLButtonElement>(".awesomeado-priority__badge")?.click();
    const options = [
      ...(priority?.querySelectorAll<HTMLButtonElement>(".awesomeado-priority__option") ?? []),
    ];
    expect(options.map((option) => option.textContent)).not.toContain("P1");
    options[0]?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writes).toEqual([
      {
        id: 2,
        rev: 2,
        field: "Microsoft.VSTS.Common.Priority",
        value: "0",
        baseValue: "1",
      },
    ]);
    await vi.waitFor(() => expect(priority?.textContent).toContain("P0"));
  });
});

// Shared by the two assignee-write groups below (module scope so each describe stays within
// max-lines-per-function without duplicating the fixture helpers).

/** A directory that only ever knows Dana, so a search result is deterministic. */
const danaDirectory: EnhancedViewServices["userDirectory"] = {
  search: async () => [
    { displayName: "Dana Scott", uniqueName: "dana@example.com", imageUrl: null },
  ],
  resolve: async () => null,
};

/** Renders the board and returns it plus the write requests the queue sent. */
async function renderBoardWithWrites(
  overrides?: Partial<EnhancedViewServices>,
): Promise<{ root: HTMLElement; writes: WorkItemFieldWriteRequest[] }> {
  const writes: WorkItemFieldWriteRequest[] = [];
  const services = createFakeServices({
    loadTree: async () => ({ isTreeQuery: true, roots: [createFixtureTree()], error: null }),
    writeField: async (request) => {
      writes.push(request);
      return { ok: true, rev: request.rev + 1 };
    },
    ...overrides,
  });
  const root = projectTrackingView.render({
    doc: document,
    queryId: "q1",
    properties: {},
    services,
  });
  await Promise.resolve();
  await Promise.resolve();
  return { root, writes };
}

/** Opens the first tree row's assignee picker and returns its chip, label and search field. */
function openRowPicker(root: HTMLElement): {
  chip: HTMLElement;
  label: HTMLElement;
  search: HTMLInputElement;
} {
  const chip = root.querySelector<HTMLElement>(".awesomeado-tracking__row .awesomeado-assigned")!;
  const label = chip.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")!;
  label.click();
  return {
    chip,
    label,
    search: chip.querySelector<HTMLInputElement>(".awesomeado-assigned__search")!,
  };
}

/** Types `query` into an open picker and clicks the result naming `displayName`. */
async function pickFromPicker(
  chip: HTMLElement,
  search: HTMLInputElement,
  query: string,
  displayName: string,
): Promise<void> {
  search.value = query;
  search.dispatchEvent(new Event("input"));
  await Promise.resolve();
  const match = [
    ...chip.querySelectorAll<HTMLButtonElement>(".awesomeado-assigned__result button"),
  ].find((button) => button.textContent?.includes(displayName))!;
  match.click();
  // Let the queued write and the roster reconcile that follows it settle.
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

describe("ProjectTrackingView — assignee suggestions", () => {
  it("offers everyone already assigned across the tree the moment the picker opens", async () => {
    const { root } = await renderBoardWithWrites();

    const { chip } = openRowPicker(root);

    const offered = [...chip.querySelectorAll(".awesomeado-assigned__result-name")].map(
      (name) => name.textContent,
    );
    expect(offered).toContain("Alice Smith");
    expect(offered).toContain("Bob Jones");
  });
});

describe("ProjectTrackingView — assignee writes", () => {
  it("persists a picked assignee to System.AssignedTo and only then repaints the chip", async () => {
    const { root, writes } = await renderBoardWithWrites({ userDirectory: danaDirectory });

    const { chip, label, search } = openRowPicker(root);
    search.value = "dana";
    search.dispatchEvent(new Event("input"));
    await Promise.resolve();
    chip.querySelector<HTMLButtonElement>(".awesomeado-assigned__result button")!.click();

    // The pick alone must not move the label — the write has not been accepted yet.
    expect(label.textContent).toBe("Bob Jones");

    for (let i = 0; i < 6; i++) await Promise.resolve();

    // The first row is the Feature (id 2, rev 2); ADO resolves an identity from its unique name.
    expect(writes).toEqual([
      { id: 2, rev: 2, field: "System.AssignedTo", value: "dana@example.com" },
    ]);
    expect(label.textContent).toBe("Dana Scott");
  });

  it("leaves the chip untouched when Azure DevOps rejects the write", async () => {
    const { root } = await renderBoardWithWrites({
      writeField: async () => ({ ok: false, error: "rejected" }),
      userDirectory: danaDirectory,
    });

    const { chip, label, search } = openRowPicker(root);
    const before = label.textContent;

    await pickFromPicker(chip, search, "dana", "Dana Scott");

    expect(label.textContent).toBe(before);
  });
});

describe("ProjectTrackingView — status writes", () => {
  it("displays the mapped Status label, never the raw ADO State", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = { doc, queryId: "q1", properties: {}, services };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    // The Story "Login UI" has ADO State "New", which the Story type routes to the "Active" column.
    // The badge must therefore show "Active" (the Status), never "New" (the raw ADO State).
    const badgeLabels = [...root.querySelectorAll(".awesomeado-status__badge")].map(
      (badge) => badge.childNodes[0]?.textContent,
    );
    expect(badgeLabels).not.toContain("New");
    expect(badgeLabels).toContain("Active");
  });

  it("enqueues the primary ADO State on change and updates the badge to the new Status", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const writeFieldCalls: Array<{ id: number; rev: number; field: string; value: string | null }> =
      [];
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
      writeField: async (request) => {
        writeFieldCalls.push(request);
        return { ok: true, rev: request.rev + 1 };
      },
    });

    const context: EnhancedViewContext = { doc, queryId: "q1", properties: {}, services };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    // The first row (Feature, ADO State "Active" → "Active" column) offers only "Done" as an
    // alternative Status; picking it writes that column's primary ADO State ("Closed").
    const firstBadge = root.querySelector(".awesomeado-status__badge") as HTMLElement;
    firstBadge.click();
    await Promise.resolve();

    const doneRow = root.querySelector(".awesomeado-status__row") as HTMLButtonElement;
    expect(doneRow.textContent).toBe("Done");
    doneRow.click();
    // Let the serialized queue run the write and the optimistic reconciliation settle.
    for (let tick = 0; tick < 6; tick += 1) {
      await Promise.resolve();
    }

    // The queued write carries the primary ADO State, not the Status label.
    expect(writeFieldCalls[0]?.field).toBe("System.State");
    expect(writeFieldCalls[0]?.value).toBe("Closed");
    // After the write commits, the badge shows the new Status label ("Done")...
    expect(firstBadge.childNodes[0]?.textContent).toBe("Done");
    // ...and re-tints to that column's ordinal ("Done" is position 3 → green), so color tracks label.
    expect(firstBadge.style.background).toBe("var(--status-green-background)");
    // The repaint also treats the newly completed item as resolved today, before its August ETA.
    expect(
      root.querySelector<HTMLElement>(".awesomeado-tracking__row .awesomeado-eta")?.style.color,
    ).toBe("var(--completion-foreground)");
  });
});

describe("ProjectTrackingView — write-queue indicator", () => {
  it("shows the write-queue status indicator while a save is in flight and hides it once it settles", async () => {
    const doc = document;

    const epic = createFixtureTree();
    // Gate the write so it stays in flight until the test releases it, letting us observe the
    // "saving" indicator deterministically without real timers.
    let releaseWrite: () => void = () => undefined;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
      writeField: async (request) => {
        await writeGate;
        return { ok: true, rev: request.rev + 1 };
      },
    });

    const context: EnhancedViewContext = { doc, queryId: "q1", properties: {}, services };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const indicator = root.querySelector(".awesomeado-write-queue-status") as HTMLElement;
    // Idle before any edit: the indicator is present but hidden.
    expect(indicator).toBeTruthy();
    expect(indicator.style.display).toBe("none");

    // Trigger a state change to enqueue a write.
    const firstBadge = root.querySelector(".awesomeado-status__badge") as HTMLElement;
    firstBadge.click();
    await Promise.resolve();
    const doneRow = root.querySelector(".awesomeado-status__row") as HTMLButtonElement;
    doneRow.click();
    // Let the enqueue notify the indicator (the write itself is still gated open).
    await Promise.resolve();

    expect(indicator.style.display).not.toBe("none");
    expect(indicator.textContent).toContain("Saving 1 change");

    // Release the write and let the queue drain; the indicator returns to hidden.
    releaseWrite();
    for (let tick = 0; tick < 6; tick += 1) {
      await Promise.resolve();
    }
    expect(indicator.style.display).toBe("none");
  });

  it("takes the user to the diagnostics log when the failure chip is clicked", async () => {
    const doc = document;

    const epic = createFixtureTree();
    let openedLog = 0;
    const services = createFakeServices({
      loadTree: async () => ({ isTreeQuery: true, roots: [epic], error: null }),
      // A rejected write leaves this persist-then-reflect board looking unchanged, so the chip is the
      // only evidence of the loss — and it has room for a count, not the cause.
      writeField: async () => ({ ok: false, error: "TF401232: work item does not exist" }),
      openDiagnosticsLog: () => {
        openedLog += 1;
      },
    });

    const context: EnhancedViewContext = { doc, queryId: "q1", properties: {}, services };
    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const firstBadge = root.querySelector(".awesomeado-status__badge") as HTMLElement;
    firstBadge.click();
    await Promise.resolve();
    const doneRow = root.querySelector(".awesomeado-status__row") as HTMLButtonElement;
    doneRow.click();
    for (let tick = 0; tick < 6; tick += 1) {
      await Promise.resolve();
    }

    const indicator = root.querySelector(".awesomeado-write-queue-status") as HTMLElement;
    expect(indicator.textContent).toContain("Couldn't save 1 change");

    indicator.click();

    expect(openedLog).toBe(1);
  });
});

describe("ProjectTrackingView — blocked marker pills", () => {
  it("shows both blocked markers after Assigned To and before the sprint pill", async () => {
    const epic = createFixtureTree();
    epic.children[0]!.tags = ["Blocked", "Blocked by another team", "Interrupt"];
    const services = createFakeServices({
      loadTree: async () => ({ isTreeQuery: true, roots: [epic], error: null }),
    });
    const context: EnhancedViewContext = {
      doc: document,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();
    await turnSprintFilterOff(root);

    const content = [...root.querySelectorAll<HTMLElement>(".awesomeado-tracking__content")].find(
      (row) =>
        row.querySelector(".awesomeado-tracking__item-title")?.textContent ===
        "User Authentication",
    )!;
    const inlineOrder = [...content.children]
      .filter((element) =>
        element.matches(
          ".awesomeado-assigned, .awesomeado-marker-reasons, .awesomeado-tracking__sprint-pill",
        ),
      )
      .map((element) => {
        if (element.classList.contains("awesomeado-assigned")) return "assigned";
        if (element.classList.contains("awesomeado-tracking__sprint-pill")) return "sprint";
        // Each pill sits in its own positioned shell, which is what its reasons popup hangs off.
        return element.querySelector(".awesomeado-marker-pill")?.getAttribute("data-marker");
      });

    expect(inlineOrder).toEqual(["assigned", "blocked", "blockedByOtherTeam", "sprint"]);
  });
});

describe("ProjectTrackingView — sprint pills", () => {
  it("should toggle filter OFF and show sprint pills", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const toggle = root.querySelector(".awesomeado-sprint-picker__button") as HTMLButtonElement;
    toggle.click();

    // The picker toggles internally and triggers a re-render via setTimeout; wait for it.
    await new Promise((resolve) => setTimeout(resolve, 10));
    await Promise.resolve();

    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    // Pills should now be visible
    const pills = root.querySelectorAll(".awesomeado-tracking__sprint-pill");
    expect(pills.length).toBeGreaterThan(0);

    // All rows should be visible (no filter)
    const rows = root.querySelectorAll(".awesomeado-tracking__row");
    expect(rows.length).toBe(3);
  });

  it("should not show a sprint pill for an item on the iteration root", async () => {
    const doc = document;

    const epic = createFixtureTree();
    // Park one rendered descendant on the iteration ROOT (a single top-level node, no nested sprint).
    // Its leaf "sprint" is only the root of the iteration tree, so it must show no pill; the other
    // rows stay on real, nested sprints and must still be badged.
    const dataMigration = epic.children[1]!;
    dataMigration.iterationPath = "Project";
    dataMigration.sprintName = "Project";
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const toggle = root.querySelector(".awesomeado-sprint-picker__button") as HTMLButtonElement;
    toggle.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await Promise.resolve();

    const pills = root.querySelectorAll(".awesomeado-tracking__sprint-pill");
    // The three rows are two nested-sprint items plus the root-iteration one; only the two nested
    // items contribute a pill.
    expect(pills.length).toBe(2);
    const pillTexts = Array.from(pills, (pill) => pill.textContent);
    expect(pillTexts).not.toContain("Project");
  });
});

describe("ProjectTrackingView — interactive sprint pills", () => {
  it("moves from a clicked sprint pill and omits the current sprint", async () => {
    const { root, writes } = await renderRecordingBoard();
    await turnSprintFilterOff(root);

    root.querySelector<HTMLButtonElement>(".awesomeado-tracking__sprint-pill-button")!.click();

    const choices = [
      ...root.querySelectorAll<HTMLButtonElement>(".awesomeado-tracking__sprint-option"),
    ];
    expect(choices.map((choice) => choice.textContent)).toEqual(["Next - Sprint 2"]);
    expect(choices[0]?.style.color).toContain("var(--communication-foreground");

    choices[0]!.dispatchEvent(new MouseEvent("mouseenter"));
    expect(choices[0]?.style.backgroundColor).toBe("var(--control-background-hover)");
    choices[0]!.dispatchEvent(new MouseEvent("mouseleave"));
    expect(choices[0]?.style.backgroundColor).toBe("");

    choices[0]!.dispatchEvent(new FocusEvent("focus"));
    expect(choices[0]?.style.backgroundColor).toBe("var(--control-background-hover)");
    choices[0]!.dispatchEvent(new FocusEvent("blur"));
    expect(choices[0]?.style.backgroundColor).toBe("");

    choices[0]!.click();
    expect(root.querySelector(".awesomeado-tracking__sprint-popup")).toBeNull();
    await settleWrites();

    expect(writes[0]).toMatchObject({
      id: 2,
      field: "System.IterationPath",
      value: "Project\\Sprint 2",
      baseValue: "Project\\Sprint 1",
    });
  });
});

describe("ProjectTrackingView — no-sprint toggle & theming", () => {
  it("should force filter OFF and disable toggle when no sprints", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const clearSprints = (item: TrackedWorkItem): void => {
      item.iterationPath = null;
      item.sprintName = null;
      item.children.forEach(clearSprints);
    };
    clearSprints(epic);
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
      loadSprintWindow: async () => ({ entries: [], currentName: null }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const toggle = root.querySelector(".awesomeado-sprint-picker__button") as HTMLButtonElement;
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(toggle.disabled).toBe(true);

    const select = root.querySelector(".awesomeado-sprint-picker__select") as HTMLSelectElement;
    expect(select.disabled).toBe(true);

    // No tree item has sprint metadata, so no pills can be rendered.
    const pills = root.querySelectorAll(".awesomeado-tracking__sprint-pill");
    expect(pills.length).toBe(0);
  });

  it("should use themed colors for expand/collapse buttons", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const expandAll = root.querySelector(".awesomeado-tracking__expand-all") as HTMLButtonElement;
    expect(expandAll).toBeTruthy();
    // Assert theme CSS variables are present (not hard-coded light-only colors).
    const expandStyle = expandAll.getAttribute("style") ?? "";
    expect(expandStyle).toContain("var(");
  });
});

describe("ProjectTrackingView — themed layout", () => {
  it("should render header as themed panel with subtle background", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const header = root.querySelector(".awesomeado-tracking__header") as HTMLElement;
    expect(header).toBeTruthy();
    // The header should have a themed background (panel), not a border-bottom.
    const headerStyle = header.getAttribute("style") ?? "";
    expect(headerStyle).toContain("background");
    expect(headerStyle).toContain("var(");
    expect(headerStyle).not.toContain("border-bottom");
  });

  it("should render children with reduced indentation and vertical guide line", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const childrenContainer = root.querySelector(".awesomeado-tracking__children") as HTMLElement;
    expect(childrenContainer).toBeTruthy();
    const style = childrenContainer.getAttribute("style") ?? "";
    // ~70% tighter indentation; account for browser-added spaces in the style string.
    expect(style).toMatch(/padding-left:\s*2px/);
    // Vertical guide line.
    expect(style).toContain("border-left");
    expect(style).toContain("var(--control-border-emphasis)");
  });
});

describe("ProjectTrackingView — sanitization", () => {
  it("should not create img element when title contains <img>", async () => {
    const doc = document;

    const epic = createFixtureTree();
    epic.title = '<img src="x" onerror="alert(1)">';

    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    // The only images the board mints itself are avatars and work item type icons; a title is always
    // written as text, so markup inside one can never become one of them.
    const imgs = root.querySelectorAll("img");
    imgs.forEach((img) => {
      expect(
        img.className.includes("awesomeado-assigned__avatar") ||
          img.className.includes("awesomeado-type-icon__image"),
      ).toBe(true);
    });

    const title = root.querySelector(".awesomeado-tracking__title");
    expect(title?.textContent).toBe('<img src="x" onerror="alert(1)">');
  });

  it("strips the handler and the unusable source from an <img> in a description", async () => {
    const doc = document;

    const epic = createFixtureTree();
    // The epic is no longer a tree row; put the payload on the first visible child instead.
    epic.children[0]!.description = '<img src="javascript:alert(1)" onerror="alert(1)">';

    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const descButton = root.querySelector(".awesomeado-tracking__describe") as HTMLButtonElement;
    descButton.click();

    // A description now renders as rich text, so an <img> IS rebuilt — but only ever as an inert
    // one: the event handler is dropped outright, and a source that could not be FETCHED as an image
    // (here a `javascript:` URL) is refused, so nothing can be executed from what someone typed.
    const rendered = root.querySelector(".awesomeado-tracking__desc-text img");
    expect(rendered).toBeTruthy();
    expect(rendered?.hasAttribute("onerror")).toBe(false);
    expect(rendered?.hasAttribute("src")).toBe(false);
  });
});

describe("ProjectTrackingView — validation logging", () => {
  it("should log validation conclusion with signals", async () => {
    const doc = document;

    const logCalls: Array<{ level: string; message: string }> = [];
    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
      logger: {
        info: (message: string) => {
          logCalls.push({ level: "info", message });
        },
        error: (message: string) => {
          logCalls.push({ level: "error", message });
        },
      },
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    expect(logCalls.length).toBeGreaterThan(0);
    const validationLog = logCalls.find((log) =>
      log.message.includes("Project Tracking validation"),
    );
    expect(validationLog).toBeTruthy();
    expect(validationLog?.message).toContain("isTreeQuery=true");
    expect(validationLog?.message).toContain("rootCount=1");
    expect(validationLog?.message).toContain("rootType=Epic");
    expect(validationLog?.message).toContain("expectedType=Epic");
  });

  it("should handle missing assignee with Unassigned text", async () => {
    const doc = document;

    const epic = createFixtureTree();
    if (epic.children[1]) {
      epic.children[1].assignedTo = null;
    }

    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    // Turn filter OFF to see all rows (including the one with null assignee)
    const toggle = root.querySelector(".awesomeado-sprint-picker__button") as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    toggle.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await Promise.resolve();

    const assignedElements = root.querySelectorAll(".awesomeado-assigned__name");
    const hasUnassigned = Array.from(assignedElements).some(
      (el) => el.textContent === "Unassigned",
    );
    expect(hasUnassigned).toBe(true);
  });
});

describe("ProjectTrackingView — missing actor", () => {
  it("should omit the actor tooltip when createdBy is missing", async () => {
    const doc = document;

    const epic = createFixtureTree();
    // The epic is no longer a tree row; clear createdBy on the first visible child instead.
    epic.children[0]!.createdBy = null;

    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    const descButton = root.querySelector(".awesomeado-tracking__describe") as HTMLButtonElement;
    descButton.click();

    const meta = root.querySelector(".awesomeado-tracking__meta");
    // Still renders the line, just without a "By <name>" tooltip on the "Created" label.
    expect(meta?.textContent).toContain("Created on:");
    const createdLabel = meta?.querySelector<HTMLElement>(".awesomeado-lifecycle__event");
    expect(createdLabel?.title).toBe("");
  });
});

describe("ProjectTrackingView — feature crew reconcile", () => {
  it("should reconcile the Feature Crew with everyone assigned on load", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const requests: FeatureCrewReconcileRequest[] = [];
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
      featureCrew: {
        reconcile: async (request) => {
          requests.push(request);
          return { ok: true, changed: false };
        },
      },
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    projectTrackingView.render(context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requests).toHaveLength(1);
    // Stored under the LAST configured type (Story) and linked to the root epic id.
    expect(requests[0]?.rootId).toBe(1);
    expect(requests[0]?.typeName).toBe("Story");
    expect(requests[0]?.assignees).toEqual<FeatureCrewAssignee[]>([
      { alias: "alice.smith", fullName: "Alice Smith" },
      { alias: "bob.jones", fullName: "Bob Jones" },
      { alias: "carol.white", fullName: "Carol White" },
    ]);
  });
});

/**
 * Drives an inline assignee pick: open the TechLead picker, search, and choose the first result.
 * Shared so the re-reconcile tests assert on the outcome rather than on the click sequence.
 */
async function pickFirstSearchedAssignee(root: HTMLElement): Promise<void> {
  const nameButton = root.querySelector(".awesomeado-assigned__name") as HTMLButtonElement;
  nameButton.click();
  const searchInput = root.querySelector(".awesomeado-assigned__search") as HTMLInputElement;
  searchInput.value = "dave";
  searchInput.dispatchEvent(new Event("input"));
  await Promise.resolve();
  await Promise.resolve();

  const option = root.querySelector(".awesomeado-assigned__result button") as HTMLButtonElement;
  option.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ProjectTrackingView — feature crew re-reconcile", () => {
  it("should re-reconcile with a new person after an inline assignee change", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const requests: FeatureCrewReconcileRequest[] = [];
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
      featureCrew: {
        reconcile: async (request) => {
          requests.push(request);
          return { ok: true, changed: false };
        },
      },
      userDirectory: {
        search: async () => [
          { displayName: "Dave New", uniqueName: "dave@example.com", imageUrl: null },
        ],
        resolve: async () => null,
      },
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    const root = projectTrackingView.render(context);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requests).toHaveLength(1);

    await pickFirstSearchedAssignee(root);

    expect(requests).toHaveLength(2);
    expect(requests[1]?.assignees.map((a) => a.alias)).toContain("dave");
  });

  it("keeps reconciling after one reconcile rejects, and releases the pending indicator", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const requests: FeatureCrewReconcileRequest[] = [];
    // The load-time seed reconcile rejects. A rejection assigned into the serial chain would poison
    // every later `.then`, so no tag or assignee would ever save again and the "Saving…" indicator
    // would climb forever because its `finally` would never run.
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
      featureCrew: {
        reconcile: async (request) => {
          requests.push(request);
          if (requests.length === 1) {
            throw new Error("reconcile boom");
          }
          return { ok: true, changed: false };
        },
      },
      userDirectory: {
        search: async () => [
          { displayName: "Dave New", uniqueName: "dave@example.com", imageUrl: null },
        ],
        resolve: async () => null,
      },
    });

    const root = projectTrackingView.render({
      doc,
      queryId: "q1",
      properties: {},
      services,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requests).toHaveLength(1);

    await pickFirstSearchedAssignee(root);

    // The chain survived the rejection: the later reconcile ran.
    expect(requests).toHaveLength(2);
    // …and the indicator went back to idle rather than showing a save that will never complete.
    const status = root.querySelector(".awesomeado-write-queue-status") as HTMLElement;
    expect(status.style.display).toBe("none");
  });
});

describe("ProjectTrackingView — feature crew skip", () => {
  it("should not reconcile the Feature Crew when no work item types are configured", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const requests: FeatureCrewReconcileRequest[] = [];
    const services = createFakeServices({
      getTypes: () => [],
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
      featureCrew: {
        reconcile: async (request) => {
          requests.push(request);
          return { ok: true, changed: false };
        },
      },
    });

    const context: EnhancedViewContext = {
      doc,
      queryId: "q1",
      properties: {},
      services,
    };

    projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();

    expect(requests).toHaveLength(0);
  });
});

describe("ProjectTrackingView — tag filter pills", () => {
  it("renders the tag filter panel with a pill per roster tag once the crew resolves", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({ isTreeQuery: true, roots: [epic], error: null }),
      featureCrew: {
        reconcile: async () => ({
          ok: true,
          changed: false,
          members: [
            { alias: "alice.smith", fullName: "Alice Smith", tag: "Core" },
            { alias: "bob.jones", fullName: "Bob Jones", tag: "Platform" },
            { alias: "carol.white", fullName: "Carol White", tag: "" },
          ],
        }),
      },
    });

    const context: EnhancedViewContext = { doc, queryId: "q1", properties: {}, services };
    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();

    const panel = root.querySelector(".awesomeado-tracking__filters");
    expect(panel).toBeTruthy();
    const pills = [...(panel?.querySelectorAll(".awesomeado-tag-pill") ?? [])].map(
      (p) => p.textContent,
    );
    // Distinct tags first-seen, with the untagged "??" bucket last (carol has no tag).
    expect(pills).toEqual(["Core", "Platform", "??"]);
  });

  it("shows each assignee's tag pill in the tree rows after the crew resolves", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({ isTreeQuery: true, roots: [epic], error: null }),
      featureCrew: {
        reconcile: async () => ({
          ok: true,
          changed: false,
          members: [{ alias: "bob.jones", fullName: "Bob Jones", tag: "Platform" }],
        }),
      },
    });

    const context: EnhancedViewContext = { doc, queryId: "q1", properties: {}, services };
    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();

    // Bob owns the only Sprint 1 feature (visible under the default Sprint 1 filter); his row shows
    // his "Platform" tag pill.
    const treePills = [...root.querySelectorAll(".awesomeado-tracking__tree .awesomeado-tag-pill")];
    expect(treePills.some((p) => p.textContent === "Platform")).toBe(true);
  });
});

describe("ProjectTrackingView — tag retag", () => {
  it("re-reconciles with a tagAssignment when a row's tag pill is retagged", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const requests: FeatureCrewReconcileRequest[] = [];
    const services = createFakeServices({
      loadTree: async () => ({ isTreeQuery: true, roots: [epic], error: null }),
      featureCrew: {
        reconcile: async (request) => {
          requests.push(request);
          return {
            ok: true,
            changed: false,
            members: [
              { alias: "alice.smith", fullName: "Alice Smith", tag: "Core" },
              { alias: "bob.jones", fullName: "Bob Jones", tag: "Platform" },
            ],
          };
        },
      },
    });

    const context: EnhancedViewContext = { doc, queryId: "q1", properties: {}, services };
    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();

    const reconcilesBefore = requests.length;

    // Open Bob's editable tag pill and move him onto the "Core" tag already worn by Alice.
    const bobPill = [
      ...root.querySelectorAll<HTMLElement>(".awesomeado-tracking__tree .awesomeado-tag-pill"),
    ].find((p) => p.textContent === "Platform");
    bobPill?.click();

    const coreChoice = [
      ...root.querySelectorAll<HTMLButtonElement>(
        ".awesomeado-assigned__tag-choices .awesomeado-tag-pill",
      ),
    ].find((c) => c.textContent === "Core");
    coreChoice?.click();
    await Promise.resolve();

    expect(requests.length).toBe(reconcilesBefore + 1);
    expect(requests[requests.length - 1]?.tagAssignments).toEqual([
      { alias: "bob.jones", tag: "Core" },
    ]);
  });
});

describe("ProjectTrackingView — tag reconcile serialization", () => {
  it("serializes reconciles so a new tag added during the load reconcile is not lost", async () => {
    const doc = document;

    const epic = createFixtureTree();

    // A background stand-in: one shared roster whose writes only settle when the test releases them,
    // so the ordering of the load-time seed reconcile and the setTag reconcile is fully controlled.
    // Each settle applies the request (add assignees, then stamp any tag) exactly as the real
    // background does, so a lost/reverted tag would surface here.
    const roster = new Map<string, { fullName: string; tag: string }>();
    const pending: Array<{
      request: FeatureCrewReconcileRequest;
      settle: () => void;
    }> = [];
    const services = createFakeServices({
      loadTree: async () => ({ isTreeQuery: true, roots: [epic], error: null }),
      featureCrew: {
        reconcile: (request) =>
          new Promise((resolve) => {
            pending.push({
              request,
              settle: () => {
                for (const a of request.assignees) {
                  if (!roster.has(a.alias)) roster.set(a.alias, { fullName: a.fullName, tag: "" });
                }
                for (const t of request.tagAssignments ?? []) {
                  const member = roster.get(t.alias);
                  if (member) member.tag = t.tag;
                }
                const members = [...roster.entries()].map(([alias, v]) => ({
                  alias,
                  fullName: v.fullName,
                  tag: v.tag,
                }));
                resolve({ ok: true, changed: true, members });
              },
            });
          }),
      },
    });

    const context: EnhancedViewContext = { doc, queryId: "q1", properties: {}, services };
    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();

    // The seed reconcile is in flight (not yet settled), but the tree already shows each assignee's
    // neutral "??" pill. Add a brand-new tag to Bob's row while the seed is still outstanding.
    expect(pending.length).toBe(1);
    const bobPill = [
      ...root.querySelectorAll<HTMLElement>(".awesomeado-tracking__tree .awesomeado-tag-pill"),
    ].find((p) => p.textContent === "??");
    bobPill?.click();
    const input = root.querySelector<HTMLInputElement>(".awesomeado-assigned__tag-input")!;
    const addButton = root.querySelector<HTMLButtonElement>(
      ".awesomeado-assigned__tag-add-button",
    )!;
    input.value = "Data";
    input.dispatchEvent(new Event("input"));
    addButton.click();
    await Promise.resolve();

    // Serialization proof: the setTag reconcile must NOT have started yet — it is queued behind the
    // still-outstanding seed. Were they allowed to race, this second call would already be pending.
    expect(pending.length).toBe(1);

    // Release the seed; the queued setTag reconcile then runs against the now-created roster.
    pending[0]!.settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(pending.length).toBe(2);
    expect(pending[1]?.request.tagAssignments).toEqual([{ alias: "bob.jones", tag: "Data" }]);

    pending[1]!.settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();

    // Bob keeps his new "Data" tag: it was persisted to the roster and painted, never reverted.
    const bobAfter = [
      ...root.querySelectorAll<HTMLElement>(".awesomeado-tracking__tree .awesomeado-tag-pill"),
    ].some((p) => p.textContent === "Data");
    expect(bobAfter).toBe(true);
    expect(roster.get("bob.jones")?.tag).toBe("Data");
  });
});

describe("ProjectTrackingView — tag saving indicator", () => {
  it("shows the saving indicator for a user tag reconcile but not for the load-time seed", async () => {
    const doc = document;

    const epic = createFixtureTree();

    // Gate every reconcile so its in-flight window is fully controlled: the seed and the setTag
    // reconcile only settle when the test releases them, letting us observe the indicator per call.
    const roster = new Map<string, { fullName: string; tag: string }>();
    const pending: Array<{
      request: FeatureCrewReconcileRequest;
      settle: () => void;
    }> = [];
    const services = createFakeServices({
      loadTree: async () => ({ isTreeQuery: true, roots: [epic], error: null }),
      featureCrew: {
        reconcile: (request) =>
          new Promise((resolve) => {
            pending.push({
              request,
              settle: () => {
                for (const a of request.assignees) {
                  if (!roster.has(a.alias)) roster.set(a.alias, { fullName: a.fullName, tag: "" });
                }
                for (const t of request.tagAssignments ?? []) {
                  const member = roster.get(t.alias);
                  if (member) member.tag = t.tag;
                }
                const members = [...roster.entries()].map(([alias, v]) => ({
                  alias,
                  fullName: v.fullName,
                  tag: v.tag,
                }));
                resolve({ ok: true, changed: true, members });
              },
            });
          }),
      },
    });

    const context: EnhancedViewContext = { doc, queryId: "q1", properties: {}, services };
    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();

    const indicator = root.querySelector(".awesomeado-write-queue-status") as HTMLElement;

    // The load-time seed reconcile is in flight, but it is background housekeeping — the indicator
    // must stay hidden. Only a save the user is waiting on should reveal "Saving…".
    expect(pending.length).toBe(1);
    expect(indicator.style.display).toBe("none");

    // Let the seed settle so the roster exists and the tree paints each assignee's neutral pill.
    pending[0]!.settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    expect(indicator.style.display).toBe("none");

    // Add a brand-new tag to Bob's row: a user-triggered reconcile that the indicator must reflect
    // the moment it is queued.
    const bobPill = [
      ...root.querySelectorAll<HTMLElement>(".awesomeado-tracking__tree .awesomeado-tag-pill"),
    ].find((p) => p.textContent === "??");
    bobPill?.click();
    const input = root.querySelector<HTMLInputElement>(".awesomeado-assigned__tag-input")!;
    const addButton = root.querySelector<HTMLButtonElement>(
      ".awesomeado-assigned__tag-add-button",
    )!;
    input.value = "Data";
    input.dispatchEvent(new Event("input"));
    addButton.click();
    await Promise.resolve();

    expect(pending.length).toBe(2);
    expect(indicator.style.display).not.toBe("none");
    expect(indicator.textContent).toContain("Saving 1 change");

    // Settle the tag reconcile; the indicator returns to hidden once the user's save lands.
    pending[1]!.settle();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();
    expect(indicator.style.display).toBe("none");
  });
});

/** The tag pill wearing `label` in the board's one filter row. */
const tagFilterPillOf = (root: HTMLElement, label: string): HTMLButtonElement | undefined =>
  [
    ...root.querySelectorAll<HTMLButtonElement>(
      ".awesomeado-tracking__filters .awesomeado-tag-pill",
    ),
  ].find((pill) => pill.textContent === label);

/** One Feature Crew roster entry, as the reconcile fake hands it back. */
type CrewMember = { alias: string; fullName: string; tag: string };

/**
 * Renders the fixture board with a Feature Crew roster applied and the sprint filter already off, so
 * every descendant is a candidate for the tag pills. `prepare` can adjust the tree before it loads
 * (e.g. to make one item recently created). Shared by the tag-pill tests so the identical seven-line
 * render-and-settle dance lives in one place.
 */
async function renderTaggedBoard(
  members: CrewMember[],
  prepare?: (epic: TrackedWorkItem) => void,
): Promise<HTMLElement> {
  const epic = createFixtureTree();
  prepare?.(epic);
  const services = createFakeServices({
    loadTree: async () => ({ isTreeQuery: true, roots: [epic], error: null }),
    featureCrew: { reconcile: async () => ({ ok: true, changed: false, members }) },
  });

  const context: EnhancedViewContext = { doc: document, queryId: "q1", properties: {}, services };
  const root = projectTrackingView.render(context);
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
  await turnSprintFilterOff(root);
  return root;
}

describe("ProjectTrackingView — combined pill filtering", () => {
  it("ORs the tag pills with one another, so a second tag widens the board", async () => {
    const root = await renderTaggedBoard([
      { alias: "bob.jones", fullName: "Bob Jones", tag: "Platform" },
      { alias: "carol.white", fullName: "Carol White", tag: "" },
    ]);

    tagFilterPillOf(root, "Platform")?.click();
    await Promise.resolve();
    expect(renderedRowTitles(root)).toEqual(["User Authentication"]);

    // Carol is untagged, so the "??" bucket is her pill. Lighting it ADDS her story.
    tagFilterPillOf(root, "??")?.click();
    await Promise.resolve();
    expect(renderedRowTitles(root)).toEqual(["User Authentication", "Login UI"]);
  });

  it("ANDs the tag group against the activity group, so an activity pill narrows a tag", async () => {
    // Bob's Feature (Platform) and the unassigned Data Migration were both created an hour ago;
    // Carol's Story is months old. Lighting Platform + "Newly created" must therefore keep ONLY
    // Bob's item: Data Migration is just as new, but it is not Bob's.
    const root = await renderTaggedBoard(
      [
        { alias: "bob.jones", fullName: "Bob Jones", tag: "Platform" },
        { alias: "carol.white", fullName: "Carol White", tag: "" },
      ],
      (epic) => {
        epic.children[0]!.createdDate = "2026-07-24T11:00:00Z";
        epic.children[1]!.createdDate = "2026-07-24T11:00:00Z";
      },
    );

    activityPillOf(root, "created").click();
    await Promise.resolve();
    expect(renderedRowTitles(root)).toEqual(["User Authentication", "Data Migration"]);

    // The tag group intersects with the activity group rather than adding to it: were the two OR'd,
    // Data Migration would survive on being newly created alone.
    tagFilterPillOf(root, "Platform")?.click();
    await Promise.resolve();
    expect(renderedRowTitles(root)).toEqual(["User Authentication"]);
  });

  it("keeps an unlit group out of the way, so lighting nothing narrows nothing", async () => {
    const root = await renderTaggedBoard([
      { alias: "bob.jones", fullName: "Bob Jones", tag: "Platform" },
      { alias: "carol.white", fullName: "Carol White", tag: "" },
    ]);

    expect(renderedRowTitles(root)).toEqual(["User Authentication", "Login UI", "Data Migration"]);
  });
});

describe("ProjectTrackingView — tag filtering", () => {
  it("filters the tree to people wearing a selected tag when its pill is clicked", async () => {
    const root = await renderTaggedBoard([
      { alias: "alice.smith", fullName: "Alice Smith", tag: "Core" },
      { alias: "bob.jones", fullName: "Bob Jones", tag: "Platform" },
      { alias: "carol.white", fullName: "Carol White", tag: "" },
    ]);

    // With the sprint filter off, all three descendants show.
    expect(root.querySelectorAll(".awesomeado-tracking__row").length).toBe(3);

    // Click the "Platform" filter pill: only Bob's feature (Platform) survives; the untagged story
    // and the unassigned feature drop out.
    const platformPill = tagFilterPillOf(root, "Platform");
    expect(platformPill).toBeTruthy();
    platformPill?.click();
    await Promise.resolve();

    const rows = root.querySelectorAll(".awesomeado-tracking__row");
    expect(rows.length).toBe(1);
    expect(rows[0]?.textContent).toContain("User Authentication");
  });

  it("narrows to untagged people when the ?? filter pill is clicked", async () => {
    const root = await renderTaggedBoard([
      { alias: "bob.jones", fullName: "Bob Jones", tag: "Platform" },
      { alias: "carol.white", fullName: "Carol White", tag: "" },
    ]);

    // The "??" bucket catches assigned-but-untagged people (Carol on the Login UI story). Her
    // ancestor feature stays so she is not orphaned; the unassigned Data Migration feature drops out.
    const untaggedPill = tagFilterPillOf(root, "??");
    expect(untaggedPill).toBeTruthy();
    untaggedPill?.click();
    await Promise.resolve();

    const rowText = [...root.querySelectorAll(".awesomeado-tracking__row")].map(
      (r) => r.textContent,
    );
    expect(rowText.some((t) => t?.includes("Login UI"))).toBe(true);
    expect(rowText.some((t) => t?.includes("Data Migration"))).toBe(false);
  });
});

describe("ProjectTrackingView — techlead tag", () => {
  it("does not show a Feature Crew tag on the TechLead, even after the crew resolves", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({ isTreeQuery: true, roots: [epic], error: null }),
      featureCrew: {
        reconcile: async () => ({
          ok: true,
          changed: false,
          members: [{ alias: "alice.smith", fullName: "Alice Smith", tag: "Core" }],
        }),
      },
    });

    const context: EnhancedViewContext = { doc, queryId: "q1", properties: {}, services };
    const root = projectTrackingView.render(context);
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();

    const techLeadPill = root.querySelector(".awesomeado-tracking__techlead .awesomeado-tag-pill");
    expect(techLeadPill).toBeNull();
  });
});

/** The four-level type catalog (Epic → Feature → Story → Task) the rollup tests need. */
const DEEP_TYPES: TypeCatalogEntry[] = [
  {
    name: "Epic",
    color: "ff6b6b",
    icon: "epic.svg",
    etaField: null,
    columns: [],
    children: ["Feature"],
  },
  {
    name: "Feature",
    color: "6bcf7f",
    icon: "feature.svg",
    etaField: null,
    columns: [],
    children: ["Story"],
  },
  {
    name: "Story",
    color: "4fc3f7",
    icon: "story.svg",
    etaField: null,
    columns: [],
    children: ["Task"],
  },
  {
    name: "Task",
    color: "F2CB1D",
    icon: "https://ado/task.svg",
    etaField: "Custom.TaskETA",
    children: [],
    columns: [
      { column: "Active", states: ["Active", "New"] },
      { column: "Done", states: ["Closed"] },
      { column: "Removed", states: ["Removed"] },
    ],
  },
];

/** A work item with the fixture defaults every rollup test shares, overridable per item. */
function createItem(overrides: Partial<TrackedWorkItem> & { id: number }): TrackedWorkItem {
  return {
    rev: 1,
    type: "Task",
    title: `Item ${overrides.id}`,
    state: "Active",
    priority: null,
    assignedTo: null,
    iterationPath: "Project\\Sprint 1",
    sprintName: "Sprint 1",
    createdDate: "2026-01-10T08:00:00Z",
    createdBy: null,
    changedDate: "2026-01-10T08:00:00Z",
    changedBy: null,
    // Recent by default (the fixture clock is 2026-07-24) so a Done item is not aged off the board
    // unless the test says so.
    stateChangeDate: "2026-07-24T08:00:00Z",
    description: "",
    tags: [],
    importance: overrides.id,
    noteCount: 0,
    eta: null,
    children: [],
    ...overrides,
  };
}

/**
 * Epic → Feature → Story → three Tasks (one Done, one Active, one Removed, the last on Sprint 2),
 * so the rollup badge can be checked for depth, completion counting, and filter agreement.
 */
function createDeepTree(): TrackedWorkItem {
  return createItem({
    id: 1,
    type: "Epic",
    title: "Platform Modernization",
    assignedTo: createUser("Alice Smith"),
    children: [
      createItem({
        id: 2,
        type: "Feature",
        title: "User Authentication",
        children: [
          createItem({
            id: 3,
            type: "Story",
            title: "Login UI",
            children: [
              createItem({ id: 4, title: "Wire the form", state: "Closed" }),
              createItem({
                id: 5,
                title: "Style the form",
                state: "Active",
                assignedTo: createUser("Bob Jones"),
                eta: "2026-09-01T00:00:00Z",
              }),
              createItem({
                id: 6,
                title: "Drop the old form",
                state: "Removed",
                iterationPath: "Project\\Sprint 2",
                sprintName: "Sprint 2",
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

/** Renders the deep tree board and waits for its async load to settle. */
async function renderDeepBoard(overrides?: Partial<EnhancedViewServices>): Promise<HTMLElement> {
  const services = createFakeServices({
    getTypes: () => DEEP_TYPES,
    loadTree: async () => ({ isTreeQuery: true, roots: [createDeepTree()], error: null }),
    ...overrides,
  });
  const context: EnhancedViewContext = { doc: document, queryId: "q1", properties: {}, services };
  const root = projectTrackingView.render(context);
  await Promise.resolve();
  await Promise.resolve();
  return root;
}

/** Turns the sprint filter off (it defaults ON, on the current sprint) and waits for the re-render. */
async function turnSprintFilterOff(root: HTMLElement): Promise<void> {
  (root.querySelector(".awesomeado-sprint-picker__button") as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 10));
  await Promise.resolve();
}

const rollupBadgeOf = (root: HTMLElement): HTMLElement =>
  root.querySelector<HTMLElement>(
    ".awesomeado-tracking__minor-children .awesomeado-child-items__badge",
  )!;

describe("ProjectTrackingView — rolled-up minor children", () => {
  it("renders rows only two levels below the root", async () => {
    const root = await renderDeepBoard();
    await turnSprintFilterOff(root);

    const titles = [...root.querySelectorAll(".awesomeado-tracking__item-title")].map(
      (title) => title.textContent,
    );
    // The Feature and its Story are rows; the Story's Tasks are rolled up, not listed.
    expect(titles).toEqual(["User Authentication", "Login UI"]);
  });

  it("gives the deepest rendered row no twisty, since it has no child rows to expand", async () => {
    const root = await renderDeepBoard();
    await turnSprintFilterOff(root);

    // Only the Feature (whose Story IS a row) can expand; the Story's rolled-up Tasks are not rows.
    expect(root.querySelectorAll(".awesomeado-tracking__twisty")).toHaveLength(1);
  });

  it("counts only children in the last column before Removed as completed", async () => {
    const root = await renderDeepBoard();
    await turnSprintFilterOff(root);

    // 3 Tasks: one Closed→Done (completed), one Active, one Removed (abandoned, never completed).
    expect(rollupBadgeOf(root).textContent).toBe("1 / 3");
  });

  it("summarizes every child, including one the active sprint filter hides from the outline", async () => {
    const root = await renderDeepBoard();

    // The sprint filter defaults ON at Sprint 1, but the rollup answers "how much of this is done?"
    // about the ITEM, not about what the board is narrowed to — so the Sprint 2 Task still counts.
    // Dropping it silently understated the work: the same 3 Tasks read "1 / 2" here and "1 / 3" with
    // the filter off.
    expect(rollupBadgeOf(root).textContent).toBe("1 / 3");
  });

  it("tints the rollup badge with a discrete wash of the last configured type's color", async () => {
    const root = await renderDeepBoard();

    // Task (the last configured type) is F2CB1D → rgb(242,203,29).
    expect(rollupBadgeOf(root).style.background.replace(/\s/g, "")).toContain(
      "rgba(242,203,29,0.12)",
    );
  });

  it("hides the rollup badge when the row has no children", async () => {
    const services = {
      loadTree: async () => ({ isTreeQuery: true, roots: [epicOnly()], error: null }),
    };
    const root = await renderDeepBoard(services);

    expect(root.querySelector(".awesomeado-tracking__minor-children")).toBeNull();
  });
});

/** An epic whose Feature has a childless Story, so no rollup badge can be rendered. */
function epicOnly(): TrackedWorkItem {
  return createItem({
    id: 1,
    type: "Epic",
    title: "Platform Modernization",
    children: [
      createItem({
        id: 2,
        type: "Feature",
        title: "User Authentication",
        children: [createItem({ id: 3, type: "Story", title: "Login UI" })],
      }),
    ],
  });
}

/** Right-clicks an element the way a reader would, so the item menu opens over it. */
const rightClick = (element: Element): void => {
  element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
};

/** Every command row in whatever the item menu is currently showing. */
const menuCommands = (root: HTMLElement): HTMLButtonElement[] => [
  ...root.querySelectorAll<HTMLButtonElement>(".awesomeado-item-menu__command"),
];

/** The command whose label starts with `label` — the chevron on a submenu row is not part of it. */
const commandNamed = (root: HTMLElement, label: string): HTMLButtonElement =>
  menuCommands(root).find((command) => command.textContent?.startsWith(label))!;

/** The editor a menu panel opened, and the button that commits it. */
const editorIn = (root: HTMLElement) => ({
  input: root.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    ".awesomeado-item-menu__panel .awesomeado-text-editor__input",
  )!,
  save: root.querySelector<HTMLButtonElement>(
    ".awesomeado-item-menu__panel .awesomeado-text-editor button",
  )!,
});

/** Lets the write queue's promise chain settle; every hop in it is a microtask. */
async function settleWrites(): Promise<void> {
  for (let tick = 0; tick < 8; tick++) {
    await Promise.resolve();
  }
}

describe("ProjectTrackingView — the item right-click menu", () => {
  /** Installs a clipboard the menu's copy commands can write to, and reports what they wrote. */
  const captureClipboard = (): ReturnType<typeof vi.fn> => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    return writeText;
  };

  it("offers the three shared commands, then the item's own, then the marker flags", async () => {
    const root = await renderDeepBoard();
    await turnSprintFilterOff(root);

    rightClick(root.querySelector(".awesomeado-tracking__row")!);

    expect(menuCommands(root).map((command) => command.textContent)).toEqual([
      "Copy Item ID",
      "Copy ADO Url",
      "Open in ADO",
      "Update title",
      "Update description",
      "Move to another sprint\u203A",
      "View all notes",
      "Tag with Blocked (internal)",
      "Tag with Blocked by another team",
    ]);
    // Two rules: one under the commands that only DESCRIBE the item, one above the flags.
    expect(root.querySelectorAll(".awesomeado-item-menu__separator")).toHaveLength(2);
  });

  it("copies the id of the row that was right-clicked", async () => {
    const writeText = captureClipboard();
    const root = await renderDeepBoard();
    await turnSprintFilterOff(root);

    // The second row is the Story (Login UI, id 3) nested under the Feature.
    rightClick([...root.querySelectorAll(".awesomeado-tracking__row")][1]!);
    menuCommands(root)[0]!.click();

    expect(writeText).toHaveBeenCalledWith("3");
  });

  it("answers a rolled-up child with its OWN menu, not the row it is nested in", async () => {
    const writeText = captureClipboard();
    const root = await renderDeepBoard();
    await turnSprintFilterOff(root);
    rollupBadgeOf(root).click();

    // "Style the form" (id 5) — a popup row living inside the Story row that opened it.
    rightClick([...root.querySelectorAll(".awesomeado-child-items__row")][1]!);
    menuCommands(root)[0]!.click();

    expect(writeText).toHaveBeenCalledWith("5");
  });

  it("offers the ROOT item's menu on the project title, which is never a row", async () => {
    const writeText = captureClipboard();
    const root = await renderDeepBoard();

    rightClick(root.querySelector(".awesomeado-tracking__title")!);
    menuCommands(root)[0]!.click();

    // The Epic (id 1) is summarized in the header rather than listed, so the title is the only
    // place its id can be copied from.
    expect(writeText).toHaveBeenCalledWith("1");
  });
});

/** A board whose field writes are recorded and always accepted, each committing the next rev. */
async function renderRecordingBoard(): Promise<{
  root: HTMLElement;
  writes: WorkItemFieldWriteRequest[];
}> {
  const writes: WorkItemFieldWriteRequest[] = [];
  const root = await renderDeepBoard({
    writeField: async (request) => {
      writes.push(request);
      return { ok: true, rev: request.rev + 1 };
    },
  });
  return { root, writes };
}

describe("ProjectTrackingView — the item's own menu commands", () => {
  it("renames the item and repaints the board with the new title", async () => {
    const { root, writes } = await renderRecordingBoard();
    await turnSprintFilterOff(root);

    rightClick(root.querySelector(".awesomeado-tracking__row")!);
    commandNamed(root, "Update title").click();
    const { input, save } = editorIn(root);
    // The editor opens on what is stored, so a rename starts from the name in use.
    expect(input.value).toBe("User Authentication");

    input.value = "Sign-in";
    save.click();
    await settleWrites();

    expect(writes[0]).toMatchObject({ id: 2, field: "System.Title", value: "Sign-in" });
    expect(root.querySelector(".awesomeado-tracking__item-title")?.textContent).toBe("Sign-in");
  });

  it("re-labels the header when the ROOT is renamed, which no tree pass can reach", async () => {
    const { root } = await renderRecordingBoard();

    rightClick(root.querySelector(".awesomeado-tracking__title")!);
    commandNamed(root, "Update title").click();
    const { input, save } = editorIn(root);
    input.value = "Modernization";
    save.click();
    await settleWrites();

    expect(root.querySelector(".awesomeado-tracking__title")?.textContent).toBe("Modernization");
  });

  it("saves a description as Markdown, not as the HTML the field defaults to", async () => {
    const { root, writes } = await renderRecordingBoard();
    await turnSprintFilterOff(root);

    rightClick(root.querySelector(".awesomeado-tracking__row")!);
    commandNamed(root, "Update description").click();
    const { input, save } = editorIn(root);
    input.value = "**Bold** plan.";
    save.click();
    await settleWrites();

    expect(writes[0]).toMatchObject({
      field: "System.Description",
      value: "**Bold** plan.",
      multilineFormat: "Markdown",
    });
  });

  it("offers only the sprints the item is not already on and has not passed", async () => {
    const { root } = await renderRecordingBoard();
    await turnSprintFilterOff(root);

    rightClick(root.querySelector(".awesomeado-tracking__row")!);
    commandNamed(root, "Move to another sprint").click();

    const options = [...root.querySelectorAll(".awesomeado-item-menu__submenu button")];
    // The Feature sits on Sprint 1 (the current one), so only the next sprint is a move.
    expect(options.map((option) => option.textContent)).toEqual(["Next - Sprint 2"]);
  });
});

describe("ProjectTrackingView — moving an item and reading its discussion", () => {
  it("moves the item to the sprint that was picked", async () => {
    const { root, writes } = await renderRecordingBoard();
    await turnSprintFilterOff(root);

    rightClick(root.querySelector(".awesomeado-tracking__row")!);
    commandNamed(root, "Move to another sprint").click();
    root.querySelector<HTMLButtonElement>(".awesomeado-item-menu__submenu button")!.click();
    await settleWrites();

    expect(writes[0]).toMatchObject({
      id: 2,
      field: "System.IterationPath",
      value: "Project\\Sprint 2",
    });
  });

  it("shows every note in the window, not the two days a row's panel is limited to", async () => {
    const root = await renderDeepBoard({
      noteLoader: {
        loadNotes: async () => ({
          notes: [
            fixtureNote(1, "2026-07-23T09:00:00Z"),
            fixtureNote(2, "2026-07-22T09:00:00Z"),
            fixtureNote(3, "2026-07-21T09:00:00Z"),
          ],
          currentUser: null,
          error: null,
        }),
      },
    });
    await turnSprintFilterOff(root);

    rightClick(root.querySelector(".awesomeado-tracking__row")!);
    commandNamed(root, "View all notes").click();
    await settleWrites();

    const panel = root.querySelector(".awesomeado-item-menu__panel")!;
    expect(panel.querySelectorAll(".awesomeado-note")).toHaveLength(3);
    // The composer comes with the panel, so a discussion can be added to from here too.
    expect(panel.querySelector(".awesomeado-note-composer__trigger")).not.toBeNull();
  });

  it("closes the notes popup from its top-right button", async () => {
    const root = await renderDeepBoard();
    await turnSprintFilterOff(root);

    rightClick(root.querySelector(".awesomeado-tracking__row")!);
    commandNamed(root, "View all notes").click();
    root.querySelector<HTMLButtonElement>('[aria-label="Close notes"]')!.click();

    expect(root.querySelector(".awesomeado-item-menu")).toBeNull();
  });
});

/** One note on a given day, by someone other than the reader. */
function fixtureNote(id: number, createdDate: string): WorkItemNote {
  return {
    id,
    workItemId: 2,
    author: { displayName: "Bob Jones", id: null, uniqueName: "bob@example.com" },
    createdDate,
    text: `Note ${id}.`,
    renderedHtml: null,
  };
}

/** Opens one command's panel on the board's first tree row and returns the panel. */
async function openPanel(label: string): Promise<HTMLElement> {
  const { root } = await renderRecordingBoard();
  await turnSprintFilterOff(root);
  rightClick(root.querySelector(".awesomeado-tracking__row")!);
  commandNamed(root, label).click();
  return root.querySelector<HTMLElement>(".awesomeado-item-menu__panel")!;
}

describe("ProjectTrackingView — what a command's panel says it is about", () => {
  it("heads every panel with the item's number, as the link that opens it in ADO", async () => {
    const panel = await openPanel("Update title");

    const id = panel.querySelector<HTMLElement>(".awesomeado-item-command__id")!;
    expect(id.textContent).toBe("#2");
    // jsdom's page address is not an ADO project, so the number is shown but cannot be followed.
    expect(id.tagName).toBe("SPAN");
  });

  it("does not repeat the title above the box that edits it", async () => {
    const panel = await openPanel("Update title");

    expect(panel.querySelector(".awesomeado-item-command__title")).toBeNull();
  });

  it("names the item above a description, where the box says nothing about which it is", async () => {
    const panel = await openPanel("Update description");

    expect(panel.querySelector(".awesomeado-item-command__title")?.textContent).toBe(
      "User Authentication",
    );
  });

  it("opens a description far taller than a title, since one is paragraphs and one is a line", async () => {
    const description = await openPanel("Update description");
    const title = await openPanel("Update title");

    expect(
      description.querySelector<HTMLTextAreaElement>(".awesomeado-text-editor__input")!.rows,
    ).toBeGreaterThan(3);
    expect(title.querySelector(".awesomeado-text-editor__input")!.tagName).toBe("INPUT");
  });

  it("sizes the discussion from the window rather than from the pointer", async () => {
    const panel = await openPanel("View all notes");

    const surface = panel.querySelector<HTMLElement>(".awesomeado-item-command__panel")!;
    expect(surface.style.width).toBe("70vw");
    expect(surface.style.height).toBe("70vh");
  });
});

describe("ProjectTrackingView — rollup popup rows", () => {
  it("lists each rolled-up child with its assignee, title, ETA and ADO link", async () => {
    const root = await renderDeepBoard();
    await turnSprintFilterOff(root);

    rollupBadgeOf(root).click();

    const rows = [...root.querySelectorAll(".awesomeado-child-items__row")];
    expect(rows).toHaveLength(3);

    const styleTheForm = rows[1]!;
    expect(styleTheForm.querySelector(".awesomeado-assigned__name")?.textContent).toBe("Bob Jones");
    const title = styleTheForm.querySelector<HTMLElement>(".awesomeado-child-items__title")!;
    expect(title.textContent).toBe("Style the form");
    // Task's configured color (F2CB1D) tints the title, matching the tree's type coloring.
    expect(title.style.color).toBe("rgb(242, 203, 29)");
    expect(styleTheForm.querySelector(".awesomeado-child-items__eta")?.textContent).toContain(
      "ETA ",
    );
    // The open affordance is a type-agnostic link glyph, not the work item type's icon.
    expect(styleTheForm.querySelector(".awesomeado-child-items__icon svg")).not.toBeNull();
    expect(styleTheForm.querySelector(".awesomeado-child-items__icon img")).toBeNull();
  });

  it("wears the assignee's Feature Crew tag pill on each rolled-up child, hidden when unassigned", async () => {
    const root = await renderDeepBoard();
    await turnSprintFilterOff(root);

    rollupBadgeOf(root).click();

    const rows = [...root.querySelectorAll<HTMLElement>(".awesomeado-child-items__row")];
    // Bob is assigned, so his pill shows; the unassigned first child keeps a hidden pill so a later
    // reassignment can reveal it.
    const assignedPill = rows[1]!.querySelector<HTMLElement>(".awesomeado-tag-pill")!;
    expect(assignedPill.style.display).toBe("");
    const unassignedPill = rows[0]!.querySelector<HTMLElement>(".awesomeado-tag-pill")!;
    expect(unassignedPill.style.display).toBe("none");
  });

  it("shows No ETA for a rolled-up child with no ETA set", async () => {
    const root = await renderDeepBoard();
    await turnSprintFilterOff(root);

    rollupBadgeOf(root).click();

    const firstRow = root.querySelector(".awesomeado-child-items__row")!;
    expect(firstRow.querySelector(".awesomeado-child-items__eta")?.textContent).toBe("No ETA");
  });

  it("persists an ETA picked on a rolled-up child through the board's write queue", async () => {
    const writes: WorkItemFieldWriteRequest[] = [];
    const root = await renderDeepBoard({
      writeField: async (request) => {
        writes.push(request);
        return { ok: true, rev: 2 };
      },
    });
    await turnSprintFilterOff(root);

    rollupBadgeOf(root).click();
    const firstRow = root.querySelector(".awesomeado-child-items__row")!;
    (firstRow.querySelector(".awesomeado-eta__label") as HTMLElement).click();
    const input = firstRow.querySelector<HTMLInputElement>(".awesomeado-eta__date")!;
    input.value = "2026-10-05";
    input.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(writes).toEqual([
      { id: 4, rev: 1, field: "Custom.TaskETA", value: "2026-10-05T12:00:00Z" },
    ]);
  });

  it("ticks the checkbox of each rolled-up child already in the completed column", async () => {
    const root = await renderDeepBoard();
    await turnSprintFilterOff(root);

    rollupBadgeOf(root).click();

    // Task 4 is Closed→Done; Task 5 is Active and Task 6 is Removed, neither of which is completed.
    const ticked = [...root.querySelectorAll(".awesomeado-child-items__check")].map((check) =>
      check.getAttribute("aria-checked"),
    );
    expect(ticked).toEqual(["true", "false", "false"]);
  });
});

describe("ProjectTrackingView — same-parent popup reordering", () => {
  it("reorders rolled-up children with the tree's insertion-line preview", async () => {
    const moves: Parameters<EnhancedViewServices["reorderItem"]>[0][] = [];
    const root = await renderDeepBoard({
      reorderItem: async (request) => {
        moves.push(request);
        return { ok: true, order: 300 };
      },
    });
    document.body.append(root);
    await turnSprintFilterOff(root);
    rollupBadgeOf(root).click();

    dragPopupChild(root, 0, 2, (preview, target) => {
      expect(preview.defaultPrevented).toBe(true);
      expect(root.querySelector(".awesomeado-tracking__drop-line")?.previousElementSibling).toBe(
        target,
      );
    });

    await vi.waitFor(() => expect(moves).toEqual([ROLLUP_REORDER_REQUEST]));
    await vi.waitFor(() =>
      expect(popupChildTitles(root)).toEqual([
        "Style the form",
        "Drop the old form",
        "Wire the form",
      ]),
    );

    expect(root.querySelectorAll(".awesomeado-child-items__row")).toHaveLength(3);
  });

  it("accepts another popup reorder after repainting the first move", async () => {
    const moves: Parameters<EnhancedViewServices["reorderItem"]>[0][] = [];
    const root = await renderDeepBoard({
      reorderItem: async (request) => {
        moves.push(request);
        return { ok: true, order: 300 };
      },
    });
    document.body.append(root);
    await turnSprintFilterOff(root);
    rollupBadgeOf(root).click();

    dragPopupChild(root, 0, 2);
    await vi.waitFor(() => expect(moves).toHaveLength(1));
    dragPopupChild(root, 0, 2);

    await vi.waitFor(() => {
      expect(moves).toHaveLength(2);
      expect(root.querySelectorAll(".awesomeado-child-items__row")).toHaveLength(3);
    });
  });
});

describe("ProjectTrackingView — popup hierarchy changes", () => {
  it("promotes a popup child between parents and converts it to the destination child type", async () => {
    const moves: Parameters<EnhancedViewServices["reorderItem"]>[0][] = [];
    const root = await renderDeepBoard({
      reorderItem: async (request) => {
        moves.push(request);
        return { ok: true, order: 2, reparented: true, rev: 2 };
      },
    });
    document.body.append(root);
    await turnSprintFilterOff(root);
    rollupBadgeOf(root).click();

    const popupTitle = root.querySelector<HTMLElement>(".awesomeado-child-items__title")!;
    const storyTitle = [
      ...root.querySelectorAll<HTMLElement>(".awesomeado-tracking__item-title"),
    ].find((title) => title.textContent === "Login UI")!;
    const storyRow = storyTitle.closest<HTMLElement>(".awesomeado-tracking__row")!;
    Object.assign(storyRow, {
      getBoundingClientRect: () => ({ top: 40, height: 20, bottom: 60 }) as DOMRect,
    });
    popupTitle.dispatchEvent(new Event("dragstart", { bubbles: true }));
    const preview = new Event("dragover", { bubbles: true, cancelable: true });
    Object.assign(preview, { clientY: 45 });
    storyRow.dispatchEvent(preview);

    expect(root.querySelector(".awesomeado-child-items__popup")).toBeNull();
    expect(
      root.querySelector<HTMLElement>(".awesomeado-tracking__drop-line")?.dataset.dropKind,
    ).toBe("reparent");

    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.assign(drop, { clientY: 45 });
    storyRow.dispatchEvent(drop);

    await vi.waitFor(() =>
      expect(moves).toEqual([
        {
          id: 4,
          rev: 1,
          parentId: 2,
          currentParentId: 3,
          previousId: 0,
          nextId: 3,
          siblingIds: [4, 3],
          type: "Story",
          team: "team-guid",
        },
      ]),
    );
    await vi.waitFor(() =>
      expect(
        [...root.querySelectorAll<HTMLElement>(".awesomeado-tracking__item-title")].map(
          (title) => title.textContent,
        ),
      ).toContain("Wire the form"),
    );
  });
});

const ROLLUP_REORDER_REQUEST = {
  id: 4,
  rev: 1,
  parentId: 3,
  currentParentId: 3,
  previousId: 6,
  nextId: 0,
  siblingIds: [5, 6, 4],
  team: "team-guid",
} as const;

/** Titles currently shown by the rolled-up child popup. */
const popupChildTitles = (root: HTMLElement): Array<string | null> =>
  [...root.querySelectorAll<HTMLElement>(".awesomeado-child-items__title-text")].map(
    (title) => title.textContent,
  );

/** Drags one popup child after another, exposing the preview before completing the drop. */
function dragPopupChild(
  root: HTMLElement,
  sourceIndex: number,
  targetIndex: number,
  onPreview: (preview: Event, target: HTMLElement) => void = () => undefined,
): void {
  const rows = [...root.querySelectorAll<HTMLElement>(".awesomeado-child-items__row")];
  const source = rows[sourceIndex]!.querySelector<HTMLElement>(".awesomeado-child-items__title")!;
  const target = rows[targetIndex]!;
  source.dispatchEvent(new Event("dragstart", { bubbles: true }));
  Object.assign(target, {
    getBoundingClientRect: () => ({ top: 40, height: 20, bottom: 60 }) as DOMRect,
  });
  const preview = new Event("dragover", { bubbles: true, cancelable: true });
  Object.assign(preview, { clientY: 55 });
  target.dispatchEvent(preview);
  onPreview(preview, target);
  const drop = new Event("drop", { bubbles: true, cancelable: true });
  Object.assign(drop, { clientY: 55 });
  target.dispatchEvent(drop);
}

describe("ProjectTrackingView — rollup popup completion writes", () => {
  it("moves a rolled-up child to the completed column when its checkbox is ticked", async () => {
    const writes: WorkItemFieldWriteRequest[] = [];
    const root = await renderDeepBoard({
      writeField: async (request) => {
        writes.push(request);
        return { ok: true, rev: 2 };
      },
    });
    await turnSprintFilterOff(root);

    rollupBadgeOf(root).click();
    // Task 5 ("Style the form") is Active, so ticking it writes Done's primary state.
    checkOfChildRow(root, 1).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writes).toEqual([{ id: 5, rev: 1, field: "System.State", value: "Closed" }]);
    await vi.waitFor(() =>
      expect(checkOfChildRow(root, 1).getAttribute("aria-checked")).toBe("true"),
    );
    expect(etaColorOfChildRow(root, 1)).toBe("var(--completion-foreground)");
  });

  it("reopens a completed rolled-up child onto the in-progress column", async () => {
    const writes: WorkItemFieldWriteRequest[] = [];
    const root = await renderDeepBoard({
      writeField: async (request) => {
        writes.push(request);
        return { ok: true, rev: 2 };
      },
    });
    await turnSprintFilterOff(root);

    rollupBadgeOf(root).click();
    // Task 4 is Closed→Done; clearing it writes the primary state of board column 1 ("Active").
    checkOfChildRow(root, 0).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writes).toEqual([{ id: 4, rev: 1, field: "System.State", value: "Active" }]);
    await vi.waitFor(() =>
      expect(checkOfChildRow(root, 0).getAttribute("aria-checked")).toBe("false"),
    );
  });

  it("leaves the tick where ADO has it when the completion write is rejected", async () => {
    const root = await renderDeepBoard({
      writeField: async () => ({ ok: false, error: "rejected" }),
    });
    await turnSprintFilterOff(root);

    rollupBadgeOf(root).click();
    checkOfChildRow(root, 1).click();
    await Promise.resolve();
    await Promise.resolve();

    await vi.waitFor(() =>
      expect(checkOfChildRow(root, 1).getAttribute("aria-checked")).toBe("false"),
    );
  });

  it("writes nothing, and says why, when the child's type routes no state to the target column", async () => {
    const lines: string[] = [];
    const writes: WorkItemFieldWriteRequest[] = [];
    const root = await renderDeepBoard({
      // A Task type with no column on the in-progress position, so a completed child cannot reopen.
      getTypes: () => [
        ...DEEP_TYPES.slice(0, 3),
        { ...DEEP_TYPES[3]!, columns: [{ column: "Done", states: ["Closed"] }] },
      ],
      writeField: async (request) => {
        writes.push(request);
        return { ok: true, rev: 2 };
      },
      logger: { info: (message) => lines.push(message), error: () => undefined },
    });
    await turnSprintFilterOff(root);

    rollupBadgeOf(root).click();
    checkOfChildRow(root, 0).click();
    await Promise.resolve();
    await Promise.resolve();

    expect(writes).toEqual([]);
    expect(checkOfChildRow(root, 0).getAttribute("aria-checked")).toBe("true");
    expect(lines).toContain(
      "Child 4 (Task) completion unchanged: no state routed to board column 1",
    );
  });
});

/** The completion checkbox of the rolled-up child popup row at `index`. */
const checkOfChildRow = (root: HTMLElement, index: number): HTMLButtonElement =>
  [...root.querySelectorAll<HTMLButtonElement>(".awesomeado-child-items__check")][index]!;

/** The rendered ETA color of the rolled-up child popup row at `index`. */
const etaColorOfChildRow = (root: HTMLElement, index: number): string | undefined =>
  checkOfChildRow(root, index)
    .closest(".awesomeado-child-items__row")
    ?.querySelector<HTMLElement>(".awesomeado-eta")?.style.color;

/** Renders a board over `tree` with the given binding properties, and waits for its async load. */
async function renderBoardForTree(
  tree: TrackedWorkItem,
  properties: Record<string, string> = {},
  serviceOverrides: Partial<EnhancedViewServices> = {},
): Promise<HTMLElement> {
  const services = createFakeServices({
    loadTree: async () => ({ isTreeQuery: true, roots: [tree], error: null }),
    ...serviceOverrides,
  });
  const root = projectTrackingView.render({ doc: document, queryId: "q1", properties, services });
  await Promise.resolve();
  await Promise.resolve();
  return root;
}

/** The titles of the rendered tree rows, in the order the board painted them. */
function renderedRowTitles(root: HTMLElement): string[] {
  return [...root.querySelectorAll(".awesomeado-tracking__item-title")].map(
    (title) => title.textContent ?? "",
  );
}

/** An Epic over the given children, so the board's depth-0 rows are exactly those children. */
function epicOver(children: TrackedWorkItem[]): TrackedWorkItem {
  return createItem({ id: 1, type: "Epic", title: "Platform Modernization", children });
}

// Every fixture below leans on the fake clock (2026-07-24T12:00Z) and the fake board columns
// (…Done, Removed), so "Closed" maps to Done — the column before Removed — and the default 4-day
// window cuts at 2026-07-20T12:00Z.
const LONG_AGO = "2026-07-01T00:00:00Z";
const YESTERDAY = "2026-07-23T00:00:00Z";

/** A Feature sitting in the resolved column since `stateChangeDate`. */
function resolvedFeature(
  id: number,
  title: string,
  stateChangeDate: string,
  extra: Partial<TrackedWorkItem> = {},
): TrackedWorkItem {
  return createItem({ id, type: "Feature", title, state: "Closed", stateChangeDate, ...extra });
}

/** A Task sitting in the resolved column since `stateChangeDate`, for the rollup fixtures. */
function resolvedTask(id: number, title: string, stateChangeDate: string): TrackedWorkItem {
  return createItem({ id, title, state: "Closed", stateChangeDate });
}

/** An Epic whose deepest row rolls the given Tasks up into its badge. */
function epicOverRolledUpTasks(tasks: TrackedWorkItem[]): TrackedWorkItem {
  return epicOver([
    createItem({
      id: 20,
      type: "Feature",
      title: "User Authentication",
      children: [createItem({ id: 30, type: "Story", title: "Login UI", children: tasks })],
    }),
  ]);
}

describe("ProjectTrackingView — completed ETA", () => {
  it("colors completed ETAs green only when resolved on or before the ETA day", async () => {
    const resolvedJuly23 = "2026-07-23T12:00:00Z";
    const root = await renderBoardForTree(
      epicOver([
        resolvedFeature(2, "On time", resolvedJuly23, { eta: "2026-07-23T00:00:00Z" }),
        resolvedFeature(3, "Late", resolvedJuly23, { eta: "2026-07-22T00:00:00Z" }),
      ]),
    );
    const rows = [...root.querySelectorAll<HTMLElement>(".awesomeado-tracking__row")];
    const etaColorFor = (title: string): string | undefined =>
      rows
        .find((row) => row.querySelector(".awesomeado-tracking__item-title")?.textContent === title)
        ?.querySelector<HTMLElement>(".awesomeado-eta")?.style.color;

    expect(etaColorFor("On time")).toBe("var(--completion-foreground)");
    expect(etaColorFor("Late")).toBe("var(--text-secondary-color)");
  });
});

describe("ProjectTrackingView — resolved item window", () => {
  it("hides an item resolved longer ago than the configured window", async () => {
    const root = await renderBoardForTree(
      epicOver([
        resolvedFeature(2, "Long done", LONG_AGO),
        createItem({ id: 3, type: "Feature", title: "Still active", state: "Active" }),
      ]),
    );

    expect(renderedRowTitles(root)).toEqual(["Still active"]);
  });

  it("keeps an item resolved inside the window", async () => {
    const root = await renderBoardForTree(
      epicOver([
        resolvedFeature(2, "Just done", YESTERDAY),
        createItem({ id: 3, type: "Feature", title: "Still active", state: "Active" }),
      ]),
    );

    expect(renderedRowTitles(root)).toEqual(["Just done", "Still active"]);
  });

  it("measures the window from the state change, not from the last edit", async () => {
    // Touched today (a comment, a re-tag) without moving the state: that must not put a finished
    // item back on the board for another four days.
    const tree = epicOver([
      resolvedFeature(2, "Long done", LONG_AGO, { changedDate: "2026-07-24T11:00:00Z" }),
    ]);

    expect(renderedRowTitles(await renderBoardForTree(tree))).toEqual([]);
  });

  it("keeps a long-resolved item while unresolved work still sits beneath it", async () => {
    const tree = epicOver([
      resolvedFeature(2, "Long done", LONG_AGO, {
        children: [createItem({ id: 3, type: "Story", title: "Still open", state: "Active" })],
      }),
    ]);

    expect(renderedRowTitles(await renderBoardForTree(tree))).toEqual(["Long done", "Still open"]);
  });

  it("keeps a resolved item ADO returned no state-change date for", async () => {
    const tree = epicOver([resolvedFeature(2, "Done, undated", "")]);

    expect(renderedRowTitles(await renderBoardForTree(tree))).toEqual(["Done, undated"]);
  });

  it("leaves an abandoned item alone: only the column before Removed ages out", async () => {
    // No column routes "Removed" for this type, so its status is the raw state — which is the LAST
    // board column, not the resolved one before it.
    const tree = epicOver([
      createItem({ id: 2, type: "Feature", title: "Abandoned", state: "Removed" }),
    ]);

    expect(renderedRowTitles(await renderBoardForTree(tree))).toEqual(["Abandoned"]);
  });

  it("hides a resolved item immediately when the window is zero days", async () => {
    const root = await renderBoardForTree(
      epicOver([
        resolvedFeature(2, "Done a minute ago", "2026-07-24T11:59:00Z"),
        createItem({ id: 3, type: "Feature", title: "Still active", state: "Active" }),
      ]),
      { days: "0" },
    );

    expect(renderedRowTitles(root)).toEqual(["Still active"]);
  });

  it("keeps a long-resolved child in the rollup summary, though the outline would drop it", async () => {
    const root = await renderBoardForTree(
      epicOverRolledUpTasks([
        resolvedTask(4, "Long done", LONG_AGO),
        resolvedTask(5, "Just done", YESTERDAY),
        createItem({ id: 6, title: "Still active", state: "Active" }),
      ]),
      {},
      { getTypes: () => DEEP_TYPES },
    );

    // All 3 Tasks count, 2 of them resolved. Ageing the long-resolved one out of the rollup made a
    // finished row report LESS work than it had done — and a row whose children had ALL finished
    // before the window lost its badge entirely, reading as though it had no children at all.
    expect(rollupBadgeOf(root).textContent).toBe("2 / 3");
  });
});

describe("ProjectTrackingView — item ordering", () => {
  /** Three Features whose rank, title and ETA orders are all different, so each policy is visible. */
  function unorderedFeatures(): TrackedWorkItem {
    return epicOver([
      createItem({
        id: 2,
        type: "Feature",
        title: "Charlie",
        importance: 10,
        eta: "2026-09-01T00:00:00Z",
      }),
      createItem({ id: 3, type: "Feature", title: "Alpha", importance: 30, eta: null }),
      createItem({
        id: 4,
        type: "Feature",
        title: "Bravo",
        importance: 20,
        eta: "2026-08-01T00:00:00Z",
      }),
    ]);
  }

  it("orders rows by backlog rank when the binding stores no policy", async () => {
    const root = await renderBoardForTree(unorderedFeatures());

    expect(renderedRowTitles(root)).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("orders rows a-z under the title policy", async () => {
    const root = await renderBoardForTree(unorderedFeatures(), { orderingPolicy: "title" });

    expect(renderedRowTitles(root)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("orders rows by ETA under the eta policy, with undated items last", async () => {
    const root = await renderBoardForTree(unorderedFeatures(), { orderingPolicy: "eta" });

    expect(renderedRowTitles(root)).toEqual(["Bravo", "Charlie", "Alpha"]);
  });

  it("orders nested rows by the same policy as their parents", async () => {
    const root = await renderBoardForTree(
      epicOver([
        createItem({
          id: 2,
          type: "Feature",
          title: "User Authentication",
          children: [
            createItem({ id: 3, type: "Story", title: "Zebra", importance: 20 }),
            createItem({ id: 4, type: "Story", title: "Aardvark", importance: 10 }),
          ],
        }),
      ]),
    );

    expect(renderedRowTitles(root)).toEqual(["User Authentication", "Aardvark", "Zebra"]);
  });

  it("orders the rolled-up children by the binding's policy too", async () => {
    const root = await renderBoardForTree(
      epicOverRolledUpTasks([
        createItem({ id: 4, title: "Zebra" }),
        createItem({ id: 5, title: "Aardvark" }),
      ]),
      { orderingPolicy: "title" },
      { getTypes: () => DEEP_TYPES },
    );

    rollupBadgeOf(root).click();
    const titles = [...root.querySelectorAll(".awesomeado-child-items__title")].map(
      (title) => title.textContent,
    );
    expect(titles).toEqual(["Aardvark", "Zebra"]);
  });
});

/** Opens the header's ordering menu and picks `policy`; returns false when that row is absent. */
function pickOrderingPolicy(root: HTMLElement, policy: string): boolean {
  root.querySelector<HTMLButtonElement>(".awesomeado-ordering__trigger")!.click();
  const row = root.querySelector<HTMLButtonElement>(
    `.awesomeado-ordering__option[data-policy="${policy}"]`,
  );
  row?.click();
  return row !== null;
}

describe("ProjectTrackingView — ordering picker", () => {
  /** Three Features whose rank and title orders disagree, so a re-sort is visible in the rows. */
  function unorderedFeatures(): TrackedWorkItem {
    return epicOver([
      createItem({ id: 2, type: "Feature", title: "Charlie", importance: 10 }),
      createItem({ id: 3, type: "Feature", title: "Alpha", importance: 30 }),
      createItem({ id: 4, type: "Feature", title: "Bravo", importance: 20 }),
    ]);
  }

  it("labels the header indicator with the binding's policy", async () => {
    const root = await renderBoardForTree(unorderedFeatures(), { orderingPolicy: "eta" });

    const trigger = root.querySelector<HTMLButtonElement>(".awesomeado-ordering__trigger")!;
    expect(trigger.title).toContain("Ordering: By ETA (past/recent - future)");
  });

  it("re-sorts the rows on the spot when a new policy is picked", async () => {
    const root = await renderBoardForTree(unorderedFeatures());
    expect(renderedRowTitles(root)).toEqual(["Charlie", "Bravo", "Alpha"]);

    expect(pickOrderingPolicy(root, "title")).toBe(true);

    expect(renderedRowTitles(root)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("re-sorts without re-reading the query from Azure DevOps", async () => {
    let treeReads = 0;
    const root = await renderBoardForTree(
      unorderedFeatures(),
      {},
      {
        loadTree: async () => {
          treeReads++;
          return { isTreeQuery: true, roots: [unorderedFeatures()], error: null };
        },
      },
    );

    pickOrderingPolicy(root, "title");

    expect(treeReads).toBe(1);
  });

  it("re-sorts every level of the tree, not just the top one", async () => {
    const root = await renderBoardForTree(
      epicOver([
        createItem({
          id: 2,
          type: "Feature",
          title: "User Authentication",
          children: [
            createItem({ id: 3, type: "Story", title: "Aardvark", importance: 10 }),
            createItem({ id: 4, type: "Story", title: "Zebra", importance: 20 }),
          ],
        }),
      ]),
    );
    expect(renderedRowTitles(root)).toEqual(["User Authentication", "Aardvark", "Zebra"]);

    pickOrderingPolicy(root, "eta");

    // Neither Story has an ETA, so the stable sort keeps them in the order the query returned.
    expect(renderedRowTitles(root)).toEqual(["User Authentication", "Aardvark", "Zebra"]);
  });

  it("keeps the picked order across a later re-render (a resolved roster)", async () => {
    const root = await renderBoardForTree(unorderedFeatures());
    pickOrderingPolicy(root, "title");

    // The Feature Crew reconcile resolves after load and repaints the tree; the session's pick must
    // survive it rather than snapping back to the binding's policy.
    await Promise.resolve();
    await Promise.resolve();

    expect(renderedRowTitles(root)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("records the ordering flip, with the policy it moved from and the binding's own", async () => {
    const lines: string[] = [];
    const root = await renderBoardForTree(
      unorderedFeatures(),
      { orderingPolicy: "importance" },
      { logger: { info: (message) => lines.push(message), error: () => undefined } },
    );

    pickOrderingPolicy(root, "title");

    expect(
      lines.some(
        (line) =>
          line.includes("Project Tracking ordering changed") &&
          line.includes("from=importance") &&
          line.includes("to=title") &&
          line.includes("bindingPolicy=importance"),
      ),
    ).toBe(true);
  });
});

/** Renders the fixture board and lets the roster reconcile's repaint settle before it is inspected. */
async function renderNotesBoard(
  properties: Record<string, string> = {},
  serviceOverrides: Partial<EnhancedViewServices> = {},
  tree: TrackedWorkItem = createFixtureTree(),
): Promise<HTMLElement> {
  const root = await renderBoardForTree(tree, properties, serviceOverrides);
  // The Feature Crew reconcile repaints the tree; the toggle under test must be the final one.
  await new Promise((resolve) => setTimeout(resolve, 0));
  return root;
}

/** The notes toggle on the board's first (and, with the sprint filter on, only) row. */
function notesToggleOf(root: HTMLElement): HTMLButtonElement {
  return root.querySelector<HTMLButtonElement>(".awesomeado-tracking__notes-toggle")!;
}

describe("ProjectTrackingView - notes toggle", () => {
  it("puts the item's own type icon in front of every row's title", async () => {
    const root = await renderNotesBoard();

    const toggle = notesToggleOf(root);
    const image = toggle.querySelector<HTMLImageElement>(".awesomeado-type-icon img");
    // The fixture row is a Feature, so it must carry the Feature type's configured icon.
    expect(image?.getAttribute("src")).toBe("feature.svg");
    // The icon carries no tooltip of its own: it IS the notes affordance, so hovering it must say
    // what clicking does rather than shadowing that with the work item type.
    expect(toggle.querySelector(".awesomeado-type-icon")?.hasAttribute("title")).toBe(false);
    expect(toggle.title).toBe("Show notes");
  });

  it("starts closed, with the icon dimmed and the panel out of the way", async () => {
    const root = await renderNotesBoard();

    const toggle = notesToggleOf(root);
    const icon = toggle.querySelector<HTMLElement>(".awesomeado-type-icon");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    // The fixture Feature reports a discussion, so the icon keeps its type color while dimmed.
    expect(icon?.style.opacity).toBe("0.55");
    expect(icon?.style.filter).toBe("none");
    expect(root.querySelector<HTMLElement>(".awesomeado-notes")?.style.display).toBe("none");
  });

  it("greys the icon of an item with no discussion, so empties are visible without clicking", async () => {
    const tree = createFixtureTree();
    // Same row as every other test here, but ADO reports it has never been commented on.
    tree.children[0]!.noteCount = 0;
    const root = await renderNotesBoard({}, {}, tree);

    const toggle = notesToggleOf(root);
    const icon = toggle.querySelector<HTMLElement>(".awesomeado-type-icon");
    expect(icon?.style.filter).toBe("grayscale(1)");
    // "Has notes?" is the icon's shade to answer; the tooltip only ever names the action, so an
    // empty item is not talked out of being opened.
    expect(toggle.title).toBe("Show notes");
  });
});

describe("ProjectTrackingView - notes toggle, once a panel has been opened", () => {
  it("greys the icon once a read shows the window holds nothing, despite older comments", async () => {
    // ADO's count is a TOTAL, so an item whose only comments predate the window starts out
    // promising notes; opening it is what settles the question.
    const root = await renderNotesBoard();

    notesToggleOf(root).click();
    await Promise.resolve();
    await Promise.resolve();
    // A third tick: the panel also resolves the `@`-mentions in what it just fetched before it
    // builds its rows, and the note count is only reported once those rows render.
    await Promise.resolve();

    const icon = notesToggleOf(root).querySelector<HTMLElement>(".awesomeado-type-icon");
    // Still open, so still full strength — the correction shows once it is closed again.
    expect(icon?.style.opacity).toBe("1");

    notesToggleOf(root).click();
    expect(
      notesToggleOf(root).querySelector<HTMLElement>(".awesomeado-type-icon")?.style.filter,
    ).toBe("grayscale(1)");
  });

  it("leaves the icon alone when the read failed, since the count is then unknown", async () => {
    const root = await renderNotesBoard(
      {},
      {
        noteLoader: {
          loadNotes: async () => ({ notes: [], currentUser: null, error: "HTTP 500" }),
        },
      },
    );

    notesToggleOf(root).click();
    await Promise.resolve();
    await Promise.resolve();
    notesToggleOf(root).click();

    // Never greyed off a failure: that would claim an item has no discussion because nobody could
    // read it.
    expect(
      notesToggleOf(root).querySelector<HTMLElement>(".awesomeado-type-icon")?.style.filter,
    ).toBe("none");
  });

  it("brightens the icon and reveals the notes when the toggle is clicked", async () => {
    const root = await renderNotesBoard();

    notesToggleOf(root).click();

    const toggle = notesToggleOf(root);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.querySelector<HTMLElement>(".awesomeado-type-icon")?.style.opacity).toBe("1");
    expect(root.querySelector<HTMLElement>(".awesomeado-notes")?.style.display).toBe("block");
  });

  it("keeps an opened empty item's icon grey, only brighter, rather than lending it the type color", async () => {
    const tree = createFixtureTree();
    tree.children[0]!.noteCount = 0;
    const root = await renderNotesBoard({}, {}, tree);
    const closed = notesToggleOf(root).querySelector<HTMLElement>(".awesomeado-type-icon")!;
    const closedOpacity = Number(closed.style.opacity);

    notesToggleOf(root).click();

    // The type color says "there is something written here"; an open but empty item has nothing to
    // spend it on, so opening only brings the same grey forward.
    const opened = notesToggleOf(root).querySelector<HTMLElement>(".awesomeado-type-icon")!;
    expect(opened.style.filter).toBe("grayscale(1)");
    expect(Number(opened.style.opacity)).toBeGreaterThan(closedOpacity);
  });

  it("reads the discussion over the binding's own Updates window", async () => {
    const requests: { workItemId: number; sinceIso: string }[] = [];
    const root = await renderNotesBoard(
      { weeks: "3" },
      {
        noteLoader: {
          loadNotes: async (request) => {
            requests.push(request);
            return { notes: [], currentUser: null, error: null };
          },
        },
      },
    );

    notesToggleOf(root).click();

    // Three weeks back from the fixture clock (2026-07-24T12:00Z), for the row's own work item.
    expect(requests[0]).toEqual({ workItemId: 2, sinceIso: "2026-07-03T12:00:00.000Z" });
  });
});

describe("ProjectTrackingView — @-mentions in descriptions", () => {
  const ADA = "11111111-2222-3333-4444-555555555555";

  /** A tree whose first Feature's description mentions Ada, plus the resolve calls it triggers. */
  function mountMentionBoard(names: Map<string, string>) {
    const tree = createFixtureTree();
    tree.children[0]!.description = `Blocked on @<${ADA}>.`;
    const asked: string[][] = [];
    const services = createFakeServices({
      loadTree: async () => ({ isTreeQuery: true, roots: [tree], error: null }),
      mentionDirectory: {
        resolveNames: async (ids) => {
          asked.push([...ids]);
          return names;
        },
        knownNames: () => names,
      },
    });
    const root = projectTrackingView.render({
      doc: document,
      queryId: "q1",
      properties: {},
      services,
    });
    return { root, asked };
  }

  /** The description text of the first tree row, after opening its `?` panel. */
  function descriptionTextOf(root: HTMLElement): string {
    root.querySelector<HTMLButtonElement>(".awesomeado-tracking__describe")!.click();
    return root.querySelector<HTMLElement>(".awesomeado-tracking__desc-text")!.textContent ?? "";
  }

  it("asks the directory about every identity its descriptions mention", async () => {
    const { asked } = mountMentionBoard(new Map());

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // One bulk call for the board, not one per description: that is the whole point of the contract.
    expect(asked).toEqual([[ADA]]);
  });

  it("repaints the board so a resolved mention reads as the person's name", async () => {
    const { root } = mountMentionBoard(new Map([[ADA, "Ada Lovelace"]]));

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(descriptionTextOf(root)).toContain("@Ada Lovelace");
  });

  it("shows a neutral placeholder rather than a raw identity id when nobody answered", async () => {
    const { root } = mountMentionBoard(new Map());

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const text = descriptionTextOf(root);
    expect(text).toContain("@mention");
    expect(text).not.toContain(ADA);
  });
});

/** The header's refresh button on the currently rendered board. */
const refreshButtonOf = (root: HTMLElement): HTMLButtonElement =>
  root.querySelector<HTMLButtonElement>(".awesomeado-tracking__refresh")!;

/** Presses refresh and lets the (awaited queue + re-read + repaint) microtask chain settle. */
async function pressRefresh(root: HTMLElement): Promise<void> {
  refreshButtonOf(root).click();
  await new Promise((resolve) => setTimeout(resolve, 10));
}

/**
 * A board whose successive re-reads answer with `trees` in order (the last one repeats), so a test
 * can show the reader something new arriving without reaching into the view's internals.
 */
async function renderRefreshableBoard(
  trees: TrackedWorkItem[],
  overrides: Partial<EnhancedViewServices> = {},
): Promise<{ root: HTMLElement; treeReads: () => number }> {
  let reads = 0;
  const root = await renderBoardForTree(trees[0]!, {}, {
    loadTree: async () => {
      const tree = trees[Math.min(reads, trees.length - 1)]!;
      reads++;
      return { isTreeQuery: true, roots: [tree], error: null };
    },
    ...overrides,
  } as Partial<EnhancedViewServices>);
  return { root, treeReads: () => reads };
}

/** The same epic twice, the second time carrying a Feature that was not there before. */
function grownProject(): TrackedWorkItem[] {
  return [
    epicOver([createItem({ id: 2, type: "Feature", title: "User Authentication" })]),
    epicOver([
      createItem({ id: 2, type: "Feature", title: "User Authentication" }),
      createItem({ id: 3, type: "Feature", title: "Data Migration" }),
    ]),
  ];
}

describe("ProjectTrackingView — refreshing the board in place", () => {
  it("re-reads the query and paints what came back, without touching the rest of the page", async () => {
    const { root, treeReads } = await renderRefreshableBoard(grownProject());
    expect(renderedRowTitles(root)).toEqual(["User Authentication"]);

    await pressRefresh(root);

    expect(treeReads()).toBe(2);
    // The view's own root element survives: only its contents were replaced, so nothing above the
    // board (ADO's chrome, the surface overlay) is disturbed by a refresh.
    expect(renderedRowTitles(root)).toEqual(["User Authentication", "Data Migration"]);
  });

  it("re-reads the sprint window too, so the picker cannot outlive the sprint it opened on", async () => {
    let sprintReads = 0;
    const { root } = await renderRefreshableBoard(grownProject(), {
      loadSprintWindow: async () => {
        sprintReads++;
        return {
          entries: [...FIXTURE_SPRINT_WINDOW.entries],
          currentName: FIXTURE_SPRINT_WINDOW.currentName,
        };
      },
    });

    await pressRefresh(root);

    expect(sprintReads).toBe(2);
  });

  it("waits for queued writes before re-reading, so a saved edit cannot read back stale", async () => {
    const order: string[] = [];
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const { root } = await renderRefreshableBoard(grownProject(), {
      writeField: async () => {
        await writeGate;
        order.push("write");
        return { ok: true, rev: 2 };
      },
      loadTree: async () => {
        order.push("read");
        return { isTreeQuery: true, roots: [grownProject()[1]!], error: null };
      },
    });
    order.length = 0;

    // An ETA edit on the first row is in flight when the reader presses refresh.
    const row = root.querySelector<HTMLElement>(".awesomeado-tracking__row")!;
    row.querySelector<HTMLElement>(".awesomeado-eta__label")!.click();
    const picked = row.querySelector<HTMLInputElement>(".awesomeado-eta__date")!;
    picked.value = "2026-10-05";
    picked.dispatchEvent(new Event("change"));
    refreshButtonOf(root).click();
    releaseWrite();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(order).toEqual(["write", "read"]);
  });

  it("ignores a second press while a re-read is already running", async () => {
    const { root, treeReads } = await renderRefreshableBoard(grownProject());

    refreshButtonOf(root).click();
    refreshButtonOf(root).click();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(treeReads()).toBe(2);
  });
});

describe("ProjectTrackingView — a refresh keeps the reader's place", () => {
  it("keeps the outline the reader collapsed", async () => {
    const { root } = await renderRefreshableBoard([
      epicOver([
        createItem({
          id: 2,
          type: "Feature",
          title: "User Authentication",
          children: [createItem({ id: 3, type: "Story", title: "Login UI" })],
        }),
      ]),
    ]);
    await turnSprintFilterOff(root);
    root.querySelector<HTMLButtonElement>(".awesomeado-tracking__twisty")!.click();

    await pressRefresh(root);

    // A refresh replaces every row, so the reader's outline only survives if it is remembered
    // outside the board — otherwise "show me the latest" silently reopens everything they closed.
    const twisty = root.querySelector<HTMLButtonElement>(".awesomeado-tracking__twisty")!;
    expect(twisty.getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the sprint filter as the reader left it", async () => {
    const { root } = await renderRefreshableBoard(grownProject());
    await turnSprintFilterOff(root);

    await pressRefresh(root);

    const button = root.querySelector<HTMLButtonElement>(".awesomeado-sprint-picker__button")!;
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the ordering the reader picked for this session", async () => {
    const { root } = await renderRefreshableBoard([
      epicOver([
        createItem({ id: 2, type: "Feature", title: "Charlie", importance: 10 }),
        createItem({ id: 3, type: "Feature", title: "Alpha", importance: 30 }),
      ]),
    ]);
    expect(pickOrderingPolicy(root, "title")).toBe(true);
    expect(renderedRowTitles(root)).toEqual(["Alpha", "Charlie"]);

    await pressRefresh(root);

    // The pick is never written back to the binding, so only the session can carry it across the
    // re-read; without that, refreshing would quietly re-sort the board back under the reader.
    expect(renderedRowTitles(root)).toEqual(["Alpha", "Charlie"]);
  });
});

describe("ProjectTrackingView — a refresh that fails", () => {
  /** A board whose first read succeeds and whose every later read rejects. */
  async function renderThenFail(
    overrides: Partial<EnhancedViewServices> = {},
  ): Promise<HTMLElement> {
    let reads = 0;
    const tree = epicOver([createItem({ id: 2, type: "Feature", title: "User Authentication" })]);
    return renderBoardForTree(
      tree,
      {},
      {
        loadTree: async () => {
          reads++;
          if (reads > 1) {
            throw new Error("ADO said no");
          }
          return { isTreeQuery: true, roots: [tree], error: null };
        },
        ...overrides,
      },
    );
  }

  it("keeps the board on screen rather than trading it for a load-failure message", async () => {
    const root = await renderThenFail();

    await pressRefresh(root);

    // The board is still a truthful, if older, picture. Replacing it with "Could not load this
    // query." because one fetch failed would cost the reader everything they had open, for nothing.
    expect(renderedRowTitles(root)).toEqual(["User Authentication"]);
    expect(root.textContent).not.toContain("Could not load this query");
  });

  it("records the cause and says on the button that the board is now stale", async () => {
    const errors: string[] = [];
    const root = await renderThenFail({
      logger: { info: () => undefined, error: (message) => errors.push(message) },
    });

    await pressRefresh(root);

    expect(errors.some((message) => message.includes("could not refresh"))).toBe(true);
    // Persist-then-reflect: nothing on screen changed, so without this the reader cannot tell a
    // failed refresh from a query that genuinely has not moved.
    expect(refreshButtonOf(root).title).toContain("older data");
  });

  it("hands the reader the recorded cause on the next press, then refreshes again on the one after", async () => {
    let opened = 0;
    let reads = 0;
    const tree = epicOver([createItem({ id: 2, type: "Feature", title: "User Authentication" })]);
    const root = await renderBoardForTree(
      tree,
      {},
      {
        openDiagnosticsLog: () => {
          opened++;
        },
        loadTree: async () => {
          reads++;
          if (reads === 2) {
            throw new Error("ADO said no");
          }
          return { isTreeQuery: true, roots: [tree], error: null };
        },
      },
    );

    await pressRefresh(root);
    expect(refreshButtonOf(root).title).toContain("older data");

    await pressRefresh(root);
    expect(opened).toBe(1);
    // The report is cleared by that press, so the button is a refresh button again — a failed
    // re-read must not be a dead end the reader can only escape by reloading the page.
    expect(refreshButtonOf(root).title).toContain("Refresh");

    await pressRefresh(root);
    expect(reads).toBe(3);
  });
});

// The fake clock is 2026-07-24T12:00Z, so the binding's default 24-hour window opens at
// 2026-07-23T12:00Z. Every fixture below is placed clearly on one side of that line.
const AN_HOUR_AGO = "2026-07-24T11:00:00Z";
const FIVE_HOURS_AGO = "2026-07-24T07:00:00Z";
const MONTHS_AGO = "2026-06-01T00:00:00Z";

/**
 * Four Features, one per answer the pills can give: freshly created (and therefore also freshly
 * changed), only re-touched, untouched, and untouched but talked about.
 */
function epicOverRecentActivity(): TrackedWorkItem {
  return epicOver([
    createItem({
      id: 2,
      type: "Feature",
      title: "Fresh feature",
      createdDate: AN_HOUR_AGO,
      changedDate: AN_HOUR_AGO,
    }),
    createItem({
      id: 3,
      type: "Feature",
      title: "Touched feature",
      createdDate: MONTHS_AGO,
      changedDate: AN_HOUR_AGO,
    }),
    createItem({
      id: 4,
      type: "Feature",
      title: "Quiet feature",
      createdDate: MONTHS_AGO,
      changedDate: MONTHS_AGO,
    }),
    createItem({
      id: 5,
      type: "Feature",
      title: "Discussed feature",
      createdDate: MONTHS_AGO,
      changedDate: MONTHS_AGO,
      noteCount: 3,
    }),
  ]);
}

const activityPillOf = (root: HTMLElement, kind: string): HTMLButtonElement =>
  root.querySelector<HTMLButtonElement>(`.awesomeado-activity-pill[data-activity="${kind}"]`)!;

/** Drains the microtasks the discussion reads and the repaint they trigger resolve on. */
async function settleActivityReads(): Promise<void> {
  for (let tick = 0; tick < 30; tick++) {
    await Promise.resolve();
  }
}

describe("ProjectTrackingView — recent-activity pills", () => {
  it("puts every pill on one wrapping row introduced by a single 'Filters:' label", async () => {
    const root = await renderBoardForTree(epicOverRecentActivity());

    const row = root.querySelector<HTMLElement>(".awesomeado-tracking__filters")!;
    expect(row.querySelector(".awesomeado-tracking__filters-label")?.textContent).toBe("Filters:");
    expect(row.querySelectorAll(".awesomeado-activity-pill")).toHaveLength(3);
    // One continuous line that reflows when the board is narrow, with the label centred against the
    // taller pills it shares a line with.
    expect(row.style.flexWrap).toBe("wrap");
    expect(row.style.alignItems).toBe("center");
  });

  it("closes that row with the activity pills, after the tag pills", async () => {
    const services = createFakeServices({
      loadTree: async () => ({ isTreeQuery: true, roots: [createFixtureTree()], error: null }),
      featureCrew: {
        reconcile: async () => ({
          ok: true,
          changed: false,
          members: [{ alias: "bob.jones", fullName: "Bob Jones", tag: "Platform" }],
        }),
      },
    });
    const root = projectTrackingView.render({
      doc: document,
      queryId: "q1",
      properties: {},
      services,
    });
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await Promise.resolve();

    const row = root.querySelector(".awesomeado-tracking__filters")!;
    const classes = [...row.children].map((child) => child.className);
    expect(classes[0]).toBe("awesomeado-tracking__filters-label");
    // "Whose is it?" reads before "what changed?", and the activity pills close the row.
    expect(classes.findIndex((name) => name.startsWith("awesomeado-tag-pill"))).toBeLessThan(
      classes.indexOf("awesomeado-activity-pill"),
    );
    expect(classes.slice(-3)).toEqual([
      "awesomeado-activity-pill",
      "awesomeado-activity-pill",
      "awesomeado-activity-pill",
    ]);
  });
});

describe("ProjectTrackingView — what the recent-activity pills narrow to", () => {
  it("shows every item while no pill is lit", async () => {
    const root = await renderBoardForTree(epicOverRecentActivity());

    expect(renderedRowTitles(root)).toEqual([
      "Fresh feature",
      "Touched feature",
      "Quiet feature",
      "Discussed feature",
    ]);
  });

  it("narrows to items created inside the window", async () => {
    const root = await renderBoardForTree(epicOverRecentActivity());

    activityPillOf(root, "created").click();

    expect(renderedRowTitles(root)).toEqual(["Fresh feature"]);
  });

  it("narrows to items changed inside the window", async () => {
    const root = await renderBoardForTree(epicOverRecentActivity());

    activityPillOf(root, "updated").click();

    expect(renderedRowTitles(root)).toEqual(["Fresh feature", "Touched feature"]);
  });

  it("ORs two lit pills rather than intersecting them", async () => {
    const root = await renderBoardForTree(epicOverRecentActivity());

    activityPillOf(root, "created").click();
    activityPillOf(root, "updated").click();

    expect(renderedRowTitles(root)).toEqual(["Fresh feature", "Touched feature"]);
  });

  it("measures 'newly' against the binding's own window, not a fixed day", async () => {
    const tree = epicOver([
      createItem({
        id: 2,
        type: "Feature",
        title: "Touched five hours ago",
        createdDate: MONTHS_AGO,
        changedDate: FIVE_HOURS_AGO,
      }),
    ]);
    const root = await renderBoardForTree(tree, { hours: "2" });

    // The window is no longer on the row's label (one label now introduces every filter), so each
    // pill's tooltip is what has to name it.
    expect(activityPillOf(root, "updated").title).toBe("Items changed in the last 2 hours.");
    activityPillOf(root, "updated").click();
    expect(renderedRowTitles(root)).toEqual([]);
  });

  it("puts a lit pill out again, restoring the whole board", async () => {
    const root = await renderBoardForTree(epicOverRecentActivity());

    activityPillOf(root, "created").click();
    activityPillOf(root, "created").click();

    expect(renderedRowTitles(root)).toHaveLength(4);
  });

  it("records the flip, so a missing item is explainable from the log alone", async () => {
    const infos: string[] = [];
    const root = await renderBoardForTree(
      epicOverRecentActivity(),
      {},
      { logger: { info: (message) => infos.push(message), error: () => undefined } },
    );

    activityPillOf(root, "created").click();

    expect(
      infos.some(
        (message) =>
          message.includes("recent-activity filter") &&
          message.includes("selected=[created]") &&
          message.includes("windowHours=24"),
      ),
    ).toBe(true);
  });
});

describe("ProjectTrackingView — the New notes pill", () => {
  /** Dates the one fixture item that was discussed, and reports the rest as never commented on. */
  const discussedItemActivity = (asked: number[]) => ({
    readNoteActivity: async (request: { workItemIds: number[] }) => {
      asked.push(...request.workItemIds);
      return {
        activity: request.workItemIds.map((workItemId) => ({
          workItemId,
          newestNoteDate: workItemId === 5 ? AN_HOUR_AGO : null,
        })),
        error: null,
      };
    },
  });

  it("leaves the board wide, and says it is still reading, until the discussions land", async () => {
    const asked: number[] = [];
    const root = await renderBoardForTree(
      epicOverRecentActivity(),
      {},
      { noteActivity: discussedItemActivity(asked) },
    );

    activityPillOf(root, "notes").click();

    // One visible jump, not two: narrowing on an answer nobody has yet would empty the board and
    // then repopulate it.
    expect(renderedRowTitles(root)).toHaveLength(4);
    expect(activityPillOf(root, "notes").getAttribute("aria-busy")).toBe("true");
  });

  it("narrows to the items that gained a note once the reads settle", async () => {
    const asked: number[] = [];
    const root = await renderBoardForTree(
      epicOverRecentActivity(),
      {},
      { noteActivity: discussedItemActivity(asked) },
    );

    activityPillOf(root, "notes").click();
    await settleActivityReads();

    expect(renderedRowTitles(root)).toEqual(["Discussed feature"]);
    expect(activityPillOf(root, "notes").getAttribute("aria-busy")).toBe("false");
    // Only the item ADO reports a discussion on is asked about; the other three cost nothing.
    expect(asked).toEqual([5]);
  });

  it("reads no discussion at all until the pill is lit", async () => {
    const asked: number[] = [];
    await renderBoardForTree(
      epicOverRecentActivity(),
      {},
      { noteActivity: discussedItemActivity(asked) },
    );
    await settleActivityReads();

    expect(asked).toEqual([]);
  });
});

/** A board whose one Feature row (id 2) carries the given ADO tags, with every write recorded. */
async function renderFlaggedBoard(
  tags: string[],
  overrides: Partial<EnhancedViewServices> = {},
): Promise<{
  root: HTMLElement;
  writes: WorkItemFieldWriteRequest[];
  notes: { workItemId: number; text: string }[];
}> {
  const writes: WorkItemFieldWriteRequest[] = [];
  // Recorded so a test can prove the reason does NOT go through the comments API: a separately
  // posted comment advances the item's rev and gets the tag patch rejected with HTTP 412.
  const notes: { workItemId: number; text: string }[] = [];
  const root = await renderDeepBoard({
    loadTree: async () => ({
      isTreeQuery: true,
      roots: [
        createItem({
          id: 1,
          type: "Epic",
          title: "Platform Modernization",
          children: [
            createItem({ id: 2, type: "Feature", title: "User Authentication", tags }),
            createItem({ id: 7, type: "Feature", title: "Data Migration" }),
          ],
        }),
      ],
      error: null,
    }),
    writeField: async (request) => {
      writes.push(request);
      return { ok: true, rev: request.rev + 1 };
    },
    noteWriter: {
      addNote: async (request) => {
        notes.push(request);
        return { ok: true };
      },
      editNote: async () => ({ ok: true }),
    },
    ...overrides,
  });
  await turnSprintFilterOff(root);
  return { root, writes, notes };
}

/** Opens the menu on the flagged row and returns the marker command whose label starts with `verb`. */
function markerCommand(root: HTMLElement, verb: string): HTMLButtonElement {
  rightClick(root.querySelector(".awesomeado-tracking__row")!);
  return commandNamed(root, verb);
}

/** The marker pills on the board's filter row (never the one drawn inside a menu command). */
const filterMarkerPills = (root: HTMLElement): HTMLButtonElement[] => [
  ...root.querySelectorAll<HTMLButtonElement>(
    ".awesomeado-tracking__filters .awesomeado-marker-pill",
  ),
];

/** Every row title currently on the board. */
const rowTitles = (root: HTMLElement): (string | null)[] =>
  [...root.querySelectorAll(".awesomeado-tracking__item-title")].map((title) => title.textContent);

describe("ProjectTrackingView - flagging an item from its menu", () => {
  it("shows each flag as the very pill the item will wear", async () => {
    const { root } = await renderFlaggedBoard([]);

    const command = markerCommand(root, "Tag with Blocked (internal)");
    const pill = command.querySelector<HTMLElement>(".awesomeado-marker-pill")!;
    expect(pill.textContent).toBe("Blocked (internal)");
    expect(pill.title).toBe('Azure DevOps tag "Blocked"');
    // The row is still announceable despite its label being a rendered thing rather than text.
    expect(command.getAttribute("aria-label")).toBe("Tag with Blocked (internal)");
  });

  it("refuses to flag an item until a reason is typed", async () => {
    const { root, writes, notes } = await renderFlaggedBoard([]);

    markerCommand(root, "Tag with Blocked (internal)").click();
    editorIn(root).save.click();
    await settleWrites();

    expect(notes).toEqual([]);
    expect(writes).toEqual([]);
  });

  it("carries the reason and the tag in ONE patch, never as a separate comment", async () => {
    const { root, writes, notes } = await renderFlaggedBoard([]);

    markerCommand(root, "Tag with Blocked (internal)").click();
    const { input, save } = editorIn(root);
    input.value = "Waiting on the API.";
    save.click();
    await settleWrites();

    expect(writes).toEqual([
      expect.objectContaining({
        id: 2,
        field: "System.Tags",
        value: "Blocked",
        comment: "[BLOCKED] Waiting on the API.",
      }),
    ]);
    // Posting it through the comments API would create its own revision and get this very patch
    // rejected on its rev test, so nothing may reach the note writer.
    expect(notes).toEqual([]);
  });

  it("adds the other team's tag alongside one the item already wears", async () => {
    const { root, writes } = await renderFlaggedBoard(["Blocked"]);

    markerCommand(root, "Tag with Blocked by another team").click();
    const { input, save } = editorIn(root);
    input.value = "Handed to Platform.";
    save.click();
    await settleWrites();

    expect(writes[0]).toMatchObject({
      field: "System.Tags",
      value: "Blocked; Blocked by another team",
    });
  });

  it("names the tags it derived the change from, so a rev bump elsewhere cannot sink the write", async () => {
    const { root, writes } = await renderFlaggedBoard(["Blocked"]);

    markerCommand(root, "Tag with Blocked by another team").click();
    const { input, save } = editorIn(root);
    input.value = "Handed to Platform.";
    save.click();
    await settleWrites();

    // A drag-reorder or a note advances System.Rev without reporting it, so without the base value
    // the very next flag on that item is refused with HTTP 412 until the board is reloaded.
    expect(writes[0]).toMatchObject({ baseValue: "Blocked" });
  });

  it("does not flag the item when the patch carrying the reason was rejected", async () => {
    const { root, writes } = await renderFlaggedBoard([], {
      writeField: async (request) => {
        writes.push(request);
        return { ok: false, error: "HTTP 412" };
      },
    });

    markerCommand(root, "Tag with Blocked (internal)").click();
    const { input, save } = editorIn(root);
    input.value = "Waiting on the API.";
    save.click();
    await settleWrites();

    // One patch means one outcome: the reason and the tag were refused together, so there is nothing
    // to undo — the pill never appears and the author keeps their words.
    expect(filterMarkerPills(root)).toEqual([]);
    expect(editorIn(root).input.value).toBe("Waiting on the API.");
  });
});

describe("ProjectTrackingView - clearing a flag and unconfigured markers", () => {
  it("offers to clear a flag the item already wears, with no reason asked for", async () => {
    const { root } = await renderFlaggedBoard(["Blocked"]);

    const command = markerCommand(root, "Clear Blocked (internal)");
    expect(command.querySelector(".awesomeado-marker-pill")?.textContent).toBe(
      "Blocked (internal)",
    );

    command.click();
    await settleWrites();

    expect(root.querySelector(".awesomeado-item-menu__panel")).toBeNull();
  });

  it("clears the tag with no reason attached to the patch", async () => {
    const { root, writes } = await renderFlaggedBoard(["Blocked"]);

    markerCommand(root, "Clear Blocked (internal)").click();
    await settleWrites();

    expect(writes[0]).toMatchObject({ id: 2, field: "System.Tags", value: "" });
    expect(writes[0]?.comment).toBeUndefined();
  });

  it("keeps the tags it is not clearing when the item wears more than one", async () => {
    const { root, writes } = await renderFlaggedBoard(["Blocked", "Needs review"]);

    markerCommand(root, "Clear Blocked (internal)").click();
    await settleWrites();

    expect(writes[0]).toMatchObject({ field: "System.Tags", value: "Needs review" });
  });

  it("leaves the flag inert, saying why, when the team configured no tag for it", async () => {
    const { root } = await renderFlaggedBoard([], {
      markerTags: () => ({
        blocked: { tag: "", commentTag: "" },
        blockedByOtherTeam: { tag: "Blocked by another team", commentTag: "" },
        interrupt: { tag: "", commentTag: "" },
      }),
    });

    const command = markerCommand(root, "Tag with Blocked (internal)");
    expect(command.disabled).toBe(true);
    expect(command.title).toContain("Marker tags");
  });

  it("writes the bare comment when the team configured no comment token", async () => {
    const { root, writes } = await renderFlaggedBoard([], {
      markerTags: () => ({
        blocked: { tag: "Blocked", commentTag: "" },
        blockedByOtherTeam: { tag: "Blocked by another team", commentTag: "" },
        interrupt: { tag: "", commentTag: "" },
      }),
    });

    markerCommand(root, "Tag with Blocked (internal)").click();
    const { input, save } = editorIn(root);
    input.value = "Waiting on the API.";
    save.click();
    await settleWrites();

    expect(writes[0]?.comment).toBe("Waiting on the API.");
  });
});

describe("ProjectTrackingView - the marker filter pills", () => {
  it("offers no pill while nothing on the board is flagged", async () => {
    const { root } = await renderFlaggedBoard([]);

    expect(filterMarkerPills(root)).toEqual([]);
  });

  it("offers a pill the moment any item carries that tag", async () => {
    const { root } = await renderFlaggedBoard(["Blocked"]);

    expect(filterMarkerPills(root).map((pill) => pill.textContent)).toEqual(["Blocked (internal)"]);
  });

  it("narrows the board to the flagged item when its pill is lit", async () => {
    const { root } = await renderFlaggedBoard(["Blocked"]);
    expect(rowTitles(root)).toEqual(["User Authentication", "Data Migration"]);

    filterMarkerPills(root)[0]!.click();

    expect(rowTitles(root)).toEqual(["User Authentication"]);
  });

  it("ANDs the marker group with the crew-tag group rather than widening it", async () => {
    const { root } = await renderFlaggedBoard(["Blocked"]);

    filterMarkerPills(root)[0]!.click();
    // The flagged Feature is unassigned, so it wears no crew tag; lighting the untagged bucket must
    // not drag the unflagged Feature back in.
    const untagged = root.querySelector<HTMLButtonElement>(
      ".awesomeado-tracking__filters .awesomeado-tag-pill",
    );
    untagged?.click();

    expect(rowTitles(root)).toEqual(["User Authentication"]);
  });

  it("drops a selection whose pill is gone once the item is no longer flagged", async () => {
    const { root } = await renderFlaggedBoard(["Blocked"]);

    filterMarkerPills(root)[0]!.click();
    markerCommand(root, "Clear Blocked (internal)").click();
    await settleWrites();

    // The pill it was lit on no longer exists, so the board is not left narrowed to nothing.
    expect(filterMarkerPills(root)).toEqual([]);
    expect(rowTitles(root)).toEqual(["User Authentication", "Data Migration"]);
  });
});

describe("ProjectTrackingView - when a flag write is rejected", () => {
  it("keeps showing a flag whose removal was refused", async () => {
    const { root } = await renderFlaggedBoard(["Blocked"], {
      writeField: async () => ({ ok: false, error: "HTTP 412" }),
    });

    markerCommand(root, "Clear Blocked (internal)").click();
    await settleWrites();

    expect(filterMarkerPills(root).map((pill) => pill.textContent)).toEqual(["Blocked (internal)"]);
  });
});
