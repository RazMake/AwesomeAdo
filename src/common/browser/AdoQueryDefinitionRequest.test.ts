import { describe, expect, it } from "vitest";

import {
  isLoadQueryDefinitionMessage,
  LOAD_QUERY_DEFINITION_MESSAGE,
  loadQueryDefinitionMessageProblem,
} from "./AdoQueryDefinitionRequest";

describe("isLoadQueryDefinitionMessage", () => {
  it("accepts only a string query id with the expected discriminator", () => {
    expect(
      isLoadQueryDefinitionMessage({ type: LOAD_QUERY_DEFINITION_MESSAGE, queryId: "query-1" }),
    ).toBe(true);
    expect(isLoadQueryDefinitionMessage({ type: LOAD_QUERY_DEFINITION_MESSAGE, queryId: 1 })).toBe(
      false,
    );
    expect(isLoadQueryDefinitionMessage(null)).toBe(false);
  });

  it("describes malformed messages owned by this operation", () => {
    expect(
      loadQueryDefinitionMessageProblem({
        type: LOAD_QUERY_DEFINITION_MESSAGE,
        queryId: "",
      }),
    ).toContain("queryId");
    expect(loadQueryDefinitionMessageProblem(null)).toContain("not an object");
  });
});
