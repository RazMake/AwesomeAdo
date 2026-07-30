import { afterEach, describe, expect, it, vi } from "vitest";

import { reorderWorkItemInPage, type ReorderWorkItemConfig } from "./reorderWorkItemInPage";

const ORDER_URL = "https://ado.example/contoso/web/Web/_apis/work/workitemsorder?api-version=x";
const RELATIONS_URL = "https://ado.example/contoso/_apis/wit/workitems/10?$expand=relations";
const ITEM_URL = "https://ado.example/contoso/_apis/wit/workitems/10?api-version=7.1";
const PARENT_LINK_URL = "https://ado.example/contoso/_apis/wit/workItems/20";
const PARENT_LINK_TYPE = "System.LinkTypes.Hierarchy-Reverse";

const config = (overrides: Partial<ReorderWorkItemConfig> = {}): ReorderWorkItemConfig => ({
  orderUrl: ORDER_URL,
  relationsUrl: RELATIONS_URL,
  itemUrl: ITEM_URL,
  parentLinkUrl: PARENT_LINK_URL,
  parentLinkType: PARENT_LINK_TYPE,
  id: 10,
  rev: 5,
  parentId: 20,
  previousId: 3,
  nextId: 4,
  reparent: false,
  ...overrides,
});

/**
 * A minimal `Response` stand-in: only `ok`, `status`, `json()` and `text()` are ever read. `text()`
 * is what the failure path reads, so a rejected reply can hand back what the server actually said.
 */
const reply = (body: unknown, ok = true, status = 200, text?: string): Response =>
  ({
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(text ?? JSON.stringify(body)),
  }) as unknown as Response;

/** The order endpoint's happy-path body for item 10. */
const ORDER_BODY = [{ id: 10, order: 1500 }];

/** The relations read's body: the item's rev plus the links it currently carries. */
const relations = (rels: Array<{ rel: string; url?: string }>): Response =>
  reply({ rev: 5, relations: rels });

type Call = [string, RequestInit | undefined];

/**
 * Stubs `fetch` with a router keyed by URL, so each test states only the responses it cares about
 * and an unexpected call fails loudly instead of silently resolving.
 */
function stubFetch(routes: Partial<Record<string, Response>>): { calls: Call[] } {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) => {
    calls.push([url, init]);
    const response = routes[url];
    return response === undefined
      ? Promise.reject(new Error(`Unexpected fetch: ${url}`))
      : Promise.resolve(response);
  });
  return { calls };
}

/** The JSON Patch operations sent to the work item endpoint. */
const patchOps = (calls: Call[]): Array<Record<string, unknown>> =>
  JSON.parse(calls.find(([url]) => url === ITEM_URL)?.[1]?.body as string) as Array<
    Record<string, unknown>
  >;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reorderWorkItemInPage - ranking only", () => {
  it("PATCHes the order endpoint alone when the parent is unchanged", async () => {
    const { calls } = stubFetch({ [ORDER_URL]: reply(ORDER_BODY) });

    const result = await reorderWorkItemInPage(config());

    expect(calls).toHaveLength(1);
    const [url, init] = calls[0]!;
    expect(url).toBe(ORDER_URL);
    expect(init?.method).toBe("PATCH");
    // ADO's session cookies are SameSite, so the page-world call must send credentials.
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(init?.body as string)).toEqual({
      ids: [10],
      parentId: 20,
      previousId: 3,
      nextId: 4,
    });
    expect(result).toEqual({ ok: true, rev: undefined, order: 1500, reparented: false });
  });

  it("reads the new rank out of a { value: [...] } envelope too", async () => {
    stubFetch({
      [ORDER_URL]: reply({
        value: [
          { id: 9, order: 1 },
          { id: 10, order: 2500 },
        ],
      }),
    });

    expect(await reorderWorkItemInPage(config())).toEqual({
      ok: true,
      rev: undefined,
      order: 2500,
      reparented: false,
    });
  });

  it("leaves the order undefined when the body names no rank for this item", async () => {
    stubFetch({ [ORDER_URL]: reply([{ id: 99, order: 1 }]) });

    expect(await reorderWorkItemInPage(config())).toEqual({
      ok: true,
      rev: undefined,
      order: undefined,
      reparented: false,
    });
  });

  it("leaves the order undefined when the reported rank is not a number", async () => {
    stubFetch({ [ORDER_URL]: reply([{ id: 10, order: "1500" }]) });

    expect((await reorderWorkItemInPage(config())).order).toBeUndefined();
  });

  it("leaves the order undefined when the body is not a list at all", async () => {
    stubFetch({ [ORDER_URL]: reply({ message: "no content" }) });

    expect(await reorderWorkItemInPage(config())).toEqual({
      ok: true,
      rev: undefined,
      order: undefined,
      reparented: false,
    });
  });
});

