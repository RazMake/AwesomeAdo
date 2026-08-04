import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type {
  EnhancedViewContext,
  EnhancedViewServices,
} from "../../../common/view-common/EnhancedView";

import { projectsView } from "./ProjectsView";

const TYPES: TypeCatalogEntry[] = [
  {
    name: "Epic",
    color: "ff6b6b",
    icon: "epic.svg",
    etaField: null,
    children: ["Story"],
    columns: [
      { column: "Active", states: ["Active", "New"] },
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
      { column: "Active", states: ["Active"] },
      { column: "Done", states: ["Closed"] },
    ],
  },
];

/** A tracked item carrying only what the board paints; each test overrides what it is about. */
function item(overrides: Partial<TrackedWorkItem> & { id: number }): TrackedWorkItem {
  return {
    rev: 1,
    type: "Epic",
    title: `Item ${overrides.id}`,
    state: "Active",
    priority: null,
    assignedTo: null,
    areaPath: null,
    iterationPath: null,
    sprintName: null,
    createdDate: "2026-07-01T00:00:00Z",
    createdBy: null,
    changedDate: "2026-07-01T00:00:00Z",
    changedBy: null,
    stateChangeDate: "2026-07-01T00:00:00Z",
    description: "",
    noteCount: 0,
    tags: [],
    importance: overrides.id,
    eta: null,
    children: [],
    ...overrides,
  };
}

/**
 * The fixture query: two projects that both carry the query's own `Catalog` tag, the first with a
 * tagged story and a grandchild. Module-scope because it never varies; a test that needs another
 * shape passes its own roots.
 */
const FIXTURE_ROOTS: TrackedWorkItem[] = [
  item({
    id: 1,
    title: "Payments",
    tags: ["Catalog", "Platform"],
    children: [
      item({
        id: 2,
        type: "Story",
        title: "Card capture",
        tags: ["Api"],
        assignedTo: { displayName: "Alice", uniqueName: null, imageUrl: null },
        children: [item({ id: 3, type: "Story", title: "Retry on decline" })],
      }),
    ],
  }),
  item({
    id: 4,
    title: "Reporting",
    state: "Closed",
    tags: ["Catalog"],
    children: [item({ id: 5, type: "Story", title: "Weekly export", tags: ["Docs"] })],
  }),
];

/**
 * A fresh copy of the fixture for one board.
 *
 * The catalog now EDITS the items it loaded — a tag write, a completion, a re-rank all fold their
 * result back onto the tree in place — so handing every test the same objects would let one test's
 * successful write decide what the next one starts from.
 */
function fixtureRoots(): TrackedWorkItem[] {
  return structuredClone(FIXTURE_ROOTS);
}

/** Only the services this view actually reaches for; anything else would be unreachable state. */
function createServices(overrides?: Partial<EnhancedViewServices>): EnhancedViewServices {
  return {
    loadTree: async () => ({ isTreeQuery: true, roots: fixtureRoots(), error: null }),
    getTypes: () => TYPES,
    logger: { info: () => undefined, error: () => undefined },
    openDiagnosticsLog: () => undefined,
    // Nothing in the fixtures owns a tracking query, so the default answers "none linked"; the tests
    // that exercise the lifecycle commands override these with recorders.
    projectQueries: {
      readLinks: async () => ({ links: [], error: null }),
      create: async () => ({ ok: true, queryId: "query-2", rev: 2 }),
      remove: async () => ({ ok: true, rev: 3 }),
    },
    createWorkItem: { create: async () => ({ ok: true, id: 900, rev: 1 }) },
    queryBindings: { bind: async () => undefined, unbind: async () => undefined },
    writeField: async () => ({ ok: true, rev: 2 }),
    reorderItem: async () => ({ ok: true }),
    currentTeam: () => "team-guid",
    ...overrides,
  } as EnhancedViewServices;
}

function createContext(overrides?: Partial<EnhancedViewContext>): EnhancedViewContext {
  return {
    doc: document,
    queryId: "query-1",
    properties: {},
    services: createServices(),
    ...overrides,
  };
}

/** Mount the board and let its single load settle, which is what puts rows on screen. */
async function renderBoard(context: EnhancedViewContext = createContext()): Promise<HTMLElement> {
  const root = projectsView.render(context);
  document.body.append(root);
  await vi.waitFor(() => expect(root.querySelector(".awesomeado-projects__header")).not.toBeNull());
  return root;
}

const titles = (root: HTMLElement): (string | null)[] =>
  [...root.querySelectorAll(".awesomeado-projects__title")].map((title) => title.textContent);

