import { afterEach, describe, expect, it, vi } from "vitest";

import type { DirectoryUser, IUserDirectory } from "../../../ado/IUserDirectory";
import type { TrackedUser } from "../../../ado/TrackedWorkItem";

import { renderChildItemsBadge, type ChildItemDescriptor } from "./ChildItemsBadge";

/** A fake user directory: returns controlled search results via a resolved promise. */
class FakeUserDirectory implements IUserDirectory {
  private searchResults: DirectoryUser[] = [];

  setSearchResults(users: DirectoryUser[]): void {
    this.searchResults = users;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  search(_query: string): Promise<DirectoryUser[]> {
    return Promise.resolve(this.searchResults);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolve(_nameOrUnique: string): Promise<DirectoryUser | null> {
    return Promise.resolve(null);
  }
}

const alice: TrackedUser = {
  displayName: "Alice",
  uniqueName: "alice@example.com",
  imageUrl: null,
};

/** Build a child descriptor with sensible defaults, overridable per test. */
const childOf = (overrides: Partial<ChildItemDescriptor> = {}): ChildItemDescriptor => ({
  assignedTo: alice,
  title: "Do the thing",
  titleColor: "#CC293D",
  eta: null,
  iconUrl: "https://example.com/story.png",
  url: "https://dev.azure.com/contoso/web/_workitems/edit/42",
  ...overrides,
});

/** Whitespace-insensitive contains so `rgba(224, 168, 0, …)` matches `rgba(224,168,0,…)`. */
const containsColor = (cssValue: string, needle: string): boolean =>
  cssValue.replace(/\s/g, "").includes(needle.replace(/\s/g, ""));

const badgeOf = (root: HTMLElement): HTMLElement =>
  root.querySelector<HTMLElement>(".awesomeado-child-items__badge")!;

const popupOf = (root: HTMLElement): HTMLElement | null =>
  root.querySelector<HTMLElement>(".awesomeado-child-items__popup");

afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderChildItemsBadge - badge and popup rendering", () => {
  it("shows the completed / total count", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf(), childOf(), childOf()],
      completedCount: 2,
      userDirectory: new FakeUserDirectory(),
    });

    expect(badgeOf(root).textContent).toBe("2 / 3");
  });

  it("tints the badge with a discrete wash of the supplied type color", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
      userDirectory: new FakeUserDirectory(),
      color: "#4FC3F7",
    });

    expect(containsColor(badgeOf(root).style.background, "rgba(79,195,247,0.12)")).toBe(true);
    expect(containsColor(badgeOf(root).style.borderColor, "rgba(79,195,247,0.35)")).toBe(true);
  });

  it("falls back to a neutral themed chip when no usable color is supplied", () => {
    const withoutColor = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
      userDirectory: new FakeUserDirectory(),
    });
    const withGarbage = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
      userDirectory: new FakeUserDirectory(),
      color: "not-a-color",
    });

    expect(badgeOf(withoutColor).style.background).toContain("--palette-neutral-4");
    expect(badgeOf(withGarbage).style.background).toContain("--palette-neutral-4");
  });

  it("does not render a popup until the badge is clicked", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 1,
      userDirectory: new FakeUserDirectory(),
    });

    expect(popupOf(root)).toBeNull();
  });

  it("opens a popup with one row per child on click", () => {
    document.body.innerHTML = "";
    const root = renderChildItemsBadge(document, {
      children: [childOf({ title: "First" }), childOf({ title: "Second" })],
      completedCount: 1,
      userDirectory: new FakeUserDirectory(),
    });
    document.body.append(root);

    badgeOf(root).click();

    const rows = root.querySelectorAll(".awesomeado-child-items__row");
    expect(rows).toHaveLength(2);
  });
});

describe("renderChildItemsBadge - row content", () => {
  it("renders each child's assignee via the shared AssignedTo control", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
      userDirectory: new FakeUserDirectory(),
    });
    document.body.append(root);

    badgeOf(root).click();

    const assignee = popupOf(root)!.querySelector(".awesomeado-assigned__name");
    expect(assignee?.textContent).toBe("Alice");
  });

  it("colors the child title with its type color", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf({ titleColor: "#CC293D" })],
      completedCount: 0,
      userDirectory: new FakeUserDirectory(),
    });
    document.body.append(root);

    badgeOf(root).click();

    const title = popupOf(root)!.querySelector<HTMLElement>(".awesomeado-child-items__title")!;
    expect(title.style.color).toBe("rgb(204, 41, 61)");
  });
});

