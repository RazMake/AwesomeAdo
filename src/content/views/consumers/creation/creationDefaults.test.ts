import { describe, expect, it } from "vitest";

import type { TrackedWorkItem, TypeCatalogEntry } from "../../../../common/ado/TrackedWorkItem";

import {
  calledServiceName,
  knownClientIds,
  newConsumerType,
  newRequestAreaPath,
  newRequestType,
} from "./creationDefaults";

const TEAM_A = "Org\\Team A";
const OTHER = "Org\\Other";

/** A tracked item carrying only what the defaults read; each fixture overrides what it is about. */
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

function typeEntry(name: string, children?: string[]): TypeCatalogEntry {
  return { name, color: "000000", icon: "i.svg", etaField: null, columns: [], children };
}

const TYPES: ReadonlyMap<string, TypeCatalogEntry> = new Map([
  ["Group", typeEntry("Group", ["Consumer", "Other"])],
  ["Consumer", typeEntry("Consumer", ["Request"])],
  ["Request", typeEntry("Request")],
]);

/** Children of the given types, numbered from `firstId`. */
function ofTypes(types: string[], firstId = 100): TrackedWorkItem[] {
  return types.map((type, index) => item({ id: firstId + index, type }));
}

describe("newConsumerType", () => {
  it("uses the type most existing consumers have", () => {
    const grouping = item({ id: 1, type: "Group", children: ofTypes(["App", "Svc", "Svc"]) });

    expect(newConsumerType(grouping, TYPES)).toBe("Svc");
  });

  it("breaks a tie in favor of the type seen first", () => {
    const tied = item({ id: 1, type: "Group", children: ofTypes(["Svc", "App", "App", "Svc"]) });

    expect(newConsumerType(tied, TYPES)).toBe("Svc");
  });

  it("falls back to the grouping type's first configured child type when there are no consumers", () => {
    expect(newConsumerType(item({ id: 1, type: "Group" }), TYPES)).toBe("Consumer");
  });

  it("ignores consumers whose type is blank", () => {
    const grouping = item({ id: 1, type: "Group", children: ofTypes([""]) });

    expect(newConsumerType(grouping, TYPES)).toBe("Consumer");
  });

  it("is null when neither the consumers nor the configuration says", () => {
    expect(newConsumerType(item({ id: 1, type: "Unknown" }), TYPES)).toBeNull();
    expect(newConsumerType(item({ id: 1, type: "Request" }), TYPES)).toBeNull();
  });
});

describe("newRequestType", () => {
  it("uses the type this consumer's requests most often have", () => {
    const consumer = item({ id: 2, type: "Consumer", children: ofTypes(["Task", "Bug", "Bug"]) });
    const other = item({ id: 3, type: "Consumer", children: ofTypes(["Story"], 200) });
    const grouping = item({ id: 1, type: "Group", children: [consumer, other] });

    expect(newRequestType(grouping, consumer, TYPES)).toBe("Bug");
  });

  it("uses the type any consumer's requests have when this one has none", () => {
    const consumer = item({ id: 2, type: "Consumer" });
    const other = item({ id: 3, type: "Consumer", children: ofTypes(["Story", "Bug", "Story"]) });
    const grouping = item({ id: 1, type: "Group", children: [consumer, other] });

    expect(newRequestType(grouping, consumer, TYPES)).toBe("Story");
  });

  it("falls back to the consumer type's configured child type", () => {
    const consumer = item({ id: 2, type: "Consumer" });
    const grouping = item({ id: 1, type: "Group", children: [consumer] });

    expect(newRequestType(grouping, consumer, TYPES)).toBe("Request");
  });

  it("is null when nothing says", () => {
    const consumer = item({ id: 2, type: "Unknown" });
    const grouping = item({ id: 1, type: "Group", children: [consumer] });

    expect(newRequestType(grouping, consumer, TYPES)).toBeNull();
  });
});

