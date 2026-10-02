import { afterEach, describe, expect, it, vi } from "vitest";

import type { WorkItemReorderResult } from "../../../common/ado/IWorkItemReorderWriter";
import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import { normalizeMarkerTags } from "../../../common/settings/ExtensionSettings";
import type {
  EnhancedViewContext,
  EnhancedViewServices,
} from "../../../common/view-common/EnhancedView";

import { consumersView } from "./ConsumersView";

const COLUMNS = [
  { column: "New", states: ["New"] },
  { column: "Active", states: ["Active"] },
  { column: "Done", states: ["Closed"] },
];

const TYPES: TypeCatalogEntry[] = [
  { name: "Group", color: "773b93", icon: "g.svg", etaField: null, columns: COLUMNS },
  { name: "Consumer", color: "ff6b6b", icon: "c.svg", etaField: null, columns: COLUMNS },
  { name: "Request", color: "4fc3f7", icon: "r.svg", etaField: null, columns: COLUMNS },
];

const TEAM_A = "Org\\Team A";
const TEAM_B = "Org\\Team B";
const OTHER = "Org\\Other";

/** A tracked item carrying only what the board paints; each fixture overrides what it is about. */
function item(overrides: Partial<TrackedWorkItem> & { id: number }): TrackedWorkItem {
  return {
    rev: 1,
    type: "Request",
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
 * The grouping item (never drawn) holding three consumers, one per area: Contoso (Team A) with two
 * requests in different areas, Fabrikam (Team B) with requests filed outside its own area, and
 * Northwind (Other) with none. A grandchild sits under Contoso's first request to prove the board
 * ignores anything below a request.
 */
function fixtureRoots(): TrackedWorkItem[] {
  return [
    item({
      id: 100,
      type: "Group",
      title: "All consumers",
      children: [
        item({
          id: 10,
          type: "Consumer",
          title: "Contoso",
          description: "Contoso consumer description.",
          areaPath: TEAM_A,
          importance: 1,
          children: [
            item({
              id: 11,
              title: "Export to CSV",
              description: "Export request description.",
              noteCount: 1,
              areaPath: TEAM_A,
              children: [item({ id: 111, title: "Hidden grandchild", areaPath: TEAM_A })],
            }),
            item({ id: 12, title: "Dark mode", areaPath: TEAM_B, state: "Closed" }),
          ],
        }),
        item({
          id: 20,
          type: "Consumer",
          title: "Fabrikam",
          areaPath: TEAM_B,
          importance: 2,
          children: [
            item({ id: 21, title: "Single sign-on", areaPath: TEAM_A }),
            item({ id: 22, title: "Audit log", areaPath: OTHER }),
          ],
        }),
        item({ id: 30, type: "Consumer", title: "Northwind", areaPath: OTHER, importance: 3 }),
      ],
    }),
  ];
}

/** One consumer whose description carries the onboarding template the rows read. */
function profiledRoots(): TrackedWorkItem[] {
  return [
    item({
      id: 100,
      type: "Group",
      title: "All consumers",
      children: [
        item({
          id: 10,
          type: "Consumer",
          title: "Contoso",
          description:
            "# Overview\n- **ServiceName**: `IPSimulationService`\n" +
            "- **ClientId**: `531aebea-d218-4cad-8eab-dcec494dbe86`\n" +
            "# Contacts\n- `M1`: Sundar Kameswaran (_skamesw_)\n",
        }),
      ],
    }),
  ];
}

/** Only the services this view reaches for. */
function createServices(overrides?: Partial<EnhancedViewServices>): EnhancedViewServices {
  return {
    loadTree: async () => ({ isTreeQuery: true, roots: fixtureRoots(), error: null }),
    getTypes: () => TYPES,
    getBoardColumns: () => ["New", "Active", "Done"],
    mentionDirectory: {
      resolveNames: async () => new Map(),
      knownNames: () => new Map(),
    },
    userDirectory: {
      search: async () => [],
      resolve: async () => null,
    },
    noteLoader: {
      loadNotes: async () => ({ notes: [], currentUser: null, error: null }),
    },
    noteWriter: {
      addNote: async () => ({ ok: true }),
      editNote: async () => ({ ok: true }),
    },
    markerTags: () => normalizeMarkerTags(undefined),
    logger: { info: () => undefined, error: () => undefined },
    openDiagnosticsLog: () => undefined,
    now: () => new Date("2026-07-15T00:00:00Z"),
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

/** A context whose services carry `overrides`, for the tests that watch one collaborator. */
const contextWith = (overrides: Partial<EnhancedViewServices>): EnhancedViewContext =>
  createContext({ services: createServices(overrides) });

/** Mount the board and let its single load settle, which is what puts the header on screen. */
async function renderBoard(context: EnhancedViewContext = createContext()): Promise<HTMLElement> {
  const root = consumersView.render(context);
  document.body.append(root);
  await vi.waitFor(() =>
    expect(root.querySelector(".awesomeado-consumers__header")).not.toBeNull(),
  );
  return root;
}

const titles = (root: HTMLElement): (string | null)[] =>
  [...root.querySelectorAll(".awesomeado-consumers__title")].map((title) => title.textContent);

const consumerTitles = (root: HTMLElement): (string | null)[] =>
  [...root.querySelectorAll(".awesomeado-consumers__row.is-consumer")].map(
    (row) => row.querySelector(".awesomeado-consumers__title")!.textContent,
  );

const titleOf = (root: HTMLElement, text: string): HTMLElement =>
  [...root.querySelectorAll<HTMLElement>(".awesomeado-consumers__title")].find(
    (title) => title.textContent === text,
  )!;

const emptyMessage = (root: HTMLElement): string | null | undefined =>
  root.querySelector(".awesomeado-consumers__list-host")?.textContent;

const areaOptionValues = (): string[] =>
  [...document.querySelectorAll<HTMLInputElement>(".awesomeado-area-filter__option input")].map(
    (input) => input.value,
  );

const openAreaFilter = (root: HTMLElement): void => {
  root.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.click();
};

const tickArea = (path: string): void => {
  [...document.querySelectorAll<HTMLInputElement>(".awesomeado-area-filter__option input")]
    .find((input) => input.value === path)!
    .click();
};

/** Let the queued write and the repaint that follows it settle, without any timer. */
async function flush(): Promise<void> {
  for (let tick = 0; tick < 10; tick += 1) await Promise.resolve();
}

// The board keeps the page URL naming its area paths, so the URL is shared test state too.
afterEach(() => {
  document.body.replaceChildren();
  window.history.replaceState({}, "", "/");
});

describe("consumersView - shell", () => {
  it("says so rather than rendering an empty board when data services are unavailable", () => {
    const root = consumersView.render({ doc: document, queryId: "q", properties: {} });

    expect(root.querySelector(".awesomeado-view__title")?.textContent).toBe("Consumers View");
    expect(root.querySelector(".awesomeado-view__message")?.textContent).toBe(
      "Data services are unavailable.",
    );
  });

  it("shows the view's own title while the query is still loading", () => {
    const root = consumersView.render(createContext());

    expect(root.querySelector(".awesomeado-view__message")?.textContent).toBe(
      "Loading consumers\u2026",
    );
  });

  it("logs a failed load and says the query could not be loaded", async () => {
    const error = vi.fn();
    const root = consumersView.render(
      contextWith({
        loadTree: async () => ({ isTreeQuery: true, roots: [], error: "boom" }),
        logger: { info: () => undefined, error },
      }),
    );

    await vi.waitFor(() =>
      expect(root.querySelector(".awesomeado-view__message")?.textContent).toBe(
        "Could not load this query.",
      ),
    );
    expect(error).toHaveBeenCalledWith(
      "Consumers View could not load the query",
      expect.any(Error),
    );
  });

  it("unregisters the modifier tracker when disposed", () => {
    const root = consumersView.render(createContext());

    expect(() => consumersView.dispose?.(root)).not.toThrow();
  });
});

describe("consumersView - query shape", () => {
  it.each([
    [{ isTreeQuery: false, roots: fixtureRoots() }, "needs a tree (work item links) query"],
    [{ isTreeQuery: true, roots: [] }, "This query returned no work items."],
    [
      { isTreeQuery: true, roots: [...fixtureRoots(), item({ id: 200 })] },
      "needs one top-level item grouping the consumers; this query returned 2",
    ],
    [{ isTreeQuery: true, roots: [item({ id: 100 })] }, "This query returned no consumers."],
  ])("explains a query it cannot show while keeping Refresh on screen", async (shape, message) => {
    const info = vi.fn();
    const root = await renderBoard(
      contextWith({
        loadTree: async () => ({ ...shape, error: null }),
        logger: { info, error: () => undefined },
      }),
    );

    expect(emptyMessage(root)).toContain(message);
    expect(root.querySelector(".awesomeado-consumers__refresh")).not.toBeNull();
    expect(titles(root)).toEqual([]);
  });

  it("logs why it cannot show a query exactly once across repaints", async () => {
    const info = vi.fn();
    const root = await renderBoard(
      contextWith({
        loadTree: async () => ({ isTreeQuery: false, roots: [], error: null }),
        logger: { info, error: () => undefined },
      }),
    );
    root.querySelector<HTMLButtonElement>(".awesomeado-consumers__expand-all")!.click();

    const lines = info.mock.calls.map(([line]) => line as string);
    expect(lines.filter((line) => line.includes("cannot show this query"))).toEqual([
      "Consumers View cannot show this query: isTreeQuery=false, rootCount=0.",
    ]);
  });
});

describe("consumersView - tree", () => {
  it("uses the grouping item as the header and lists only its descendants as rows", async () => {
    const root = await renderBoard();

    expect(root.querySelector("h1")?.textContent).toBe("All consumers");
    expect(titles(root)).toEqual([
      "Contoso",
      "Export to CSV",
      "Dark mode",
      "Fabrikam",
      "Single sign-on",
      "Audit log",
      "Northwind",
    ]);
    expect(root.textContent).not.toContain("Hidden grandchild");
  });

  it("shows Status only on requests, not on consumer nodes", async () => {
    const root = await renderBoard();
    const request = titleOf(root, "Dark mode").closest<HTMLElement>(".awesomeado-consumers__row")!;
    const consumer = titleOf(root, "Contoso").closest<HTMLElement>(".awesomeado-consumers__row")!;

    expect(request.querySelector(".awesomeado-status__badge")?.textContent).toContain("Done");
    expect(request.querySelector(".awesomeado-consumers__twisty")).toBeNull();
    expect(request.children).toHaveLength(5);
    expect(consumer.querySelector(".awesomeado-status__badge")).toBeNull();
    expect([...consumer.children].map((part) => part.className)).toEqual([
      "awesomeado-consumers__twisty",
      "awesomeado-consumers__card-head",
      "awesomeado-consumers__profile",
    ]);
  });

  it("frames each consumer as its own card, and never a request", async () => {
    const root = await renderBoard();

    expect(
      [...root.querySelectorAll(".awesomeado-consumers__consumer")].map(
        (card) => (card as HTMLElement).dataset.itemId,
      ),
    ).toEqual(["10", "20", "30"]);
  });
});

describe("consumersView - consumer profile", () => {
  it("shows the service identity and contacts a consumer's description names", async () => {
    const root = await renderBoard(
      contextWith({
        loadTree: async () => ({ isTreeQuery: true, roots: profiledRoots(), error: null }),
      }),
    );
    const consumer = root.querySelector<HTMLElement>('[data-item-id="10"]')!;
    const contact = consumer.querySelector<HTMLElement>(".awesomeado-consumers__contact")!;

    expect(consumer.querySelector(".awesomeado-consumers__identity")?.textContent).toBe(
      "IPSimulationService(531aebea-d218-4cad-8eab-dcec494dbe86)",
    );
    expect(contact.querySelector(".awesomeado-assigned__name")?.textContent).toBe(
      "Sundar Kameswaran",
    );
    expect(contact.querySelector(".awesomeado-tag-pill")?.textContent).toBe("M1");
    expect(contact.textContent).not.toContain("skamesw");
  });

  it("offers a consumer described only in prose a Contacts heading to add the first person", async () => {
    const root = await renderBoard();
    const consumer = root.querySelector<HTMLElement>('[data-item-id="10"]')!;

    expect(consumer.querySelector(".awesomeado-consumers__identity")).toBeNull();
    expect(consumer.querySelector(".awesomeado-consumers__contacts-label")?.textContent).toBe(
      "Contacts",
    );
    expect(consumer.querySelector(".awesomeado-consumers__contact")).toBeNull();
  });
});

const JANE = { displayName: "Jane Doe", uniqueName: "jdoe@contoso.com", imageUrl: null };

/** The consumer card for `id`: the one row surface its title, details, and contacts share. */
const cardOf = (root: HTMLElement, id: number): HTMLElement =>
  root.querySelector<HTMLElement>(`[data-item-id="${id}"] > .awesomeado-consumers__row`)!;

/** Type into the open people picker and pick its first answer. */
async function pickFirstPerson(scope: HTMLElement): Promise<void> {
  const search = scope.querySelector<HTMLInputElement>(".awesomeado-assigned__search")!;
  search.value = "jane";
  search.dispatchEvent(new Event("input"));
  await flush();
  scope.querySelector<HTMLButtonElement>(".awesomeado-assigned__result button")!.click();
}

describe("consumersView - consumer card", () => {
  it("draws a consumer as ONE row surface holding its title line and its profile", async () => {
    const root = await renderBoard(
      contextWith({
        loadTree: async () => ({ isTreeQuery: true, roots: profiledRoots(), error: null }),
      }),
    );
    const consumer = root.querySelector<HTMLElement>('[data-item-id="10"]')!;
    const card = cardOf(root, 10);

    expect(consumer.querySelectorAll(":scope > .awesomeado-consumers__row")).toHaveLength(1);
    expect(card.style.display).toBe("grid");
    const profile = card.querySelector<HTMLElement>(".awesomeado-consumers__profile")!;
    // The `?` opens the head line and the details sit under it, both in the card's second column.
    expect(profile.style.gridColumn).toBe("2");
    expect(profile.classList.contains("awesomeado-consumers__row")).toBe(false);
  });

  it("opens the description and discussion below the card rather than inside it", async () => {
    const root = await renderBoard();
    const consumer = root.querySelector<HTMLElement>('[data-item-id="10"]')!;
    const card = cardOf(root, 10);

    card.querySelector<HTMLButtonElement>(".awesomeado-consumers__describe")!.click();
    card.querySelector<HTMLButtonElement>(".awesomeado-consumers__notes-toggle")!.click();

    const [first, description, notes] = [...consumer.children];
    expect(first).toBe(card);
    expect(description?.classList.contains("awesomeado-consumers__description")).toBe(true);
    expect(card.contains(notes!)).toBe(false);
    expect(notes?.nextElementSibling?.classList.contains("awesomeado-consumers__children")).toBe(
      true,
    );
  });

  it("opens the consumer's menu from anywhere on its card, contacts included", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const root = await renderBoard(
      contextWith({
        loadTree: async () => ({ isTreeQuery: true, roots: profiledRoots(), error: null }),
      }),
    );
    const name = cardOf(root, 10).querySelector<HTMLElement>(".awesomeado-assigned__name")!;

    name.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    [...root.querySelectorAll<HTMLElement>(".awesomeado-item-menu__command")]
      .find((command) => command.textContent === "Copy Item ID")!
      .click();

    expect(writeText).toHaveBeenCalledWith("10");
  });

  it("leaves a right-click in a text field on the card to the browser", async () => {
    const root = await renderBoard();
    const card = cardOf(root, 10);

    card.querySelector<HTMLButtonElement>(".awesomeado-consumers__add-contact-button")!.click();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    card.querySelector(".awesomeado-assigned__search")!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(root.querySelector(".awesomeado-item-menu")).toBeNull();
  });
});

describe("consumersView - editing contacts", () => {
  it("writes an added contact into the description and redraws the card with it", async () => {
    const writeField = vi.fn(async () => ({ ok: true, rev: 2 }));
    const root = await renderBoard(
      contextWith({
        loadTree: async () => ({ isTreeQuery: true, roots: profiledRoots(), error: null }),
        userDirectory: { search: async () => [JANE], resolve: async () => null },
        writeField,
      }),
    );

    cardOf(root, 10)
      .querySelector<HTMLButtonElement>(".awesomeado-consumers__add-contact-button")!
      .click();
    await pickFirstPerson(cardOf(root, 10));
    await flush();

    expect(writeField).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 10,
        field: "System.Description",
        value: expect.stringContaining(
          "- `M1`: Sundar Kameswaran (_skamesw_)\n- Jane Doe (_jdoe_)",
        ),
        multilineFormat: "Markdown",
      }),
    );
    expect(
      [...cardOf(root, 10).querySelectorAll(".awesomeado-consumers__contact")].map(
        (contact) => contact.querySelector(".awesomeado-assigned__name")?.textContent,
      ),
    ).toEqual(["Sundar Kameswaran", "Jane Doe"]);
  });

  it("offers the default roles and those already in use, under an Add new role field", async () => {
    const root = await renderBoard(
      contextWith({
        loadTree: async () => ({ isTreeQuery: true, roots: profiledRoots(), error: null }),
      }),
    );

    cardOf(root, 10).querySelector<HTMLElement>(".awesomeado-tag-pill")!.click();

    expect(
      [...root.querySelectorAll(".awesomeado-assigned__tag-choices .awesomeado-tag-pill")].map(
        (choice) => choice.textContent,
      ),
    ).toEqual(["??", "M1", "M2", "M3", "DEV", "PM"]);
    expect(
      root.querySelector<HTMLInputElement>(".awesomeado-assigned__tag-input")?.placeholder,
    ).toBe("Add new role");
  });
});