const clickTagOption = (root: HTMLElement, label: string): void => {
  root.querySelector<HTMLButtonElement>(".awesomeado-tag-filter__trigger")!.click();
  const rows = [...root.querySelectorAll<HTMLElement>(".awesomeado-tag-filter__option")];
  rows
    .find((row) => row.textContent === label)!
    .querySelector("input")!
    .click();
};

afterEach(() => {
  document.body.replaceChildren();
});

describe("projectsView - shell", () => {
  it("says so rather than rendering an empty board when data services are unavailable", () => {
    const root = projectsView.render({ doc: document, queryId: "q", properties: {} });

    expect(root.querySelector(".awesomeado-view__title")?.textContent).toBe(
      "All Projects Catalog View",
    );
    expect(root.querySelector(".awesomeado-view__message")?.textContent).toBe(
      "Data services are unavailable.",
    );
  });

  it("shows the view's own title while the query is still loading", () => {
    const root = projectsView.render(createContext());

    expect(root.querySelector(".awesomeado-view__title")?.textContent).toBe(
      "All Projects Catalog View",
    );
    expect(root.querySelector(".awesomeado-view__message")?.textContent).toBe(
      "Loading projects\u2026",
    );
  });

  it("keeps a failed load off the board and records the cause", async () => {
    const error = vi.fn();
    const context = createContext({
      services: createServices({
        loadTree: async () => ({ isTreeQuery: true, roots: [], error: "boom" }),
        logger: { info: () => undefined, error },
      }),
    });
    const root = projectsView.render(context);

    await vi.waitFor(() =>
      expect(root.querySelector(".awesomeado-view__message")?.textContent).toBe(
        "Could not load this query.",
      ),
    );
    expect(error).toHaveBeenCalledWith(
      "All Projects Catalog View could not load the query",
      expect.any(Error),
    );
  });

  it("explains an empty query instead of leaving a blank surface", async () => {
    const root = await renderBoard(
      createContext({
        services: createServices({
          loadTree: async () => ({ isTreeQuery: true, roots: [], error: null }),
        }),
      }),
    );

    expect(root.querySelector(".awesomeado-empty-state__message")?.textContent).toBe(
      "This query returned no work items.",
    );
  });
});

describe("projectsView - project list", () => {
  it("lists the query's top-level items as projects, closed, with their children hidden", async () => {
    const root = await renderBoard();

    expect(titles(root)).toEqual(["Payments", "Reporting"]);
    expect(root.querySelectorAll(".awesomeado-projects__children")).toHaveLength(0);
  });

  it("shows each project's own tags and how many children it has, and nothing else", async () => {
    const root = await renderBoard();
    const payments = root.querySelector<HTMLElement>(".awesomeado-projects__item")!;

    expect(payments.querySelector(".awesomeado-projects__child-count")?.textContent).toBe("1");
    expect(
      [...payments.querySelectorAll(".awesomeado-projects__tags span")].map((el) => el.textContent),
    ).toEqual(["Platform"]);
    expect(root.querySelector(".awesomeado-status__badge")).toBeNull();
    expect(root.textContent).not.toContain("Alice");
  });

  it("puts the child count immediately after the title it counts for", async () => {
    const root = await renderBoard();
    const line = root.querySelector<HTMLElement>(".awesomeado-projects__row")!;
    const title = line.querySelector(".awesomeado-projects__title")!;

    expect(title.nextElementSibling?.className).toBe("awesomeado-projects__child-count");
  });

  it("leaves a childless project without a count at all", async () => {
    const root = await renderBoard(
      createContext({
        services: createServices({
          loadTree: async () => ({
            isTreeQuery: true,
            roots: [item({ id: 1, title: "Payments" })],
            error: null,
          }),
        }),
      }),
    );

    expect(root.querySelector(".awesomeado-projects__child-count")).toBeNull();
  });

  it("orders projects by the binding's ordering policy", async () => {
    const root = await renderBoard(createContext({ properties: { orderingPolicy: "title" } }));

    expect(titles(root)).toEqual(["Payments", "Reporting"]);
  });
});

describe("projectsView - ordering picker", () => {
  const UNSORTED_ROOTS = [
    item({ id: 1, title: "Zebra", importance: 1 }),
    item({ id: 2, title: "Apple", importance: 2 }),
  ];

  async function renderUnsortedBoard(): Promise<HTMLElement> {
    return renderBoard(
      createContext({
        services: createServices({
          loadTree: async () => ({ isTreeQuery: true, roots: UNSORTED_ROOTS, error: null }),
        }),
      }),
    );
  }

  it("names the binding's ordering in the header's sort glyph", async () => {
    const root = await renderUnsortedBoard();

    expect(
      root.querySelector(".awesomeado-projects__header-corner .awesomeado-ordering"),
    ).not.toBeNull();
    expect(root.querySelector<HTMLElement>(".awesomeado-ordering__trigger")!.title).toBe(
      "Ordering: By Importance (most important first)",
    );
  });

  it("re-orders the board from the items already loaded when another policy is picked", async () => {
    const root = await renderUnsortedBoard();
    expect(titles(root)).toEqual(["Zebra", "Apple"]);

    root.querySelector<HTMLButtonElement>(".awesomeado-ordering__trigger")!.click();
    root
      .querySelector<HTMLButtonElement>(".awesomeado-ordering__option[data-policy='title']")!
      .click();

    expect(titles(root)).toEqual(["Apple", "Zebra"]);
  });
});

