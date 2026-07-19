import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChromeSyncStorage } from "./ChromeSyncStorage";

type MockStorageChange = { newValue?: unknown };
type StorageChangeListener = (changes: Record<string, MockStorageChange>, areaName: string) => void;

interface MockChrome {
  storage: {
    sync: {
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
      sync: {
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

describe("ChromeSyncStorage", () => {
  let mockChrome: MockChrome;
  let storage: ChromeSyncStorage;

  beforeEach(() => {
    mockChrome = makeMockChrome();
    globalThis.chrome = mockChrome as unknown as typeof chrome;
    storage = new ChromeSyncStorage();
  });

  describe("get", () => {
    it("returns the value for the requested key", async () => {
      mockChrome.storage.sync.get.mockResolvedValue({
        "settings.theme": "dark",
      });
      const result = await storage.get("settings.theme");
      expect(result).toBe("dark");
      expect(mockChrome.storage.sync.get).toHaveBeenCalledWith("settings.theme");
    });

    it("returns undefined when the key is absent from storage", async () => {
      mockChrome.storage.sync.get.mockResolvedValue({});
      const result = await storage.get("settings.theme");
      expect(result).toBeUndefined();
    });
  });

  describe("set", () => {
    it("writes the key/value pair to sync storage", async () => {
      mockChrome.storage.sync.set.mockResolvedValue(undefined);
      await storage.set("settings.defaultView", "original");
      expect(mockChrome.storage.sync.set).toHaveBeenCalledWith({
        "settings.defaultView": "original",
      });
    });
  });

  describe("subscribe", () => {
    it("forwards the newValue for the matching key and area", () => {
      const listener = vi.fn();
      let capturedHandler: StorageChangeListener | undefined;
      mockChrome.storage.onChanged.addListener.mockImplementation(
        (handler: StorageChangeListener) => {
          capturedHandler = handler;
        },
      );

      storage.subscribe("settings.theme", listener);
      expect(mockChrome.storage.onChanged.addListener).toHaveBeenCalledOnce();

      capturedHandler!({ "settings.theme": { newValue: false } }, "sync");
      expect(listener).toHaveBeenCalledWith(false);
    });

    it("ignores changes for a different area", () => {
      const listener = vi.fn();
      let capturedHandler: StorageChangeListener | undefined;
      mockChrome.storage.onChanged.addListener.mockImplementation(
        (handler: StorageChangeListener) => {
          capturedHandler = handler;
        },
      );

      storage.subscribe("settings.theme", listener);
      capturedHandler!({ "settings.theme": { newValue: true } }, "local");
      expect(listener).not.toHaveBeenCalled();
    });

    it("ignores changes for a different key", () => {
      const listener = vi.fn();
      let capturedHandler: StorageChangeListener | undefined;
      mockChrome.storage.onChanged.addListener.mockImplementation(
        (handler: StorageChangeListener) => {
          capturedHandler = handler;
        },
      );

      storage.subscribe("settings.theme", listener);
      capturedHandler!({ "other.key": { newValue: true } }, "sync");
      expect(listener).not.toHaveBeenCalled();
    });

    it("calls removeListener when the unsubscribe function is called", () => {
      let capturedHandler: StorageChangeListener | undefined;
      mockChrome.storage.onChanged.addListener.mockImplementation(
        (handler: StorageChangeListener) => {
          capturedHandler = handler;
        },
      );

      const unsubscribe = storage.subscribe("settings.theme", vi.fn());
      unsubscribe();
      expect(mockChrome.storage.onChanged.removeListener).toHaveBeenCalledWith(capturedHandler);
    });
  });
});