describe("consumersView - item content", () => {
  it("opens every item's description from the type-colored question-mark control", async () => {
    const root = await renderBoard();
    const consumer = root.querySelector<HTMLElement>('[data-item-id="10"]')!;
    const request = root.querySelector<HTMLElement>('[data-item-id="11"]')!;

    const consumerToggle = consumer.querySelector<HTMLButtonElement>(
      ":scope > .awesomeado-consumers__row .awesomeado-consumers__describe",
    )!;
    expect(consumerToggle.textContent).toBe("?");
    expect(consumerToggle.style.background).toContain("#ff6b6b");
    consumerToggle.click();
    expect(
      consumer.querySelector(":scope > .awesomeado-consumers__description")?.textContent,
    ).toContain("Contoso consumer description.");

    request.querySelector<HTMLButtonElement>(".awesomeado-consumers__describe")!.click();
    expect(
      request.querySelector(":scope > .awesomeado-consumers__description")?.textContent,
    ).toContain("Export request description.");
  });

  it("opens Discussion from the type icon and offers the shared add-note editor", async () => {
    const loadNotes = vi.fn(async () => ({
      notes: [
        {
          id: 5,
          workItemId: 11,
          author: { displayName: "Ada", id: "ada", uniqueName: "ada@example.com" },
          createdDate: "2026-07-14T12:00:00Z",
          text: "Please validate the export.",
          renderedHtml: null,
        },
      ],
      currentUser: null,
      error: null,
    }));
    const root = await renderBoard(contextWith({ noteLoader: { loadNotes } }));
    const request = root.querySelector<HTMLElement>('[data-item-id="11"]')!;

    request.querySelector<HTMLButtonElement>(".awesomeado-consumers__notes-toggle")!.click();

    await vi.waitFor(() =>
      expect(request.querySelector(".awesomeado-note")?.textContent).toContain(
        "Please validate the export.",
      ),
    );
    expect(loadNotes).toHaveBeenCalledWith({
      workItemId: 11,
      sinceIso: new Date(0).toISOString(),
    });
    request.querySelector<HTMLButtonElement>(".awesomeado-note-composer__trigger")!.click();
    expect(request.querySelector(".awesomeado-text-editor__input")).not.toBeNull();
  });
});