describe("projectsView - expanding", () => {
  it("reveals a project's children when its twisty is pressed, and hides them again", async () => {
    const root = await renderBoard();
    const twisty = root.querySelector<HTMLButtonElement>(".awesomeado-projects__twisty")!;

    twisty.click();
    expect(titles(root)).toEqual(["Payments", "Card capture", "Reporting"]);

    root.querySelector<HTMLButtonElement>(".awesomeado-projects__twisty")!.click();
    expect(titles(root)).toEqual(["Payments", "Reporting"]);
  });

  it("opens every level at once from the header, and closes them all again", async () => {
    const root = await renderBoard();

    root.querySelector<HTMLButtonElement>(".awesomeado-projects__expand-all")!.click();
    expect(titles(root)).toEqual([
      "Payments",
      "Card capture",
      "Retry on decline",
      "Reporting",
      "Weekly export",
    ]);

    root.querySelector<HTMLButtonElement>(".awesomeado-projects__collapse-all")!.click();
    expect(titles(root)).toEqual(["Payments", "Reporting"]);
  });

  it("gives a childless project no twisty to press", async () => {
    const root = await renderBoard();

    root.querySelector<HTMLButtonElement>(".awesomeado-projects__expand-all")!.click();
    const leaf = [...root.querySelectorAll<HTMLElement>(".awesomeado-projects__item")].find(
      (candidate) => candidate.dataset.itemId === "3",
    )!;

    expect(leaf.querySelector(".awesomeado-projects__twisty")).toBeNull();
    expect(leaf.querySelector(".awesomeado-projects__twisty-spacer")).not.toBeNull();
  });
});

describe("projectsView - tag filter", () => {
  it("offers every tag worn anywhere in the tree, not just the projects' own", async () => {
    const root = await renderBoard();
    root.querySelector<HTMLButtonElement>(".awesomeado-tag-filter__trigger")!.click();

    expect(
      [...root.querySelectorAll(".awesomeado-tag-filter__option")].map((row) => row.textContent),
    ).toEqual(["Api", "Docs", "Platform"]);
  });

  it("shows the tag every project carries nowhere, because it is the query's own condition", async () => {
    const root = await renderBoard();

    expect(
      [...root.querySelectorAll(".awesomeado-projects__tags span")].map((el) => el.textContent),
    ).toEqual(["Platform"]);

    root.querySelector<HTMLButtonElement>(".awesomeado-tag-filter__trigger")!.click();
    expect(
      [...root.querySelectorAll(".awesomeado-tag-filter__option")].map((row) => row.textContent),
    ).not.toContain("Catalog");
  });

  it("narrows the offered tags as the reader types in the quick search", async () => {
    const root = await renderBoard();
    root.querySelector<HTMLButtonElement>(".awesomeado-tag-filter__trigger")!.click();
    const search = root.querySelector<HTMLInputElement>(".awesomeado-tag-filter__search")!;

    search.value = "plat";
    search.dispatchEvent(new Event("input"));

    const shown = [...root.querySelectorAll<HTMLElement>(".awesomeado-tag-filter__option")].filter(
      (row) => row.style.display !== "none",
    );
    expect(shown.map((row) => row.textContent)).toEqual(["Platform"]);
  });

  it("keeps a project whose only matching work is buried beneath it", async () => {
    const root = await renderBoard();

    clickTagOption(root, "Api");

    expect(titles(root)).toEqual(["Payments"]);
  });

  it("widens the board when a second tag is selected", async () => {
    const root = await renderBoard();

    clickTagOption(root, "Api");
    expect(titles(root)).toEqual(["Payments"]);

    clickTagOption(root, "Docs");
    expect(titles(root)).toEqual(["Payments", "Reporting"]);
  });

  it("records which tags are in force and how much of the query they leave", async () => {
    const info = vi.fn();
    const root = await renderBoard(
      createContext({ services: createServices({ logger: { info, error: () => undefined } }) }),
    );

    clickTagOption(root, "Api");

    expect(info).toHaveBeenCalledWith(
      "All Projects Catalog View tag filter set to [Api]: showing 1 of 2 project(s)",
    );
  });

  it("drops a selected tag the refreshed query no longer wears, and says so", async () => {
    const info = vi.fn();
    const loadTree = vi
      .fn()
      .mockResolvedValueOnce({ isTreeQuery: true, roots: FIXTURE_ROOTS, error: null })
      .mockResolvedValue({
        isTreeQuery: true,
        roots: [item({ id: 1, title: "Payments" }), item({ id: 4, title: "Reporting" })],
        error: null,
      });
    const root = await renderBoard(
      createContext({
        services: createServices({ loadTree, logger: { info, error: () => undefined } }),
      }),
    );
    clickTagOption(root, "Api");

    root.querySelector<HTMLButtonElement>(".awesomeado-projects__refresh")!.click();

    await vi.waitFor(() => expect(titles(root)).toEqual(["Payments", "Reporting"]));
    expect(info).toHaveBeenCalledWith(
      "All Projects Catalog View dropped tag filter(s) no longer present in the query: api",
    );
  });
});

