import { afterEach, describe, expect, it } from "vitest";

import type { DirectoryUser, IUserDirectory } from "../../../ado/IUserDirectory";
import type { TrackedUser } from "../../../ado/TrackedWorkItem";

import { renderAssignedTo, type AssignedToHandle } from "./AssignedTo";

/**
 * A fake user directory for testing: returns controlled search results via a promise.
 */
class FakeUserDirectory implements IUserDirectory {
  private searchResults: DirectoryUser[] = [];
  /** Every query the control asked the directory about, in order. */
  readonly queries: string[] = [];

  /** Configure the next search result. */
  setSearchResults(users: DirectoryUser[]): void {
    this.searchResults = users;
  }

  search(query: string): Promise<DirectoryUser[]> {
    this.queries.push(query);
    return Promise.resolve(this.searchResults);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  resolve(_nameOrUnique: string): Promise<DirectoryUser | null> {
    return Promise.resolve(null);
  }
}

afterEach(() => {
  document.body.innerHTML = "";
});

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

describe("renderAssignedTo - suggestions", () => {
  const crew: DirectoryUser[] = [
    { displayName: "Ada Lovelace", uniqueName: "ada@example.com", imageUrl: null },
    { displayName: "Grace Hopper", uniqueName: "grace@example.com", imageUrl: null },
  ];

  const openPicker = (directory: FakeUserDirectory): HTMLElement => {
    const control = renderAssignedTo(document, {
      user: null,
      userDirectory: directory,
      suggestions: () => crew,
    });
    document.body.append(control);
    control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")?.click();
    return control;
  };

  it("lists the caller's suggestions the moment the picker opens, with no search", () => {
    const directory = new FakeUserDirectory();

    const control = openPicker(directory);

    const results = control.querySelectorAll(".awesomeado-assigned__result button");
    expect(
      [...results].map((r) => r.querySelector(".awesomeado-assigned__result-name")?.textContent),
    ).toEqual(["Ada Lovelace", "Grace Hopper"]);
    expect(directory.queries).toEqual([]);
  });

  it("filters the suggestions locally without asking the directory below the search minimum", () => {
    const directory = new FakeUserDirectory();
    const control = openPicker(directory);

    const searchInput = control.querySelector<HTMLInputElement>(".awesomeado-assigned__search")!;
    searchInput.value = "a";
    searchInput.dispatchEvent(new Event("input"));

    const results = control.querySelectorAll(".awesomeado-assigned__result button");
    expect(results).toHaveLength(2);
    expect(directory.queries).toEqual([]);
    expect(control.querySelector(".awesomeado-assigned__status")?.textContent).toBe(
      "Keep typing to search Azure DevOps…",
    );
  });

  it("keeps a matching suggestion first and appends the directory's other matches", async () => {
    const directory = new FakeUserDirectory();
    directory.setSearchResults([
      // The same person the suggestions already offer must not be listed twice.
      { displayName: "Grace Hopper", uniqueName: "grace@example.com", imageUrl: null },
      { displayName: "Gracie Fields", uniqueName: "gracie@example.com", imageUrl: null },
    ]);
    const control = openPicker(directory);

    const searchInput = control.querySelector<HTMLInputElement>(".awesomeado-assigned__search")!;
    searchInput.value = "grace";
    searchInput.dispatchEvent(new Event("input"));
    await Promise.resolve();

    const names = [...control.querySelectorAll(".awesomeado-assigned__result-name")].map(
      (n) => n.textContent,
    );
    expect(names).toEqual(["Grace Hopper", "Gracie Fields"]);
    expect(directory.queries).toEqual(["grace"]);
  });

  it("says so when the directory found nobody", async () => {
    const directory = new FakeUserDirectory();
    const control = openPicker(directory);

    const searchInput = control.querySelector<HTMLInputElement>(".awesomeado-assigned__search")!;
    searchInput.value = "zzz";
    searchInput.dispatchEvent(new Event("input"));
    await Promise.resolve();

    expect(control.querySelector(".awesomeado-assigned__status")?.textContent).toBe(
      "No people found.",
    );
  });

  it("invites a search when it has no suggestions to offer", () => {
    const control = renderAssignedTo(document, {
      user: null,
      userDirectory: new FakeUserDirectory(),
    });
    document.body.append(control);
    control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")?.click();

    expect(control.querySelector(".awesomeado-assigned__status")?.textContent).toBe(
      "Type a name to search Azure DevOps.",
    );
  });
});

describe("renderAssignedTo - search progress", () => {
  /** Open a picker whose directory answers only when the returned `release` is called. */
  const openWithPendingSearch = (): {
    control: AssignedToHandle;
    search: HTMLInputElement;
    release: (users: DirectoryUser[]) => void;
  } => {
    let release: (users: DirectoryUser[]) => void = () => {};
    const directory: IUserDirectory = {
      search: () =>
        new Promise<DirectoryUser[]>((resolve) => {
          release = resolve;
        }),
      resolve: () => Promise.resolve(null),
    };
    const control = renderAssignedTo(document, { user: null, userDirectory: directory });
    document.body.append(control);
    control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")?.click();
    return {
      control,
      search: control.querySelector<HTMLInputElement>(".awesomeado-assigned__search")!,
      release: (users) => release(users),
    };
  };

  it("shows nothing spinning until a search actually starts", () => {
    const { control } = openWithPendingSearch();

    expect(control.querySelector<HTMLElement>(".awesomeado-assigned__spinner")?.style.display).toBe(
      "none",
    );
  });

  it("spins while the directory round-trip is pending and stops when it answers", async () => {
    const { control, search, release } = openWithPendingSearch();
    const spinner = control.querySelector<HTMLElement>(".awesomeado-assigned__spinner")!;

    search.value = "ada";
    search.dispatchEvent(new Event("input"));

    expect(spinner.style.display).toBe("inline-block");
    expect(control.querySelector(".awesomeado-assigned__status")?.textContent).toBe(
      "Searching Azure DevOps…",
    );

    release([{ displayName: "Ada", uniqueName: "ada@example.com", imageUrl: null }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(spinner.style.display).toBe("none");
    expect(control.querySelectorAll(".awesomeado-assigned__result button")).toHaveLength(1);
  });
});

/** The project crew the picker offers before anything is typed; Grace deliberately has no tag. */
const taggedCrew: TrackedUser[] = [
  { displayName: "Ada Lovelace", uniqueName: "ada@example.com", imageUrl: null, tag: "Platform" },
  { displayName: "Grace Hopper", uniqueName: "grace@example.com", imageUrl: null, tag: null },
  { displayName: "Alan Turing", uniqueName: "alan@example.com", imageUrl: null, tag: "Compiler" },
];

/** Render a tagging picker over `taggedCrew`, open it, and hand back its root and search box. */
const openTaggedPicker = (
  onChange?: (user: DirectoryUser) => void,
): { control: AssignedToHandle; search: HTMLInputElement } => {
  const control = renderAssignedTo(document, {
    user: null,
    userDirectory: new FakeUserDirectory(),
    suggestions: () => taggedCrew,
    onChange,
  });
  document.body.append(control);
  control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")?.click();
  return {
    control,
    search: control.querySelector<HTMLInputElement>(".awesomeado-assigned__search")!,
  };
};

const pressKey = (search: HTMLInputElement, key: string): void => {
  search.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
};

/** The one result row wearing the highlight fill — what Enter would commit. */
const highlightedName = (control: HTMLElement): string | undefined =>
  [...control.querySelectorAll<HTMLButtonElement>(".awesomeado-assigned__result button")]
    .find((row) => row.style.background !== "transparent")
    ?.querySelector(".awesomeado-assigned__result-name")?.textContent ?? undefined;

describe("renderAssignedTo - picker tags", () => {
  it("puts the caret in the search box as soon as the picker opens", () => {
    const { search } = openTaggedPicker();

    expect(document.activeElement).toBe(search);
  });

  it("shows each offered person's crew tag, and '??' for anyone without one", () => {
    // The chip itself is tagless here, proving the picker tags its rows off the offered people.
    const { control } = openTaggedPicker();

    const pills = [
      ...control.querySelectorAll(".awesomeado-assigned__result .awesomeado-tag-pill"),
    ];
    expect(pills.map((pill) => pill.textContent)).toEqual(["Platform", "??", "Compiler"]);
  });

  it("leaves the results untagged when the offered people carry no tags at all", () => {
    const control = renderAssignedTo(document, {
      user: null,
      userDirectory: new FakeUserDirectory(),
      suggestions: () => [
        { displayName: "Ada Lovelace", uniqueName: "ada@example.com", imageUrl: null },
      ],
    });
    document.body.append(control);
    control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")?.click();

    expect(
      control.querySelectorAll(".awesomeado-assigned__result .awesomeado-tag-pill"),
    ).toHaveLength(0);
  });
});

describe("renderAssignedTo - picker keyboard", () => {
  it("highlights the first person so Enter alone accepts the top match", () => {
    let picked: DirectoryUser | null = null;
    const { control, search } = openTaggedPicker((user) => (picked = user));

    expect(highlightedName(control)).toBe("Ada Lovelace");

    pressKey(search, "Enter");

    expect(picked).toEqual(taggedCrew[0]);
    expect(control.querySelector(".awesomeado-assigned__popup")).toBeNull();
  });

  it("walks the list with the arrow keys and commits the highlighted person on Enter", () => {
    let picked: DirectoryUser | null = null;
    const { control, search } = openTaggedPicker((user) => (picked = user));

    pressKey(search, "ArrowDown");
    pressKey(search, "ArrowDown");
    expect(highlightedName(control)).toBe("Alan Turing");

    pressKey(search, "ArrowUp");
    expect(highlightedName(control)).toBe("Grace Hopper");

    pressKey(search, "Enter");
    expect(picked).toEqual(taggedCrew[1]);
  });

  it("wraps the highlight around both ends of the list", () => {
    const { control, search } = openTaggedPicker();

    pressKey(search, "ArrowUp");
    expect(highlightedName(control)).toBe("Alan Turing");

    pressKey(search, "ArrowDown");
    expect(highlightedName(control)).toBe("Ada Lovelace");
  });

  it("paints the highlight with a self-contained grey so it reads under 'Follow ADO'", () => {
    const { control } = openTaggedPicker();

    // A --palette-neutral-* token resolves to ADO's own surface color on that theme, which is what
    // the popup is already painted with, leaving the highlighted row invisible.
    const highlighted = control.querySelector<HTMLButtonElement>(
      ".awesomeado-assigned__result button",
    )!;
    expect(highlighted.style.background).toContain("rgba(128, 128, 128");
    expect(highlighted.style.background).not.toContain("palette-neutral");
  });

  it("re-highlights the top row after the list is filtered", () => {
    let picked: DirectoryUser | null = null;
    const { control, search } = openTaggedPicker((user) => (picked = user));

    pressKey(search, "ArrowDown");
    // Matches everyone, so a stale index would survive; only an explicit reset lands back on top.
    search.value = "a";
    search.dispatchEvent(new Event("input"));

    expect(highlightedName(control)).toBe("Ada Lovelace");

    pressKey(search, "Enter");
    expect(picked).toEqual(taggedCrew[0]);
  });

  it("does nothing on Enter when nobody matches the query", () => {
    let picked: DirectoryUser | null = null;
    const { control, search } = openTaggedPicker((user) => (picked = user));

    search.value = "zz";
    search.dispatchEvent(new Event("input"));
    pressKey(search, "ArrowDown");
    pressKey(search, "Enter");

    expect(picked).toBeNull();
    // A dead Enter must not dismiss the picker: the query is still there to be corrected.
    expect(control.querySelector(".awesomeado-assigned__popup")).not.toBeNull();
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
    searchInput!.value = "ev";
    searchInput!.dispatchEvent(new Event("input"));

    // Flush microtasks to resolve the search promise.
    await Promise.resolve();

    const results = control.querySelectorAll(".awesomeado-assigned__result button");
    expect(results).toHaveLength(2);
    expect(results[0]?.textContent).toContain("Eve");
    expect(results[1]?.textContent).toContain("Frank");
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
    searchInput!.value = "gr";
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

  it("leaves the label untouched on pick and only repaints it through setUser", async () => {
    const directory = new FakeUserDirectory();
    directory.setSearchResults([
      { displayName: "Henry", uniqueName: "henry@example.com", imageUrl: null },
    ]);

    const control = renderAssignedTo(document, { user: null, userDirectory: directory });
    const nameButton = control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name");
    nameButton?.click();

    const searchInput = control.querySelector<HTMLInputElement>(".awesomeado-assigned__search");
    searchInput!.value = "he";
    searchInput!.dispatchEvent(new Event("input"));

    await Promise.resolve();

    const resultButton = control.querySelector<HTMLButtonElement>(
      ".awesomeado-assigned__result button",
    );
    resultButton?.click();

    // Persist-then-reflect: nothing is painted until the owner confirms ADO accepted the write.
    expect(nameButton?.textContent).toBe("Unassigned");

    control.setUser({ displayName: "Henry", uniqueName: "henry@example.com", imageUrl: null });
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

  it("closes the popup when pressing Escape", () => {
    const directory = new FakeUserDirectory();

    const control = renderAssignedTo(document, { user: null, userDirectory: directory });
    // The shared popup host dismisses from document-level capture listeners, so the control has to
    // be in the document for the event to reach them.
    document.body.append(control);
    const nameButton = control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name");
    nameButton?.click();

    const searchInput = control.querySelector<HTMLInputElement>(".awesomeado-assigned__search");
    searchInput?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(control.querySelector(".awesomeado-assigned__popup")).toBeNull();
  });

  it("closes the popup on a pointerdown outside the control", () => {
    const outside = document.createElement("div");
    document.body.append(outside);
    const control = renderAssignedTo(document, {
      user: null,
      userDirectory: new FakeUserDirectory(),
    });
    document.body.append(control);
    control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")?.click();
    expect(control.querySelector(".awesomeado-assigned__popup")).not.toBeNull();

    outside.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(control.querySelector(".awesomeado-assigned__popup")).toBeNull();
  });

  it("keeps the popup open when a pointerdown lands inside it", () => {
    const control = renderAssignedTo(document, {
      user: null,
      userDirectory: new FakeUserDirectory(),
    });
    document.body.append(control);
    control.querySelector<HTMLButtonElement>(".awesomeado-assigned__name")?.click();

    control
      .querySelector(".awesomeado-assigned__popup")
      ?.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    expect(control.querySelector(".awesomeado-assigned__popup")).not.toBeNull();
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
    searchInput!.value = "aa";
    searchInput!.dispatchEvent(new Event("input"));

    searchInput!.value = "bb";
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
    searchInput!.value = "xx";
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

  it("hides the tag pill for an unassigned slot even with showTag on", () => {
    const directory = new FakeUserDirectory();

    const control = renderAssignedTo(document, {
      user: null,
      userDirectory: directory,
      showTag: true,
    });

    // The pill is built but hidden, so a later reassignment reveals it without rebuilding the chip.
    const pill = control.querySelector<HTMLElement>(".awesomeado-tag-pill");
    expect(pill?.style.display).toBe("none");

    control.setUser({ displayName: "Dana", uniqueName: null, imageUrl: null, tag: "Core" });
    expect(pill?.style.display).toBe("");
    expect(pill?.textContent).toBe("Core");
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
