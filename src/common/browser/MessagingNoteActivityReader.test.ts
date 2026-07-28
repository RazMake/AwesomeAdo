import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../logging/ILogger";

import { MessagingNoteActivityReader } from "./MessagingNoteActivityReader";
import {
  READ_NOTE_ACTIVITY_MESSAGE,
  type RawNoteActivity,
  type ReadNoteActivityResponse,
} from "./NoteActivityRequest";

function fakeLogger(): ILogger & { infos: string[]; errors: string[] } {
  const infos: string[] = [];
  const errors: string[] = [];
  return { infos, errors, info: (m) => infos.push(m), error: (m) => errors.push(m) };
}

const RAW: RawNoteActivity = {
  newest: [{ workItemId: 7, newestNoteDate: "2026-07-24T09:00:00Z" }],
  failedIds: [],
  failure: "none",
  status: 0,
};

/** A reader whose worker answers with `response`. */
function readerAnswering(response: ReadNoteActivityResponse | undefined) {
  const send = vi.fn(async () => response);
  const logger = fakeLogger();
  return { reader: new MessagingNoteActivityReader(send, logger), send, logger };
}

describe("MessagingNoteActivityReader", () => {
  it("asks the worker for exactly the ids it was given", async () => {
    const { reader, send } = readerAnswering({ raw: RAW });

    const result = await reader.readNoteActivity({ workItemIds: [7, 9] });

    expect(send).toHaveBeenCalledWith({
      type: READ_NOTE_ACTIVITY_MESSAGE,
      workItemIds: [7, 9],
    });
    expect(result).toEqual({ activity: RAW.newest, error: null });
  });

  it("answers an empty ask without a round-trip", async () => {
    const { reader, send } = readerAnswering({ raw: RAW });

    const result = await reader.readNoteActivity({ workItemIds: [] });

    expect(send).not.toHaveBeenCalled();
    expect(result).toEqual({ activity: [], error: null });
  });

  it("explains a worker that never handled the message", async () => {
    const { reader, logger } = readerAnswering(undefined);

    const result = await reader.readNoteActivity({ workItemIds: [7] });

    // "No response" alone would send the reader looking for a network fault that is not there.
    expect(result.error).toContain("older code");
    expect(logger.errors[0]).toContain("older code");
    expect(result.activity).toEqual([]);
  });

  it("passes the worker's own reason through when it declined", async () => {
    const { reader } = readerAnswering({ raw: null, error: "not a project-scoped ADO URL" });

    const result = await reader.readNoteActivity({ workItemIds: [7] });

    expect(result).toEqual({ activity: [], error: "not a project-scoped ADO URL" });
  });

  it("keeps a partial answer and reports what was lost alongside it", async () => {
    const { reader, logger } = readerAnswering({
      raw: { ...RAW, failedIds: [9], failure: "http", status: 403 },
    });

    const result = await reader.readNoteActivity({ workItemIds: [7, 9] });

    // The items that were read still narrow the board; the ones that were not stay unclaimed.
    expect(result.activity).toEqual(RAW.newest);
    expect(result.error).toBe("http (HTTP 403)");
    expect(logger.errors[0]).toContain("1 of 2");
  });

  it("degrades rather than throwing when the channel itself fails", async () => {
    const send = vi.fn(() => Promise.reject(new Error("port closed")));
    const logger = fakeLogger();
    const reader = new MessagingNoteActivityReader(send, logger);

    const result = await reader.readNoteActivity({ workItemIds: [7] });

    expect(result).toEqual({ activity: [], error: "could not reach Azure DevOps" });
    expect(logger.errors[0]).toContain("Could not read note activity");
  });

  it("records counts only, never a comment or an author", async () => {
    const { reader, logger } = readerAnswering({ raw: RAW });

    await reader.readNoteActivity({ workItemIds: [7] });

    expect(logger.infos[0]).toBe("Note activity read for 1 item(s): dated=1, failed=0.");
  });
});