describe("projectsView - refresh", () => {
  it("re-reads the query in place and keeps the rows the reader had opened", async () => {
    const loadTree = vi
      .fn()
      .mockResolvedValueOnce({ isTreeQuery: true, roots: FIXTURE_ROOTS, error: null })
      .mockResolvedValue({
        isTreeQuery: true,
        roots: [item({ id: 1, title: "Payments (renamed)", children: [item({ id: 2 })] })],
        error: null,
      });
    const root = await renderBoard(createContext({ services: createServices({ loadTree }) }));
    root.querySelector<HTMLButtonElement>(".awesomeado-projects__twisty")!.click();

    root.querySelector<HTMLButtonElement>(".awesomeado-projects__refresh")!.click();

    await vi.waitFor(() => expect(titles(root)[0]).toBe("Payments (renamed)"));
    expect(titles(root)).toHaveLength(2);
    expect(loadTree).toHaveBeenCalledTimes(2);
  });

  it("keeps the older board when a refresh fails, then hands over the recorded cause", async () => {
    const openDiagnosticsLog = vi.fn();
    const loadTree = vi
      .fn()
      .mockResolvedValueOnce({ isTreeQuery: true, roots: FIXTURE_ROOTS, error: null })
      .mockRejectedValue(new Error("offline"));
    const root = await renderBoard(
      createContext({ services: createServices({ loadTree, openDiagnosticsLog }) }),
    );

    root.querySelector<HTMLButtonElement>(".awesomeado-projects__refresh")!.click();
    await vi.waitFor(() =>
      expect(
        root.querySelector<HTMLButtonElement>(".awesomeado-projects__refresh")!.title,
      ).toContain("older data"),
    );
    expect(titles(root)).toEqual(["Payments", "Reporting"]);

    root.querySelector<HTMLButtonElement>(".awesomeado-projects__refresh")!.click();
    expect(openDiagnosticsLog).toHaveBeenCalledOnce();
    expect(loadTree).toHaveBeenCalledTimes(2);
  });
});

/** Right-click `target` and return the commands the shared menu put on screen. */
function openMenu(target: Element): HTMLButtonElement[] {
  target.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 20, clientY: 30 }),
  );
  return [...document.querySelectorAll<HTMLButtonElement>(".awesomeado-item-menu__command")];
}

/** A command's label, without the chevron the menu appends to anything carrying a submenu. */
const commandLabel = (row: HTMLButtonElement): string =>
  (row.textContent ?? "").replace("\u203A", "").trim();

function menuCommand(label: string): HTMLButtonElement {
  const command = [
    ...document.querySelectorAll<HTMLButtonElement>(".awesomeado-item-menu__command"),
  ].find((row) => commandLabel(row) === label);
  if (command === undefined) throw new Error(`Missing menu command "${label}".`);
  return command;
}

/** Open a command's flyout the way a pointer does, and return what it offers. */
function openSubmenu(label: string): string[] {
  const host = menuCommand(label).closest(".awesomeado-item-menu__submenu-host");
  host?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }));
  return [
    ...(host?.querySelectorAll<HTMLButtonElement>(
      ".awesomeado-item-menu__submenu .awesomeado-item-menu__command",
    ) ?? []),
  ].map(commandLabel);
}

/** Activate one entry of an already-open flyout. */
function clickSubmenuCommand(parent: string, label: string): void {
  const host = menuCommand(parent).closest(".awesomeado-item-menu__submenu-host");
  const entry = [
    ...(host?.querySelectorAll<HTMLButtonElement>(
      ".awesomeado-item-menu__submenu .awesomeado-item-menu__command",
    ) ?? []),
  ].find((row) => commandLabel(row) === label);
  if (entry === undefined) throw new Error(`Missing submenu command "${label}".`);
  entry.click();
}