describe("reorderWorkItemInPage - re-parenting", () => {
  it("reads the links, replaces the parent under a rev test, then ranks the item", async () => {
    const { calls } = stubFetch({
      [RELATIONS_URL]: relations([
        { rel: "System.LinkTypes.Related", url: "https://ado.example/x" },
        { rel: PARENT_LINK_TYPE, url: "https://ado.example/contoso/_apis/wit/workItems/10" },
      ]),
      [ITEM_URL]: reply({ rev: 6 }),
      [ORDER_URL]: reply(ORDER_BODY),
    });

    const result = await reorderWorkItemInPage(config({ reparent: true }));

    expect(calls.map(([url]) => url)).toEqual([RELATIONS_URL, ITEM_URL, ORDER_URL]);
    // The relations read is a plain credentialed GET: no method, no body.
    expect(calls[0]?.[1]).toEqual({ credentials: "include" });
    expect(patchOps(calls)).toEqual([
      { op: "test", path: "/rev", value: 5 },
      // Index 1: the parent link's position in the relations array, the only way JSON Patch can
      // address it for removal.
      { op: "remove", path: "/relations/1" },
      {
        op: "add",
        path: "/relations/-",
        value: { rel: PARENT_LINK_TYPE, url: PARENT_LINK_URL },
      },
    ]);
    expect(calls[1]?.[1]?.method).toBe("PATCH");
    expect(result).toEqual({ ok: true, rev: 6, order: 1500, reparented: true });
  });

  it("sends the item patch as a JSON Patch document with credentials", async () => {
    const { calls } = stubFetch({
      [RELATIONS_URL]: relations([]),
      [ITEM_URL]: reply({ rev: 6 }),
      [ORDER_URL]: reply(ORDER_BODY),
    });

    await reorderWorkItemInPage(config({ reparent: true }));

    const headers = calls[1]?.[1]?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json-patch+json");
    expect(calls[1]?.[1]?.credentials).toBe("include");
  });
});

describe("reorderWorkItemInPage - the link patch it builds", () => {
  it("changes type in the same guarded patch as the parent link", async () => {
    const { calls } = stubFetch({
      [RELATIONS_URL]: relations([{ rel: PARENT_LINK_TYPE }]),
      [ITEM_URL]: reply({ rev: 6 }),
      [ORDER_URL]: reply(ORDER_BODY),
    });

    await reorderWorkItemInPage(config({ reparent: true, typeName: "Feature" }));

    expect(patchOps(calls)).toEqual([
      { op: "test", path: "/rev", value: 5 },
      { op: "remove", path: "/relations/0" },
      { op: "add", path: "/relations/-", value: { rel: PARENT_LINK_TYPE, url: PARENT_LINK_URL } },
      { op: "add", path: "/fields/System.WorkItemType", value: "Feature" },
    ]);
  });

  it("adds the new link without a remove when the item had no parent", async () => {
    const { calls } = stubFetch({
      [RELATIONS_URL]: relations([{ rel: "System.LinkTypes.Related" }]),
      [ITEM_URL]: reply({ rev: 6 }),
      [ORDER_URL]: reply(ORDER_BODY),
    });

    await reorderWorkItemInPage(config({ reparent: true }));

    expect(patchOps(calls)).toEqual([
      { op: "test", path: "/rev", value: 5 },
      { op: "add", path: "/relations/-", value: { rel: PARENT_LINK_TYPE, url: PARENT_LINK_URL } },
    ]);
  });

  it("only removes the old link when the item is being moved to the top level", async () => {
    const { calls } = stubFetch({
      [RELATIONS_URL]: relations([{ rel: PARENT_LINK_TYPE }]),
      [ITEM_URL]: reply({ rev: 6 }),
      [ORDER_URL]: reply(ORDER_BODY),
    });

    await reorderWorkItemInPage(config({ reparent: true, parentLinkUrl: null, parentId: 0 }));

    expect(patchOps(calls)).toEqual([
      { op: "test", path: "/rev", value: 5 },
      { op: "remove", path: "/relations/0" },
    ]);
  });

  it("tolerates a response that carries no relations array", async () => {
    const { calls } = stubFetch({
      [RELATIONS_URL]: reply({ rev: 5 }),
      [ITEM_URL]: reply({ rev: 6 }),
      [ORDER_URL]: reply(ORDER_BODY),
    });

    const result = await reorderWorkItemInPage(config({ reparent: true }));

    expect(patchOps(calls)).toHaveLength(2);
    expect(result).toEqual({ ok: true, rev: 6, order: 1500, reparented: true });
  });

  it("forwards no rev when the patched item reported a non-numeric one", async () => {
    stubFetch({
      [RELATIONS_URL]: reply({ relations: [] }),
      [ITEM_URL]: reply({ rev: "6" }),
      [ORDER_URL]: reply(ORDER_BODY),
    });

    expect(await reorderWorkItemInPage(config({ reparent: true }))).toEqual({
      ok: true,
      rev: undefined,
      order: 1500,
      reparented: true,
    });
  });
});

