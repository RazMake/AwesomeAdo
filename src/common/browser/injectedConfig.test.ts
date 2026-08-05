import { describe, expect, it } from "vitest";

import { encodeInjectedConfig } from "./injectedConfig";

describe("encodeInjectedConfig", () => {
  it("keeps a null that MEANS something, at any depth", () => {
    // The regression this guards: `chrome.scripting.executeScript` drops null-valued `args`
    // properties, so a cleared ETA reached the page as `undefined` and became a JSON Patch `add`
    // carrying no value — which Azure DevOps rejects with HTTP 400.
    const encoded = encodeInjectedConfig({
      value: null,
      baseValue: null,
      additionalFields: [{ field: "System.Tags", value: null }],
    });

    expect(JSON.parse(encoded)).toEqual({
      value: null,
      baseValue: null,
      additionalFields: [{ field: "System.Tags", value: null }],
    });
  });

  it("leaves an omitted optional absent rather than encoding a hole", () => {
    const encoded = encodeInjectedConfig({ field: "System.State", comment: undefined });

    expect(JSON.parse(encoded)).toEqual({ field: "System.State" });
  });
});