const projectTitle = (root: HTMLElement, name: string): HTMLElement =>
  [...root.querySelectorAll<HTMLElement>(".awesomeado-projects__title")].find(
    (title) => title.textContent === name,
  )!;

describe("projectsView - catalog menu", () => {
  it("advertises the title menu with the same cursor the Sprint view uses", async () => {
    const root = await renderBoard();

    expect(root.querySelector<HTMLElement>(".awesomeado-view__title")!.style.cursor).toBe(
      "context-menu",
    );
  });

  it("offers the query URL and adding a project, and nothing that acts on a work item", async () => {
    const root = await renderBoard();

    const labels = openMenu(root.querySelector(".awesomeado-view__title")!).map((row) =>
      row.textContent?.trim(),
    );

    expect(labels).toEqual(["Copy ADO Url", "Add new project"]);
  });

  it("opens the title box above the list, stating what the project will be born with", async () => {
    const root = await renderBoard();

    openMenu(root.querySelector(".awesomeado-view__title")!);
    menuCommand("Add new project").click();

    const row = root.querySelector(".awesomeado-projects__new")!;
    // The tag is derived from the query's own condition, which is what makes the query return it.
    expect(row.textContent).toContain("tagged Catalog");
    expect(row.compareDocumentPosition(root.querySelector(".awesomeado-projects__list")!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("derives the catalog tag from WIQL even when the query returns only one project", async () => {
    const root = await renderBoard(
      createContext({
        services: createServices({
          loadTree: async () => ({
            isTreeQuery: true,
            roots: [item({ id: 1, title: "Payments", tags: ["Catalog", "Platform"] })],
            error: null,
          }),
          loadQueryDefinition: async () => ({
            wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.Tags] CONTAINS 'Catalog'",
            error: null,
          }),
        }),
      }),
    );

    openMenu(root.querySelector(".awesomeado-view__title")!);
    menuCommand("Add new project").click();

    expect(root.querySelector(".awesomeado-projects__new")?.textContent).toContain(
      "tagged Catalog",
    );
    expect(root.querySelector(".awesomeado-projects__tags")?.textContent).toBe("Platform");
  });
});

describe("projectsView - adding a project", () => {
  it("creates the project with the catalog's tag and the binding's area path", async () => {
    const create = vi.fn(async () => ({ ok: true, id: 900, rev: 1 }));
    const loadTree = vi.fn(async () => ({
      isTreeQuery: true,
      roots: FIXTURE_ROOTS,
      error: null,
    }));
    const root = await renderBoard(
      createContext({
        properties: {
          newProjectAreaPath: "Fabrikam\\Core",
          newProjectIterationPath: "Fabrikam",
        },
        services: createServices({ loadTree, createWorkItem: { create } }),
      }),
    );

    openMenu(root.querySelector(".awesomeado-view__title")!);
    menuCommand("Add new project").click();
    const box = root.querySelector<HTMLInputElement>(".awesomeado-projects__new input")!;
    box.value = "Search";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelectorAll<HTMLButtonElement>(".awesomeado-projects__new button")[0]!.click();

    await vi.waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        type: "Epic",
        title: "Search",
        tags: ["Catalog"],
        areaPath: "Fabrikam\\Core",
        iterationPath: "Fabrikam",
      }),
    );
    // Only the query decides what belongs to this catalog, so the board is re-read rather than
    // guessing the new project onto the list.
    await vi.waitFor(() => expect(loadTree).toHaveBeenCalledTimes(2));
  });

  it("prefers the binding's own tags over the ones the query happens to share", async () => {
    const create = vi.fn(async () => ({ ok: true, id: 900, rev: 1 }));
    const root = await renderBoard(
      createContext({
        properties: { newProjectTags: "Initiative, FY26" },
        services: createServices({ createWorkItem: { create } }),
      }),
    );

    openMenu(root.querySelector(".awesomeado-view__title")!);
    menuCommand("Add new project").click();
    const box = root.querySelector<HTMLInputElement>(".awesomeado-projects__new input")!;
    box.value = "Search";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLButtonElement>(".awesomeado-projects__new button")!.click();

    await vi.waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ["Initiative", "FY26"],
          areaPath: null,
          iterationPath: null,
        }),
      ),
    );
  });
});

