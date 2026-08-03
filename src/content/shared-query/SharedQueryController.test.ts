import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../../common/logging/ILogger";
import { DEFAULT_SETTINGS } from "../../common/settings/ExtensionSettings";
import { exportCompactConfig } from "../../common/settings-transfer/AwesomeAdoConfig";
import { SharedQueryConfigResolver } from "../../common/settings-transfer/SharedQueryConfigResolver";
import type { SharedQueryLinkService } from "../../common/settings-transfer/SharedQueryLinkService";
import type {
  SharedQuerySources,
  SharedQuerySourceStore,
} from "../../common/settings-transfer/SharedQuerySourceStore";
import type {
  TeamConfigReader,
  TeamConfigReadResult,
} from "../../common/settings-transfer/TeamConfigSynchronizer";

import { SharedQueryController, type SharedQueryConfiguration } from "./SharedQueryController";

const QUERY_ID = "2f6a1b4c-0000-4a11-9f00-abcdef012345";
const QUERY_URL = `https://dev.azure.com/myorg/myproject/_queries/query/${QUERY_ID}`;
const WORK_ITEM_ID = 42;

const logger = (): ILogger => ({ info: vi.fn(), error: vi.fn() });

class FakeSources implements SharedQuerySourceStore {
  constructor(public links: SharedQuerySources = {}) {}
  read = vi.fn(async () => this.links);
  link = vi.fn(async (queryId: string, workItemId: number) => {
    this.links = { ...this.links, [queryId]: workItemId };
  });
  unlink = vi.fn(async (queryId: string) => {
    const rest = { ...this.links };
    delete rest[queryId];
    this.links = rest;
  });
  observe = vi.fn(() => ({ ready: Promise.resolve(), unsubscribe: vi.fn() }));
}

const published = (): string =>
  exportCompactConfig(
    { ...DEFAULT_SETTINGS, project: "Theirs" },
    {
      [QUERY_ID]: { view: "sprint", properties: {}, name: "Their board" },
    },
  );

function reader(text: string | null): TeamConfigReader {
  return {
    read: vi.fn(async (): Promise<TeamConfigReadResult> =>
      text === null ? { ok: false, error: "HTTP 403" } : { ok: true, text },
    ),
  };
}

interface Harness {
  controller: SharedQueryController;
  reported: (SharedQueryConfiguration | null)[];
  sources: FakeSources;
  apply: ReturnType<typeof vi.fn>;
}

function harness(options: { links?: SharedQuerySources; payload?: string | null } = {}): Harness {
  const sources = new FakeSources(options.links ?? {});
  const apply = vi.fn(async (queryId: string, workItemId: number) => {
    await sources.link(queryId, workItemId);
    return { status: "linked" as const, workItemId, queryId };
  });
  const reported: (SharedQueryConfiguration | null)[] = [];
  const controller = new SharedQueryController(
    { apply } as unknown as SharedQueryLinkService,
    sources,
    new SharedQueryConfigResolver(
      reader(options.payload === undefined ? published() : options.payload),
      logger(),
    ),
    (configuration) => reported.push(configuration),
    logger(),
  );
  return { controller, reported, sources, apply };
}

describe("SharedQueryController", () => {
  it("applies the link a shared query URL carries", async () => {
    const { controller, apply } = harness();

    await controller.navigate(`${QUERY_URL}?awesomeAdoConfig=${WORK_ITEM_ID}`);

    expect(apply).toHaveBeenCalledWith(QUERY_ID, WORK_ITEM_ID);
  });

  it("reports the publisher's settings and binding for a linked query", async () => {
    const { controller, reported } = harness({ links: { [QUERY_ID]: WORK_ITEM_ID } });

    await controller.navigate(QUERY_URL);

    expect(reported.at(-1)).toEqual({
      queryId: QUERY_ID,
      workItemId: WORK_ITEM_ID,
      settings: expect.objectContaining({ project: "Theirs" }),
      binding: { view: "sprint", properties: {}, name: "Their board" },
    });
    expect(controller.isReadOnly(QUERY_ID)).toBe(true);
  });

  it("reports no shared configuration for a query nobody shared", async () => {
    const { controller, reported } = harness();

    await controller.navigate(QUERY_URL);

    expect(reported).toEqual([null]);
    expect(controller.isReadOnly(QUERY_ID)).toBe(false);
  });

  it("reports no shared configuration off a single-query route", async () => {
    const { controller, reported, sources } = harness({ links: { [QUERY_ID]: WORK_ITEM_ID } });

    await controller.navigate("https://dev.azure.com/myorg/myproject/_queries/all");

    expect(reported).toEqual([null]);
    expect(sources.read).not.toHaveBeenCalled();
  });

  it("drops the publisher's configuration when the reader leaves the shared query", async () => {
    // The answer is per query, not per tab: keeping it would show someone else's configuration on
    // the reader's own queries.
    const { controller, reported } = harness({ links: { [QUERY_ID]: WORK_ITEM_ID } });

    await controller.navigate(QUERY_URL);
    await controller.navigate(
      "https://dev.azure.com/myorg/myproject/_queries/query/99999999-9999-4999-8999-999999999999",
    );

    expect(reported.at(-1)).toBeNull();
    expect(controller.isReadOnly(QUERY_ID)).toBe(false);
  });

  it("keeps the link but renders nothing when the shared work item cannot be read", async () => {
    const { controller, reported, sources } = harness({
      links: { [QUERY_ID]: WORK_ITEM_ID },
      payload: null,
    });

    await controller.navigate(QUERY_URL);

    expect(reported.at(-1)).toBeNull();
    // Dropping the link on a transient failure would silently un-enhance the query for good.
    expect(sources.unlink).not.toHaveBeenCalled();
  });

  it("reports a binding-less shared configuration when the publisher does not enhance the query", async () => {
    const { controller, reported } = harness({
      links: { [QUERY_ID]: WORK_ITEM_ID },
      payload: exportCompactConfig(DEFAULT_SETTINGS, {}),
    });

    await controller.navigate(QUERY_URL);

    expect(reported.at(-1)?.binding).toBeNull();
  });

  it("releases a link and stops reporting its configuration", async () => {
    const { controller, reported, sources } = harness({ links: { [QUERY_ID]: WORK_ITEM_ID } });
    await controller.navigate(QUERY_URL);

    await controller.release(QUERY_ID);

    expect(sources.unlink).toHaveBeenCalledWith(QUERY_ID);
    expect(reported.at(-1)).toBeNull();
    expect(controller.isReadOnly(QUERY_ID)).toBe(false);
  });

  it("records a link that could not be applied without abandoning the page", async () => {
    const { controller, apply, reported } = harness();
    apply.mockResolvedValueOnce({ status: "failed", workItemId: WORK_ITEM_ID, error: "nope" });

    await controller.navigate(`${QUERY_URL}?awesomeAdoConfig=${WORK_ITEM_ID}`);

    expect(reported).toEqual([null]);
  });
});
