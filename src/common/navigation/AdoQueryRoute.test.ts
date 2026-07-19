import { describe, expect, it } from "vitest";

import {
  ADO_NAVIGATION_MESSAGE,
  isAdoNavigationMessage,
  isAdoQueryUrl,
  parseAdoQueryId,
} from "./AdoQueryRoute";

describe("isAdoQueryUrl", () => {
  describe("returns true for valid ADO query URLs", () => {
    it("recognizes bare _queries on dev.azure.com", () => {
      expect(isAdoQueryUrl("https://dev.azure.com/org/project/_queries")).toBe(true);
    });

    it("recognizes nested _queries on dev.azure.com", () => {
      expect(isAdoQueryUrl("https://dev.azure.com/org/project/_queries/query/some-id")).toBe(true);
    });

    it("recognizes _queries on visualstudio.com subdomains", () => {
      expect(isAdoQueryUrl("https://myorg.visualstudio.com/project/_queries")).toBe(true);
    });

    it("matches _queries case-insensitively (uppercase)", () => {
      expect(isAdoQueryUrl("https://dev.azure.com/org/project/_QUERIES")).toBe(true);
    });

    it("matches _queries case-insensitively (mixed case)", () => {
      expect(isAdoQueryUrl("https://dev.azure.com/org/project/_Queries")).toBe(true);
    });

    it("matches _queries deep in the path", () => {
      expect(isAdoQueryUrl("https://dev.azure.com/a/b/_queries/c/d/e")).toBe(true);
    });
  });

  describe("returns false for non-query ADO URLs", () => {
    it("rejects an unrelated ADO path", () => {
      expect(isAdoQueryUrl("https://dev.azure.com/org/project/_boards")).toBe(false);
    });

    it("rejects the root ADO path", () => {
      expect(isAdoQueryUrl("https://dev.azure.com/org/project")).toBe(false);
    });

    it("rejects _queries in query string (not path)", () => {
      expect(isAdoQueryUrl("https://dev.azure.com/org/project/_boards?redirect=_queries")).toBe(
        false,
      );
    });
  });

  describe("returns false for lookalike or non-HTTPS URLs", () => {
    it("rejects a lookalike hostname prefix", () => {
      expect(isAdoQueryUrl("https://evildev.azure.com/org/_queries")).toBe(false);
    });

    it("rejects a lookalike .visualstudio.com suffix attack", () => {
      expect(isAdoQueryUrl("https://fake.visualstudio.com.evil.com/_queries")).toBe(false);
    });

    it("rejects http protocol", () => {
      expect(isAdoQueryUrl("http://dev.azure.com/org/_queries")).toBe(false);
    });

    it("rejects a completely unrelated host with _queries path", () => {
      expect(isAdoQueryUrl("https://example.com/_queries")).toBe(false);
    });
  });

  describe("returns false for malformed or empty URLs", () => {
    it("rejects a non-URL string", () => {
      expect(isAdoQueryUrl("not-a-url")).toBe(false);
    });

    it("rejects an empty string", () => {
      expect(isAdoQueryUrl("")).toBe(false);
    });
  });
});

describe("isAdoNavigationMessage", () => {
  it("accepts a valid navigation message", () => {
    expect(
      isAdoNavigationMessage({
        type: ADO_NAVIGATION_MESSAGE,
        url: "https://dev.azure.com/org/_queries",
      }),
    ).toBe(true);
  });

  it("rejects null", () => {
    expect(isAdoNavigationMessage(null)).toBe(false);
  });

  it("rejects a non-object primitive", () => {
    expect(isAdoNavigationMessage("string")).toBe(false);
    expect(isAdoNavigationMessage(42)).toBe(false);
    expect(isAdoNavigationMessage(true)).toBe(false);
  });

  it("rejects a message with wrong type value", () => {
    expect(isAdoNavigationMessage({ type: "other:message", url: "https://example.com" })).toBe(
      false,
    );
  });

  it("rejects a message missing the url property", () => {
    expect(isAdoNavigationMessage({ type: ADO_NAVIGATION_MESSAGE })).toBe(false);
  });

  it("rejects a message with non-string url", () => {
    expect(isAdoNavigationMessage({ type: ADO_NAVIGATION_MESSAGE, url: 42 })).toBe(false);
  });

  it("accepts a valid message with extra properties", () => {
    // isAdoNavigationMessage only checks required fields
    expect(
      isAdoNavigationMessage({
        type: ADO_NAVIGATION_MESSAGE,
        url: "https://dev.azure.com/org/_queries",
        extra: "field",
      }),
    ).toBe(true);
  });

  it("rejects an empty object", () => {
    expect(isAdoNavigationMessage({})).toBe(false);
  });
});

