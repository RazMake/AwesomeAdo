import { describe, expect, it, vi } from "vitest";

import { discardBoardCaches } from "./discardBoardCaches";

function fakeLogger() {
  return { info: vi.fn<(message: string) => void>(), error: vi.fn() };
}

function fakeCache() {
  return { clear: vi.fn() };
}

describe("discardBoardCaches", () => {
  it("clears every board cache and the page's shared services", () => {
    const logger = fakeLogger();
    const discardCachedData = vi.fn();
    const caches = [fakeCache(), fakeCache()];

    discardBoardCaches({ logger, discardCachedData }, "Sprint View", caches);

    expect(caches[0]!.clear).toHaveBeenCalledTimes(1);
    expect(caches[1]!.clear).toHaveBeenCalledTimes(1);
    expect(discardCachedData).toHaveBeenCalledTimes(1);
  });

  it("logs which board discarded and how many caches it threw away", () => {
    const logger = fakeLogger();

    discardBoardCaches({ logger, discardCachedData: vi.fn() }, "Consumers View", [fakeCache()]);

    expect(logger.info).toHaveBeenCalledTimes(1);
    const line = String(logger.info.mock.calls[0]?.[0]);
    expect(line).toContain("Consumers View Ctrl+Refresh");
    expect(line).toContain("discarding 1 board cache(s)");
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("still clears the board caches when the services remember nothing", () => {
    const logger = fakeLogger();
    const cache = fakeCache();

    expect(() => discardBoardCaches({ logger }, "Project Tracking", [cache])).not.toThrow();

    expect(cache.clear).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Project Tracking"));
  });
});
