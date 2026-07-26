import { describe, expect, it } from "vitest";

import type { DirectoryUser, IUserDirectory } from "../../../ado/IUserDirectory";
import type { TrackedUser } from "../../../ado/TrackedWorkItem";

import { renderAssignedTo } from "./AssignedTo";

/**
 * A fake user directory for testing: returns controlled search results via a promise.
 */
class FakeUserDirectory implements IUserDirectory {
  private searchResults: DirectoryUser[] = [];

  /** Configure the next search result. */
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

describe("renderAssignedTo", () => {
  it("shows the user's display name when assigned", () => {
    const user: TrackedUser = {
      displayName: "Alice",
      uniqueName: "alice@example.com",
      imageUrl: null,
    };
    const directory = new FakeUserDirectory();

    const control = renderAssignedTo(document, { user, userDirectory: directory });

    expect(control.querySelector(".awesomeado-assigned__name")?.textContent).toBe("Alice");
  });

  it("shows 'Unassigned' when user is null", () => {
    const directory = new FakeUserDirectory();

    const control = renderAssignedTo(document, { user: null, userDirectory: directory });

    expect(control.querySelector(".awesomeado-assigned__name")?.textContent).toBe("Unassigned");
  });

  it("styles the name button as clickable text with no border or background", () => {
    const user: TrackedUser = {
      displayName: "Bob",
      uniqueName: "bob@example.com",
      imageUrl: null,
    };
    const directory = new FakeUserDirectory();

    const control = renderAssignedTo(document, { user, userDirectory: directory });
    const nameButton = control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name");

    // Assert against the raw cssText: jsdom's CSSOM normalizes `border:none`→`border: medium` and
    // drops `background:transparent`, so the source declaration is the deterministic thing to check.
    const style = nameButton?.style.cssText ?? "";
    expect(style).toContain("cursor: pointer");
    expect(style).toContain("padding: 0");
    // The simplified control reads as plain clickable text: no bordered/filled "box" chrome.
    expect(style).not.toContain("solid");
    expect(style).not.toContain("background:");
  });

  it("opens a popup with a search input when the name button is clicked", () => {
    const user: TrackedUser = { displayName: "Dave", uniqueName: null, imageUrl: null };
    const directory = new FakeUserDirectory();

    const control = renderAssignedTo(document, { user, userDirectory: directory });
    const nameButton = control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name");
    nameButton?.click();

    const popup = control.querySelector(".awesomeado-assigned__popup");
    expect(popup).not.toBeNull();

    const searchInput = popup?.querySelector<HTMLInputElement>(".awesomeado-assigned__search");
    expect(searchInput?.placeholder).toBe("Search people…");
  });
});

describe("renderAssignedTo - search results and selection", () => {
  it("triggers a search and renders results when typing in the search input", async () => {
    const directory = new FakeUserDirectory();
    directory.setSearchResults([
      { displayName: "Eve", uniqueName: "eve@example.com", imageUrl: null },
      { displayName: "Frank", uniqueName: "frank@example.com", imageUrl: null },
    ]);

    const control = renderAssignedTo(document, { user: null, userDirectory: directory });
    const nameButton = control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name");
    nameButton?.click();

    const searchInput = control.querySelector<HTMLInputElement>(".awesomeado-assigned__search");
    searchInput!.value = "e";
    searchInput!.dispatchEvent(new Event("input"));

    // Flush microtasks to resolve the search promise.
    await Promise.resolve();

    const results = control.querySelectorAll(".awesomeado-assigned__result button");
    expect(results).toHaveLength(2);
    expect(results[0]?.textContent).toBe("Eve");
    expect(results[1]?.textContent).toBe("Frank");
  });

  it("calls onChange with the selected user and closes the popup", async () => {
    const directory = new FakeUserDirectory();
    directory.setSearchResults([
      { displayName: "Grace", uniqueName: "grace@example.com", imageUrl: null },
    ]);

    let selectedUser: DirectoryUser | null = null;
    const onChange = (user: DirectoryUser) => {
      selectedUser = user;
    };

    const control = renderAssignedTo(document, { user: null, userDirectory: directory, onChange });
    const nameButton = control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name");
    nameButton?.click();

    const searchInput = control.querySelector<HTMLInputElement>(".awesomeado-assigned__search");
    searchInput!.value = "g";
    searchInput!.dispatchEvent(new Event("input"));

    await Promise.resolve();

    const resultButton = control.querySelector<HTMLButtonElement>(
      ".awesomeado-assigned__result button",
    );
    resultButton?.click();

    expect(selectedUser).toEqual({
      displayName: "Grace",
      uniqueName: "grace@example.com",
      imageUrl: null,
    });
    expect(control.querySelector(".awesomeado-assigned__popup")).toBeNull();
  });

  it("updates the name button label after selecting a user", async () => {
    const directory = new FakeUserDirectory();
    directory.setSearchResults([
      { displayName: "Henry", uniqueName: "henry@example.com", imageUrl: null },
    ]);

    const control = renderAssignedTo(document, { user: null, userDirectory: directory });
    const nameButton = control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name");
    nameButton?.click();

    const searchInput = control.querySelector<HTMLInputElement>(".awesomeado-assigned__search");
    searchInput!.value = "h";
    searchInput!.dispatchEvent(new Event("input"));

    await Promise.resolve();

    const resultButton = control.querySelector<HTMLButtonElement>(
      ".awesomeado-assigned__result button",
    );
    resultButton?.click();

    expect(nameButton?.textContent).toBe("Henry");
  });
});

describe("renderAssignedTo - popup dismissal", () => {
  it("closes the popup when clicking the name button again", () => {
    const directory = new FakeUserDirectory();

    const control = renderAssignedTo(document, { user: null, userDirectory: directory });
    const nameButton = control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name");

    // Open.
    nameButton?.click();
    expect(control.querySelector(".awesomeado-assigned__popup")).not.toBeNull();

    // Close.
    nameButton?.click();
    expect(control.querySelector(".awesomeado-assigned__popup")).toBeNull();
  });

  it("closes the popup when pressing Escape in the search input", () => {
    const directory = new FakeUserDirectory();

    const control = renderAssignedTo(document, { user: null, userDirectory: directory });
    const nameButton = control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name");
    nameButton?.click();

    const searchInput = control.querySelector<HTMLInputElement>(".awesomeado-assigned__search");
    searchInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));

    expect(control.querySelector(".awesomeado-assigned__popup")).toBeNull();
  });
});

