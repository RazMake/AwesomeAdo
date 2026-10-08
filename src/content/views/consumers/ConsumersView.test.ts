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
    // Most suites are about the consumer cards, so the harness opens there; the requests-list
    // suites, and those about the default, pass their own saved mode.
    consumersShowConsumers: savedMode(true),
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

/** Mount the board and open every consumer from the header, for the tests about requests. */
async function renderOpenBoard(
  context: EnhancedViewContext = createContext(),
): Promise<HTMLElement> {
  const root = await renderBoard(context);
  root.querySelector<HTMLButtonElement>(".awesomeado-consumers__expand-all")!.click();
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
  it("uses the grouping item as the header and lists its consumers, closed, as rows", async () => {
    const root = await renderBoard();

    expect(root.querySelector("h1")?.textContent).toBe("All consumers");
    expect(titles(root)).toEqual(["Contoso", "Fabrikam", "Northwind"]);
  });

  it("opens onto only the grouping item's descendants, never anything below a request", async () => {
    const root = await renderOpenBoard();

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
    const root = await renderOpenBoard();
    const request = titleOf(root, "Dark mode").closest<HTMLElement>(".awesomeado-consumers__row")!;
    const consumer = titleOf(root, "Contoso").closest<HTMLElement>(".awesomeado-consumers__row")!;

    expect(request.querySelector(".awesomeado-status__badge")?.textContent).toContain("Done");
    expect(request.querySelector(".awesomeado-consumers__twisty")).toBeNull();
    expect(request.children).toHaveLength(5);
    expect(consumer.querySelector(".awesomeado-status__badge")).toBeNull();
    expect([...consumer.children].map((part) => part.className)).toEqual([
      "awesomeado-consumers__request-count",
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
    const root = await renderOpenBoard();
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
    const root = await renderOpenBoard();
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
    const root = await renderOpenBoard(contextWith({ noteLoader: { loadNotes } }));
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
  it("shows each consumer's request count on its card, and an inert zero for none", async () => {
    const root = await renderBoard();
    const count = (id: number): HTMLElement =>
      cardOf(root, id).querySelector<HTMLElement>(".awesomeado-consumers__request-count")!;

    expect([10, 20, 30].map((id) => count(id).textContent)).toEqual(["2", "2", "0"]);
    expect(count(10).tagName).toBe("BUTTON");
    expect(count(10).title).toBe("Show 2 feature requests");
    expect(count(10).getAttribute("aria-label")).toBe("Show 2 feature requests from Contoso");
    expect(count(30).tagName).toBe("SPAN");
    expect(count(30).classList.contains("is-empty")).toBe(true);
    expect(count(30).title).toBe("No feature requests");
  });

  it("opens and closes one consumer's requests from its count, drawn below its card", async () => {
    const root = await renderBoard();
    const card = (): HTMLElement => cardOf(root, 10);
    const count = (): HTMLButtonElement =>
      card().querySelector<HTMLButtonElement>(".awesomeado-consumers__request-count")!;
    const consumer = (): HTMLElement => card().parentElement!;

    expect(count().getAttribute("aria-expanded")).toBe("false");
    expect(titles(root)).not.toContain("Export to CSV");

    count().click();
    // Open: the requests follow the card inside the consumer, never inside the card itself.
    const requests = consumer().querySelector(":scope > .awesomeado-consumers__children");
    expect(requests?.textContent).toContain("Export to CSV");
    expect(card().querySelector(".awesomeado-consumers__children")).toBeNull();
    expect(count().getAttribute("aria-expanded")).toBe("true");
    expect(count().title).toBe("Hide 2 feature requests");
    expect(titles(root)).not.toContain("Single sign-on");

    count().click();
    expect(titles(root)).not.toContain("Export to CSV");
    expect(consumer().querySelector(".awesomeado-consumers__children")).toBeNull();
  });

  it("expands and collapses every consumer from the header", async () => {
    const root = await renderBoard();

    root.querySelector<HTMLButtonElement>(".awesomeado-consumers__expand-all")!.click();
    expect(titles(root)).toHaveLength(7);

    root.querySelector<HTMLButtonElement>(".awesomeado-consumers__collapse-all")!.click();
    expect(titles(root)).toEqual(["Contoso", "Fabrikam", "Northwind"]);
  });

  it("collapses open descriptions, then open discussions, and only then the tree", async () => {
    const info = vi.fn();
    const root = await renderOpenBoard(contextWith({ logger: { info, error: () => undefined } }));
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

describe("consumersView - Ctrl+click refresh", () => {
  const refreshButton = (root: HTMLElement): HTMLButtonElement =>
    root.querySelector<HTMLButtonElement>(".awesomeado-consumers__refresh")!;

  it("discards cached data and re-reads on a Ctrl+click, but not on a plain click", async () => {
    const discardCachedData = vi.fn();
    const loadTree = vi.fn(async () => ({
      isTreeQuery: true,
      roots: fixtureRoots(),
      error: null,
    }));
    const root = await renderBoard(contextWith({ loadTree, discardCachedData }));

    refreshButton(root).click();
    await vi.waitFor(() => expect(loadTree).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(refreshButton(root).disabled).toBe(false));
    expect(discardCachedData).not.toHaveBeenCalled();

    refreshButton(root).dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true }));

    expect(discardCachedData).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(loadTree).toHaveBeenCalledTimes(3));
  });
});

const requestCount = (root: HTMLElement, id: number): HTMLElement =>
  cardOf(root, id).querySelector<HTMLElement>(".awesomeado-consumers__request-count")!;

const requestCounts = (root: HTMLElement): (string | null)[] =>
  [10, 20, 30].map((id) => requestCount(root, id).textContent);

describe("consumersView - configured area paths", () => {
  it("keeps every consumer but only the requests in the binding's area paths", async () => {
    const root = await renderOpenBoard(createContext({ properties: { requestAreaPaths: TEAM_A } }));

    expect(titles(root)).toEqual([
      "Contoso",
      "Export to CSV",
      "Fabrikam",
      "Single sign-on",
      "Northwind",
    ]);
  });

  it("matches configured area branches and their descendants without case", async () => {
    const root = await renderOpenBoard(
      createContext({ properties: { requestAreaPaths: "org\\team b\nOrg\\Other" } }),
    );

    expect(titles(root)).toEqual(["Contoso", "Dark mode", "Fabrikam", "Audit log", "Northwind"]);
  });

  it("still reads the legacy consumer area paths key", async () => {
    const root = await renderOpenBoard(
      createContext({ properties: { consumerAreaPaths: TEAM_A } }),
    );

    expect(titles(root)).not.toContain("Dark mode");
    expect(titles(root)).toContain("Export to CSV");
  });

  it("offers the kept requests' represented areas under the configured branch", async () => {
    const root = await renderBoard(createContext({ properties: { requestAreaPaths: "Org" } }));

    openAreaFilter(root);

    expect(areaOptionValues()).toEqual([OTHER, TEAM_A, TEAM_B]);
  });

  it("offers only the areas of the requests the binding keeps", async () => {
    const root = await renderBoard(createContext({ properties: { requestAreaPaths: TEAM_A } }));

    openAreaFilter(root);

    expect(areaOptionValues()).toEqual([TEAM_A]);
  });

  it("logs what it shows, counting only the kept requests, only when it changes", async () => {
    const info = vi.fn();
    const root = await renderBoard(
      createContext({
        properties: { requestAreaPaths: TEAM_A },
        services: createServices({ logger: { info, error: () => undefined } }),
      }),
    );
    root.querySelector<HTMLButtonElement>(".awesomeado-consumers__expand-all")!.click();

    const lines = info.mock.calls.map(([line]) => line as string);
    expect(lines.filter((line) => line.startsWith("Consumers View showing"))).toEqual([
      "Consumers View showing 3 of 3 consumer(s), with 2 feature request(s): mode=consumers, configuredAreaPaths=1, selectedAreaPaths=0, selectedConsumers=0, tags=none.",
    ]);
  });
});

describe("consumersView - area-filtered request counts", () => {
  it("counts only the requests the binding keeps, with an inert zero", async () => {
    const root = await renderBoard(createContext({ properties: { requestAreaPaths: TEAM_B } }));

    expect(requestCounts(root)).toEqual(["1", "0", "0"]);
    expect(requestCount(root, 10).tagName).toBe("BUTTON");
    expect(requestCount(root, 20).tagName).toBe("SPAN");
    expect(requestCount(root, 20).classList.contains("is-empty")).toBe(true);
  });

  it("counts only the requests the header filter keeps", async () => {
    const root = await renderBoard();
    openAreaFilter(root);
    tickArea(OTHER);

    expect(requestCounts(root)).toEqual(["0", "1", "0"]);
    expect(requestCount(root, 10).classList.contains("is-empty")).toBe(true);
  });

  it("expands only the consumers that keep a request", async () => {
    const root = await renderOpenBoard(createContext({ properties: { requestAreaPaths: TEAM_B } }));

    expect(titles(root)).toEqual(["Contoso", "Dark mode", "Fabrikam", "Northwind"]);
    expect(requestCount(root, 10).getAttribute("aria-expanded")).toBe("true");
  });
});

describe("consumersView - area-filtered requests list", () => {
  it("lists only the kept requests", async () => {
    const root = await renderBoard(requestsContext({}, { requestAreaPaths: TEAM_A }));

    expect(titles(root)).toEqual(["Export to CSV", "Single sign-on"]);
  });

  it("says no request matches when the binding's area paths keep none", async () => {
    const root = await renderBoard(requestsContext({}, { requestAreaPaths: "Elsewhere" }));

    expect(emptyMessage(root)).toContain(
      "No feature request of the shown consumers matches the area paths.",
    );
    expect(emptyMessage(root)).toContain("Area filter");
  });

  it("says no request matches when the header filter keeps none of the shown consumers", async () => {
    window.history.replaceState({}, "", `/?areaPath=${encodeURIComponent(OTHER)}&consumer=10`);

    const root = await renderBoard(requestsContext());

    expect(emptyMessage(root)).toContain(
      "No feature request of the shown consumers matches the area paths.",
    );
    expect(emptyMessage(root)).not.toContain("None of the shown consumers");
  });
});

describe("consumersView - header area filter", () => {
  it("narrows the requests live, keeps the dropdown open, and names the areas in the URL", async () => {
    const info = vi.fn();
    const root = await renderOpenBoard(contextWith({ logger: { info, error: () => undefined } }));
    const header = root.querySelector(".awesomeado-consumers__header");

    openAreaFilter(root);
    expect(areaOptionValues()).toEqual([OTHER, TEAM_A, TEAM_B]);
    tickArea(TEAM_B);

    // Consumers stay; only Contoso keeps a request, the one filed in Team B.
    expect(titles(root)).toEqual(["Contoso", "Dark mode", "Fabrikam", "Northwind"]);
    expect(root.querySelector(".awesomeado-consumers__header")).toBe(header);
    expect(new URLSearchParams(window.location.search).getAll("areaPath")).toEqual([TEAM_B]);
    expect(info).toHaveBeenCalledWith("Consumers View area-path filter: selectedCount=1.");
  });

  it("matches picked areas exactly, not their descendants", async () => {
    const root = await renderOpenBoard(
      contextWith({
        loadTree: async () => {
          const roots = fixtureRoots();
          roots[0]!.children[0]!.children[1]!.areaPath = `${TEAM_A}\\Sub`;
          return { isTreeQuery: true, roots, error: null };
        },
      }),
    );
    openAreaFilter(root);
    tickArea(TEAM_A);

    expect(titles(root)).toEqual([
      "Contoso",
      "Export to CSV",
      "Fabrikam",
      "Single sign-on",
      "Northwind",
    ]);
  });

  it("clears an active filter from its trigger in one press", async () => {
    const root = await renderOpenBoard();
    openAreaFilter(root);
    tickArea(TEAM_B);
    document.body.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));

    openAreaFilter(root);

    expect(titles(root)).toHaveLength(7);
    expect(window.location.search).toBe("");
  });

  it("opens on the areas a shared link names", async () => {
    window.history.replaceState({}, "", `/?areaPath=${encodeURIComponent(TEAM_A)}`);

    const root = await renderOpenBoard();

    expect(titles(root)).toEqual([
      "Contoso",
      "Export to CSV",
      "Fabrikam",
      "Single sign-on",
      "Northwind",
    ]);
  });

  it("drops a linked area the board cannot offer, from the board and from the URL", async () => {
    window.history.replaceState({}, "", "/?_a=query&areaPath=Org%5CGone");

    const root = await renderOpenBoard();

    expect(titles(root)).toHaveLength(7);
    expect(window.location.search).toBe("?_a=query");
  });
});

describe("consumersView - status and menus", () => {
  it("writes a picked Status and reflects it once Azure DevOps accepts it", async () => {
    const writeField = vi.fn(async () => ({ ok: true, rev: 5 }));
    const root = await renderOpenBoard(contextWith({ writeField }));
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
    const root = await renderOpenBoard();

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
    expect([...menuLabels(root)].sort()).toEqual(["Add new consumer", "Copy ADO Url"]);
  });
});

/** Drag `source`'s title onto `target`'s row at a height fraction: 0.1 above, 0.9 below. */
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

/** A saved-mode store answering `showConsumers` for every query, watched by the tests that persist it. */
function savedMode(showConsumers: boolean): {
  read: ReturnType<typeof vi.fn<(queryId: string) => Promise<boolean>>>;
  write: ReturnType<typeof vi.fn<(queryId: string, showConsumers: boolean) => Promise<void>>>;
} {
  return {
    read: vi.fn<(queryId: string) => Promise<boolean>>(async () => showConsumers),
    write: vi.fn<(queryId: string, showConsumers: boolean) => Promise<void>>(async () => undefined),
  };
}

/** A context opening on the requests list (the board's default), with `overrides` applied. */
const requestsContext = (
  overrides: Partial<EnhancedViewServices> = {},
  properties: Record<string, string> = {},
): EnhancedViewContext =>
  createContext({
    properties,
    services: createServices({ consumersShowConsumers: savedMode(false), ...overrides }),
  });

const showConsumersToggle = (root: HTMLElement): HTMLButtonElement =>
  root.querySelector<HTMLButtonElement>(".awesomeado-consumers__show-consumers")!;

const consumerTags = (root: HTMLElement): (string | null)[] =>
  [...root.querySelectorAll(".awesomeado-consumers__consumer-tag")].map((tag) => tag.textContent);

const boardLines = (info: ReturnType<typeof vi.fn>): string[] =>
  info.mock.calls
    .map(([line]) => line as string)
    .filter((line) => line.startsWith("Consumers View showing"));

const draggable = (root: HTMLElement): boolean[] =>
  [...root.querySelectorAll<HTMLElement>(".awesomeado-consumers__title")].map(
    (title) => title.draggable,
  );

const orderingGlyph = (root: HTMLElement): string | null | undefined =>
  root.querySelector(".awesomeado-ordering__trigger")?.getAttribute("title");

const pickOrdering = (root: HTMLElement, label: string): void => {
  root.querySelector<HTMLButtonElement>(".awesomeado-ordering__trigger")!.click();
  [...document.querySelectorAll<HTMLElement>(".awesomeado-ordering__option")]
    .find((option) => option.textContent?.includes(label))!
    .click();
};

const IMPORTANCE_ORDERED_REQUESTS = ["Export to CSV", "Dark mode", "Single sign-on", "Audit log"];

const BOARD_LINE_TAIL =
  "configuredAreaPaths=0, selectedAreaPaths=0, selectedConsumers=0, tags=none.";

describe("consumersView - the requests list by default", () => {
  it("opens on the requests list with Show consumers beside + and −, released", async () => {
    const preference = savedMode(false);
    const root = await renderBoard(contextWith({ consumersShowConsumers: preference }));
    const toggle = showConsumersToggle(root);

    expect(toggle.textContent).toBe("Show consumers");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    // Sits with the outline buttons rather than among the filters.
    expect(toggle.previousElementSibling?.className).toContain("collapse-all");
    expect(preference.read).toHaveBeenCalledWith("query-1");
    expect(titles(root)).toEqual(IMPORTANCE_ORDERED_REQUESTS);
    expect(root.querySelector(".awesomeado-consumers__row.is-consumer")).toBeNull();
  });

  it("opens on the requests list when no saved-mode store exists", async () => {
    const root = await renderBoard(contextWith({ consumersShowConsumers: undefined }));

    expect(titles(root)).toEqual(IMPORTANCE_ORDERED_REQUESTS);
  });

  it("tags each request with its consumer", async () => {
    const root = await renderBoard(requestsContext());

    expect(consumerTags(root)).toEqual(["Contoso", "Contoso", "Fabrikam", "Fabrikam"]);
    expect(root.textContent).not.toContain("Hidden grandchild");
    expect(root.querySelector<HTMLElement>(".awesomeado-consumers__consumer-tag")?.title).toBe(
      "Requested by Contoso",
    );
  });

  it("saves the choice for this query and logs each flip", async () => {
    const info = vi.fn();
    const preference = savedMode(false);
    const root = await renderBoard(
      contextWith({ consumersShowConsumers: preference, logger: { info, error: () => undefined } }),
    );

    showConsumersToggle(root).click();
    expect(preference.write).toHaveBeenLastCalledWith("query-1", true);
    expect(showConsumersToggle(root).getAttribute("aria-pressed")).toBe("true");
    expect(consumerTitles(root)).toEqual(["Contoso", "Fabrikam", "Northwind"]);

    showConsumersToggle(root).click();
    expect(preference.write).toHaveBeenLastCalledWith("query-1", false);
    expect(info).toHaveBeenCalledWith("Consumers View Show consumers: on.");
    expect(info).toHaveBeenCalledWith("Consumers View Show consumers: off.");
    expect(boardLines(info)).toEqual([
      `Consumers View showing 3 of 3 consumer(s), with 4 feature request(s): mode=requests-only, ${BOARD_LINE_TAIL}`,
      `Consumers View showing 3 of 3 consumer(s), with 4 feature request(s): mode=consumers, ${BOARD_LINE_TAIL}`,
      `Consumers View showing 3 of 3 consumer(s), with 4 feature request(s): mode=requests-only, ${BOARD_LINE_TAIL}`,
    ]);
  });
});

describe("consumersView - opening in the saved mode", () => {
  it("opens straight into the consumers when that is what was saved for the query", async () => {
    const root = await renderBoard(contextWith({ consumersShowConsumers: savedMode(true) }));

    expect(showConsumersToggle(root).getAttribute("aria-pressed")).toBe("true");
    expect(consumerTitles(root)).toHaveLength(3);
  });

  it("keeps a flip made since across Refresh, reading the saved mode only once", async () => {
    const preference = savedMode(true);
    const loadTree = vi.fn(async () => ({
      isTreeQuery: true,
      roots: fixtureRoots(),
      error: null,
    }));
    const root = await renderBoard(contextWith({ consumersShowConsumers: preference, loadTree }));

    showConsumersToggle(root).click();
    root.querySelector<HTMLButtonElement>(".awesomeado-consumers__refresh")!.click();
    await vi.waitFor(() => expect(loadTree).toHaveBeenCalledTimes(2));
    await flush();

    expect(showConsumersToggle(root).getAttribute("aria-pressed")).toBe("false");
    expect(titles(root)).toEqual(IMPORTANCE_ORDERED_REQUESTS);
    expect(preference.read).toHaveBeenCalledTimes(1);
  });

  it("logs a saved mode it cannot read, and shows the requests list", async () => {
    const error = vi.fn();
    const failure = new Error("storage unavailable");
    const root = await renderBoard(
      contextWith({
        consumersShowConsumers: {
          read: async () => Promise.reject(failure),
          write: async () => {},
        },
        logger: { info: () => undefined, error },
      }),
    );

    expect(showConsumersToggle(root).getAttribute("aria-pressed")).toBe("false");
    expect(titles(root)).toEqual(IMPORTANCE_ORDERED_REQUESTS);
    expect(error).toHaveBeenCalledWith(
      "Consumers View could not read the saved Show consumers choice",
      failure,
    );
  });

  it("logs a choice it cannot save, keeping the board the reader asked for", async () => {
    const error = vi.fn();
    const failure = new Error("quota exceeded");
    const root = await renderBoard(
      contextWith({
        consumersShowConsumers: {
          read: async () => false,
          write: async () => Promise.reject(failure),
        },
        logger: { info: () => undefined, error },
      }),
    );

    showConsumersToggle(root).click();
    await flush();

    expect(error).toHaveBeenCalledWith(
      "Consumers View could not save the Show consumers choice",
      failure,
    );
    expect(consumerTitles(root)).toHaveLength(3);
  });
});

describe("consumersView - requests-list rows", () => {
  it("gives each request its Status, description, Discussion, and item menu", async () => {
    const root = await renderBoard(requestsContext());
    const request = root.querySelector<HTMLElement>('[data-item-id="11"]')!;
    const row = request.querySelector<HTMLElement>(".awesomeado-consumers__row")!;

    expect(row.querySelector(".awesomeado-status__badge")).not.toBeNull();
    expect(row.querySelector(".awesomeado-consumers__notes-toggle")).not.toBeNull();
    row.querySelector<HTMLButtonElement>(".awesomeado-consumers__describe")!.click();
    expect(
      request.querySelector(":scope > .awesomeado-consumers__description")?.textContent,
    ).toContain("Export request description.");

    row.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const commands = [...root.querySelectorAll(".awesomeado-item-menu__command")].map(
      (command) => command.textContent,
    );
    expect(commands).toEqual(
      expect.arrayContaining(["Update parent", "View all notes", "Copy Item ID"]),
    );
  });

  it("steps the header's minus through the panels only, with nothing for plus to open", async () => {
    const info = vi.fn();
    const root = await renderBoard(requestsContext({ logger: { info, error: () => undefined } }));
    const press = (control: "collapse-all" | "expand-all"): void =>
      root.querySelector<HTMLButtonElement>(`.awesomeado-consumers__${control}`)!.click();
    root
      .querySelector<HTMLButtonElement>('[data-item-id="11"] .awesomeado-consumers__describe')!
      .click();
    root
      .querySelector<HTMLButtonElement>('[data-item-id="21"] .awesomeado-consumers__notes-toggle')!
      .click();

    press("collapse-all");
    press("collapse-all");
    press("collapse-all");
    press("expand-all");

    expect(info).toHaveBeenCalledWith("Consumers View collapse: descriptions.");
    expect(info).toHaveBeenCalledWith("Consumers View collapse: discussions.");
    expect(info).toHaveBeenCalledWith("Consumers View collapse: nothing left to collapse.");
    expect(info).toHaveBeenCalledWith("Consumers View expand: nothing left to expand.");
    expect(titles(root)).toEqual(IMPORTANCE_ORDERED_REQUESTS);
  });

  it("says so when none of the shown consumers has a request and no area filter is active", async () => {
    window.history.replaceState({}, "", "/?consumer=30");

    const root = await renderBoard(requestsContext());

    expect(emptyMessage(root)).toContain("None of the shown consumers has a feature request.");
    expect(emptyMessage(root)).toContain("Press Show consumers");
  });

  it("explains a query with no consumers just as the consumer cards do", async () => {
    const root = await renderBoard(
      requestsContext({
        loadTree: async () => ({ isTreeQuery: true, roots: [item({ id: 100 })], error: null }),
      }),
    );

    expect(emptyMessage(root)).toContain("This query returned no consumers.");
  });
});

/** The fixture with a needed-by date on one request, under a Request type that declares the field. */
const ETA_FIELD = "Microsoft.VSTS.Scheduling.TargetDate";
const etaServices = (writeField = vi.fn(async () => ({ ok: true, rev: 2 }))) => ({
  writeField,
  getTypes: () =>
    TYPES.map((entry) => (entry.name === "Request" ? { ...entry, etaField: ETA_FIELD } : entry)),
  loadTree: async () => {
    const roots = fixtureRoots();
    roots[0]!.children[0]!.children[0]!.eta = "2026-08-10T12:00:00Z";
    return { isTreeQuery: true, roots, error: null };
  },
});

const etaBadges = (root: HTMLElement): (string | null)[] =>
  [...root.querySelectorAll(".awesomeado-eta__label")].map((label) => label.textContent);

describe("consumersView - needed-by dates", () => {
  it("shows each request's ETA as the date it is Needed by", async () => {
    const root = await renderBoard(requestsContext(etaServices()));

    expect(etaBadges(root)).toEqual([
      "Needed by 08/10/2026",
      "No needed-by date",
      "No needed-by date",
      "No needed-by date",
    ]);
  });

  it("shows no date for a request type that declares no ETA field", async () => {
    const root = await renderBoard(requestsContext());

    expect(root.querySelector(".awesomeado-eta__label")).toBeNull();
  });

  it("orders the requests by the date they are needed by under By ETA", async () => {
    const root = await renderBoard(requestsContext(etaServices(), { orderingPolicy: "eta" }));

    expect(titles(root)[0]).toBe("Export to CSV");
    expect(draggable(root).some(Boolean)).toBe(false);
    expect(orderingGlyph(root)).toContain("only available under Drag-and-drop order");
  });
});

describe("consumersView - reordering requests", () => {
  it("ranks a dropped request among every request, keeping it under its own consumer", async () => {
    const reorderItem = acceptingReorder(0);
    const root = await renderBoard(requestsContext({ reorderItem }));

    expect(draggable(root).every(Boolean)).toBe(true);
    drag(titleOf(root, "Audit log"), titleOf(root, "Export to CSV"), 0.1);
    await flush();

    const request = reorderItem.mock.calls[0]![0] as Record<string, unknown>;
    expect(request).toMatchObject({
      id: 22,
      parentId: 20,
      currentParentId: 20,
      previousId: 0,
      nextId: 11,
      siblingIds: [22, 11, 12, 21],
      team: "team-guid",
    });
    expect(request.type).toBeUndefined();
    expect(titles(root)).toEqual(["Audit log", "Export to CSV", "Dark mode", "Single sign-on"]);
  });

  it("leaves the list as it was when Azure DevOps refuses the move", async () => {
    const reorderItem = vi.fn(async () => ({ ok: false, error: "nope" }));
    const root = await renderBoard(requestsContext({ reorderItem }));

    drag(titleOf(root, "Audit log"), titleOf(root, "Export to CSV"), 0.1);
    await flush();

    expect(titles(root)).toEqual(IMPORTANCE_ORDERED_REQUESTS);
  });

  it("offers only the drag order and the ETA order on the glyph", async () => {
    const root = await renderBoard(requestsContext());

    root.querySelector<HTMLButtonElement>(".awesomeado-ordering__trigger")!.click();
    expect(
      [...document.querySelectorAll(".awesomeado-ordering__option")].map((row) => row.textContent),
    ).toEqual(["\u2713Drag-and-drop order", "\u2713By ETA (past/recent - future)"]);
  });

  it("turns dragging off under By ETA and back on under Drag-and-drop order", async () => {
    const info = vi.fn();
    const root = await renderBoard(requestsContext({ logger: { info, error: () => undefined } }));

    pickOrdering(root, "By ETA");
    expect(draggable(root).some(Boolean)).toBe(false);

    pickOrdering(root, "Drag-and-drop order");
    expect(draggable(root).every(Boolean)).toBe(true);
    expect(info).toHaveBeenCalledWith("Consumers View ordering: eta.");
  });
});

describe("consumersView - when dragging is unavailable", () => {
  it("never offers a drag on the consumer cards, and says why on the ordering glyph", async () => {
    const root = await renderOpenBoard();

    expect(draggable(root).some(Boolean)).toBe(false);
    expect(orderingGlyph(root)).toContain("consumers keep a fixed order");
  });

  it("offers no drag handle without a team, and says why on the ordering glyph", async () => {
    const root = await renderBoard(requestsContext({ currentTeam: () => null }));

    expect(draggable(root).some(Boolean)).toBe(false);
    expect(orderingGlyph(root)).toContain("needs a team");
  });

  it("logs and declines a drop that lands after the team was cleared", async () => {
    let team: string | null = "team-guid";
    const error = vi.fn();
    const reorderItem = acceptingReorder(0);
    const root = await renderBoard(
      requestsContext({ currentTeam: () => team, reorderItem, logger: { info: () => {}, error } }),
    );

    team = null;
    drag(titleOf(root, "Audit log"), titleOf(root, "Export to CSV"), 0.1);
    await flush();

    expect(reorderItem).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("no team is configured"));
  });
});

