import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChromeSessionStorage } from "./ChromeSessionStorage";

type MockStorageChange = { newValue?: unknown };
type StorageChangeListener = (changes: Record<string, MockStorageChange>, areaName: string) => void;

interface MockChrome {
  storage: {
    session: {
      get: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
    };
    onChanged: {
      addListener: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
    };
  };
}

function makeMockChrome(): MockChrome {
  return {
    storage: {
      session: {
        get: vi.fn(),
        set: vi.fn(),
      },
      onChanged: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  };
}

describe("ChromeSessionStorage", () => {
  let mockChrome: MockChrome;
  let storage: ChromeSessionStorage;

  beforeEach(() => {
    mockChrome = makeMockChrome();
    globalThis.chrome = mockChrome as unknown as typeof chrome;
    storage = new ChromeSessionStorage();
  });

  describe("get", () => {
    it("returns the value for the requested key", async () => {
      mockChrome.storage.session.get.mockResolvedValue({ "catalogFavorites.removed.id": [] });

      const result = await storage.get("catalogFavorites.removed.id");

      expect(result).toEqual([]);
      expect(mockChrome.storage.session.get).toHaveBeenCalledWith("catalogFavorites.removed.id");
    });

    it("returns undefined when the key is absent from storage", async () => {
      mockChrome.storage.session.get.mockResolvedValue({});

      expect(await storage.get("catalogFavorites.removed.id")).toBeUndefined();
    });
  });

  describe("set", () => {
    it("writes the key/value pair to session storage", async () => {
      mockChrome.storage.session.set.mockResolvedValue(undefined);

      await storage.set("catalogFavorites.removed.id", [1]);

      expect(mockChrome.storage.session.set).toHaveBeenCalledWith({
        "catalogFavorites.removed.id": [1],
      });
    });
  });

  describe("subscribe", () => {
    it("forwards the newValue only for the matching key in the session area", () => {
      const listener = vi.fn();
      let capturedHandler: StorageChangeListener | undefined;
      mockChrome.storage.onChanged.addListener.mockImplementation(
        (handler: StorageChangeListener) => {
          capturedHandler = handler;
        },
      );

      storage.subscribe("catalogFavorites.removed.id", listener);
      capturedHandler!({ "catalogFavorites.removed.id": { newValue: [2] } }, "session");

      expect(listener).toHaveBeenCalledWith([2]);
    });

    it.each(["local", "sync"])("ignores changes from the %s area", (areaName) => {
      const listener = vi.fn();
      let capturedHandler: StorageChangeListener | undefined;
      mockChrome.storage.onChanged.addListener.mockImplementation(
        (handler: StorageChangeListener) => {
          capturedHandler = handler;
        },
      );

      storage.subscribe("catalogFavorites.removed.id", listener);
      capturedHandler!({ "catalogFavorites.removed.id": { newValue: [2] } }, areaName);

      expect(listener).not.toHaveBeenCalled();
    });

    it("calls removeListener when unsubscribed", () => {
      let capturedHandler: StorageChangeListener | undefined;
      mockChrome.storage.onChanged.addListener.mockImplementation(
        (handler: StorageChangeListener) => {
          capturedHandler = handler;
        },
      );

      const unsubscribe = storage.subscribe("catalogFavorites.removed.id", vi.fn());
      unsubscribe();

      expect(mockChrome.storage.onChanged.removeListener).toHaveBeenCalledWith(capturedHandler);
    });
  });
});