describe("consumersView - tree controls", () => {
  it("colors the root title from its Azure DevOps work item type", async () => {
    const root = await renderBoard();
    const title = root.querySelector<HTMLElement>("h1")!;

    expect(title.textContent).toBe("All consumers");
    expect(title.style.color).toBe(
      "light-dark(#773b93, color-mix(in srgb, #773b93 75%, var(--text-primary-color)))",
    );
    expect(
      root.querySelector(".awesomeado-consumers__header-corner .awesomeado-ordering"),
    ).not.toBeNull();
  });
});

describe("consumersView - expansion", () => {
  it("collapses and expands one consumer's requests, drawn below its card", async () => {
    const root = await renderBoard();
    const card = (): HTMLElement =>
      titleOf(root, "Contoso").closest<HTMLElement>(".awesomeado-consumers__row")!;
    const twisty = (): HTMLButtonElement =>
      card().querySelector<HTMLButtonElement>(".awesomeado-consumers__twisty")!;
    const consumer = (): HTMLElement => card().parentElement!;

    // Open: the requests follow the card inside the consumer, never inside the card itself.
    const requests = consumer().querySelector(":scope > .awesomeado-consumers__children");
    expect(requests?.textContent).toContain("Export to CSV");
    expect(card().querySelector(".awesomeado-consumers__children")).toBeNull();

    twisty().click();
    expect(titles(root)).not.toContain("Export to CSV");
    expect(consumer().querySelector(".awesomeado-consumers__children")).toBeNull();
    expect(twisty().getAttribute("aria-expanded")).toBe("false");

    twisty().click();
    expect(titles(root)).toContain("Export to CSV");
  });

  it("collapses and expands every consumer from the header", async () => {
    const root = await renderBoard();

    root.querySelector<HTMLButtonElement>(".awesomeado-consumers__collapse-all")!.click();
    expect(titles(root)).toEqual(["Contoso", "Fabrikam", "Northwind"]);

    root.querySelector<HTMLButtonElement>(".awesomeado-consumers__expand-all")!.click();
    expect(titles(root)).toHaveLength(7);
  });

  it("collapses open descriptions, then open discussions, and only then the tree", async () => {
    const info = vi.fn();
    const root = await renderBoard(contextWith({ logger: { info, error: () => undefined } }));
    const toggle = (id: number, kind: "describe" | "notes-toggle"): HTMLButtonElement =>
      root.querySelector<HTMLButtonElement>(
        `[data-item-id="${id}"] .awesomeado-consumers__${kind}`,
      )!;
    const collapse = (): void =>
      root.querySelector<HTMLButtonElement>(".awesomeado-consumers__collapse-all")!.click();
    toggle(11, "describe").click();
    toggle(20, "describe").click();
    toggle(21, "notes-toggle").click();

    collapse();
    expect(toggle(11, "describe").getAttribute("aria-expanded")).toBe("false");
    expect(toggle(20, "describe").getAttribute("aria-expanded")).toBe("false");
    expect(toggle(21, "notes-toggle").getAttribute("aria-expanded")).toBe("true");
    expect(titles(root)).toHaveLength(7);

    collapse();
    expect(toggle(21, "notes-toggle").getAttribute("aria-expanded")).toBe("false");
    expect(titles(root)).toHaveLength(7);

    collapse();
    expect(titles(root)).toEqual(["Contoso", "Fabrikam", "Northwind"]);
    expect(info).toHaveBeenCalledWith("Consumers View collapse: descriptions.");
    expect(info).toHaveBeenCalledWith("Consumers View collapse: discussions.");
    expect(info).toHaveBeenCalledWith("Consumers View collapse: tree level 1.");
  });

  it("expands only the tree from the header, never a closed panel", async () => {
    const root = await renderBoard();
    root.querySelector<HTMLButtonElement>(".awesomeado-consumers__collapse-all")!.click();

    root.querySelector<HTMLButtonElement>(".awesomeado-consumers__expand-all")!.click();

    expect(titles(root)).toHaveLength(7);
    expect(
      [...root.querySelectorAll(".awesomeado-consumers__describe")].map((describe) =>
        describe.getAttribute("aria-expanded"),
      ),
    ).not.toContain("true");
  });
});