/** The fixture with tags on the consumers (and one on a request, which the filter must ignore). */
const taggedServices = () => ({
  loadTree: async () => {
    const roots = fixtureRoots();
    const [contoso, fabrikam, northwind] = roots[0]!.children;
    contoso!.tags = ["Gold"];
    fabrikam!.tags = ["Silver"];
    northwind!.tags = ["Gold"];
    contoso!.children[0]!.tags = ["Bronze"];
    return { isTreeQuery: true, roots, error: null };
  },
});

const tagOptionValues = (): string[] =>
  [...document.querySelectorAll(".awesomeado-tag-filter__option input")].map(
    (input) => (input as HTMLInputElement).value,
  );

const tickTag = (root: HTMLElement, tag: string): void => {
  root.querySelector<HTMLButtonElement>(".awesomeado-tag-filter__trigger")!.click();
  [...document.querySelectorAll<HTMLInputElement>(".awesomeado-tag-filter__option input")]
    .find((input) => input.value === tag)!
    .click();
};

describe("consumersView - tag filter", () => {
  it("offers only the consumers' own tags", async () => {
    const root = await renderBoard(requestsContext(taggedServices()));

    root.querySelector<HTMLButtonElement>(".awesomeado-tag-filter__trigger")!.click();
    expect(tagOptionValues()).toEqual(["Gold", "Silver"]);
  });

  it("keeps the requests of the consumers whose tags match, live, and names it in the URL", async () => {
    const info = vi.fn();
    const root = await renderBoard(
      requestsContext({ ...taggedServices(), logger: { info, error: () => undefined } }),
    );

    tickTag(root, "Silver");

    expect(titles(root)).toEqual(["Single sign-on", "Audit log"]);
    expect(document.querySelector(".awesomeado-tag-filter__popup")).not.toBeNull();
    expect(new URLSearchParams(window.location.search).get("tags")).toBe("silver");
    expect(info).toHaveBeenCalledWith("Consumers View tag filter set to any of [silver].");
  });

  it("narrows the consumer cards the same way", async () => {
    const root = await renderBoard(contextWith(taggedServices()));

    tickTag(root, "Gold");

    expect(consumerTitles(root)).toEqual(["Contoso", "Northwind"]);
  });

  it("opens on the condition a shared link names, dropping tags no consumer wears", async () => {
    window.history.replaceState({}, "", "/?tags=gold,bronze&notTags=silver");
    const info = vi.fn();

    const root = await renderBoard(
      contextWith({ ...taggedServices(), logger: { info, error: () => undefined } }),
    );

    expect(consumerTitles(root)).toEqual(["Contoso", "Northwind"]);
    expect(info).toHaveBeenCalledWith(
      "Consumers View dropped tag filter(s) no consumer wears any more: bronze.",
    );
    expect(new URLSearchParams(window.location.search).get("tags")).toBe("gold");
  });

  it("explains a board the header filters emptied", async () => {
    window.history.replaceState({}, "", "/?tags=gold&notTags=gold");

    const root = await renderBoard(contextWith(taggedServices()));

    expect(emptyMessage(root)).toContain("No consumer matches the header filters.");
  });
});