describe("renderAssignedTo - concurrency and injection safety", () => {
  it("ignores out-of-order search responses (stale response does not overwrite newer one)", async () => {
    // A directory that resolves promises in controlled order.
    class DelayedDirectory implements IUserDirectory {
      private pendingResolvers: Array<(users: DirectoryUser[]) => void> = [];

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      search(_query: string): Promise<DirectoryUser[]> {
        return new Promise((resolve) => {
          this.pendingResolvers.push(resolve);
        });
      }

      resolve(): Promise<DirectoryUser | null> {
        return Promise.resolve(null);
      }

      /** Resolve the i-th pending search with the given users. */
      resolvePending(index: number, users: DirectoryUser[]): void {
        this.pendingResolvers[index]?.(users);
      }
    }

    const directory = new DelayedDirectory();
    const control = renderAssignedTo(document, { user: null, userDirectory: directory });

    const nameButton = control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name");
    nameButton?.click();

    const searchInput = control.querySelector<HTMLInputElement>(".awesomeado-assigned__search");

    // Trigger two searches.
    searchInput!.value = "a";
    searchInput!.dispatchEvent(new Event("input"));

    searchInput!.value = "b";
    searchInput!.dispatchEvent(new Event("input"));

    // Resolve the second search first (newer).
    directory.resolvePending(1, [{ displayName: "NewUser", uniqueName: null, imageUrl: null }]);
    await Promise.resolve();

    // Resolve the first search second (stale).
    directory.resolvePending(0, [{ displayName: "StaleUser", uniqueName: null, imageUrl: null }]);
    await Promise.resolve();

    // Only the newer result should be visible.
    const results = control.querySelectorAll(".awesomeado-assigned__result button");
    expect(results).toHaveLength(1);
    expect(results[0]?.textContent).toBe("NewUser");
  });

  it("inserts result displayName as text so a name containing HTML tags does not inject markup", async () => {
    const directory = new FakeUserDirectory();
    directory.setSearchResults([
      { displayName: "<img src=x onerror=alert(1)>", uniqueName: null, imageUrl: null },
    ]);

    const control = renderAssignedTo(document, { user: null, userDirectory: directory });
    const nameButton = control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name");
    nameButton?.click();

    const searchInput = control.querySelector<HTMLInputElement>(".awesomeado-assigned__search");
    searchInput!.value = "x";
    searchInput!.dispatchEvent(new Event("input"));

    await Promise.resolve();

    const resultButton = control.querySelector<HTMLButtonElement>(
      ".awesomeado-assigned__result button",
    );
    // No <img> child should be created from the string.
    expect(resultButton?.querySelector("img")).toBeNull();
    expect(resultButton?.textContent).toBe("<img src=x onerror=alert(1)>");
  });
});

