import { describe, expect, it, vi } from "vitest";

import type { AdoRawTree } from "../ado/fetchAdoTree";
import { TRACKING_FIELDS } from "../ado/fetchAdoTree";
import type { ILogger } from "../logging/ILogger";

import type { LoadQueryTreeMessage, LoadQueryTreeResponse } from "./AdoTreeRequest";
import { MessagingWorkItemTreeLoader, type SendTreeRequest } from "./MessagingWorkItemTreeLoader";

const LOAD_FAILURE_ERROR = "Could not load this query from Azure DevOps.";

function makeLoggerSpy(): ILogger {
  return { info: vi.fn(), error: vi.fn() };
}

function oneRootRawTree(): AdoRawTree {
  return {
    wiql: {
      queryType: "tree",
      workItemRelations: [{ source: null, target: { id: 1 } }],
    },
    items: [
      {
        id: 1,
        rev: 3,
        fields: {
          "System.WorkItemType": "Epic",
          "System.Title": "Root epic",
          "System.State": "Active",
        },
      },
    ],
  };
}

function makeLoader(
  send: SendTreeRequest,
  etaFieldByType: ReadonlyMap<string, string> = new Map(),
): { loader: MessagingWorkItemTreeLoader; logger: ILogger } {
  const logger = makeLoggerSpy();
  const loader = new MessagingWorkItemTreeLoader(send, () => etaFieldByType, logger);
  return { loader, logger };
}

describe("MessagingWorkItemTreeLoader", () => {
  it("requests the union of TRACKING_FIELDS and the eta fields, deduped", async () => {
    const send = vi.fn<SendTreeRequest>().mockResolvedValue({ raw: null });
    const etaFieldByType = new Map([
      ["Epic", "Custom.EpicEta"],
      // A duplicate eta field value must not produce a duplicate entry in the requested fields.
      ["Feature", "Custom.EpicEta"],
      ["System.Id" as string, "System.Id"],
    ]);
    const { loader } = makeLoader(send, etaFieldByType);

    await loader.loadTree("query-1");

    const message = send.mock.calls[0]?.[0] as LoadQueryTreeMessage;
    expect(message.fields).toEqual(expect.arrayContaining([...TRACKING_FIELDS]));
    expect(message.fields).toContain("Custom.EpicEta");
    expect(message.fields.length).toBe(new Set(message.fields).size);
  });

  it("returns the parsed tree on success", async () => {
    const raw = oneRootRawTree();
    const send = vi.fn<SendTreeRequest>().mockResolvedValue({ raw });
    const { loader, logger } = makeLoader(send);

    const result = await loader.loadTree("query-1");

    expect(result.isTreeQuery).toBe(true);
    expect(result.error).toBeNull();
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0]).toMatchObject({ id: 1, type: "Epic", title: "Root epic" });
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe("MessagingWorkItemTreeLoader failures", () => {
  it("logs the stage and HTTP status when the work-items batch fails", async () => {
    const raw: AdoRawTree = {
      wiql: null,
      items: [],
      failure: { stage: "batch", status: 400 },
    };
    const { loader, logger } = makeLoader(vi.fn<SendTreeRequest>().mockResolvedValue({ raw }));

    const result = await loader.loadTree("query-1");

    expect(result.error).toBe(LOAD_FAILURE_ERROR);
    expect(logger.error).toHaveBeenCalledWith(
      "Could not load query tree for query-1: batch request failed (HTTP 400).",
      raw.failure,
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("logs an error when Azure DevOps returns incomplete tree data without a transport failure", async () => {
    const raw: AdoRawTree = {
      wiql: {
        queryType: "tree",
        workItemRelations: [{ source: null, target: { id: 1 } }],
      },
      items: [],
    };
    const { loader, logger } = makeLoader(vi.fn<SendTreeRequest>().mockResolvedValue({ raw }));

    const result = await loader.loadTree("query-1");

    expect(result.error).toBe(LOAD_FAILURE_ERROR);
    expect(logger.error).toHaveBeenCalledWith(
      "Could not load query tree for query-1: Azure DevOps returned incomplete or malformed tree data.",
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("returns an error result and logs when raw is null", async () => {
    const send = vi.fn<SendTreeRequest>().mockResolvedValue({ raw: null } as LoadQueryTreeResponse);
    const { loader, logger } = makeLoader(send);

    const result = await loader.loadTree("query-1");

    expect(result).toEqual({ isTreeQuery: false, roots: [], error: LOAD_FAILURE_ERROR });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("query-1"));
  });

  it("returns an error result and logs when the response is undefined", async () => {
    const send = vi.fn<SendTreeRequest>().mockResolvedValue(undefined);
    const { loader, logger } = makeLoader(send);

    const result = await loader.loadTree("query-1");

    expect(result).toEqual({ isTreeQuery: false, roots: [], error: LOAD_FAILURE_ERROR });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("query-1"));
  });

  it("returns an error result and logs the original error when send rejects", async () => {
    const failure = new Error("network down");
    const send = vi.fn<SendTreeRequest>().mockRejectedValue(failure);
    const { loader, logger } = makeLoader(send);

    const result = await loader.loadTree("query-1");

    expect(result).toEqual({ isTreeQuery: false, roots: [], error: LOAD_FAILURE_ERROR });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("query-1"), failure);
  });
});