const consumerOptionLabels = (): (string | null)[] =>
  [...document.querySelectorAll(".awesomeado-consumer-filter__option")].map(
    (row) => row.textContent,
  );

const tickConsumer = (root: HTMLElement, id: number): void => {
  root.querySelector<HTMLButtonElement>(".awesomeado-consumer-filter__trigger")!.click();
  [...document.querySelectorAll<HTMLInputElement>(".awesomeado-consumer-filter__option input")]
    .find((input) => input.value === String(id))!
    .click();
};

describe("consumersView - consumer filter", () => {
  it("offers every consumer by title, whatever the request area paths", async () => {
    const root = await renderBoard(requestsContext({}, { requestAreaPaths: TEAM_A }));

    root.querySelector<HTMLButtonElement>(".awesomeado-consumer-filter__trigger")!.click();
    expect(consumerOptionLabels()).toEqual(["Contoso", "Fabrikam", "Northwind"]);
  });

  it("lists only the picked consumers' requests, without the consumer pills", async () => {
    const info = vi.fn();
    const root = await renderBoard(requestsContext({ logger: { info, error: () => undefined } }));

    tickConsumer(root, 20);

    expect(titles(root)).toEqual(["Single sign-on", "Audit log"]);
    expect(consumerTags(root)).toEqual([]);
    expect(window.location.search).toBe("?consumer=20");
    expect(info).toHaveBeenCalledWith("Consumers View consumer filter: selectedCount=1.");
  });

  it("opens on the consumers a shared link names, dropping any it cannot offer", async () => {
    window.history.replaceState({}, "", "/?consumer=10&consumer=999");

    const root = await renderBoard(contextWith({}));

    expect(consumerTitles(root)).toEqual(["Contoso"]);
    expect(window.location.search).toBe("?consumer=10");
  });
});

