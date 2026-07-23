import { describe, expect, it } from "vitest";

import { EMPTY_ADO_METADATA } from "./AdoMetadata";

describe("EMPTY_ADO_METADATA", () => {
  it("is a fully-formed but empty result", () => {
    expect(EMPTY_ADO_METADATA).toEqual({ teams: [], areaPaths: [] });
  });
});