describe("parseAdoQueryId", () => {
  const guid = "12345678-1234-1234-1234-123456789abc";

  describe("returns the query id for single-query routes", () => {
    it("parses a query route on dev.azure.com", () => {
      expect(parseAdoQueryId(`https://dev.azure.com/org/project/_queries/query/${guid}`)).toBe(
        guid,
      );
    });

    it("parses a query-edit route", () => {
      expect(parseAdoQueryId(`https://dev.azure.com/org/project/_queries/query-edit/${guid}`)).toBe(
        guid,
      );
    });

    it("parses a query route on a visualstudio.com subdomain", () => {
      expect(parseAdoQueryId(`https://myorg.visualstudio.com/project/_queries/query/${guid}`)).toBe(
        guid,
      );
    });

    it("ignores trailing path segments after the id", () => {
      expect(
        parseAdoQueryId(`https://dev.azure.com/org/project/_queries/query/${guid}/results`),
      ).toBe(guid);
    });

    it("lowercases the id so casing never splits a binding", () => {
      expect(
        parseAdoQueryId(`https://dev.azure.com/org/project/_queries/query/${guid.toUpperCase()}`),
      ).toBe(guid);
    });

    it("matches the _queries and action segments case-insensitively", () => {
      expect(parseAdoQueryId(`https://dev.azure.com/org/project/_QUERIES/QUERY/${guid}`)).toBe(
        guid,
      );
    });
  });

  describe("returns null for routes without a single query id", () => {
    it("rejects a query folder/list route", () => {
      expect(parseAdoQueryId("https://dev.azure.com/org/project/_queries/all")).toBeNull();
    });

    it("rejects a bare _queries route", () => {
      expect(parseAdoQueryId("https://dev.azure.com/org/project/_queries")).toBeNull();
    });

    it("rejects an action segment without an id", () => {
      expect(parseAdoQueryId("https://dev.azure.com/org/project/_queries/query")).toBeNull();
    });

    it("rejects a non-GUID id (e.g. a query path)", () => {
      expect(
        parseAdoQueryId("https://dev.azure.com/org/project/_queries/query/Shared%20Queries"),
      ).toBeNull();
    });

    it("rejects a non-query ADO route", () => {
      expect(parseAdoQueryId(`https://dev.azure.com/org/project/_boards/${guid}`)).toBeNull();
    });
  });

  describe("returns null for lookalike or malformed URLs", () => {
    it("rejects a lookalike hostname prefix", () => {
      expect(parseAdoQueryId(`https://evildev.azure.com/org/_queries/query/${guid}`)).toBeNull();
    });

    it("rejects a lookalike .visualstudio.com suffix attack", () => {
      expect(
        parseAdoQueryId(`https://fake.visualstudio.com.evil.com/_queries/query/${guid}`),
      ).toBeNull();
    });

    it("rejects http protocol", () => {
      expect(parseAdoQueryId(`http://dev.azure.com/org/_queries/query/${guid}`)).toBeNull();
    });

    it("rejects a non-URL string", () => {
      expect(parseAdoQueryId("not-a-url")).toBeNull();
    });

    it("rejects an empty string", () => {
      expect(parseAdoQueryId("")).toBeNull();
    });
  });
});
