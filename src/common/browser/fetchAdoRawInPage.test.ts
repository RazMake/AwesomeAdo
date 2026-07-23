import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchAdoRawInPage } from "./fetchAdoRawInPage";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchAdoRawInPage", () => {
  it("pages through every team with the session credentials and returns the raw area tree", async () => {
    // Variable page sizes verify $skip advances by the count actually returned, not a fixed page size.
    const teamPages: Record<number, unknown> = {
      0: {
        value: [
          { id: "1", name: "Alpha" },
          { id: "2", name: "Beta" },
        ],
      },
      2: { value: [{ id: "3", name: "Gamma" }] },
      3: { value: [] },
    };
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("teams-url")) {
        const skip = Number(/\$skip=(\d+)/.exec(url)?.[1] ?? "0");
        return Promise.resolve(jsonResponse(teamPages[skip]));
      }
      return Promise.resolve(jsonResponse({ name: "Web" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchAdoRawInPage("teams-url", "areas-url")).toEqual({
      teams: {
        value: [
          { id: "1", name: "Alpha" },
          { id: "2", name: "Beta" },
          { id: "3", name: "Gamma" },
        ],
      },
      areaTree: { name: "Web" },
    });
    // Credentials must be included so ADO's SameSite session cookies ride along on the page-world call.
    expect(fetchMock).toHaveBeenCalledWith("teams-url&$skip=0", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    expect(fetchMock).toHaveBeenCalledWith("areas-url", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  });

  it("yields null for a teams body a request could not read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(null, false))),
    );
    expect(await fetchAdoRawInPage("teams-url", "areas-url")).toEqual({
      teams: null,
      areaTree: null,
    });
  });

  it("yields null when a request rejects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    expect(await fetchAdoRawInPage("teams-url", "areas-url")).toEqual({
      teams: null,
      areaTree: null,
    });
  });
});