describe("projectsView - adding a project outcomes", () => {
  it("keeps the box open when Azure DevOps refuses the creation", async () => {
    const create = vi.fn(async () => ({ ok: false, error: "HTTP 403" }));
    const root = await renderBoard(
      createContext({ services: createServices({ createWorkItem: { create } }) }),
    );

    openMenu(root.querySelector(".awesomeado-view__title")!);
    menuCommand("Add new project").click();
    const box = root.querySelector<HTMLInputElement>(".awesomeado-projects__new input")!;
    box.value = "Search";
    box.dispatchEvent(new Event("input", { bubbles: true }));
    root.querySelector<HTMLButtonElement>(".awesomeado-projects__new button")!.click();

    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce());
    expect(root.querySelector(".awesomeado-projects__new")).not.toBeNull();
  });

  it("abandons the row when the reader cancels", async () => {
    const root = await renderBoard();

    openMenu(root.querySelector(".awesomeado-view__title")!);
    menuCommand("Add new project").click();
    [...root.querySelectorAll<HTMLButtonElement>(".awesomeado-projects__new button")]
      .find((button) => button.textContent === "Cancel")!
      .click();

    expect(root.querySelector(".awesomeado-projects__new")).toBeNull();
  });
});

describe("projectsView - project menu", () => {
  it("offers the shared item commands plus the catalog's own", async () => {
    const root = await renderBoard();

    const labels = openMenu(projectTitle(root, "Payments")).map(commandLabel);

    expect(labels).toEqual([
      "Copy Item ID",
      "Copy ADO Url",
      "Open in ADO",
      "Update title",
      "Update description",
      "View all notes",
      "Add custom tag",
      "Clear custom tag",
      "Create Project Query",
      "Mark completed",
    ]);
  });

  it("leaves the project lifecycle off work that is not a project", async () => {
    const root = await renderBoard();

    root.querySelector<HTMLButtonElement>(".awesomeado-projects__twisty")!.click();
    const labels = openMenu(projectTitle(root, "Card capture")).map(commandLabel);

    expect(labels).not.toContain("Create Project Query");
    expect(labels).not.toContain("Mark completed");
  });

  it("never offers to clear the tag that keeps the project in this catalog", async () => {
    const root = await renderBoard();

    openMenu(projectTitle(root, "Payments"));

    const offered = openSubmenu("Clear custom tag");
    expect(offered).toContain("Platform");
    expect(offered).not.toContain("Catalog");
  });

  it("says a project with no tags of its own has nothing to clear", async () => {
    const root = await renderBoard();

    openMenu(projectTitle(root, "Reporting"));

    expect(menuCommand("Clear custom tag").title).toContain("no tag of its own");
  });

  it("writes a tag picked from the catalog's own vocabulary", async () => {
    const writeField = vi.fn(async () => ({ ok: true, rev: 2 }));
    const root = await renderBoard(createContext({ services: createServices({ writeField }) }));

    openMenu(projectTitle(root, "Reporting"));
    openSubmenu("Add custom tag");
    clickSubmenuCommand("Add custom tag", "Docs");

    await vi.waitFor(() =>
      expect(writeField).toHaveBeenCalledWith(
        expect.objectContaining({ field: "System.Tags", value: "Catalog; Docs" }),
      ),
    );
  });
});

const LINKED_QUERY_ID = "11111111-2222-3333-4444-555555555555";
const LINKED_QUERY_URL = `https://dev.azure.com/contoso/Fabrikam/_queries/query/${LINKED_QUERY_ID}`;

/** A catalog whose first project already owns a tracking query. */
async function renderLinkedBoard(overrides: Partial<EnhancedViewServices> = {}, managed = true) {
  const remove = vi.fn(async () => ({ ok: true, rev: 3 }));
  const unbind = vi.fn(async () => undefined);
  const writeField = vi.fn(async () => ({ ok: true, rev: 2 }));
  const root = await renderBoard(
    createContext({
      services: createServices({
        writeField,
        projectQueries: {
          readLinks: async () => ({
            links: [
              {
                workItemId: 1,
                queryId: LINKED_QUERY_ID,
                url: LINKED_QUERY_URL,
                managed,
              },
            ],
            error: null,
          }),
          create: async () => ({ ok: true }),
          remove,
        },
        queryBindings: { bind: async () => undefined, unbind },
        ...overrides,
      }),
    }),
  );
  return { root, remove, unbind, writeField };
}

/** One answer in the completion confirmation. */
function completionAnswer(label: string): HTMLButtonElement {
  const button = [
    ...document.querySelectorAll<HTMLButtonElement>(".awesomeado-project-complete button"),
  ].find((candidate) => candidate.textContent === label);
  if (button === undefined) throw new Error(`Missing completion answer "${label}".`);
  return button;
}