describe("consumersView - refresh", () => {
  it("re-reads the query on Refresh", async () => {
    const loadTree = vi.fn(async () => ({
      isTreeQuery: true,
      roots: fixtureRoots(),
      error: null,
    }));
    const root = await renderBoard(contextWith({ loadTree }));

    root.querySelector<HTMLButtonElement>(".awesomeado-consumers__refresh")!.click();

    await vi.waitFor(() => expect(loadTree).toHaveBeenCalledTimes(2));
  });
});

describe("consumersView - configured area paths", () => {
  it("shows only consumers in the binding's area paths, each with every one of its requests", async () => {
    const root = await renderBoard(createContext({ properties: { consumerAreaPaths: TEAM_A } }));

    expect(titles(root)).toEqual(["Contoso", "Export to CSV", "Dark mode"]);
  });

  it("matches configured area branches and their descendants without case", async () => {
    const root = await renderBoard(
      createContext({ properties: { consumerAreaPaths: "org\\team b\nOrg\\Other" } }),
    );

    expect(consumerTitles(root)).toEqual(["Fabrikam", "Northwind"]);
  });

  it("offers the consumers' represented areas under the configured branch", async () => {
    const root = await renderBoard(createContext({ properties: { consumerAreaPaths: "Org" } }));

    openAreaFilter(root);

    expect(areaOptionValues()).toEqual([OTHER, TEAM_A, TEAM_B]);
  });

  it("says so when the binding's area paths keep none of the consumers", async () => {
    const root = await renderBoard(
      createContext({ properties: { consumerAreaPaths: "Elsewhere" } }),
    );

    expect(emptyMessage(root)).toContain(
      "None of this query's consumers sit in this board's consumer area paths.",
    );
    expect(
      root.querySelector<HTMLButtonElement>(".awesomeado-area-filter__trigger")!.disabled,
    ).toBe(true);
  });

  it("logs what it shows only when the conclusion changes", async () => {
    const info = vi.fn();
    const root = await renderBoard(
      createContext({
        properties: { consumerAreaPaths: TEAM_A },
        services: createServices({ logger: { info, error: () => undefined } }),
      }),
    );
    root.querySelector<HTMLButtonElement>(".awesomeado-consumers__expand-all")!.click();

    const lines = info.mock.calls.map(([line]) => line as string);
    expect(lines.filter((line) => line.startsWith("Consumers View showing"))).toEqual([
      "Consumers View showing 1 of 3 consumer(s), with 2 feature request(s): configuredAreaPaths=1, selectedAreaPaths=0.",
    ]);
  });
});

