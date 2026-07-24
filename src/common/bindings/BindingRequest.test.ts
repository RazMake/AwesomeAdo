import { describe, expect, it } from "vitest";

import {
  bindingSettingsPath,
  isOpenBindingSettingsMessage,
  isOpenOptionsMessage,
  isRevealBindingSettingsMessage,
  isRevealOptionsSectionMessage,
  OPEN_BINDING_SETTINGS_MESSAGE,
  OPEN_OPTIONS_MESSAGE,
  optionsPath,
  readOptionsSectionFromSearch,
  readQueryIdFromSearch,
  readQueryNameFromSearch,
  REVEAL_BINDING_SETTINGS_MESSAGE,
  REVEAL_OPTIONS_SECTION_MESSAGE,
  sectionTabId,
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

  it("accepts a valid section", () => {
    expect(isOpenOptionsMessage({ type: OPEN_OPTIONS_MESSAGE, section: "diagnostics" })).toBe(true);
  });

  it("rejects an unknown section", () => {
    expect(isOpenOptionsMessage({ type: OPEN_OPTIONS_MESSAGE, section: "nope" })).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(isOpenOptionsMessage(null)).toBe(false);
    expect(isOpenOptionsMessage("abc")).toBe(false);
  });

  it("rejects a wrong type discriminator", () => {
    expect(isOpenOptionsMessage({ type: OPEN_BINDING_SETTINGS_MESSAGE })).toBe(false);
  });
});

describe("isRevealOptionsSectionMessage", () => {
  it("accepts a valid section reveal message", () => {
    expect(
      isRevealOptionsSectionMessage({
        type: REVEAL_OPTIONS_SECTION_MESSAGE,
        section: "diagnostics",
      }),
    ).toBe(true);
  });

  it("rejects a missing or unknown section", () => {
    expect(isRevealOptionsSectionMessage({ type: REVEAL_OPTIONS_SECTION_MESSAGE })).toBe(false);
    expect(
      isRevealOptionsSectionMessage({ type: REVEAL_OPTIONS_SECTION_MESSAGE, section: "nope" }),
    ).toBe(false);
  });

  it("rejects a non-object or wrong type discriminator", () => {
    expect(isRevealOptionsSectionMessage(null)).toBe(false);
    expect(
      isRevealOptionsSectionMessage({ type: OPEN_OPTIONS_MESSAGE, section: "diagnostics" }),
    ).toBe(false);
  });
});

describe("isRevealBindingSettingsMessage", () => {
  it("accepts a valid message", () => {
    expect(
      isRevealBindingSettingsMessage({ type: REVEAL_BINDING_SETTINGS_MESSAGE, queryId: "abc" }),
    ).toBe(true);
  });

  it("accepts an optional string queryName", () => {
    expect(
      isRevealBindingSettingsMessage({
        type: REVEAL_BINDING_SETTINGS_MESSAGE,
        queryId: "abc",
        queryName: "My Query",
      }),
    ).toBe(true);
  });

  it("rejects a missing or non-string queryId", () => {
    expect(isRevealBindingSettingsMessage({ type: REVEAL_BINDING_SETTINGS_MESSAGE })).toBe(false);
    expect(
      isRevealBindingSettingsMessage({ type: REVEAL_BINDING_SETTINGS_MESSAGE, queryId: 5 }),
    ).toBe(false);
  });

  it("rejects a non-object or wrong type discriminator", () => {
    expect(isRevealBindingSettingsMessage(null)).toBe(false);
    expect(
      isRevealBindingSettingsMessage({ type: OPEN_BINDING_SETTINGS_MESSAGE, queryId: "abc" }),
    ).toBe(false);
  });
});

describe("sectionTabId", () => {
  it("maps diagnostics to its options tab element id", () => {
    expect(sectionTabId("diagnostics")).toBe("tab-diagnostics");
  });
});

describe("optionsPath", () => {
  it("returns the options page with no query pre-selected", () => {
    expect(optionsPath()).toBe("options/options.html");
  });

  it("appends the section when one is given", () => {
    expect(optionsPath("diagnostics")).toBe("options/options.html?section=diagnostics");
  });
});

describe("optionsPath / readOptionsSectionFromSearch round-trip", () => {
  it("reads back the encoded section", () => {
    const path = optionsPath("diagnostics");
    const search = path.slice(path.indexOf("?"));
    expect(readOptionsSectionFromSearch(search)).toBe("diagnostics");
  });

  it("returns null when the section is absent", () => {
    expect(readOptionsSectionFromSearch("?queryId=abc")).toBeNull();
  });

  it("returns null for an unrecognized section", () => {
    expect(readOptionsSectionFromSearch("?section=nope")).toBeNull();
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
