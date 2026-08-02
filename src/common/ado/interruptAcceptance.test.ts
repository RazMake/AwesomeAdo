import { describe, expect, it } from "vitest";

import { isInterruptAccepted, type InterruptAcceptanceEvidence } from "./interruptAcceptance";

const TAGGED_AT = "2026-08-01T10:00:00Z";

function evidence(
  notes: InterruptAcceptanceEvidence["notes"],
  taggedAt: string | null = TAGGED_AT,
): InterruptAcceptanceEvidence {
  return { taggedAt, notes };
}

describe("isInterruptAccepted", () => {
  it("accepts a configured token written at or after the current tag addition", () => {
    expect(
      isInterruptAccepted(
        evidence([{ text: "[ACCEPTED] planned into this sprint", createdDate: TAGGED_AT }]),
        "[ACCEPTED]",
      ),
    ).toBe(true);
  });

  it("ignores acceptance notes from before the item was most recently tagged", () => {
    expect(
      isInterruptAccepted(
        evidence([
          {
            text: "[ACCEPTED] from its previous tagged lifetime",
            createdDate: "2026-08-01T09:59:59Z",
          },
        ]),
        "[ACCEPTED]",
      ),
    ).toBe(false);
  });

  it("finds the token anywhere in a later note", () => {
    expect(
      isInterruptAccepted(
        evidence([
          {
            text: "Reviewed and marked [ACCEPTED] by planning",
            createdDate: "2026-08-01T10:00:01Z",
          },
        ]),
        "[ACCEPTED]",
      ),
    ).toBe(true);
  });

  it.each([
    [undefined, "[ACCEPTED]"],
    [evidence([], null), "[ACCEPTED]"],
    [evidence([], "not-a-date"), "[ACCEPTED]"],
    [evidence([{ text: "[ACCEPTED]", createdDate: "not-a-date" }]), "[ACCEPTED]"],
    [evidence([{ text: "[ACCEPTED]", createdDate: TAGGED_AT }]), "  "],
  ])("does not infer acceptance from incomplete evidence", (candidate, token) => {
    expect(isInterruptAccepted(candidate, token)).toBe(false);
  });
});