describe("consumersView - header area filter", () => {
  it("narrows the consumers live, keeps the dropdown open, and names the areas in the URL", async () => {
    const info = vi.fn();
    const root = await renderBoard(contextWith({ logger: { info, error: () => undefined } }));
    const header = root.querySelector(".awesomeado-consumers__header");

    openAreaFilter(root);
    expect(areaOptionValues()).toEqual([OTHER, TEAM_A, TEAM_B]);
    tickArea(TEAM_B);

    // Fabrikam's requests are filed in Team A and Other, and are shown all the same.
    expect(titles(root)).toEqual(["Fabrikam", "Single sign-on", "Audit log"]);
    expect(root.querySelector(".awesomeado-consumers__header")).toBe(header);
    expect(new URLSearchParams(window.location.search).getAll("areaPath")).toEqual([TEAM_B]);
    expect(info).toHaveBeenCalledWith("Consumers View area-path filter: selectedCount=1.");
  });

  it("clears an active filter from its trigger in one press", async () => {
    const root = await renderBoard();
    openAreaFilter(root);
    tickArea(TEAM_B);
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));

    openAreaFilter(root);

    expect(titles(root)).toHaveLength(7);
    expect(window.location.search).toBe("");
  });

  it("opens on the areas a shared link names", async () => {
    window.history.replaceState({}, "", `/?areaPath=${encodeURIComponent(TEAM_A)}`);

    const root = await renderBoard();

    expect(titles(root)).toEqual(["Contoso", "Export to CSV", "Dark mode"]);
  });

  it("drops a linked area the board cannot offer, from the board and from the URL", async () => {
    window.history.replaceState({}, "", "/?_a=query&areaPath=Org%5CGone");

    const root = await renderBoard();

    expect(titles(root)).toHaveLength(7);
    expect(window.location.search).toBe("?_a=query");
  });
});
describe("consumersView - status and menus", () => {
  it("writes a picked Status and reflects it once Azure DevOps accepts it", async () => {
    const writeField = vi.fn(async () => ({ ok: true, rev: 5 }));
    const root = await renderBoard(contextWith({ writeField }));
    const row = titleOf(root, "Single sign-on").closest(".awesomeado-consumers__row")!;

    row.querySelector<HTMLElement>(".awesomeado-status__badge")!.click();
    [...document.querySelectorAll<HTMLButtonElement>(".awesomeado-status__row")]
      .find((option) => option.textContent === "Done")!
      .click();
    await flush();

    expect(writeField).toHaveBeenCalledWith(
      expect.objectContaining({ id: 21, field: "System.State", value: "Closed", rev: 1 }),
    );
    expect(row.querySelector(".awesomeado-status__badge")?.textContent).toContain("Done");
  });

  it("opens the item menu from a row and the link menu from the title", async () => {
    const root = await renderBoard();

    titleOf(root, "Audit log")
      .closest(".awesomeado-consumers__row")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(root.querySelector(".awesomeado-item-menu")).not.toBeNull();
    expect(
      [...root.querySelectorAll(".awesomeado-item-menu__command")].some(
        (command) => command.textContent === "View all notes",
      ),
    ).toBe(true);

    root.querySelector("h1")!.dispatchEvent(new MouseEvent("contextmenu", { cancelable: true }));
    expect(root.querySelectorAll(".awesomeado-item-menu__command")).toHaveLength(1);
  });
});

