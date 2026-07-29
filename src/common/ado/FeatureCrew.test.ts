import { describe, expect, it } from "vitest";

import {
  buildFeatureCrewUrls,
  collectAssignedDirectoryUsers,
  collectAssignedTags,
  collectFeatureCrewAssignees,
  applyFeatureCrewTags,
  applyTagAssignments,
  deriveAlias,
  formatFeatureCrewDescription,
  mergeFeatureCrew,
  parseFeatureCrewDescription,
  type FeatureCrewAssignee,
  type FeatureCrewMember,
} from "./FeatureCrew";
import type { TrackedUser, TrackedWorkItem } from "./TrackedWorkItem";

function user(displayName: string, uniqueName: string | null): TrackedUser {
  return { displayName, uniqueName, imageUrl: null };
}

function item(
  id: number,
  assignedTo: TrackedUser | null,
  children: TrackedWorkItem[] = [],
): TrackedWorkItem {
  return {
    id,
    rev: 1,
    type: "Task",
    title: `Item ${id}`,
    state: "Active",
    priority: null,
    assignedTo,
    iterationPath: null,
    sprintName: null,
    createdDate: "2024-01-01T00:00:00Z",
    createdBy: null,
    changedDate: "2024-01-01T00:00:00Z",
    changedBy: null,
    stateChangeDate: "2024-01-01T00:00:00Z",
    description: "",
    tags: [],
    importance: 1,
    noteCount: 0,
    eta: null,
    children,
  };
}

describe("deriveAlias", () => {
  it("uses the email local-part when the unique name is an email", () => {
    expect(deriveAlias("alice@contoso.com", "Alice Anderson")).toBe("alice");
  });

  it("uses the whole unique name when it is not an email", () => {
    expect(deriveAlias("CONTOSO\\bob", "Bob Brown")).toBe("CONTOSO\\bob");
  });

  it("falls back to the display name when the unique name is null", () => {
    expect(deriveAlias(null, "Carol Clark")).toBe("Carol Clark");
  });

  it("falls back to the display name when the unique name is empty", () => {
    expect(deriveAlias("", "Dan Davis")).toBe("Dan Davis");
  });

  it("keeps the unique name when the @ is the first character", () => {
    // A leading @ means there is no local-part to take, so the raw value is used verbatim.
    expect(deriveAlias("@weird", "Weird")).toBe("@weird");
  });
});

describe("collectFeatureCrewAssignees", () => {
  it("collects distinct assignees across the tree in first-seen order", () => {
    const tree = item(1, user("Alice", "alice@contoso.com"), [
      item(2, user("Bob", "bob@contoso.com")),
      item(3, null),
      item(4, user("Alice", "alice@contoso.com"), [item(5, user("Carol", "carol@contoso.com"))]),
    ]);

    expect(collectFeatureCrewAssignees([tree])).toEqual<FeatureCrewAssignee[]>([
      { alias: "alice", fullName: "Alice" },
      { alias: "bob", fullName: "Bob" },
      { alias: "carol", fullName: "Carol" },
    ]);
  });

  it("dedupes case-insensitively by alias", () => {
    const tree = item(1, user("Alice", "Alice@contoso.com"), [
      item(2, user("Alice Lower", "alice@contoso.com")),
    ]);

    expect(collectFeatureCrewAssignees([tree])).toEqual<FeatureCrewAssignee[]>([
      { alias: "Alice", fullName: "Alice" },
    ]);
  });

  it("returns an empty list when nobody is assigned", () => {
    expect(collectFeatureCrewAssignees([item(1, null)])).toEqual([]);
  });
});

describe("collectAssignedDirectoryUsers", () => {
  it("collects distinct assignees as directory users in first-seen order", () => {
    const tree = item(1, user("Alice", "alice@contoso.com"), [
      item(2, user("Bob", "bob@contoso.com")),
      item(3, null),
      item(4, user("Alice", "alice@contoso.com")),
    ]);

    expect(collectAssignedDirectoryUsers([tree])).toEqual([
      { displayName: "Alice", uniqueName: "alice@contoso.com", imageUrl: null, tag: null },
      { displayName: "Bob", uniqueName: "bob@contoso.com", imageUrl: null, tag: null },
    ]);
  });

  it("carries each person's crew tag so the picker can show it beside their name", () => {
    const tagged = user("Alice", "alice@contoso.com");
    tagged.tag = "Platform";
    const tree = item(1, tagged, [item(2, user("Bob", "bob@contoso.com"))]);

    expect(collectAssignedDirectoryUsers([tree]).map((person) => person.tag)).toEqual([
      "Platform",
      null,
    ]);
  });

  it("keeps the person's unique name so a pick can be written back to ADO", () => {
    const tree = item(1, user("Carol", null));

    expect(collectAssignedDirectoryUsers([tree])).toEqual([
      { displayName: "Carol", uniqueName: null, imageUrl: null, tag: null },
    ]);
  });

  it("returns an empty list when nobody is assigned", () => {
    expect(collectAssignedDirectoryUsers([item(1, null)])).toEqual([]);
  });
});

