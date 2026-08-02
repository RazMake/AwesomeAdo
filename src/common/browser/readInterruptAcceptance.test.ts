import { describe, expect, it, vi } from "vitest";

import { isInterruptAccepted } from "../ado/interruptAcceptance";

import {
  readInterruptAcceptance,
  type ReadInterruptAcceptanceConfig,
} from "./readInterruptAcceptance";

function config(): ReadInterruptAcceptanceConfig {
  return {
    requests: [{ workItemId: 7, updatesUrl: "https://ado/updates?$skip=0" }],
    interruptTag: "Interrupt",
    acceptanceTag: "[ACCEPTED]",
    concurrency: 2,
    updatePageSize: 2,
    maxUpdatePages: 3,
  };
}

describe("readInterruptAcceptance", () => {
  it("uses actual-count paging and the latest tag addition", async () => {
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        raw: {
          value: [
            {
              revisedDate: "2026-08-01T08:00:00Z",
              fields: { "System.Tags": { oldValue: "", newValue: "Interrupt" } },
            },
            {
              revisedDate: "2026-08-01T08:30:00Z",
              fields: { "System.History": { newValue: "old [ACCEPTED]" } },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        raw: {
          value: [
            {
              revisedDate: "2026-08-01T09:00:00Z",
              fields: { "System.Tags": { oldValue: "Interrupt", newValue: "" } },
            },
            {
              revisedDate: "9999-01-01T00:00:00Z",
              fields: {
                "System.Tags": { oldValue: "Other", newValue: "Other; interrupt" },
                "System.ChangedDate": { newValue: "2026-08-01T10:00:00Z" },
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        raw: {
          value: [
            {
              revisedDate: "2026-08-01T10:01:00Z",
              fields: { "System.History": { newValue: "later [ACCEPTED]" } },
            },
          ],
        },
      });

    const result = await readInterruptAcceptance(config(), readPage);

    expect(readPage.mock.calls.map(([url]) => url)).toEqual([
      "https://ado/updates?$skip=0",
      "https://ado/updates?$skip=2",
      "https://ado/updates?$skip=4",
    ]);
    expect(result.evidence[0]?.taggedAt).toBe("2026-08-01T10:00:00Z");
    expect(isInterruptAccepted(result.evidence[0], "[ACCEPTED]")).toBe(true);
  });

  it("keeps failed items distinct from unaccepted items", async () => {
    const result = await readInterruptAcceptance(config(), async () => ({
      status: 401,
      raw: null,
      error: "HTTP 401",
    }));

    expect(result.evidence).toEqual([]);
    expect(result.failedIds).toEqual([7]);
    expect(result.failure).toBe("http");
  });
});