describe("projectsView - project lifecycle", () => {
  it("disables creating a query for a project that already has one", async () => {
    const { root } = await renderLinkedBoard();

    openMenu(projectTitle(root, "Payments"));

    expect(menuCommand("Create Project Query").disabled).toBe(true);
    expect(menuCommand("Create Project Query").title).toContain("already has a tracking query");
    // A project with no query still gets the offer.
    openMenu(projectTitle(root, "Reporting"));
    expect(menuCommand("Create Project Query").disabled).toBe(false);
  });

  it("creates the query in the catalog's own folder and binds it to Project Tracking", async () => {
    const create = vi.fn(async () => ({
      ok: true,
      queryId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      rev: 5,
    }));
    const bind = vi.fn(async () => undefined);
    const loadTree = vi.fn(async () => ({
      isTreeQuery: true,
      roots: FIXTURE_ROOTS,
      error: null,
      folderPath: [{ label: "Team A", path: "Shared Queries/Team A" }],
    }));
    const root = await renderBoard(
      createContext({
        services: createServices({
          loadTree,
          projectQueries: {
            readLinks: async () => ({ links: [], error: null }),
            create,
            remove: async () => ({ ok: true }),
          },
          queryBindings: { bind, unbind: async () => undefined },
        }),
      }),
    );

    openMenu(projectTitle(root, "Payments"));
    menuCommand("Create Project Query").click();

    await vi.waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        projectId: 1,
        projectTitle: "Payments",
        rev: 1,
        folderPath: "Shared Queries/Team A",
      }),
    );
    await vi.waitFor(() =>
      expect(bind).toHaveBeenCalledWith("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", {
        view: "projectTracking",
        properties: {},
        name: "Payments",
      }),
    );
  });
});

describe("projectsView - project query folder", () => {
  it("creates a project query in the folder configured on the catalog binding", async () => {
    const create = vi.fn(async () => ({ ok: true, queryId: "query-2", rev: 2 }));
    const root = await renderBoard(
      createContext({
        properties: { projectQueryFolder: "Shared Queries/Delivery" },
        services: createServices({
          projectQueries: {
            readLinks: async () => ({ links: [], error: null }),
            create,
            remove: async () => ({ ok: true }),
          },
        }),
      }),
    );

    openMenu(projectTitle(root, "Payments"));
    menuCommand("Create Project Query").click();

    await vi.waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ folderPath: "Shared Queries/Delivery" }),
      ),
    );
  });
});