const menuLabels = (root: HTMLElement): (string | null)[] =>
  [...root.querySelectorAll(".awesomeado-item-menu__command")].map(
    (command) => command.textContent,
  );

const runCommand = (root: HTMLElement, label: string): void => {
  [...root.querySelectorAll<HTMLButtonElement>(".awesomeado-item-menu__command")]
    .find((command) => command.textContent === label)!
    .click();
};

const commandLabel = (command: HTMLButtonElement): string =>
  (command.textContent ?? "").replace("\u203A", "").trim();

const menuCommand = (root: HTMLElement, label: string): HTMLButtonElement => {
  const command = [
    ...root.querySelectorAll<HTMLButtonElement>(".awesomeado-item-menu__command"),
  ].find((candidate) => commandLabel(candidate) === label);
  if (command === undefined) throw new Error(`Missing menu command "${label}".`);
  return command;
};

const openSubmenu = (root: HTMLElement, label: string): string[] => {
  const host = menuCommand(root, label).closest(".awesomeado-item-menu__submenu-host");
  host?.dispatchEvent(new MouseEvent("mouseenter"));
  return [
    ...(host?.querySelectorAll<HTMLButtonElement>(
      ".awesomeado-item-menu__submenu .awesomeado-item-menu__command",
    ) ?? []),
  ].map(commandLabel);
};