describe("renderChildItemsBadge - row ETA slot", () => {
  it("places the caller's ETA control between the title and the open affordance", () => {
    const eta = document.createElement("span");
    eta.className = "fake-eta";
    eta.textContent = "Aug 15";
    const root = renderChildItemsBadge(document, {
      children: [childOf({ eta })],
      completedCount: 0,
      userDirectory: new FakeUserDirectory(),
    });
    document.body.append(root);

    badgeOf(root).click();

    const row = popupOf(root)!.querySelector<HTMLElement>(".awesomeado-child-items__row")!;
    const classes = [...row.children].map((child) => child.className);
    expect(classes).toEqual([
      "awesomeado-assigned",
      "awesomeado-child-items__title",
      "fake-eta awesomeado-child-items__eta",
      "awesomeado-child-items__open",
    ]);
    expect(row.textContent).toContain("Aug 15");
  });

  it("omits the ETA slot for a child with no ETA control", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf({ eta: null })],
      completedCount: 0,
      userDirectory: new FakeUserDirectory(),
    });
    document.body.append(root);

    badgeOf(root).click();

    expect(popupOf(root)!.querySelector(".awesomeado-child-items__eta")).toBeNull();
  });
});

describe("renderChildItemsBadge - row open affordance", () => {
  it("links the child's icon to its ADO url in a new tab", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf({ url: "https://dev.azure.com/contoso/web/_workitems/edit/42" })],
      completedCount: 0,
      userDirectory: new FakeUserDirectory(),
    });
    document.body.append(root);

    badgeOf(root).click();

    const link = popupOf(root)!.querySelector<HTMLAnchorElement>(".awesomeado-child-items__open")!;
    expect(link.href).toBe("https://dev.azure.com/contoso/web/_workitems/edit/42");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.querySelector("img")?.getAttribute("src")).toBe("https://example.com/story.png");
  });

  it("renders an inert affordance when the child has no url", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf({ url: null, iconUrl: null })],
      completedCount: 0,
      userDirectory: new FakeUserDirectory(),
    });
    document.body.append(root);

    badgeOf(root).click();

    expect(popupOf(root)!.querySelector(".awesomeado-child-items__open")).toBeNull();
    // The fallback glyph is still present so the row lines up.
    expect(popupOf(root)!.querySelector(".awesomeado-child-items__icon")?.textContent).toBe(
      "\u2197",
    );
  });
});

describe("renderChildItemsBadge - interaction and dismissal", () => {
  it("forwards a picked assignee to the child's onAssigneeChange", async () => {
    const directory = new FakeUserDirectory();
    directory.setSearchResults([
      { displayName: "Bob", uniqueName: "bob@example.com", imageUrl: null },
    ]);
    const onAssigneeChange = vi.fn();
    const root = renderChildItemsBadge(document, {
      children: [childOf({ onAssigneeChange })],
      completedCount: 0,
      userDirectory: directory,
    });
    document.body.append(root);

    badgeOf(root).click();
    const assigneeName = popupOf(root)!.querySelector<HTMLElement>(".awesomeado-assigned__name")!;
    assigneeName.click();
    const searchInput = popupOf(root)!.querySelector<HTMLInputElement>(
      ".awesomeado-assigned__search",
    )!;
    searchInput.value = "Bob";
    searchInput.dispatchEvent(new Event("input"));
    await Promise.resolve();

    const result = popupOf(root)!.querySelector<HTMLButtonElement>(
      ".awesomeado-assigned__result button",
    )!;
    result.click();

    expect(onAssigneeChange).toHaveBeenCalledWith(expect.objectContaining({ displayName: "Bob" }));
  });

  it("toggles the popup closed on a second badge click", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
      userDirectory: new FakeUserDirectory(),
    });
    document.body.append(root);

    badgeOf(root).click();
    expect(popupOf(root)).not.toBeNull();

    badgeOf(root).click();
    expect(popupOf(root)).toBeNull();
  });

  it("closes the popup on Escape", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
      userDirectory: new FakeUserDirectory(),
    });
    document.body.append(root);

    badgeOf(root).click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(popupOf(root)).toBeNull();
  });

  it("closes the popup on an outside pointerdown", () => {
    const outside = document.createElement("div");
    document.body.append(outside);
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
      userDirectory: new FakeUserDirectory(),
    });
    document.body.append(root);

    badgeOf(root).click();
    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(popupOf(root)).toBeNull();
  });

  it("keeps the popup open when a pointerdown lands inside it", () => {
    const root = renderChildItemsBadge(document, {
      children: [childOf()],
      completedCount: 0,
      userDirectory: new FakeUserDirectory(),
    });
    document.body.append(root);

    badgeOf(root).click();
    popupOf(root)!.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(popupOf(root)).not.toBeNull();
  });
});
