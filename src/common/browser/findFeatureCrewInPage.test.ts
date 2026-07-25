import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { findFeatureCrewInPage } from "./findFeatureCrewInPage";

const WIQL_URL = "https://ado.example/_apis/wit/wiql/query-id";
const ITEM_BASE_URL = "https://ado.example/_apis/wit/workitems";
const ROOT_ID = 123;
const TITLE = "Feature Crew";
const TYPE_NAME = "Task";
const STATE = "Removed";
const AFFECTED_BY_REL = "System.LinkTypes.Hierarchy-Reverse";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("findFeatureCrewInPage", () => {
  it("finds the matching candidate and returns { id, rev, description }, with single-quote escaping in the WIQL", async () => {
    const wiqlBody = { workItems: [{ id: 100 }] };
    const itemBody = {
      id: 100,
      rev: 5,
      fields: { "System.Description": "Test description" },
      relations: [
        { rel: AFFECTED_BY_REL, url: `https://ado.example/_apis/wit/workitems/${ROOT_ID}` },
      ],
    };

    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>((url) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      if (url.startsWith(ITEM_BASE_URL)) {
        return Promise.resolve(jsonResponse(itemBody));
      }
      throw new Error(`unexpected url ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      "Type'With'Quotes",
      STATE,
      AFFECTED_BY_REL,
    );

    // Check that the WIQL POST was made with escaped single quotes.
    const wiqlCall = fetchMock.mock.calls.find((call) => call[0] === WIQL_URL);
    expect(wiqlCall).toBeDefined();
    const parsedWiql = JSON.parse((wiqlCall?.[1]?.body as string) ?? "{}") as { query: string };
    expect(parsedWiql.query).toContain("'Type''With''Quotes'");

    expect(result).toEqual({ id: 100, rev: 5, description: "Test description" });
  });

  it("skips a candidate whose relation url last segment is a prefix lookalike (12 vs 123) and picks the truly-linked one", async () => {
    const wiqlBody = { workItems: [{ id: 100 }, { id: 101 }] };

    const fetchMock = vi.fn((url: string) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      if (url.includes("/100?")) {
        // First candidate has a link to ID 12 (not 123).
        return Promise.resolve(
          jsonResponse({
            id: 100,
            rev: 1,
            relations: [
              { rel: AFFECTED_BY_REL, url: "https://ado.example/_apis/wit/workitems/12" },
            ],
          }),
        );
      }
      if (url.includes("/101?")) {
        // Second candidate correctly links to 123.
        return Promise.resolve(
          jsonResponse({
            id: 101,
            rev: 2,
            fields: { "System.Description": "Correct match" },
            relations: [
              { rel: AFFECTED_BY_REL, url: `https://ado.example/_apis/wit/workitems/${ROOT_ID}` },
            ],
          }),
        );
      }
      throw new Error(`unexpected url ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toEqual({ id: 101, rev: 2, description: "Correct match" });
  });

  it("returns null when the WIQL response is not ok", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(null, false)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when no candidate has the affectedBy relation to root", async () => {
    const wiqlBody = { workItems: [{ id: 100 }] };
    const itemBody = {
      id: 100,
      rev: 1,
      relations: [{ rel: "SomeOtherRel", url: "https://ado.example/_apis/wit/workitems/999" }],
    };

    const fetchMock = vi.fn((url: string) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      return Promise.resolve(jsonResponse(itemBody));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toBeNull();
  });

  it("treats a candidate with no relations array (or non-array relations) as no-match and continues", async () => {
    const wiqlBody = { workItems: [{ id: 100 }, { id: 101 }] };

    const fetchMock = vi.fn((url: string) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      if (url.includes("/100?")) {
        // First candidate has no relations field.
        return Promise.resolve(jsonResponse({ id: 100, rev: 1 }));
      }
      if (url.includes("/101?")) {
        // Second candidate has the correct link.
        return Promise.resolve(
          jsonResponse({
            id: 101,
            rev: 2,
            fields: { "System.Description": "Has relations" },
            relations: [
              { rel: AFFECTED_BY_REL, url: `https://ado.example/_apis/wit/workitems/${ROOT_ID}` },
            ],
          }),
        );
      }
      throw new Error(`unexpected url ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toEqual({ id: 101, rev: 2, description: "Has relations" });
  });

  it("tolerates a candidate GET returning non-ok and continues to the next candidate", async () => {
    const wiqlBody = { workItems: [{ id: 100 }, { id: 101 }] };

    const fetchMock = vi.fn((url: string) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      if (url.includes("/100?")) {
        return Promise.resolve(jsonResponse(null, false));
      }
      if (url.includes("/101?")) {
        return Promise.resolve(
          jsonResponse({
            id: 101,
            rev: 3,
            fields: { "System.Description": "Second candidate" },
            relations: [
              { rel: AFFECTED_BY_REL, url: `https://ado.example/_apis/wit/workitems/${ROOT_ID}` },
            ],
          }),
        );
      }
      throw new Error(`unexpected url ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toEqual({ id: 101, rev: 3, description: "Second candidate" });
  });

  it("returns null when the WIQL fetch rejects", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new Error("network error")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toBeNull();
  });

  it("returns null when the WIQL body has no workItems array", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse({ someOtherField: "value" }));
      }
      throw new Error(`unexpected url ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toBeNull();
  });

  it("handles a relation url with a query string by stripping it before matching", async () => {
    const wiqlBody = { workItems: [{ id: 100 }] };
    const itemBody = {
      id: 100,
      rev: 1,
      fields: { "System.Description": "Has query string" },
      relations: [
        {
          rel: AFFECTED_BY_REL,
          url: `https://ado.example/_apis/wit/workitems/${ROOT_ID}?api-version=7.1`,
        },
      ],
    };

    const fetchMock = vi.fn((url: string) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      return Promise.resolve(jsonResponse(itemBody));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toEqual({ id: 100, rev: 1, description: "Has query string" });
  });

  it("defaults rev to 0 and description to empty string when fields are absent", async () => {
    const wiqlBody = { workItems: [{ id: 100 }] };
    const itemBody = {
      id: 100,
      relations: [
        { rel: AFFECTED_BY_REL, url: `https://ado.example/_apis/wit/workitems/${ROOT_ID}` },
      ],
    };

    const fetchMock = vi.fn((url: string) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      return Promise.resolve(jsonResponse(itemBody));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toEqual({ id: 100, rev: 0, description: "" });
  });

  it("uses candidateId when item body id is not a number, and empty string when description is not a string", async () => {
    const wiqlBody = { workItems: [{ id: 200 }] };
    const itemBody = {
      id: "not-a-number",
      rev: "also-not-a-number",
      fields: { "System.Description": 12345 },
      relations: [
        { rel: AFFECTED_BY_REL, url: `https://ado.example/_apis/wit/workitems/${ROOT_ID}` },
      ],
    };

    const fetchMock = vi.fn((url: string) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      return Promise.resolve(jsonResponse(itemBody));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toEqual({ id: 200, rev: 0, description: "" });
  });

  it("caps the candidate list at 20 items even when WIQL returns more", async () => {
    const workItems = Array.from({ length: 50 }, (_, i) => ({ id: i + 1 }));
    const wiqlBody = { workItems };

    let candidateCheckCount = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      candidateCheckCount += 1;
      // None match, so all 20 should be checked.
      return Promise.resolve(jsonResponse({ id: candidateCheckCount, relations: [] }));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toBeNull();
    expect(candidateCheckCount).toBe(20);
  });

  it("tolerates a candidate GET fetch rejection and continues to the next candidate", async () => {
    const wiqlBody = { workItems: [{ id: 100 }, { id: 101 }] };

    const fetchMock = vi.fn((url: string) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      if (url.includes("/100?")) {
        return Promise.reject(new Error("timeout"));
      }
      if (url.includes("/101?")) {
        return Promise.resolve(
          jsonResponse({
            id: 101,
            rev: 4,
            fields: { "System.Description": "Survived rejection" },
            relations: [
              { rel: AFFECTED_BY_REL, url: `https://ado.example/_apis/wit/workitems/${ROOT_ID}` },
            ],
          }),
        );
      }
      throw new Error(`unexpected url ${url}`);
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toEqual({ id: 101, rev: 4, description: "Survived rejection" });
  });

  it("returns null when WIQL returns workItems with no numeric ids", async () => {
    const wiqlBody = { workItems: [{ id: "not-a-number" }, { id: null }, null, "not-an-object"] };

    const fetchMock = vi.fn(() => Promise.resolve(jsonResponse(wiqlBody)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toBeNull();
    // Should not call item endpoint since no valid candidate IDs.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("skips relations that are not objects or are null and continues checking", async () => {
    const wiqlBody = { workItems: [{ id: 100 }] };
    const itemBody = {
      id: 100,
      rev: 1,
      fields: { "System.Description": "Has invalid relations" },
      relations: [
        null,
        "not-an-object",
        { rel: AFFECTED_BY_REL, url: `https://ado.example/_apis/wit/workitems/${ROOT_ID}` },
      ],
    };

    const fetchMock = vi.fn((url: string) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      return Promise.resolve(jsonResponse(itemBody));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toEqual({ id: 100, rev: 1, description: "Has invalid relations" });
  });

  it("skips relations with non-string url or mismatched rel and continues checking", async () => {
    const wiqlBody = { workItems: [{ id: 100 }] };
    const itemBody = {
      id: 100,
      rev: 1,
      fields: { "System.Description": "Has various rel issues" },
      relations: [
        { rel: "WrongRel", url: `https://ado.example/_apis/wit/workitems/${ROOT_ID}` },
        { rel: AFFECTED_BY_REL, url: 123 },
        { rel: AFFECTED_BY_REL, url: `https://ado.example/_apis/wit/workitems/${ROOT_ID}` },
      ],
    };

    const fetchMock = vi.fn((url: string) => {
      if (url === WIQL_URL) {
        return Promise.resolve(jsonResponse(wiqlBody));
      }
      return Promise.resolve(jsonResponse(itemBody));
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await findFeatureCrewInPage(
      WIQL_URL,
      ITEM_BASE_URL,
      ROOT_ID,
      TITLE,
      TYPE_NAME,
      STATE,
      AFFECTED_BY_REL,
    );

    expect(result).toEqual({ id: 100, rev: 1, description: "Has various rel issues" });
  });
});
