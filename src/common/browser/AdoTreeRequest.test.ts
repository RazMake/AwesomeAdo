import { describe, expect, it } from "vitest";

import { isLoadQueryTreeMessage, LOAD_QUERY_TREE_MESSAGE } from "./AdoTreeRequest";

describe("isLoadQueryTreeMessage", () => {
  it("accepts a valid message", () => {
    expect(
      isLoadQueryTreeMessage({
        type: LOAD_QUERY_TREE_MESSAGE,
        queryId: "abc",
        fields: ["System.Id", "System.Title"],
      }),
    ).toBe(true);
    expect(
      isLoadQueryTreeMessage({
        type: LOAD_QUERY_TREE_MESSAGE,
        queryId: "abc",
        fields: ["System.Id"],
        wiql: "SELECT [System.Id] FROM WorkItems",
      }),
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isLoadQueryTreeMessage(null)).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(isLoadQueryTreeMessage("abc")).toBe(false);
  });

  it("rejects a wrong type discriminator", () => {
    expect(isLoadQueryTreeMessage({ type: "other", queryId: "abc", fields: [] })).toBe(false);
  });

  it("rejects a missing queryId", () => {
    expect(isLoadQueryTreeMessage({ type: LOAD_QUERY_TREE_MESSAGE, fields: [] })).toBe(false);
  });

  it("rejects a non-string queryId", () => {
    expect(isLoadQueryTreeMessage({ type: LOAD_QUERY_TREE_MESSAGE, queryId: 5, fields: [] })).toBe(
      false,
    );
  });

  it("rejects a non-array fields", () => {
    expect(
      isLoadQueryTreeMessage({
        type: LOAD_QUERY_TREE_MESSAGE,
        queryId: "abc",
        fields: "System.Id",
      }),
    ).toBe(false);
  });

  it("rejects a fields array containing a non-string", () => {
    expect(
      isLoadQueryTreeMessage({
        type: LOAD_QUERY_TREE_MESSAGE,
        queryId: "abc",
        fields: ["System.Id", 5],
      }),
    ).toBe(false);
  });

  it("rejects a non-string custom WIQL body", () => {
    expect(
      isLoadQueryTreeMessage({
        type: LOAD_QUERY_TREE_MESSAGE,
        queryId: "abc",
        fields: [],
        wiql: 42,
      }),
    ).toBe(false);
  });
});
