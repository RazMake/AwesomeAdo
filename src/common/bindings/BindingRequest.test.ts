import { describe, expect, it } from "vitest";

import {
  bindingSettingsPath,
  isOpenBindingSettingsMessage,
  isOpenOptionsMessage,
  OPEN_BINDING_SETTINGS_MESSAGE,
  OPEN_OPTIONS_MESSAGE,
  optionsPath,
  readQueryIdFromSearch,
  readQueryNameFromSearch,
} from "./BindingRequest";

describe("isOpenBindingSettingsMessage", () => {
  it("accepts a valid message", () => {
    expect(
      isOpenBindingSettingsMessage({ type: OPEN_BINDING_SETTINGS_MESSAGE, queryId: "abc" }),
    ).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(isOpenBindingSettingsMessage(null)).toBe(false);
    expect(isOpenBindingSettingsMessage("abc")).toBe(false);
  });

  it("rejects a wrong type discriminator", () => {
    expect(isOpenBindingSettingsMessage({ type: "other", queryId: "abc" })).toBe(false);
  });

  it("rejects a missing or non-string queryId", () => {
    expect(isOpenBindingSettingsMessage({ type: OPEN_BINDING_SETTINGS_MESSAGE })).toBe(false);
    expect(isOpenBindingSettingsMessage({ type: OPEN_BINDING_SETTINGS_MESSAGE, queryId: 5 })).toBe(
      false,
    );
  });

  it("accepts an optional string queryName", () => {
    expect(
      isOpenBindingSettingsMessage({
        type: OPEN_BINDING_SETTINGS_MESSAGE,
        queryId: "abc",
        queryName: "My Query",
      }),
    ).toBe(true);
  });

  it("rejects a non-string queryName", () => {
    expect(
      isOpenBindingSettingsMessage({
        type: OPEN_BINDING_SETTINGS_MESSAGE,
        queryId: "abc",
        queryName: 5,
      }),
    ).toBe(false);
  });
});

describe("isOpenOptionsMessage", () => {
  it("accepts a valid message", () => {
    expect(isOpenOptionsMessage({ type: OPEN_OPTIONS_MESSAGE })).toBe(true);
  });

  it("rejects a non-object", () => {
    expect(isOpenOptionsMessage(null)).toBe(false);
    expect(isOpenOptionsMessage("abc")).toBe(false);
  });

  it("rejects a wrong type discriminator", () => {
    expect(isOpenOptionsMessage({ type: OPEN_BINDING_SETTINGS_MESSAGE })).toBe(false);
  });
});

describe("optionsPath", () => {
  it("returns the options page with no query pre-selected", () => {
    expect(optionsPath()).toBe("options/options.html");
  });
});

describe("bindingSettingsPath / readQueryIdFromSearch round-trip", () => {
  it("encodes the query id into the options-page URL", () => {
    expect(bindingSettingsPath("query 1/2")).toBe("options/options.html?queryId=query+1%2F2");
  });

  it("reads back the encoded query id", () => {
    const path = bindingSettingsPath("query 1/2");
    const search = path.slice(path.indexOf("?"));
    expect(readQueryIdFromSearch(search)).toBe("query 1/2");
  });

  it("omits the query name when it is not provided", () => {
    expect(bindingSettingsPath("abc")).toBe("options/options.html?queryId=abc");
  });

  it("round-trips an encoded query name alongside the id", () => {
    const path = bindingSettingsPath("abc", "Sprint 42 / Team");
    const search = path.slice(path.indexOf("?"));
    expect(readQueryIdFromSearch(search)).toBe("abc");
    expect(readQueryNameFromSearch(search)).toBe("Sprint 42 / Team");
  });
});

describe("readQueryNameFromSearch", () => {
  it("returns the query name when present", () => {
    expect(readQueryNameFromSearch("?queryName=My%20Query")).toBe("My Query");
  });

  it("returns null when the param is absent", () => {
    expect(readQueryNameFromSearch("?queryId=abc")).toBeNull();
  });

  it("returns null for an empty query name", () => {
    expect(readQueryNameFromSearch("?queryName=")).toBeNull();
  });
});

describe("readQueryIdFromSearch", () => {
  it("returns the query id when present", () => {
    expect(readQueryIdFromSearch("?queryId=abc")).toBe("abc");
  });

  it("returns null when the param is absent", () => {
    expect(readQueryIdFromSearch("?other=1")).toBeNull();
  });

  it("returns null for an empty query id", () => {
    expect(readQueryIdFromSearch("?queryId=")).toBeNull();
  });

  it("returns null for an empty search string", () => {
    expect(readQueryIdFromSearch("")).toBeNull();
  });
});