/** Drag `source`'s title onto `target`'s row at a height fraction: 0.1 above, 0.5 inside. */
function drag(source: HTMLElement, target: HTMLElement, fraction: number): void {
  const values = new Map<string, string>();
  const dataTransfer = {
    effectAllowed: "none",
    dropEffect: "none",
    setData: (type: string, value: string) => values.set(type, value),
    getData: (type: string) => values.get(type) ?? "",
    setDragImage: vi.fn(),
  } as unknown as DataTransfer;
  dispatchDrag(source, "dragstart", dataTransfer, 0);
  const row = target.closest<HTMLElement>(".awesomeado-consumers__row")!;
  // jsdom lays nothing out, so the row's box has to be stated for a side to mean anything.
  row.getBoundingClientRect = () => ({ top: 0, height: 20, bottom: 20 }) as DOMRect;
  dispatchDrag(row, "dragover", dataTransfer, fraction * 20);
  dispatchDrag(row, "drop", dataTransfer, fraction * 20);
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

/** A reorder writer that accepts every move and reports the given new order. */
const acceptingReorder = (order: number) =>
  vi.fn<(request: unknown) => Promise<WorkItemReorderResult>>(async () => ({
    ok: true,
    order,
    rev: 9,
  }));

describe("consumersView - reordering consumers", () => {
  it("ranks a consumer dropped above another among the full consumer level", async () => {
    const reorderItem = acceptingReorder(0);
    const root = await renderBoard(contextWith({ reorderItem }));

    drag(titleOf(root, "Fabrikam"), titleOf(root, "Contoso"), 0.1);
    await flush();

    expect(reorderItem).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 20,
        parentId: 100,
        currentParentId: 100,
        previousId: 0,
        nextId: 10,
        siblingIds: [20, 10, 30],
        team: "team-guid",
      }),
    );
    expect(consumerTitles(root)).toEqual(["Fabrikam", "Contoso", "Northwind"]);
  });

  it("never nests a consumer inside another", async () => {
    const reorderItem = acceptingReorder(0);
    const root = await renderBoard(contextWith({ reorderItem }));

    drag(titleOf(root, "Fabrikam"), titleOf(root, "Northwind"), 0.5);
    await flush();

    expect(reorderItem).toHaveBeenCalledWith(expect.objectContaining({ id: 20, parentId: 100 }));
  });
});

