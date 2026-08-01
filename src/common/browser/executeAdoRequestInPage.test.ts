import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { executeAdoRequestInPage } from "./executeAdoRequestInPage";

const READ_URL = "https://dev.azure.com/contoso/web/_apis/read";
const QUERY_URL = "https://dev.azure.com/contoso/web/_apis/wit/queries/query-1";
const TEAM_MEMBERS_URL =
  "https://dev.azure.com/contoso/_apis/projects/web/teams/Web/members?$top=2&api-version=7.1";

function response(status: number, raw: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(raw),
  } as unknown as Response;
}

const read = (url: string) => executeAdoRequestInPage({ operation: "read", url });

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("executeAdoRequestInPage reads", () => {
  it("returns JSON with signed-in credentials", async () => {
    const raw = { wiql: "SELECT [System.Id] FROM WorkItems" };
    const fetchMock = vi.fn(() => Promise.resolve(response(200, raw)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(read(QUERY_URL)).resolves.toEqual({ raw, status: 200 });
    expect(fetchMock).toHaveBeenCalledWith(QUERY_URL, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  });

  it("retries transient responses and stops after the third attempt", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.resolve(response(503, null)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const outcome = read(READ_URL);
    await vi.runAllTimersAsync();

    await expect(outcome).resolves.toEqual({ raw: null, status: 503, error: "HTTP 503" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not retry permanent failures", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response(403, null)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(read(READ_URL)).resolves.toEqual({
      raw: null,
      status: 403,
      error: "HTTP 403",
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("reports a network failure after three attempts", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(() => Promise.reject(new Error("offline")));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const outcome = read(READ_URL);
    await vi.runAllTimersAsync();

    await expect(outcome).resolves.toEqual({
      raw: null,
      status: 0,
      error: "network after 3 attempts: Error: offline",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("executeAdoRequestInPage team-member reads", () => {
  it("pages by the actual returned count and returns every team member", async () => {
    const members = [
      { identity: { id: "alice", displayName: "Alice", uniqueName: "alice@example.com" } },
      { identity: { id: "bob", displayName: "Bob", uniqueName: "bob@example.com" } },
      { identity: { id: "carol", displayName: "Carol", uniqueName: "carol@example.com" } },
    ];
    const fetchMock = vi.fn((url: string) => {
      const skip = Number(new URL(url).searchParams.get("$skip"));
      return Promise.resolve(
        response(200, { value: skip === 0 ? members.slice(0, 2) : members.slice(2) }),
      );
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      executeAdoRequestInPage({
        operation: "readTeamMembers",
        url: TEAM_MEMBERS_URL,
      }),
    ).resolves.toEqual({
      raw: { value: members },
      status: 200,
    });
    expect(fetchMock.mock.calls.map(([url]) => new URL(url).searchParams.get("$skip"))).toEqual([
      "0",
      "2",
    ]);
  });

  it("returns the detailed page failure", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(response(403, null)));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      executeAdoRequestInPage({
        operation: "readTeamMembers",
        url: TEAM_MEMBERS_URL,
      }),
    ).resolves.toEqual({ raw: null, status: 403, error: "HTTP 403" });
  });
});
