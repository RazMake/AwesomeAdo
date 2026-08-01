import { describe, expect, it } from "vitest";

import { renderFilterPillCount } from "./FilterPill";

describe("renderFilterPillCount", () => {
  it("explains the counter through matching accessible and hover labels", () => {
    const count = renderFilterPillCount(document, {
      value: 3,
      kind: "active",
      label: "Active",
      background: "red",
      color: "white",
    });

    expect(count.getAttribute("aria-label")).toBe("Active: 3");
    expect(count.title).toBe("Active: 3");
  });
});
