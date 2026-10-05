import { describe, expect, it } from "vitest";

import type { TagCondition } from "./tagCondition";
import { searchWithTagCondition, readUrlTagCondition } from "./tagConditionUrl";

function condition(overrides: Partial<TagCondition> = {}): TagCondition {
  return { required: new Set(), excluded: new Set(), matchAll: false, ...overrides };
}

describe("Tag condition link reading", () => {
  it("reads a required, an excluded and a combining choice off one link", () => {
    expect(readUrlTagCondition("?tags=platform,api&notTags=docs&tagMatch=all")).toEqual(
      condition({
        required: new Set(["platform", "api"]),
        excluded: new Set(["docs"]),
        matchAll: true,
      }),
    );
  });

  it("lower-cases and trims what a person typed, because ADO matches tags case-insensitively", () => {
    expect(readUrlTagCondition("?tags=%20Platform%20&notTags=Docs&tagMatch=%20ALL%20")).toEqual(
      condition({ required: new Set(["platform"]), excluded: new Set(["docs"]), matchAll: true }),
    );
  });

  it("reads several tags from one list and from repeated parameters, ignoring blanks", () => {
    expect(readUrlTagCondition("?tags=api,,docs&tags=platform")).toEqual(
      condition({ required: new Set(["api", "docs", "platform"]) }),
    );
  });

  it("narrows nothing for a link that names no tags", () => {
    expect(readUrlTagCondition("?_a=query")).toEqual(condition());
    expect(readUrlTagCondition("")).toEqual(condition());
  });

  it("treats any other combining value as the default 'any of these' condition", () => {
    expect(readUrlTagCondition("?tags=api&tagMatch=either").matchAll).toBe(false);
  });
});

describe("Tag condition link writing", () => {
  it("writes the condition beside the parameters ADO already carries", () => {
    const search = searchWithTagCondition("?_a=query", {
      required: new Set(["platform", "api"]),
      excluded: new Set(["docs"]),
      matchAll: true,
    });

    expect(new URLSearchParams(search).get("_a")).toBe("query");
    expect(readUrlTagCondition(search)).toEqual(
      condition({
        required: new Set(["platform", "api"]),
        excluded: new Set(["docs"]),
        matchAll: true,
      }),
    );
  });

  it("drops the parameters a cleared condition no longer needs", () => {
    const search = searchWithTagCondition("?tags=api&notTags=docs&tagMatch=all", condition());

    expect(search).toBe("");
  });

  it("omits the combining choice while nothing is required, because it combines nothing", () => {
    const search = searchWithTagCondition("", {
      required: new Set(),
      excluded: new Set(["docs"]),
      matchAll: true,
    });

    expect(new URLSearchParams(search).has("tagMatch")).toBe(false);
    expect(readUrlTagCondition(search).excluded).toEqual(new Set(["docs"]));
  });
});
