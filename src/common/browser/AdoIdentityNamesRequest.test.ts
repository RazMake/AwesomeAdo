import { describe, expect, it } from "vitest";

import {
  isResolveAdoIdentityNamesMessage,
  RESOLVE_ADO_IDENTITY_NAMES_MESSAGE,
} from "./AdoIdentityNamesRequest";

describe("isResolveAdoIdentityNamesMessage", () => {
  it("accepts a well-formed request", () => {
    expect(
      isResolveAdoIdentityNamesMessage({
        type: RESOLVE_ADO_IDENTITY_NAMES_MESSAGE,
        ids: ["11111111-2222-3333-4444-555555555555"],
      }),
    ).toBe(true);
  });

  it("accepts an empty id list, which the worker answers with 'nothing to look up'", () => {
    expect(
      isResolveAdoIdentityNamesMessage({ type: RESOLVE_ADO_IDENTITY_NAMES_MESSAGE, ids: [] }),
    ).toBe(true);
  });

  it("rejects another extension message, so the listener leaves it alone", () => {
    expect(isResolveAdoIdentityNamesMessage({ type: "awesomeado:something-else", ids: [] })).toBe(
      false,
    );
  });

  it("rejects ids that are not a list of strings", () => {
    // The ids end up in a URL query string; anything else has no business reaching the builder.
    expect(
      isResolveAdoIdentityNamesMessage({ type: RESOLVE_ADO_IDENTITY_NAMES_MESSAGE, ids: "abc" }),
    ).toBe(false);
    expect(
      isResolveAdoIdentityNamesMessage({ type: RESOLVE_ADO_IDENTITY_NAMES_MESSAGE, ids: [1, 2] }),
    ).toBe(false);
  });

  it("rejects a value that is not a message at all", () => {
    expect(isResolveAdoIdentityNamesMessage(null)).toBe(false);
    expect(isResolveAdoIdentityNamesMessage("hello")).toBe(false);
  });
});
