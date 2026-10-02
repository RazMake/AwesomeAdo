import { describe, expect, it } from "vitest";

import { parseWorkItemId } from "./workItemIdText";

describe("parseWorkItemId", () => {
  it.each([
    ["12345", 12345],
    ["  12345\n", 12345],
    ["[12345]", 12345],
    ["(12 345)", 12345],
    ["{12-345}", 12345],
    ["https://dev.azure.com/org/Project/_workitems/edit/678", 678],
    ["https://dev.azure.com/org/Project/_workitems/edit/678/?view=x", 678],
    ["https://org.visualstudio.com/_apis/wit/workItems/91", 91],
    ["https://dev.azure.com/org/Project/_boards/board?workitem=42", 42],
  ])("reads %j as %i", (text, expected) => {
    expect(parseWorkItemId(text)).toBe(expected);
  });

  it.each(["", "abc", "#123", "12.5", "0", "123abc", "https://example.com/page/5"])(
    "rejects %j",
    (text) => {
      expect(parseWorkItemId(text)).toBeNull();
    },
  );
});