/** Requests filed in the given areas, numbered from `firstId`. */
function inAreas(areas: (string | null)[], firstId = 100): TrackedWorkItem[] {
  return areas.map((areaPath, index) => item({ id: firstId + index, areaPath }));
}

describe("newRequestAreaPath", () => {
  it("uses the area this consumer's kept requests are most often in", () => {
    const consumer = item({
      id: 2,
      type: "Consumer",
      areaPath: "Org\\Consumers",
      children: inAreas([`${TEAM_A}\\Sub`, OTHER, OTHER, `${TEAM_A}\\Sub`, TEAM_A]),
    });
    const grouping = item({ id: 1, type: "Group", children: [consumer] });

    expect(newRequestAreaPath(grouping, consumer, [TEAM_A])).toBe(`${TEAM_A}\\Sub`);
  });

  it("uses the area other consumers' kept requests are in when this one has none kept", () => {
    const consumer = item({ id: 2, type: "Consumer", children: inAreas([OTHER]) });
    const other = item({ id: 3, type: "Consumer", children: inAreas([OTHER, TEAM_A], 200) });
    const grouping = item({ id: 1, type: "Group", children: [consumer, other] });

    expect(newRequestAreaPath(grouping, consumer, [TEAM_A])).toBe(TEAM_A);
  });

  it("falls back to the first configured branch when no request is kept", () => {
    const consumer = item({ id: 2, type: "Consumer", children: inAreas([OTHER]) });
    const grouping = item({ id: 1, type: "Group", children: [consumer] });

    expect(newRequestAreaPath(grouping, consumer, [TEAM_A, "Org\\Team B"])).toBe(TEAM_A);
  });

  it("falls back to the consumer's own area when no branch is configured and no request has one", () => {
    const consumer = item({
      id: 2,
      type: "Consumer",
      areaPath: "Org\\Consumers",
      children: inAreas([null]),
    });
    const grouping = item({ id: 1, type: "Group", children: [consumer] });

    expect(newRequestAreaPath(grouping, consumer, [])).toBe("Org\\Consumers");
  });

  it("keeps every request when no branch is configured", () => {
    const consumer = item({ id: 2, type: "Consumer", children: inAreas([OTHER]) });
    const grouping = item({ id: 1, type: "Group", children: [consumer] });

    expect(newRequestAreaPath(grouping, consumer, [])).toBe(OTHER);
  });
});

describe("calledServiceName", () => {
  it("is the last segment of the grouping item's area path", () => {
    expect(calledServiceName(item({ id: 1, areaPath: "Org\\Platform\\ Billing API " }))).toBe(
      "Billing API",
    );
    expect(calledServiceName(item({ id: 1, areaPath: "Billing" }))).toBe("Billing");
  });

  it("says 'our service' when the area path names nothing", () => {
    expect(calledServiceName(item({ id: 1, areaPath: null }))).toBe("our service");
    expect(calledServiceName(item({ id: 1, areaPath: "" }))).toBe("our service");
    expect(calledServiceName(item({ id: 1, areaPath: "Org\\ " }))).toBe("our service");
  });
});

describe("knownClientIds", () => {
  it("collects the lowercased client ids the consumers' descriptions state", () => {
    const grouping = item({
      id: 1,
      type: "Group",
      children: [
        item({
          id: 2,
          description: "- **ClientId**: `AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE`",
        }),
        item({ id: 3, description: "No identity written here." }),
        item({
          id: 4,
          description: "# Overview\n\n- **ClientId**: `11111111-2222-3333-4444-555555555555`\n",
        }),
      ],
    });

    expect(knownClientIds(grouping)).toEqual(
      new Set(["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "11111111-2222-3333-4444-555555555555"]),
    );
  });

  it("is empty when there are no consumers", () => {
    expect(knownClientIds(item({ id: 1 }))).toEqual(new Set());
  });
});