const runSubmenuCommand = (root: HTMLElement, parent: string, label: string): void => {
  const host = menuCommand(root, parent).closest(".awesomeado-item-menu__submenu-host");
  const command = [
    ...(host?.querySelectorAll<HTMLButtonElement>(
      ".awesomeado-item-menu__submenu .awesomeado-item-menu__command",
    ) ?? []),
  ].find((candidate) => commandLabel(candidate) === label);
  if (command === undefined) throw new Error(`Missing submenu command "${label}".`);
  command.click();
};

const typeInto = (scope: ParentNode, selector: string, text: string): void => {
  const field = scope.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  field.value = text;
  field.dispatchEvent(new Event("input", { bubbles: true }));
};

const CLIENT_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

const creatingServices = () => {
  const create = vi.fn(async () => ({ ok: true, id: 40, rev: 1 }));
  const loadTree = vi.fn(async () => ({ isTreeQuery: true, roots: fixtureRoots(), error: null }));
  return { create, loadTree, services: { createWorkItem: { create }, loadTree } };
};

describe("consumersView - consumer tags", () => {
  it("shows a consumer's own tags as pills after its name, and never a request's", async () => {
    const root = await renderOpenBoard(contextWith(taggedServices()));

    const pills = (scope: ParentNode): (string | null)[] =>
      [...scope.querySelectorAll(".awesomeado-consumers__consumer-item-tag")].map(
        (pill) => pill.textContent,
      );
    expect(pills(cardOf(root, 10).querySelector(".awesomeado-consumers__card-head")!)).toEqual([
      "Gold",
    ]);
    expect(pills(cardOf(root, 20))).toEqual(["Silver"]);
    expect(pills(titleOf(root, "Export to CSV").closest(".awesomeado-consumers__row")!)).toEqual(
      [],
    );
    expect(pills(root)).toHaveLength(3);
  });

  it("offers custom tag commands on consumers, but not on their requests", async () => {
    const root = await renderOpenBoard(contextWith(taggedServices()));

    cardOf(root, 10).dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    expect(menuLabels(root)).toEqual(
      expect.arrayContaining(["Add custom tag\u203A", "Clear custom tag\u203A"]),
    );

    titleOf(root, "Audit log")
      .closest(".awesomeado-consumers__row")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(menuLabels(root)).not.toEqual(
      expect.arrayContaining(["Add custom tag\u203A", "Clear custom tag\u203A"]),
    );
  });

  it("adds a tag from the consumer vocabulary and clears an existing tag", async () => {
    const writeField = vi.fn(async () => ({ ok: true, rev: 2 }));
    const root = await renderOpenBoard(contextWith({ ...taggedServices(), writeField }));

    cardOf(root, 10).dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    expect(openSubmenu(root, "Add custom tag")).toEqual(["New tag…", "Silver"]);
    runSubmenuCommand(root, "Add custom tag", "Silver");

    await vi.waitFor(() =>
      expect(writeField).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          field: "System.Tags",
          value: "Gold; Silver",
          baseValue: "Gold",
        }),
      ),
    );
    expect(cardOf(root, 10).textContent).toContain("Silver");

    cardOf(root, 10).dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    expect(openSubmenu(root, "Clear custom tag")).toEqual(["Gold", "Silver"]);
    runSubmenuCommand(root, "Clear custom tag", "Gold");

    await vi.waitFor(() =>
      expect(writeField).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: 10,
          field: "System.Tags",
          value: "Silver",
          baseValue: "Gold; Silver",
        }),
      ),
    );
    expect(cardOf(root, 10).textContent).not.toContain("Gold");
  });
});