describe("consumersView - moving requests", () => {
  it("re-orders a request within its consumer", async () => {
    const reorderItem = acceptingReorder(10);
    const root = await renderBoard(contextWith({ reorderItem }));

    drag(titleOf(root, "Dark mode"), titleOf(root, "Export to CSV"), 0.1);
    await flush();

    expect(reorderItem).toHaveBeenCalledWith(
      expect.objectContaining({ id: 12, parentId: 10, currentParentId: 10, nextId: 11 }),
    );
    expect(titles(root).slice(0, 3)).toEqual(["Contoso", "Dark mode", "Export to CSV"]);
  });

  it("hands a request to another consumer, even a closed or empty one, keeping its type", async () => {
    const reorderItem = acceptingReorder(40);
    const root = await renderBoard(contextWith({ reorderItem }));

    drag(titleOf(root, "Audit log"), titleOf(root, "Northwind"), 0.5);
    await flush();

    const request = reorderItem.mock.calls[0]![0] as Record<string, unknown>;
    expect(request).toMatchObject({ id: 22, parentId: 30, currentParentId: 20, siblingIds: [22] });
    expect(request.type).toBeUndefined();
    expect(titles(root).slice(-2)).toEqual(["Northwind", "Audit log"]);
  });

  it("never lifts a request up to the consumer level", async () => {
    const reorderItem = acceptingReorder(0);
    const root = await renderBoard(contextWith({ reorderItem }));

    drag(titleOf(root, "Audit log"), titleOf(root, "Contoso"), 0.1);
    await flush();

    expect(reorderItem).not.toHaveBeenCalled();
  });

  it("leaves the tree as it was when Azure DevOps refuses the move", async () => {
    const reorderItem = vi.fn(async () => ({ ok: false, error: "nope" }));
    const root = await renderBoard(contextWith({ reorderItem }));

    drag(titleOf(root, "Audit log"), titleOf(root, "Northwind"), 0.5);
    await flush();

    expect(titles(root).slice(-2)).toEqual(["Audit log", "Northwind"]);
  });
});

