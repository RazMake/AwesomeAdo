import { describe, expect, it, vi } from "vitest";

import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";

import { renderProjectRow, type ProjectRowContext } from "./ProjectRow";

const QUERY_URL = "https://dev.azure.com/contoso/Web/_queries/query/abc-123";

const TYPES: TypeCatalogEntry[] = [
  {
    name: "Epic",
    color: "ff6b6b",
    icon: "https://example.invalid/epic.svg",
    etaField: null,
    children: ["Story"],
    columns: [{ column: "Active", states: ["Active"] }],
  },
  {
    name: "Untyped",
    color: "",
    icon: "",
    etaField: null,
    children: [],
    columns: [],
  },
];

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

function context(overrides?: Partial<ProjectRowContext>): ProjectRowContext {
  return {
    doc: document,
    href: QUERY_URL,
    types: new Map(TYPES.map((entry) => [entry.name, entry])),
    policy: "importance",
    expandedIds: new Set<number>(),
    keptIds: null,
    hiddenTags: new Set<string>(),
    dragReorder: null,
    projectSiblingIds: [],
    queryUrlOf: () => null,
    onContextMenu: () => undefined,
    repaint: () => undefined,
    ...overrides,
  };
}

describe("renderProjectRow", () => {
  it("links the title to the work item, in a tab that cannot reach back into ADO", () => {
    const row = renderProjectRow(item({ id: 42 }), context(), 0);
    const link = row.querySelector<HTMLAnchorElement>("a.awesomeado-projects__title")!;

    expect(link.href).toBe("https://dev.azure.com/contoso/Web/_workitems/edit/42");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
  });

  it("falls back to plain text when the page is not an addressable ADO query", () => {
    const row = renderProjectRow(item({ id: 42 }), context({ href: "https://example.com/" }), 0);

    expect(row.querySelector("a.awesomeado-projects__title")).toBeNull();
    expect(row.querySelector("span.awesomeado-projects__title")?.textContent).toBe("Item 42");
  });

  it("wears the item's own tags but not the ones the query put on every project", () => {
    const row = renderProjectRow(
      item({ id: 1, tags: ["Catalog", "Platform"] }),
      context({ hiddenTags: new Set(["catalog"]) }),
      0,
    );

    expect(
      [...row.querySelectorAll(".awesomeado-projects__tags span")].map((el) => el.textContent),
    ).toEqual(["Platform"]);
  });

  it("keeps an uncolored type readable by falling back to the theme foreground", () => {
    const row = renderProjectRow(item({ id: 1, type: "Untyped" }), context(), 0);
    const title = row.querySelector<HTMLElement>(".awesomeado-projects__title")!;

    expect(title.style.color).toBe("var(--text-primary-color)");
  });

  it("orders an open row's children by the given policy", () => {
    const parent = item({
      id: 1,
      children: [item({ id: 2, title: "Zebra" }), item({ id: 3, title: "Apple" })],
    });
    const row = renderProjectRow(
      parent,
      context({ expandedIds: new Set([1]), policy: "title" }),
      0,
    );

    expect(
      [...row.querySelectorAll(".awesomeado-projects__children .awesomeado-projects__title")].map(
        (title) => title.textContent,
      ),
    ).toEqual(["Apple", "Zebra"]);
  });

  it("hides the children the tag filter dropped, and the twisty with them", () => {
    const parent = item({ id: 1, children: [item({ id: 2 })] });
    const row = renderProjectRow(parent, context({ keptIds: new Set([1]) }), 0);

    expect(row.querySelector(".awesomeado-projects__twisty")).toBeNull();
    expect(row.querySelector(".awesomeado-projects__child-count")).toBeNull();
  });

  it("asks its owner to repaint when a twisty is pressed, rather than mutating the DOM in place", () => {
    const repaint = vi.fn();
    const expandedIds = new Set<number>();
    const parent = item({ id: 1, children: [item({ id: 2 })] });
    const row = renderProjectRow(parent, context({ expandedIds, repaint }), 0);

    row.querySelector<HTMLButtonElement>(".awesomeado-projects__twisty")!.click();

    expect([...expandedIds]).toEqual([1]);
    expect(repaint).toHaveBeenCalledOnce();
  });
});

const TRACKING_QUERY_URL = "https://dev.azure.com/contoso/Web/_queries/query/tracking-1";

describe("renderProjectRow - project query link", () => {
  it("opens the project's tracking query in a tab that cannot reach back into ADO", () => {
    const row = renderProjectRow(
      item({ id: 42 }),
      context({ queryUrlOf: () => TRACKING_QUERY_URL }),
      0,
    );
    const link = row.querySelector<HTMLAnchorElement>(".awesomeado-projects__query-link")!;

    expect(link.tagName).toBe("A");
    expect(link.href).toBe(TRACKING_QUERY_URL);
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.title).toContain("Open the tracking query");
  });

  it("keeps the control in place but inert while the project has no query", () => {
    const row = renderProjectRow(item({ id: 42 }), context(), 0);
    const link = row.querySelector<HTMLElement>(".awesomeado-projects__query-link")!;

    // Held rather than hidden, so the column does not shuffle as projects gain queries.
    expect(link.tagName).toBe("SPAN");
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(link.title).toContain("no tracking query yet");
  });

  it("sits immediately after the count it follows", () => {
    const parent = item({ id: 1, children: [item({ id: 2 })] });
    const row = renderProjectRow(parent, context({ queryUrlOf: () => TRACKING_QUERY_URL }), 0);
    const count = row.querySelector(".awesomeado-projects__child-count")!;

    expect(count.nextElementSibling?.className).toBe("awesomeado-projects__query-link");
  });

  it("gives the work beneath a project no query link of its own", () => {
    const parent = item({ id: 1, children: [item({ id: 2 })] });
    const row = renderProjectRow(
      parent,
      context({ expandedIds: new Set([1]), queryUrlOf: () => TRACKING_QUERY_URL }),
      0,
    );

    expect(row.querySelectorAll(".awesomeado-projects__query-link")).toHaveLength(1);
  });
});