describe("renderAssignedTo - tag pill display", () => {
  it("renders the assignee's tag pill when showTag is on", () => {
    const user: TrackedUser = {
      displayName: "Alice",
      uniqueName: "alice@example.com",
      imageUrl: null,
      tag: "Core",
    };
    const directory = new FakeUserDirectory();

    const control = renderAssignedTo(document, { user, userDirectory: directory, showTag: true });

    expect(control.querySelector(".awesomeado-tag-pill")?.textContent).toBe("Core");
  });

  it("renders the neutral ?? pill when showTag is on and the assignee has no tag", () => {
    const user: TrackedUser = {
      displayName: "Bob",
      uniqueName: "bob@example.com",
      imageUrl: null,
      tag: null,
    };
    const directory = new FakeUserDirectory();

    const control = renderAssignedTo(document, { user, userDirectory: directory, showTag: true });

    const pill = control.querySelector(".awesomeado-tag-pill");
    expect(pill?.textContent).toBe("??");
    expect(pill?.classList.contains("awesomeado-tag-pill--untagged")).toBe(true);
  });

  it("renders no tag pill by default", () => {
    const user: TrackedUser = {
      displayName: "Carol",
      uniqueName: "carol@example.com",
      imageUrl: null,
      tag: "Core",
    };
    const directory = new FakeUserDirectory();

    const control = renderAssignedTo(document, { user, userDirectory: directory });

    expect(control.querySelector(".awesomeado-tag-pill")).toBeNull();
  });

  it("renders no tag pill for an unassigned slot even with showTag on", () => {
    const directory = new FakeUserDirectory();

    const control = renderAssignedTo(document, {
      user: null,
      userDirectory: directory,
      showTag: true,
    });

    expect(control.querySelector(".awesomeado-tag-pill")).toBeNull();
  });
});

// Shared by every tag-editor group below (module scope so the sibling describes stay within
// max-lines-per-function without duplicating the fixture/helper).
const alice: TrackedUser = {
  displayName: "Alice",
  uniqueName: "alice@example.com",
  imageUrl: null,
  tag: "Core",
};

/** Render an editable-tag control and return its pieces. */
function renderEditable(tags: string[], onTagChange: (tag: string) => void): HTMLElement {
  return renderAssignedTo(document, {
    user: alice,
    userDirectory: new FakeUserDirectory(),
    showTag: true,
    assignableTags: tags,
    onTagChange,
  });
}