describe("consumersView - loaded tag vocabulary", () => {
  it("suggests only consumer tags despite filters, excluding parent and request tags", async () => {
    window.history.replaceState({}, "", "/?consumer=10");
    const roots = fixtureRoots();
    roots[0]!.tags = ["Root tag"];
    const [contoso, fabrikam, northwind] = roots[0]!.children;
    contoso!.tags = ["Gold"];
    contoso!.children[0]!.tags = ["Bronze"];
    contoso!.children[0]!.children[0]!.tags = ["Hidden tag"];
    fabrikam!.tags = ["Silver"];
    northwind!.tags = ["silver", "Gold"];
    const writeField = vi.fn(async () => ({ ok: true, rev: 2 }));
    const root = await renderBoard(
      contextWith({
        loadTree: async () => ({ isTreeQuery: true, roots, error: null }),
        writeField,
      }),
    );

    cardOf(root, 10).dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    expect(openSubmenu(root, "Add custom tag")).toEqual(["New tag…", "Silver"]);
    runSubmenuCommand(root, "Add custom tag", "Silver");

    await vi.waitFor(() =>
      expect(writeField).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 10,
          field: "System.Tags",
          value: "Gold; Silver",
          baseValue: "Gold",
        }),
      ),
    );
  });
});

describe("consumersView - creation commands", () => {
  it("offers Add new request on a consumer, but not on a request; never Add new consumer", async () => {
    const root = await renderOpenBoard();

    cardOf(root, 10).dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    expect(menuLabels(root)).toContain("Add new request");
    expect(menuLabels(root)).not.toContain("Add new consumer");

    titleOf(root, "Audit log")
      .closest(".awesomeado-consumers__row")!
      .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(menuLabels(root)).not.toContain("Add new request");
    expect(menuLabels(root)).not.toContain("Add new consumer");
  });

  it("adds a consumer under the grouping item from the title, then re-reads the query", async () => {
    const { create, loadTree, services } = creatingServices();
    const root = await renderBoard(contextWith(services));

    root.querySelector("h1")!.dispatchEvent(new MouseEvent("contextmenu", { cancelable: true }));
    runCommand(root, "Add new consumer");
    const form = root.querySelector<HTMLElement>(".awesomeado-new-consumer")!;
    expect(form.closest(".awesomeado-item-command__panel")?.textContent).toContain(
      "Parent: All consumers",
    );
    typeInto(form, ".awesomeado-new-consumer__service-name", "Woodgrove");
    typeInto(form, ".awesomeado-new-consumer__client-id", CLIENT_ID);
    form.querySelector<HTMLButtonElement>(".awesomeado-new-consumer__add")!.click();

    await vi.waitFor(() => expect(loadTree).toHaveBeenCalledTimes(2));
    expect(create).toHaveBeenCalledWith({
      type: "Consumer",
      title: "Woodgrove",
      tags: [],
      areaPath: null,
      iterationPath: null,
      description: expect.stringContaining(`- **ClientId**: \`${CLIENT_ID}\``),
      parentId: 100,
    });
    expect(root.querySelector(".awesomeado-new-consumer")).toBeNull();
  });

  it("adds a request under the right-clicked consumer, with its needed-by date", async () => {
    const { create, loadTree, services } = creatingServices();
    const root = await renderOpenBoard(
      contextWith({ ...services, getTypes: etaServices().getTypes }),
    );

    cardOf(root, 10).dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    runCommand(root, "Add new request");
    const form = root.querySelector<HTMLElement>(".awesomeado-new-request")!;
    typeInto(form, ".awesomeado-new-request__title", "Bulk export");
    typeInto(form, ".awesomeado-new-request__target-date", "2026-09-01");
    form.querySelector<HTMLButtonElement>(".awesomeado-new-request__add")!.click();

    await vi.waitFor(() => expect(loadTree).toHaveBeenCalledTimes(2));
    expect(create).toHaveBeenCalledWith({
      type: "Request",
      title: "Bulk export",
      tags: [],
      areaPath: TEAM_A,
      iterationPath: null,
      description: "",
      parentId: 10,
      extraFields: { [ETA_FIELD]: "2026-09-01T12:00:00Z" },
    });
  });
});

const addConsumerButton = (root: HTMLElement): HTMLButtonElement =>
  root.querySelector<HTMLButtonElement>(".awesomeado-consumers__add-consumer")!;

describe("consumersView - Add Consumer button", () => {
  it("sits beside Show consumers, disabled until the consumers are shown", async () => {
    const root = await renderBoard(requestsContext());

    expect(addConsumerButton(root).previousElementSibling).toBe(showConsumersToggle(root));
    expect(addConsumerButton(root).disabled).toBe(true);
    expect(addConsumerButton(root).title).toBe("Turn on Show consumers to add a consumer");

    showConsumersToggle(root).click();
    expect(addConsumerButton(root).disabled).toBe(false);

    showConsumersToggle(root).click();
    expect(addConsumerButton(root).disabled).toBe(true);
  });

  it("opens the Add new consumer form under the grouping item", async () => {
    const root = await renderOpenBoard();

    addConsumerButton(root).click();

    const form = root.querySelector<HTMLElement>(".awesomeado-new-consumer")!;
    expect(form.closest(".awesomeado-item-command__panel")?.textContent).toContain(
      "Parent: All consumers",
    );
  });
});