describe("consumersView - when dragging is unavailable", () => {
  const draggable = (root: HTMLElement): boolean[] =>
    [...root.querySelectorAll<HTMLElement>(".awesomeado-consumers__title")].map(
      (title) => title.draggable,
    );

  it("offers no drag handle without a team, and says why on the ordering glyph", async () => {
    const root = await renderBoard(contextWith({ currentTeam: () => null }));

    expect(draggable(root).some(Boolean)).toBe(false);
    expect(root.querySelector(".awesomeado-ordering__trigger")?.getAttribute("title")).toContain(
      "needs a team",
    );
  });

  it("offers no drag handle while ordered by anything but importance", async () => {
    const root = await renderBoard(createContext({ properties: { orderingPolicy: "title" } }));

    expect(draggable(root).some(Boolean)).toBe(false);
    expect(consumerTitles(root)).toEqual(["Contoso", "Fabrikam", "Northwind"]);
  });

  it("re-orders by a policy picked on the glyph, then offers dragging again under importance", async () => {
    const root = await renderBoard(createContext({ properties: { orderingPolicy: "title" } }));

    root.querySelector<HTMLButtonElement>(".awesomeado-ordering__trigger")!.click();
    [...document.querySelectorAll<HTMLElement>(".awesomeado-ordering__option")]
      .find((option) => option.textContent?.includes("Importance"))!
      .click();

    expect(draggable(root).every(Boolean)).toBe(true);
  });
});