describe("applyFeatureCrewTags", () => {
  it("projects each roster member's tag onto the matching assignee, case-insensitively", () => {
    const alice = user("Alice", "Alice@contoso.com");
    const bob = user("Bob", "bob@contoso.com");
    const tree = item(1, alice, [item(2, bob)]);

    applyFeatureCrewTags(
      [tree],
      [
        { alias: "alice", fullName: "Alice", tag: "Core" },
        { alias: "bob", fullName: "Bob", tag: "Platform" },
      ],
    );

    expect(alice.tag).toBe("Core");
    expect(bob.tag).toBe("Platform");
  });

  it("sets null for a person absent from the roster or with an empty tag", () => {
    const alice = user("Alice", "alice@contoso.com");
    const bob = user("Bob", "bob@contoso.com");
    const tree = item(1, alice, [item(2, bob)]);

    applyFeatureCrewTags([tree], [{ alias: "alice", fullName: "Alice", tag: "" }]);

    expect(alice.tag).toBeNull();
    expect(bob.tag).toBeNull();
  });

  it("ignores unassigned items", () => {
    const tree = item(1, null);
    expect(() => applyFeatureCrewTags([tree], [])).not.toThrow();
  });
});

describe("collectAssignedTags", () => {
  it("collects distinct tags in first-seen order with the untagged bucket last", () => {
    const alice = user("Alice", "alice@contoso.com");
    alice.tag = "Core";
    const bob = user("Bob", "bob@contoso.com");
    bob.tag = "Platform";
    const carol = user("Carol", "carol@contoso.com");
    carol.tag = null;
    const dave = user("Dave", "dave@contoso.com");
    dave.tag = "Core";

    const tree = item(1, alice, [item(2, bob), item(3, carol), item(4, dave)]);

    expect(collectAssignedTags([tree])).toEqual(["Core", "Platform", null]);
  });

  it("omits the untagged bucket when every assignee has a tag", () => {
    const alice = user("Alice", "alice@contoso.com");
    alice.tag = "Core";
    expect(collectAssignedTags([item(1, alice)])).toEqual(["Core"]);
  });

  it("treats an unresolved tag (undefined) as untagged", () => {
    // Fresh from the tree loader a user's tag is undefined until the roster resolves.
    const alice = user("Alice", "alice@contoso.com");
    expect(collectAssignedTags([item(1, alice)])).toEqual([null]);
  });

  it("returns an empty list when nobody is assigned", () => {
    expect(collectAssignedTags([item(1, null)])).toEqual([]);
  });
});

describe("parseFeatureCrewDescription / formatFeatureCrewDescription", () => {
  it("round-trips a roster through format then parse", () => {
    const members: FeatureCrewMember[] = [
      { alias: "alice", fullName: "Alice Anderson", tag: "Core" },
      { alias: "bob", fullName: "Bob Brown", tag: "" },
    ];

    const markdown = formatFeatureCrewDescription(members);
    expect(markdown).toBe(
      ["# Feature Crew", "- alice (Alice Anderson). `Core`", "- bob (Bob Brown). ``"].join("\n"),
    );
    expect(parseFeatureCrewDescription(markdown)).toEqual(members);
  });

  it("ignores the heading, blank lines, and hand-added non-roster lines", () => {
    const markdown = [
      "# Feature Crew",
      "",
      "Some note a developer typed.",
      "- alice (Alice Anderson). `Core`",
    ].join("\n");

    expect(parseFeatureCrewDescription(markdown)).toEqual<FeatureCrewMember[]>([
      { alias: "alice", fullName: "Alice Anderson", tag: "Core" },
    ]);
  });

  it("emits only the heading for an empty roster", () => {
    expect(formatFeatureCrewDescription([])).toBe("# Feature Crew");
  });
});