describe("reorderWorkItemInPage - failures", () => {
  it("reports the order endpoint's status and the body Azure DevOps answered with", async () => {
    stubFetch({
      [ORDER_URL]: reply({}, false, 400, '{"message":"TF401232: work item 10 does not exist"}'),
    });

    expect(await reorderWorkItemInPage(config())).toEqual({
      ok: false,
      error: "order HTTP 400",
      // The body is handed back raw; the worker turns it into the sentence a human reads, because
      // every line spent parsing it in the page world is a line that cannot be unit-tested.
      detail: '{"message":"TF401232: work item 10 does not exist"}',
      stage: "order",
      reparented: false,
    });
  });

  it("truncates a very long error body so a bounded log cannot be flooded by one failure", async () => {
    stubFetch({ [ORDER_URL]: reply({}, false, 500, "x".repeat(5000)) });

    const result = await reorderWorkItemInPage(config());

    expect(result.detail).toHaveLength(600);
  });

  it("still reports the status when the error body cannot be read", async () => {
    stubFetch({
      [ORDER_URL]: {
        ok: false,
        status: 503,
        text: () => Promise.reject(new Error("stream closed")),
      } as unknown as Response,
    });

    expect(await reorderWorkItemInPage(config())).toEqual({
      ok: false,
      error: "order HTTP 503",
      stage: "order",
      reparented: false,
    });
  });

  it("stops before touching the item when the relations read fails", async () => {
    const { calls } = stubFetch({ [RELATIONS_URL]: reply({}, false, 404, "not found") });

    const result = await reorderWorkItemInPage(config({ reparent: true }));

    expect(result).toEqual({
      ok: false,
      error: "relations HTTP 404",
      detail: "not found",
      stage: "relations",
      reparented: false,
    });
    expect(calls).toHaveLength(1);
  });
});

describe("reorderWorkItemInPage - what a partly-applied move reports", () => {
  it("leaves the rank untouched when the re-parent patch is rejected", async () => {
    const { calls } = stubFetch({
      [RELATIONS_URL]: reply({ relations: [] }),
      [ITEM_URL]: reply({}, false, 409, "rev mismatch"),
    });

    const result = await reorderWorkItemInPage(config({ reparent: true }));

    expect(result).toEqual({
      ok: false,
      error: "reparent HTTP 409",
      detail: "rev mismatch",
      stage: "reparent",
      reparented: false,
    });
    // Both the tree and the order are left as they were, rather than half-applied.
    expect(calls.map(([url]) => url)).toEqual([RELATIONS_URL, ITEM_URL]);
  });

  it("reports the order status even after a successful re-parent", async () => {
    stubFetch({
      [RELATIONS_URL]: reply({ relations: [] }),
      [ITEM_URL]: reply({ rev: 6 }),
      [ORDER_URL]: reply({}, false, 500, "boom"),
    });

    // The stage and the landed re-parent both travel: the worker falls back to ranking the item by
    // hand only when ADO refused to RANK it, and the board has to re-home an item ADO has already
    // re-linked even though the move as a whole failed.
    expect(await reorderWorkItemInPage(config({ reparent: true }))).toEqual({
      ok: false,
      error: "order HTTP 500",
      detail: "boom",
      stage: "order",
      reparented: true,
    });
  });

  it("resolves with a failure rather than throwing when the fetch itself rejects", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")));

    const result = await reorderWorkItemInPage(config());

    expect(result.ok).toBe(false);
    expect(result.error).toContain("network down");
  });

  it("resolves with a failure when the response body is not JSON", async () => {
    vi.stubGlobal("fetch", () =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error("Unexpected token")),
      } as unknown as Response),
    );

    const result = await reorderWorkItemInPage(config());

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Unexpected token");
  });
});
