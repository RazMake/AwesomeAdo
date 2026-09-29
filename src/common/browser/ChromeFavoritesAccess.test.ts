import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChromeFavoritesAccess } from "./ChromeFavoritesAccess";

interface MockChrome {
  permissions: {
    contains: ReturnType<typeof vi.fn>;
    request: ReturnType<typeof vi.fn>;
  };
}

function makeMockChrome(): MockChrome {
  return {
    permissions: {
      contains: vi.fn(),
      request: vi.fn(),
    },
  };
}

describe("ChromeFavoritesAccess", () => {
  let mockChrome: MockChrome;
  let favoritesAccess: ChromeFavoritesAccess;

  beforeEach(() => {
    mockChrome = makeMockChrome();
    vi.stubGlobal("chrome", mockChrome);
    favoritesAccess = new ChromeFavoritesAccess();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns whether Favorites access is granted", async () => {
    mockChrome.permissions.contains.mockResolvedValue(true);

    await expect(favoritesAccess.isGranted()).resolves.toBe(true);

    expect(mockChrome.permissions.contains).toHaveBeenCalledWith({ permissions: ["bookmarks"] });
  });

  it("propagates permission status failures", async () => {
    const failure = new Error("Permission status unavailable");
    mockChrome.permissions.contains.mockRejectedValue(failure);

    await expect(favoritesAccess.isGranted()).rejects.toThrow(failure);
  });

  it("requests Favorites access during the originating user gesture", async () => {
    mockChrome.permissions.request.mockResolvedValue(true);

    const result = favoritesAccess.request();

    expect(mockChrome.permissions.request).toHaveBeenCalledWith({ permissions: ["bookmarks"] });
    await expect(result).resolves.toBe(true);
  });

  it("propagates permission request failures", async () => {
    const failure = new Error("Permission request unavailable");
    mockChrome.permissions.request.mockRejectedValue(failure);

    await expect(favoritesAccess.request()).rejects.toThrow(failure);
  });
});
