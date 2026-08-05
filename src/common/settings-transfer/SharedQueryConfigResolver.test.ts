import { describe, expect, it, vi } from "vitest";

import type { ILogger } from "../logging/ILogger";
import { DEFAULT_SETTINGS } from "../settings/ExtensionSettings";

import { exportCompactConfig, exportConnectionConfig } from "./AwesomeAdoConfig";
import { SharedQueryConfigResolver } from "./SharedQueryConfigResolver";
import type { TeamConfigReader, TeamConfigReadResult } from "./TeamConfigSynchronizer";

const QUERY_ID = "11111111-1111-1111-1111-111111111111";

const logger = (): ILogger => ({ info: vi.fn(), error: vi.fn() });

function reader(
  ...results: TeamConfigReadResult[]
): TeamConfigReader & { read: ReturnType<typeof vi.fn> } {
  const read = vi.fn(
    async (): Promise<TeamConfigReadResult> => results.shift() ?? { ok: false, error: "exhausted" },
  );
  return { read };
}

const publishedConfig = (): string =>
  exportCompactConfig(
    { ...DEFAULT_SETTINGS, theme: "dark", currentTeam: { id: "team-guid", name: "Crew" } },
    { [QUERY_ID]: { view: "sprint", properties: {}, name: "Sprint board" } },
  );

describe("SharedQueryConfigResolver", () => {
  it("resolves the published settings, bindings, and team of a work item", async () => {
    const resolver = new SharedQueryConfigResolver(
      reader({ ok: true, text: publishedConfig() }),
      logger(),
    );

    const config = await resolver.resolve(42);

    expect(config?.workItemId).toBe(42);
    expect(config?.settings.currentTeam).toEqual({ id: "team-guid", name: "Crew" });
    // The publisher's theme is theirs; opening their query must not repaint the reader's page.
    expect(config?.settings.theme).toBeUndefined();
    expect(config?.teamId).toBe("team-guid");
    expect(config?.bindings[QUERY_ID]).toEqual({
      view: "sprint",
      properties: {},
      name: "Sprint board",
    });
  });

  it("reads one work item exactly once however many queries ask about it", async () => {
    // This is the whole reason the resolver exists: several queries can be shared from one item, and
    // asking Azure DevOps once per query multiplies a credentialed round trip for one answer.
    const source = reader({ ok: true, text: publishedConfig() });
    const resolver = new SharedQueryConfigResolver(source, logger());

    const [first, second, third] = await Promise.all([
      resolver.resolve(42),
      resolver.resolve(42),
      resolver.resolve(42),
    ]);
    await resolver.resolve(42);

    expect(source.read).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("asks again after an explicit invalidation", async () => {
    const source = reader(
      { ok: true, text: publishedConfig() },
      { ok: true, text: publishedConfig() },
    );
    const resolver = new SharedQueryConfigResolver(source, logger());

    await resolver.resolve(42);
    resolver.invalidate();
    await resolver.resolve(42);

    expect(source.read).toHaveBeenCalledTimes(2);
  });

  it("remembers a failed read too, so an unreachable item is asked about once", async () => {
    const source = reader({ ok: false, error: "HTTP 403" });
    const log = logger();
    const resolver = new SharedQueryConfigResolver(source, log);

    await expect(resolver.resolve(42)).resolves.toBeNull();
    await expect(resolver.resolve(42)).resolves.toBeNull();

    expect(source.read).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledTimes(1);
  });

  it("resolves nothing, without an error, for an item that has published nothing yet", async () => {
    const log = logger();
    const resolver = new SharedQueryConfigResolver(reader({ ok: true, text: null }), log);

    await expect(resolver.resolve(42)).resolves.toBeNull();
    expect(log.error).not.toHaveBeenCalled();
  });

  it("refuses a connection-only payload, which names a source instead of being one", async () => {
    const connection = exportConnectionConfig(DEFAULT_SETTINGS, 99);
    const log = logger();
    const resolver = new SharedQueryConfigResolver(reader({ ok: true, text: connection }), log);

    await expect(resolver.resolve(42)).resolves.toBeNull();
    expect(log.error).toHaveBeenCalled();
  });

  it("resolves nothing when the item's content is not a configuration at all", async () => {
    const resolver = new SharedQueryConfigResolver(
      reader({ ok: true, text: "definitely not json" }),
      logger(),
    );

    await expect(resolver.resolve(42)).resolves.toBeNull();
  });
});
