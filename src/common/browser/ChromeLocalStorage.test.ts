import { beforeEach, describe, expect, it, vi } from "vitest";

import { ChromeLocalStorage } from "./ChromeLocalStorage";

type MockStorageChange = { newValue?: unknown };
type StorageChangeListener = (changes: Record<string, MockStorageChange>, areaName: string) => void;

interface MockChrome {
  storage: {
    local: {
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
      local: {
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

describe("ChromeLocalStorage", () => {
  let mockChrome: MockChrome;
  let storage: ChromeLocalStorage;

  beforeEach(() => {
    mockChrome = makeMockChrome();
    globalThis.chrome = mockChrome as unknown as typeof chrome;
    storage = new ChromeLocalStorage();
  });

  describe("get", () => {
    it("returns the value for the requested key", async () => {
      mockChrome.storage.local.get.mockResolvedValue({ "diagnostics.log": [] });

      const result = await storage.get("diagnostics.log");

      expect(result).toEqual([]);
      expect(mockChrome.storage.local.get).toHaveBeenCalledWith("diagnostics.log");
    });

    it("returns undefined when the key is absent from storage", async () => {
      mockChrome.storage.local.get.mockResolvedValue({});

      expect(await storage.get("diagnostics.log")).toBeUndefined();
    });
  });

  describe("set", () => {
    it("writes the key/value pair to local storage", async () => {
      mockChrome.storage.local.set.mockResolvedValue(undefined);

      await storage.set("diagnostics.log", [1]);

      expect(mockChrome.storage.local.set).toHaveBeenCalledWith({ "diagnostics.log": [1] });
    });
  });

  describe("subscribe", () => {
    it("forwards the newValue only for the matching key in the local area", () => {
      const listener = vi.fn();
      let capturedHandler: StorageChangeListener | undefined;
      mockChrome.storage.onChanged.addListener.mockImplementation(
        (handler: StorageChangeListener) => {
          capturedHandler = handler;
        },
      );

      storage.subscribe("diagnostics.log", listener);
      capturedHandler!({ "diagnostics.log": { newValue: [2] } }, "local");

      expect(listener).toHaveBeenCalledWith([2]);
    });

    it("ignores changes from the sync area", () => {
      const listener = vi.fn();
      let capturedHandler: StorageChangeListener | undefined;
      mockChrome.storage.onChanged.addListener.mockImplementation(
        (handler: StorageChangeListener) => {
          capturedHandler = handler;
        },
      );

      storage.subscribe("diagnostics.log", listener);
      capturedHandler!({ "diagnostics.log": { newValue: [2] } }, "sync");

      expect(listener).not.toHaveBeenCalled();
    });

    it("calls removeListener when unsubscribed", () => {
      let capturedHandler: StorageChangeListener | undefined;
      mockChrome.storage.onChanged.addListener.mockImplementation(
        (handler: StorageChangeListener) => {
          capturedHandler = handler;
        },
      );

      const unsubscribe = storage.subscribe("diagnostics.log", vi.fn());
      unsubscribe();

      expect(mockChrome.storage.onChanged.removeListener).toHaveBeenCalledWith(capturedHandler);
    });
  });
});
