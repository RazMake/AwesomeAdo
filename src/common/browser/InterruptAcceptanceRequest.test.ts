import { describe, expect, it } from "vitest";

import {
  READ_INTERRUPT_ACCEPTANCE_MESSAGE,
  readInterruptAcceptanceMessageProblem,
} from "./InterruptAcceptanceRequest";

const valid = {
  type: READ_INTERRUPT_ACCEPTANCE_MESSAGE,
  workItemIds: [1, 2],
  interruptTag: "Interrupt",
  acceptanceTag: "[ACCEPTED]",
};

describe("readInterruptAcceptanceMessageProblem", () => {
  it("accepts a bounded request", () => {
    expect(readInterruptAcceptanceMessageProblem(valid)).toBeNull();
  });

  it.each([
    null,
    { ...valid, type: "other" },
    { ...valid, workItemIds: [] },
    { ...valid, workItemIds: [0] },
    { ...valid, interruptTag: "" },
    { ...valid, acceptanceTag: " " },
  ])("rejects malformed input", (candidate) => {
    expect(readInterruptAcceptanceMessageProblem(candidate)).not.toBeNull();
  });
});