describe("renderAssignedTo tag editor - opening and selection", () => {
  it("leaves the pill read-only (no cursor pointer, no popup) when onTagChange is absent", () => {
    const control = renderAssignedTo(document, {
      user: alice,
      userDirectory: new FakeUserDirectory(),
      showTag: true,
      assignableTags: ["Core", "Platform"],
    });
    const pill = control.querySelector<HTMLElement>(".awesomeado-tag-pill");
    pill?.click();

    expect(pill?.style.cursor).not.toBe("pointer");
    expect(control.querySelector(".awesomeado-assigned__tag-popup")).toBeNull();
  });

  it("opens the tag editor listing the existing tags plus an add field on click", () => {
    const control = renderEditable(["Core", "Platform"], () => {});
    const pill = control.querySelector<HTMLElement>(".awesomeado-tag-pill");
    pill?.click();

    const popup = control.querySelector(".awesomeado-assigned__tag-popup");
    expect(popup).not.toBeNull();
    const choices = popup!.querySelectorAll(
      ".awesomeado-assigned__tag-choices .awesomeado-tag-pill",
    );
    expect([...choices].map((c) => c.textContent)).toEqual(["Core", "Platform"]);
    expect(popup!.querySelector(".awesomeado-assigned__tag-input")).not.toBeNull();
  });

  it("calls onTagChange with a chosen existing tag, repaints the pill, and closes", () => {
    let picked: string | null = null;
    const control = renderEditable(["Core", "Platform"], (tag) => {
      picked = tag;
    });
    const pill = control.querySelector<HTMLElement>(".awesomeado-tag-pill");
    pill?.click();

    const choice = [
      ...control.querySelectorAll<HTMLButtonElement>(
        ".awesomeado-assigned__tag-choices .awesomeado-tag-pill",
      ),
    ].find((c) => c.textContent === "Platform");
    choice?.click();

    expect(picked).toBe("Platform");
    expect(pill?.textContent).toBe("Platform");
    expect(control.querySelector(".awesomeado-assigned__tag-popup")).toBeNull();
  });
});

describe("renderAssignedTo tag editor - add field", () => {
  it("adds a new valid tag via the Add button", () => {
    let picked: string | null = null;
    const control = renderEditable(["Core"], (tag) => {
      picked = tag;
    });
    control.querySelector<HTMLElement>(".awesomeado-tag-pill")?.click();

    const input = control.querySelector<HTMLInputElement>(".awesomeado-assigned__tag-input")!;
    const addButton = control.querySelector<HTMLButtonElement>(
      ".awesomeado-assigned__tag-add-button",
    )!;
    input.value = "Data";
    input.dispatchEvent(new Event("input"));

    expect(addButton.disabled).toBe(false);
    addButton.click();

    expect(picked).toBe("Data");
  });

  it("strips spaces from the add field as they are typed", () => {
    const control = renderEditable(["Core"], () => {});
    control.querySelector<HTMLElement>(".awesomeado-tag-pill")?.click();

    const input = control.querySelector<HTMLInputElement>(".awesomeado-assigned__tag-input")!;
    input.value = "Data Team";
    input.dispatchEvent(new Event("input"));

    expect(input.value).toBe("DataTeam");
  });

  it("caps the add field length at 15 characters", () => {
    const control = renderEditable([], () => {});
    control.querySelector<HTMLElement>(".awesomeado-tag-pill")?.click();

    const input = control.querySelector<HTMLInputElement>(".awesomeado-assigned__tag-input")!;
    expect(input.maxLength).toBe(15);
  });

  it("disables Add for a duplicate of an existing tag (case-insensitive)", () => {
    let picked: string | null = null;
    const control = renderEditable(["Core"], (tag) => {
      picked = tag;
    });
    control.querySelector<HTMLElement>(".awesomeado-tag-pill")?.click();

    const input = control.querySelector<HTMLInputElement>(".awesomeado-assigned__tag-input")!;
    const addButton = control.querySelector<HTMLButtonElement>(
      ".awesomeado-assigned__tag-add-button",
    )!;
    input.value = "core";
    input.dispatchEvent(new Event("input"));

    expect(addButton.disabled).toBe(true);

    // Clicking the disabled Add must not commit the duplicate.
    addButton.click();
    expect(picked).toBeNull();
  });

  it("commits a valid new tag on Enter", () => {
    let picked: string | null = null;
    const control = renderEditable([], (tag) => {
      picked = tag;
    });
    control.querySelector<HTMLElement>(".awesomeado-tag-pill")?.click();

    const input = control.querySelector<HTMLInputElement>(".awesomeado-assigned__tag-input")!;
    input.value = "Infra";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(picked).toBe("Infra");
  });
});