describe("projectsView - project completion", () => {
  it("completes the project without touching a query when the reader declines", async () => {
    const { root, remove, writeField } = await renderLinkedBoard();

    openMenu(projectTitle(root, "Payments"));
    menuCommand("Mark completed").click();
    completionAnswer("Complete").click();

    await vi.waitFor(() =>
      expect(writeField).toHaveBeenCalledWith(
        expect.objectContaining({ field: "System.State", value: "Closed" }),
      ),
    );
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("projectsView - retiring a project", () => {
  it("unlinks, deletes and unbinds the query when the reader asks for it", async () => {
    const { root, remove, unbind } = await renderLinkedBoard();

    openMenu(projectTitle(root, "Payments"));
    menuCommand("Mark completed").click();
    completionAnswer("Complete and delete query").click();

    await vi.waitFor(() =>
      expect(remove).toHaveBeenCalledWith({
        projectId: 1,
        queryId: LINKED_QUERY_ID,
        rev: 2,
      }),
    );
    // The binding is dropped only once the query is actually gone.
    await vi.waitFor(() => expect(unbind).toHaveBeenCalledWith(LINKED_QUERY_ID));
  });

  it("offers no query cleanup for a project that owns none", async () => {
    const root = await renderBoard();

    openMenu(projectTitle(root, "Payments"));
    menuCommand("Mark completed").click();

    const panel = document.querySelector(".awesomeado-project-complete")!;
    expect(panel.textContent).toContain("no tracking query to clean up");
    expect([...panel.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Complete",
      "Cancel",
    ]);
  });
});

describe("projectsView - a query linked outside this extension", () => {
  it("opens it from the project row, at the address Azure DevOps stores", async () => {
    const { root } = await renderLinkedBoard({}, false);

    const link = root.querySelector<HTMLAnchorElement>(".awesomeado-projects__query-link")!;
    expect(link.tagName).toBe("A");
    expect(link.href).toBe(LINKED_QUERY_URL);
  });

  it("still refuses to create a second query beside it", async () => {
    const { root } = await renderLinkedBoard({}, false);

    openMenu(projectTitle(root, "Payments"));

    expect(menuCommand("Create Project Query").disabled).toBe(true);
  });

  it("never offers to delete a query somebody else saved", async () => {
    const { root, remove } = await renderLinkedBoard({}, false);

    openMenu(projectTitle(root, "Payments"));
    menuCommand("Mark completed").click();

    const panel = document.querySelector(".awesomeado-project-complete")!;
    expect(panel.textContent).toContain("linked outside AwesomeADO");
    expect([...panel.querySelectorAll("button")].map((button) => button.textContent)).toEqual([
      "Complete",
      "Cancel",
    ]);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe("projectsView - unreadable query links", () => {
  /** A catalog whose query-link read was refused, so no project's query can be named. */
  async function renderUnreadableBoard(): Promise<HTMLElement> {
    return renderBoard(
      createContext({
        services: createServices({
          projectQueries: {
            readLinks: async () => ({ links: [], error: "HTTP 403" }),
            create: async () => ({ ok: true, queryId: "query-2", rev: 2 }),
            remove: async () => ({ ok: true, rev: 3 }),
          },
        }),
      }),
    );
  }

  it("never claims there is nothing to clean up when it could not ask", async () => {
    const root = await renderUnreadableBoard();

    openMenu(projectTitle(root, "Payments"));
    menuCommand("Mark completed").click();

    const panel = document.querySelector(".awesomeado-project-complete")!;
    expect(panel.textContent).toContain("could not be asked");
    expect(panel.textContent).not.toContain("no tracking query to clean up");
  });

  it("refuses to create a second query it cannot rule out already existing", async () => {
    const root = await renderUnreadableBoard();

    openMenu(projectTitle(root, "Payments"));

    expect(menuCommand("Create Project Query").disabled).toBe(true);
    expect(menuCommand("Create Project Query").title).toContain("could not be asked");
  });
});

describe("projectsView - reordering projects", () => {
  it("makes a project title a drag handle under the backlog-rank ordering", async () => {
    const root = await renderBoard();

    expect(projectTitle(root, "Payments").draggable).toBe(true);
    expect(projectTitle(root, "Payments").style.cursor).toBe("grab");
  });

  it("leaves titles alone under a derived ordering, which a move would only undo", async () => {
    const root = await renderBoard(createContext({ properties: { orderingPolicy: "title" } }));

    expect(projectTitle(root, "Payments").draggable).toBe(false);
  });

  it("only the projects are draggable, never the work beneath them", async () => {
    const root = await renderBoard();

    root.querySelector<HTMLButtonElement>(".awesomeado-projects__twisty")!.click();

    expect(projectTitle(root, "Card capture").draggable).toBe(false);
  });

  it("re-ranks a dropped project against the team's backlog and repaints from ADO's answer", async () => {
    const reorderItem = vi.fn(async () => ({ ok: true, order: 0, rev: 2 }));
    const root = await renderBoard(createContext({ services: createServices({ reorderItem }) }));

    dragProject(projectTitle(root, "Reporting"), projectTitle(root, "Payments"));

    await vi.waitFor(() =>
      expect(reorderItem).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 4,
          parentId: 0,
          currentParentId: 0,
          previousId: 0,
          nextId: 1,
          siblingIds: [4, 1],
          team: "team-guid",
        }),
      ),
    );
    await vi.waitFor(() => expect(titles(root)).toEqual(["Reporting", "Payments"]));
  });

  it("refuses a move with no configured team rather than ranking against the wrong backlog", async () => {
    const reorderItem = vi.fn(async () => ({ ok: true }));
    const error = vi.fn();
    const root = await renderBoard(
      createContext({
        services: createServices({
          reorderItem,
          currentTeam: () => null,
          logger: { info: () => undefined, error },
        }),
      }),
    );

    dragProject(projectTitle(root, "Reporting"), projectTitle(root, "Payments"));

    expect(reorderItem).not.toHaveBeenCalled();
    expect(error.mock.calls[0]?.[0]).toContain("no team is configured");
  });
});

/** Drag `source`'s title onto the top half of `target`'s row, which is what plans a move above it. */
function dragProject(source: HTMLElement, target: HTMLElement): void {
  const values = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: "none",
    dropEffect: "none",
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? "",
    setDragImage: vi.fn(),
  } as unknown as DataTransfer;
  dispatchDrag(source, "dragstart", dataTransfer, 0);
  const row = target.closest<HTMLElement>(".awesomeado-projects__row")!;
  // jsdom lays nothing out, so the row's midpoint has to be stated for "above" to mean anything.
  row.getBoundingClientRect = () => ({ top: 0, height: 20, bottom: 20 }) as DOMRect;
  dispatchDrag(row, "dragover", dataTransfer, 2);
  dispatchDrag(row, "drop", dataTransfer, 2);
}

function dispatchDrag(
  target: HTMLElement,
  type: string,
  dataTransfer: DataTransfer,
  clientY: number,
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  Object.defineProperty(event, "clientY", { value: clientY });
  target.dispatchEvent(event);
}
