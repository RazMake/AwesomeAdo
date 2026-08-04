import { describe, expect, it, vi } from "vitest";

import { HYPERLINK_RELATION, PROJECT_QUERY_LINK_COMMENT } from "../ado/projectQuery";

import {
  MessagingProjectQueryService,
  type SendProjectQueryRequest,
} from "./MessagingProjectQueryService";
import { PROJECT_QUERY_MESSAGE } from "./ProjectQueryRequest";

const QUERY_ID = "11111111-2222-3333-4444-555555555555";
const LINK_URL = `https://dev.azure.com/contoso/Fabrikam/_queries/query/${QUERY_ID}`;

function logger() {
  return {
    info: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string, error?: unknown) => void>(),
  };
}

function service(send: SendProjectQueryRequest, log = logger()): MessagingProjectQueryService {
  return new MessagingProjectQueryService(send, log);
}

describe("MessagingProjectQueryService.readLinks", () => {
  it("asks the worker and parses which projects own a tracking query", async () => {
    const send = vi.fn(async () => ({
      ok: true,
      raw: {
        value: [
          {
            id: 7,
            rev: 3,
            relations: [
              {
                rel: HYPERLINK_RELATION,
                url: LINK_URL,
                attributes: { comment: PROJECT_QUERY_LINK_COMMENT },
              },
            ],
          },
        ],
      },
    })) as SendProjectQueryRequest;

    const result = await service(send).readLinks([7]);

    expect(send).toHaveBeenCalledWith({
      type: PROJECT_QUERY_MESSAGE,
      operation: "read-links",
      ids: [7],
    });
    expect(result).toEqual({
      links: [{ workItemId: 7, queryId: QUERY_ID, url: LINK_URL, managed: true }],
      error: null,
    });
  });

  it("asks nothing when there are no projects to ask about", async () => {
    const send = vi.fn() as unknown as SendProjectQueryRequest;

    expect(await service(send).readLinks([])).toEqual({ links: [], error: null });
    expect(send).not.toHaveBeenCalled();
  });

  it("reports a refused read so the catalog can say the answer is unknown", async () => {
    const send = vi.fn(async () => ({ ok: false, error: "HTTP 401" })) as SendProjectQueryRequest;
    const log = logger();

    expect(await service(send, log).readLinks([7])).toEqual({ links: [], error: "HTTP 401" });
    expect(log.error).toHaveBeenCalledOnce();
  });
});

describe("MessagingProjectQueryService.create", () => {
  it("forwards the request and reports the created query", async () => {
    const send = vi.fn(async () => ({
      ok: true,
      queryId: QUERY_ID,
      rev: 5,
    })) as SendProjectQueryRequest;
    const log = logger();

    const result = await service(send, log).create({
      projectId: 7,
      projectTitle: "Payments",
      rev: 4,
      folderPath: "Shared Queries",
    });

    expect(send).toHaveBeenCalledWith({
      type: PROJECT_QUERY_MESSAGE,
      operation: "create",
      projectId: 7,
      projectTitle: "Payments",
      rev: 4,
      folderPath: "Shared Queries",
    });
    expect(result).toEqual({ ok: true, queryId: QUERY_ID, rev: 5 });
    expect(log.info).toHaveBeenCalledOnce();
  });

  it("reports a refusal instead of a query id nobody created", async () => {
    const send = vi.fn(async () => ({ ok: false, error: "HTTP 403" })) as SendProjectQueryRequest;

    const result = await service(send).create({
      projectId: 7,
      projectTitle: "Payments",
      rev: 4,
      folderPath: "Shared Queries",
    });

    expect(result).toEqual({ ok: false, error: "HTTP 403" });
  });
});

describe("MessagingProjectQueryService.remove", () => {
  it("forwards the request and reports the project's new revision", async () => {
    const send = vi.fn(async () => ({ ok: true, rev: 6 })) as SendProjectQueryRequest;
    const log = logger();

    const result = await service(send, log).remove({ projectId: 7, queryId: QUERY_ID, rev: 5 });

    expect(send).toHaveBeenCalledWith({
      type: PROJECT_QUERY_MESSAGE,
      operation: "remove",
      projectId: 7,
      queryId: QUERY_ID,
      rev: 5,
    });
    expect(result).toEqual({ ok: true, rev: 6 });
    expect(log.info).toHaveBeenCalledOnce();
  });

  it("records a worker that never answered rather than reporting success", async () => {
    const send = vi.fn(async () => undefined) as SendProjectQueryRequest;
    const log = logger();

    expect((await service(send, log).remove({ projectId: 7, queryId: QUERY_ID, rev: 5 })).ok).toBe(
      false,
    );
    expect(log.error).toHaveBeenCalledOnce();
  });

  it("never lets a rejected round trip escape as an exception", async () => {
    const send = vi.fn(async () => {
      throw new Error("port closed");
    }) as unknown as SendProjectQueryRequest;
    const log = logger();

    const result = await service(send, log).remove({ projectId: 7, queryId: QUERY_ID, rev: 5 });

    expect(result.ok).toBe(false);
    expect(log.error).toHaveBeenCalledOnce();
  });
});
