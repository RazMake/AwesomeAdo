import { afterEach, describe, expect, it, vi } from "vitest";

import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import type { EnhancedViewServices } from "../../../common/view-common/EnhancedView";

import { renderProjectRow, type ProjectRowContext } from "./ProjectRow";

const QUERY_URL = "https://dev.azure.com/contoso/Web/_queries/query/abc-123";
const NOW = new Date("2026-07-15T00:00:00Z");

const TYPES: TypeCatalogEntry[] = [
  {
    name: "Epic",
    color: "ff6b6b",
    icon: "https://example.invalid/epic.svg",
    etaField: "Custom.Eta",
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

/** Only the services a row reaches for: the picker's directory and the clock the ETA counts to. */
function services(overrides?: Partial<EnhancedViewServices>): EnhancedViewServices {
  return {
    userDirectory: { search: async () => [], resolve: async () => null },
    now: () => NOW,
    ...overrides,
  } as EnhancedViewServices;
}

function writeQueue(writeField: EnhancedViewServices["writeField"]): WorkItemWriteQueue {
  return new WorkItemWriteQueue(writeField, { info: () => undefined, error: () => undefined });
}

/** A popup anchors inside its own control, so a row it opens from has to be in the document. */
function mounted(row: HTMLElement): HTMLElement {
  document.body.append(row);
  return row;
}

afterEach(() => {
  document.body.innerHTML = "";
});

function context(overrides?: Partial<ProjectRowContext>): ProjectRowContext {
  return {
    doc: document,
    href: QUERY_URL,
    services: services(),
    queue: writeQueue(async () => ({ ok: true, rev: 2 })),
    types: new Map(TYPES.map((entry) => [entry.name, entry])),
    policy: "importance",
    expandedIds: new Set<number>(),
    keptIds: null,
    hiddenTags: new Set<string>(),
    dragReorder: null,
    projectSiblingIds: [],
    queryUrlOf: () => null,
    assigneeSuggestions: () => [],
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

describe("renderProjectRow - assignee", () => {
  it("follows the count badge and the query link, spaced by the row's own gap", () => {
    const parent = item({ id: 1, children: [item({ id: 2 })] });
    const row = renderProjectRow(parent, context({ queryUrlOf: () => TRACKING_QUERY_URL }), 0);
    const link = row.querySelector(".awesomeado-projects__query-link")!;
    const line = row.querySelector<HTMLElement>(".awesomeado-projects__row")!;

    expect(link.nextElementSibling?.className).toBe("awesomeado-assigned");
    expect(line.style.gap).toBe("8px");
  });

  it("names the person the project is assigned to, and says so when it is nobody", () => {
    const assigned = item({
      id: 1,
      assignedTo: { displayName: "Alice", uniqueName: "alice@contoso.com", imageUrl: null },
    });

    expect(
      renderProjectRow(assigned, context(), 0).querySelector(".awesomeado-assigned__name")
        ?.textContent,
    ).toBe("Alice");
    expect(
      renderProjectRow(item({ id: 2 }), context(), 0).querySelector(".awesomeado-assigned__name")
        ?.textContent,
    ).toBe("Unassigned");
  });

  it("wears no crew tag pill, which this catalog reads no roster to fill", () => {
    const row = renderProjectRow(item({ id: 1 }), context(), 0);

    expect(row.querySelector(".awesomeado-assigned .awesomeado-tag-pill")).toBeNull();
  });

  it("shows the new name only once Azure DevOps accepted the write", async () => {
    const writeField = vi.fn(async () => ({ ok: true, rev: 9 }));
    const project = item({ id: 7 });
    const row = mounted(
      renderProjectRow(
        project,
        context({
          queue: writeQueue(writeField),
          assigneeSuggestions: () => [
            { displayName: "Bob", uniqueName: "bob@contoso.com", imageUrl: null },
          ],
        }),
        0,
      ),
    );

    row.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")!.click();
    row.querySelector<HTMLButtonElement>(".awesomeado-assigned__result button")!.click();

    await vi.waitFor(() =>
      expect(writeField).toHaveBeenCalledWith(
        expect.objectContaining({ field: "System.AssignedTo", value: "bob@contoso.com" }),
      ),
    );
    await vi.waitFor(() => expect(project.assignedTo?.displayName).toBe("Bob"));
    expect(project.rev).toBe(9);
    expect(row.querySelector(".awesomeado-assigned__name")?.textContent).toBe("Bob");
  });

  it("gives the work beneath a project no assignee control of its own", () => {
    const parent = item({ id: 1, children: [item({ id: 2 })] });
    const row = renderProjectRow(parent, context({ expandedIds: new Set([1]) }), 0);

    expect(row.querySelectorAll(".awesomeado-assigned")).toHaveLength(1);
  });
});

describe("renderProjectRow - ETA", () => {
  it("sits last on the line, after the tags that push it to the right edge", () => {
    const row = renderProjectRow(item({ id: 1, tags: ["Platform"] }), context(), 0);
    const line = row.querySelector<HTMLElement>(".awesomeado-projects__row")!;
    const tags = row.querySelector<HTMLElement>(".awesomeado-projects__tags")!;

    expect(tags.style.marginLeft).toBe("auto");
    expect(line.lastElementChild?.className).toBe("awesomeado-eta");
  });

  it("stays a read-only placeholder for a type that declares no ETA field", () => {
    const row = renderProjectRow(item({ id: 1, type: "Untyped" }), context(), 0);
    const badge = row.querySelector<HTMLElement>(".awesomeado-eta")!;

    expect(badge.textContent).toContain("No ETA");
    expect(badge.style.cursor).not.toBe("pointer");
  });

  it("writes the picked date to the type's own ETA field and reflects what was committed", async () => {
    const writeField = vi.fn(async () => ({ ok: true, rev: 4 }));
    const project = item({ id: 7 });
    const row = mounted(renderProjectRow(project, context({ queue: writeQueue(writeField) }), 0));

    row.querySelector<HTMLElement>(".awesomeado-eta__label")!.click();
    const input = row.querySelector<HTMLInputElement>(".awesomeado-eta__date")!;
    input.value = "2026-08-20";
    input.dispatchEvent(new Event("change"));

    await vi.waitFor(() =>
      expect(writeField).toHaveBeenCalledWith(
        expect.objectContaining({
          field: "Custom.Eta",
          value: expect.stringContaining("2026-08-20"),
        }),
      ),
    );
    await vi.waitFor(() => expect(project.eta).toContain("2026-08-20"));
    expect(project.rev).toBe(4);
  });

  it("gives every open child its own ETA, in the same right-hand column", () => {
    const parent = item({
      id: 1,
      children: [item({ id: 2, children: [item({ id: 3 })] })],
    });
    const row = renderProjectRow(parent, context({ expandedIds: new Set([1, 2]) }), 0);

    expect(row.querySelectorAll(".awesomeado-eta")).toHaveLength(3);
    for (const line of row.querySelectorAll(".awesomeado-projects__row")) {
      expect(line.lastElementChild?.className).toBe("awesomeado-eta");
    }
  });

  it("writes a child's date to that child's own type field, not the project's", async () => {
    const writeField = vi.fn(async () => ({ ok: true, rev: 6 }));
    const child = item({ id: 2, type: "Untyped" });
    const row = mounted(
      renderProjectRow(
        item({ id: 1, children: [child] }),
        context({ expandedIds: new Set([1]), queue: writeQueue(writeField) }),
        0,
      ),
    );
    const badges = row.querySelectorAll<HTMLElement>(".awesomeado-eta");

    // The child's type declares no ETA field, so its badge cannot be edited even though the
    // project's above it can.
    expect(badges).toHaveLength(2);
    expect(badges[1]!.querySelector(".awesomeado-eta__label")).toBeTruthy();
    badges[1]!.querySelector<HTMLElement>(".awesomeado-eta__label")!.click();
    expect(row.querySelectorAll(".awesomeado-eta__date")).toHaveLength(0);
    expect(writeField).not.toHaveBeenCalled();
  });
});
