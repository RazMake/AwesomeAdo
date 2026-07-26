import { describe, expect, it } from "vitest";

import type { FeatureCrewAssignee } from "../../../common/ado/FeatureCrew";
import type { FeatureCrewReconcileRequest } from "../../../common/ado/IFeatureCrewWriter";
import type { WorkItemFieldWriteRequest } from "../../../common/ado/IWorkItemFieldWriter";
import type {
  TrackedUser,
  TrackedWorkItem,
  TypeCatalogEntry,
} from "../../../common/ado/TrackedWorkItem";
import type {
  EnhancedViewContext,
  EnhancedViewServices,
} from "../../../common/view-common/EnhancedView";

import { projectTrackingView } from "./ProjectTrackingView";

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
    getBoardColumns: () => ["Queue", "Active", "Waiting", "Done", "Removed"],
    loadSprintWindow: async () => ({
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
    }),
    now: () => new Date("2026-07-24T12:00:00Z"),
    logger: {
      info: (message: string) => {
        logCalls.push({ level: "info", message });
      },
      error: (message: string, err?: unknown) => {
        logCalls.push({ level: "error", message: String(err) });
      },
    },
    writeField: async () => ({ ok: true, rev: 1 }),
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

describe("ProjectTrackingView — expand & collapse", () => {
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
    expect(firstChip?.style.background.replace(/\s/g, "")).toContain("rgba(0,120,212,0.2)");
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

    expect(writeFieldCalls.length).toBeGreaterThan(0);
    const firstCall = writeFieldCalls[0];
    // The first badge is the Feature (id 2, rev 2, ADO State "Active"); its only alternative Status
    // is "Done", whose primary ADO State is "Closed".
    expect(firstCall?.id).toBe(2);
    expect(firstCall?.rev).toBe(2);
    expect(firstCall?.field).toBe("System.State");
    expect(firstCall?.value).toBe("Closed");
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
    expect(firstBadge.style.background.replace(/\s/g, "")).toContain("rgba(16,124,16,0.2)");
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
    // Self-contained grey guide color so it stays visible under "Follow ADO".
    expect(style).toMatch(/rgba\(128,\s*128,\s*128,\s*0\.45\)/);
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
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(requests).toHaveLength(2);
    expect(requests[1]?.assignees.map((a) => a.alias)).toContain("dave");
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

    const panel = root.querySelector(".awesomeado-tag-filter");
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

describe("ProjectTrackingView — tag filtering", () => {
  it("filters the tree to people wearing a selected tag when its pill is clicked", async () => {
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

    // Turn the sprint filter OFF so every item is a candidate; then all three descendants show.
    const toggle = root.querySelector(".awesomeado-sprint-picker__button") as HTMLButtonElement;
    toggle.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await Promise.resolve();
    expect(root.querySelectorAll(".awesomeado-tracking__row").length).toBe(3);

    // Click the "Platform" filter pill: only Bob's feature (Platform) survives; the untagged story
    // and the unassigned feature drop out.
    const platformPill = [
      ...root.querySelectorAll<HTMLButtonElement>(".awesomeado-tag-filter .awesomeado-tag-pill"),
    ].find((p) => p.textContent === "Platform");
    expect(platformPill).toBeTruthy();
    platformPill?.click();
    await Promise.resolve();

    const rows = root.querySelectorAll(".awesomeado-tracking__row");
    expect(rows.length).toBe(1);
    expect(rows[0]?.textContent).toContain("User Authentication");
  });

  it("narrows to untagged people when the ?? filter pill is clicked", async () => {
    const doc = document;

    const epic = createFixtureTree();
    const services = createFakeServices({
      loadTree: async () => ({ isTreeQuery: true, roots: [epic], error: null }),
      featureCrew: {
        reconcile: async () => ({
          ok: true,
          changed: false,
          members: [
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

    const toggle = root.querySelector(".awesomeado-sprint-picker__button") as HTMLButtonElement;
    toggle.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    await Promise.resolve();

    // The "??" bucket catches assigned-but-untagged people (Carol on the Login UI story). Her
    // ancestor feature stays so she is not orphaned; the unassigned Data Migration feature drops out.
    const untaggedPill = [
      ...root.querySelectorAll<HTMLButtonElement>(".awesomeado-tag-filter .awesomeado-tag-pill"),
    ].find((p) => p.textContent === "??");
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
  { name: "Epic", color: "ff6b6b", icon: "epic.svg", etaField: null, columns: [] },
  { name: "Feature", color: "6bcf7f", icon: "feature.svg", etaField: null, columns: [] },
  { name: "Story", color: "4fc3f7", icon: "story.svg", etaField: null, columns: [] },
  {
    name: "Task",
    color: "F2CB1D",
    icon: "https://ado/task.svg",
    etaField: "Custom.TaskETA",
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
    assignedTo: null,
    iterationPath: "Project\\Sprint 1",
    sprintName: "Sprint 1",
    createdDate: "2026-01-10T08:00:00Z",
    createdBy: null,
    changedDate: "2026-01-10T08:00:00Z",
    changedBy: null,
    description: "",
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

  it("summarizes only the children the active sprint filter leaves visible", async () => {
    const root = await renderDeepBoard();

    // Filter defaults ON at Sprint 1, so the Sprint 2 Task drops out of the rollup entirely.
    expect(rollupBadgeOf(root).textContent).toBe("1 / 2");
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
    expect(styleTheForm.querySelector<HTMLImageElement>(".awesomeado-child-items__icon")?.src).toBe(
      "https://ado/task.svg",
    );
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
});
