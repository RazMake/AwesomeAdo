import { beforeEach, describe, expect, it, vi } from "vitest";

import { onStorageAreaChange } from "./onStorageAreaChange";

type MockStorageChange = { newValue?: unknown };
type StorageChangeListener = (changes: Record<string, MockStorageChange>, areaName: string) => void;

interface MockChrome {
  storage: {
    onChanged: {
      addListener: ReturnType<typeof vi.fn>;
      removeListener: ReturnType<typeof vi.fn>;
    };
  };
}

describe("onStorageAreaChange", () => {
  let mockChrome: MockChrome;
  let capturedHandler: StorageChangeListener | undefined;

  beforeEach(() => {
    capturedHandler = undefined;
    mockChrome = {
      storage: {
        onChanged: {
          addListener: vi.fn((handler: StorageChangeListener) => {
            capturedHandler = handler;
          }),
          removeListener: vi.fn(),
        },
      },
    };
    globalThis.chrome = mockChrome as unknown as typeof chrome;
  });

  it("delivers the newValue when both the area and key match", () => {
    const listener = vi.fn();

    onStorageAreaChange("local", "diagnostics.log", listener);
    capturedHandler!({ "diagnostics.log": { newValue: 7 } }, "local");

    expect(listener).toHaveBeenCalledWith(7);
  });

  it("ignores changes from a different area", () => {
    const listener = vi.fn();

    onStorageAreaChange("local", "diagnostics.log", listener);
    capturedHandler!({ "diagnostics.log": { newValue: 7 } }, "sync");

    expect(listener).not.toHaveBeenCalled();
  });

  it("ignores changes to a different key in the same area", () => {
    const listener = vi.fn();

    onStorageAreaChange("local", "diagnostics.log", listener);
    capturedHandler!({ "other.key": { newValue: 7 } }, "local");

    expect(listener).not.toHaveBeenCalled();
  });

  it("removes the same handler it registered when unsubscribed", () => {
    const unsubscribe = onStorageAreaChange("local", "diagnostics.log", vi.fn());

    unsubscribe();

    expect(mockChrome.storage.onChanged.removeListener).toHaveBeenCalledWith(capturedHandler);
  });
});
