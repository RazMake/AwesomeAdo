import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchAdoRawInPage } from "./fetchAdoRawInPage";

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return { ok, status, json: () => Promise.resolve(body) } as unknown as Response;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchAdoRawInPage - metadata", () => {
  it("pages through every team and returns the remaining metadata", async () => {
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
      if (url === "wit-url") {
        return Promise.resolve(jsonResponse({ value: [{ name: "Bug" }] }));
      }
      if (url === "fields-url") {
        return Promise.resolve(jsonResponse({ value: [{ referenceName: "System.CreatedDate" }] }));
      }
      return Promise.resolve(jsonResponse({ name: "Web" }));
    });
    vi.stubGlobal("fetch", fetchMock);

    expect(await fetchAdoRawInPage("teams-url", "wit-url", "fields-url", "areas-url")).toEqual({
      teams: {
        value: [
          { id: "1", name: "Alpha" },
          { id: "2", name: "Beta" },
          { id: "3", name: "Gamma" },
        ],
      },
      workItemTypes: { value: [{ name: "Bug" }] },
      fields: { value: [{ referenceName: "System.CreatedDate" }] },
      areaPaths: { name: "Web" },
    });
    // Credentials must be included so ADO's SameSite session cookies ride along on the page-world call.
    expect(fetchMock).toHaveBeenCalledWith("teams-url&$skip=0", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    expect(fetchMock).toHaveBeenCalledWith("wit-url", {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    expect(fetchMock).toHaveBeenCalledWith("fields-url", {
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
    expect(await fetchAdoRawInPage("teams-url", "wit-url", "fields-url", "areas-url")).toEqual({
      teams: null,
      workItemTypes: null,
      fields: null,
      areaPaths: null,
    });
  });
});

describe("fetchAdoRawInPage - area-path retries", () => {
  it("yields null when a request rejects", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    const result = fetchAdoRawInPage("teams-url", "wit-url", "fields-url", "areas-url");
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({
      teams: null,
      workItemTypes: null,
      fields: null,
      areaPaths: null,
    });
  });

  it("retries a transient area-path failure up to three attempts with backoff", async () => {
    vi.useFakeTimers();
    let areaAttempts = 0;
    const fetchMock = vi.fn((url: string) => {
      if (url === "areas-url" && ++areaAttempts < 3) {
        return Promise.resolve(jsonResponse(null, false, 503));
      }
      return Promise.resolve(
        jsonResponse(url === "areas-url" ? { name: "Project" } : { value: [] }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = fetchAdoRawInPage("teams-url", "wit-url", "fields-url", "areas-url");
    await vi.runAllTimersAsync();

    await expect(result).resolves.toMatchObject({ areaPaths: { name: "Project" } });
    expect(areaAttempts).toBe(3);
  });
});
