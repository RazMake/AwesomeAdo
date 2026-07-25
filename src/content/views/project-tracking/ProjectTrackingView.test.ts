import { describe, expect, it } from "vitest";

import type { FeatureCrewAssignee } from "../../../common/ado/FeatureCrew";
import type { FeatureCrewReconcileRequest } from "../../../common/ado/IFeatureCrewWriter";
import type { TrackedUser, TrackedWorkItem } from "../../../common/ado/TrackedWorkItem";
import type {
  EnhancedViewContext,
  EnhancedViewServices,
} from "../../../common/view-common/EnhancedView";

import { collectSprintsFromTree, projectTrackingView } from "./ProjectTrackingView";

/**
 * Creates a fake EnhancedViewServices for testing with controlled return values.
 */
function createFakeServices(overrides?: Partial<EnhancedViewServices>): EnhancedViewServices {
  const logCalls: Array<{ level: string; message: string }> = [];
  return {
    loadTree: async () => ({
      isTreeQuery: true,
      roots: [],
      error: null,
    }),
    featureCrew: {
      reconcile: async () => ({ ok: true, changed: false }),
    },
    userDirectory: {
      search: async () => [],
      resolve: async () => null,
    },
    getTypes: () => [
      {
        name: "Epic",
        color: "ff6b6b",
        icon: "epic.svg",
        etaField: "Custom.EpicETA",
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
        columns: [
          { column: "Active", states: ["Active", "New"] },
          { column: "Done", states: ["Closed"] },
        ],
      },
    ],
    getSprints: () => [
      { path: "Project\\Sprint 1", name: "Sprint 1" },
      { path: "Project\\Sprint 2", name: "Sprint 2" },
    ],
    getBoardColumns: () => ["Queue", "Active", "Waiting", "Done", "Removed"],
    now: () => new Date("2026-07-24T12:00:00Z"),
    logger: {
      info: (message: string) => {
        logCalls.push({ level: "info", message });
      },
      error: (message: string, err?: unknown) => {
        logCalls.push({ level: "error", message: String(err) });
      },
    },
    writeState: async () => ({ ok: true, rev: 1 }),
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
    assignedTo: alice,
    iterationPath: "Project\\Sprint 1",
    sprintName: "Sprint 1",
    createdDate: "2026-01-10T08:00:00Z",
    createdBy: alice,
    changedDate: "2026-07-20T14:30:00Z",
    changedBy: bob,
    description: "Modernize the platform infrastructure.",
    eta: "2026-12-31T00:00:00Z",
    children: [
      {
        id: 2,
        rev: 2,
        type: "Feature",
        title: "User Authentication",
        state: "Active",
        assignedTo: bob,
        iterationPath: "Project\\Sprint 1",
        sprintName: "Sprint 1",
        createdDate: "2026-01-15T09:00:00Z",
        createdBy: bob,
        changedDate: "2026-07-22T10:15:00Z",
        changedBy: carol,
        description: "Implement OAuth2 authentication.",
        eta: "2026-08-15T00:00:00Z",
        children: [
          {
            id: 3,
            rev: 1,
            type: "Story",
            title: "Login UI",
            state: "New",
            assignedTo: carol,
            iterationPath: "Project\\Sprint 2",
            sprintName: "Sprint 2",
            createdDate: "2026-01-20T10:00:00Z",
            createdBy: carol,
            changedDate: "2026-01-20T10:00:00Z",
            changedBy: carol,
            description: "Design and implement the login screen.",
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
        assignedTo: null,
        iterationPath: "Project\\Sprint 2",
        sprintName: "Sprint 2",
        createdDate: "2026-01-18T11:00:00Z",
        createdBy: alice,
        changedDate: "2026-01-18T11:00:00Z",
        changedBy: alice,
        description: "Migrate legacy data to new schema.",
        eta: null,
        children: [],
      },
    ],
  };

  return epic;
}

describe("ProjectTrackingView", () => {
  it("collects distinct tree sprints in first-seen order", () => {
    const tree = createFixtureTree();
    tree.children[1]!.iterationPath = null;
    tree.children[1]!.sprintName = "Backlog";
    tree.children[0]!.children[0]!.iterationPath = null;
    tree.children[0]!.children[0]!.sprintName = "Sprint 2";

    expect(collectSprintsFromTree(tree)).toEqual([
      { path: "Project\\Sprint 1", name: "Sprint 1" },
      { path: "Sprint 2", name: "Sprint 2" },
      { path: "Backlog", name: "Backlog" },
    ]);
  });

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

  it("should toggle twisty to collapse and expand children", async () => {
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

    const twisty = root.querySelector(".awesomeado-tracking__twisty") as HTMLButtonElement;
    expect(twisty).toBeTruthy();
    expect(twisty.getAttribute("aria-expanded")).toBe("true");
    expect(twisty.textContent).toBe("▼\uFE0E");

    twisty.click();
    expect(twisty.getAttribute("aria-expanded")).toBe("false");
    expect(twisty.textContent).toBe("▶\uFE0E");

    const childrenContainer = twisty
      .closest(".awesomeado-tracking__row")
      ?.parentElement?.querySelector(".awesomeado-tracking__children") as HTMLElement;
    expect(childrenContainer.style.display).toBe("none");

    twisty.click();
    expect(twisty.getAttribute("aria-expanded")).toBe("true");
    expect(childrenContainer.style.display).toBe("block");
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
    });
  });

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
    expect(meta?.textContent).toContain("Created:");
    expect(meta?.textContent).toContain("Bob Jones");
    expect(meta?.textContent).toContain("Last Modified:");
    expect(meta?.textContent).toContain("Carol White");
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
  });

  it("should call writeState when status badge is changed", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const writeStateCalls: Array<{ id: number; rev: number; state: string }> = [];
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
      writeState: async (request) => {
        writeStateCalls.push(request);
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

    expect(writeStateCalls.length).toBeGreaterThan(0);
    const firstCall = writeStateCalls[0];
    expect(firstCall?.id).toBeDefined();
    expect(firstCall?.rev).toBeDefined();
    expect(firstCall?.state).toBeDefined();
  });

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
    const writeStateCalls: Array<{ id: number; rev: number; state: string }> = [];
    const services = createFakeServices({
      loadTree: async () => ({
        isTreeQuery: true,
        roots: [epic],
        error: null,
      }),
      writeState: async (request) => {
        writeStateCalls.push(request);
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
    expect(writeStateCalls[0]?.state).toBe("Closed");
    // After the write commits, the badge shows the new Status label ("Done").
    expect(firstBadge.childNodes[0]?.textContent).toBe("Done");
  });

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
      getSprints: () => [],
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
    // Self-contained grey guide color so it stays visible under "Follow ADO".
    expect(style).toMatch(/rgba\(128,\s*128,\s*128,\s*0\.45\)/);
  });

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

    const imgs = root.querySelectorAll("img.awesomeado-tracking__item-title, img");
    // Only avatars should be present, not from the title
    imgs.forEach((img) => {
      expect(img.className).toContain("awesomeado-assigned__avatar");
    });

    const title = root.querySelector(".awesomeado-tracking__title");
    expect(title?.textContent).toBe('<img src="x" onerror="alert(1)">');
  });

  it("should not create img element when description contains <img>", async () => {
    const doc = document;

    const epic = createFixtureTree();
    // The epic is no longer a tree row; put the payload on the first visible child instead.
    epic.children[0]!.description = '<img src="x" onerror="alert(1)">';

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

    const descText = root.querySelector(".awesomeado-tracking__desc-text");
    expect(descText?.textContent).toBe('<img src="x" onerror="alert(1)">');

    const imgs = root.querySelectorAll("img");
    imgs.forEach((img) => {
      // Ensure no img was created from the description text
      expect(img.closest(".awesomeado-tracking__desc-text")).toBeFalsy();
    });
  });

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

  it("should handle missing createdBy with Unknown", async () => {
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
    expect(meta?.textContent).toContain("by Unknown");
  });

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
    await Promise.resolve();
    await Promise.resolve();

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
    await Promise.resolve();
    await Promise.resolve();

    expect(requests).toHaveLength(1);

    // Drive an inline assignee pick by opening the TechLead picker and choosing the searched user.
    const nameButton = root.querySelector(".awesomeado-assigned__name") as HTMLButtonElement;
    nameButton.click();
    const searchInput = root.querySelector(".awesomeado-assigned__search") as HTMLInputElement;
    searchInput.value = "dave";
    searchInput.dispatchEvent(new Event("input"));
    await Promise.resolve();
    await Promise.resolve();

    const option = root.querySelector(".awesomeado-assigned__result button") as HTMLButtonElement;
    option.click();
    await Promise.resolve();

    expect(requests).toHaveLength(2);
    expect(requests[1]?.assignees.map((a) => a.alias)).toContain("dave");
  });

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