describe("mergeFeatureCrew", () => {
  it("appends new assignees with an empty tag and reports changed", () => {
    const existing: FeatureCrewMember[] = [{ alias: "alice", fullName: "Alice", tag: "Core" }];
    const assignees: FeatureCrewAssignee[] = [
      { alias: "alice", fullName: "Alice" },
      { alias: "bob", fullName: "Bob" },
    ];

    const result = mergeFeatureCrew(existing, assignees);

    expect(result.changed).toBe(true);
    expect(result.members).toEqual<FeatureCrewMember[]>([
      { alias: "alice", fullName: "Alice", tag: "Core" },
      { alias: "bob", fullName: "Bob", tag: "" },
    ]);
  });

  it("preserves existing members' tags and reports no change when everyone is present", () => {
    const existing: FeatureCrewMember[] = [{ alias: "alice", fullName: "Alice", tag: "Core" }];
    const assignees: FeatureCrewAssignee[] = [{ alias: "ALICE", fullName: "Alice" }];

    const result = mergeFeatureCrew(existing, assignees);

    expect(result.changed).toBe(false);
    expect(result.members).toEqual(existing);
  });
});

describe("applyTagAssignments", () => {
  it("sets a matching member's tag (matched case-insensitively) and reports changed", () => {
    const members: FeatureCrewMember[] = [
      { alias: "alice", fullName: "Alice", tag: "" },
      { alias: "bob", fullName: "Bob", tag: "Core" },
    ];

    const result = applyTagAssignments(members, [{ alias: "ALICE", tag: "Platform" }]);

    expect(result.changed).toBe(true);
    expect(result.members).toEqual<FeatureCrewMember[]>([
      { alias: "alice", fullName: "Alice", tag: "Platform" },
      { alias: "bob", fullName: "Bob", tag: "Core" },
    ]);
  });

  it("reports no change when the assigned tag equals the stored one", () => {
    const members: FeatureCrewMember[] = [{ alias: "alice", fullName: "Alice", tag: "Core" }];

    const result = applyTagAssignments(members, [{ alias: "alice", tag: "Core" }]);

    expect(result.changed).toBe(false);
    expect(result.members).toEqual(members);
  });

  it("clears a member's tag when assigned an empty string", () => {
    const members: FeatureCrewMember[] = [{ alias: "alice", fullName: "Alice", tag: "Core" }];

    const result = applyTagAssignments(members, [{ alias: "alice", tag: "" }]);

    expect(result.changed).toBe(true);
    expect(result.members[0]?.tag).toBe("");
  });

  it("ignores an assignment for an alias not on the roster (never conjures a floating member)", () => {
    const members: FeatureCrewMember[] = [{ alias: "alice", fullName: "Alice", tag: "" }];

    const result = applyTagAssignments(members, [{ alias: "ghost", tag: "Core" }]);

    expect(result.changed).toBe(false);
    expect(result.members).toEqual(members);
  });

  it("reports no change for an empty assignment list", () => {
    const members: FeatureCrewMember[] = [{ alias: "alice", fullName: "Alice", tag: "Core" }];

    expect(applyTagAssignments(members, []).changed).toBe(false);
  });
});

describe("buildFeatureCrewUrls", () => {
  it("builds the reconcile URLs for a project-scoped ADO href", () => {
    const urls = buildFeatureCrewUrls(
      "https://dev.azure.com/contoso/web/_queries/query/abc-123",
      101,
      "Epic",
    );

    expect(urls).toEqual({
      wiqlUrl: "https://dev.azure.com/contoso/web/_apis/wit/wiql?api-version=7.1",
      createUrl: "https://dev.azure.com/contoso/web/_apis/wit/workitems/$Epic?api-version=7.1",
      itemBaseUrl: "https://dev.azure.com/contoso/_apis/wit/workitems",
      rootRelationUrl: "https://dev.azure.com/contoso/_apis/wit/workItems/101",
    });
  });

  it("encodes a type name with reserved characters", () => {
    const urls = buildFeatureCrewUrls(
      "https://dev.azure.com/contoso/web/_queries/query/abc-123",
      101,
      "User Story",
    );

    expect(urls?.createUrl).toBe(
      "https://dev.azure.com/contoso/web/_apis/wit/workitems/$User%20Story?api-version=7.1",
    );
  });

  it("returns null when the href is not a project-scoped ADO location", () => {
    expect(buildFeatureCrewUrls("https://example.com/", 101, "Epic")).toBeNull();
  });
});
