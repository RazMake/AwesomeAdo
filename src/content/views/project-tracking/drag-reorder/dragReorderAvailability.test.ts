import { describe, expect, it } from "vitest";

import { dragReorderUnavailableReason } from "./dragReorderAvailability";

describe("dragReorderUnavailableReason", () => {
  it("offers dragging under the manual backlog rank with a team", () => {
    expect(dragReorderUnavailableReason("team", "importance")).toBeNull();
  });

  it("explains a missing team before anything else", () => {
    expect(dragReorderUnavailableReason(null, "importance")).toContain("needs a team");
  });

  it("explains that only the importance ordering can be rearranged by hand", () => {
    expect(dragReorderUnavailableReason("team", "title")).toContain("ordering by importance");
  });
});
