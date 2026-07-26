import { describe, expect, it } from "vitest";

import { isSearchAdoIdentitiesMessage, SEARCH_ADO_IDENTITIES_MESSAGE } from "./AdoIdentityRequest";

describe("isSearchAdoIdentitiesMessage", () => {
  it("accepts a valid message", () => {
    expect(
      isSearchAdoIdentitiesMessage({ type: SEARCH_ADO_IDENTITIES_MESSAGE, query: "ada" }),
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isSearchAdoIdentitiesMessage(null)).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(isSearchAdoIdentitiesMessage("abc")).toBe(false);
  });

  it("rejects a wrong type discriminator", () => {
    expect(isSearchAdoIdentitiesMessage({ type: "other", query: "ada" })).toBe(false);
  });

  it("rejects a non-string query", () => {
    expect(isSearchAdoIdentitiesMessage({ type: SEARCH_ADO_IDENTITIES_MESSAGE, query: 5 })).toBe(
      false,
    );
  });
});
