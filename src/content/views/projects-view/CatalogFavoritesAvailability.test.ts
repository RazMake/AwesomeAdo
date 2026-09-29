import { describe, expect, it, vi } from "vitest";

import type { CatalogFavorites, CatalogFavoritesStatus } from "../../../common/browser/Favorites";

import {
  CatalogFavoritesAvailability,
  FAVORITES_AVAILABILITY_TEXT,
} from "./CatalogFavoritesAvailability";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function setup(status = vi.fn<CatalogFavorites["status"]>()) {
  const logger = { info: vi.fn(), error: vi.fn() };
  const availability = new CatalogFavoritesAvailability(
    {
      status,
      sync: vi.fn(),
      restore: vi.fn(),
      openSettings: vi.fn(),
    },
    "catalog",
    logger,
  );
  return { availability, logger, status };
}

describe("CatalogFavoritesAvailability", () => {
  it("reports every disabled reason in priority order", () => {
    const { availability } = setup();

    expect(availability.disabledReason(false)).toBe(FAVORITES_AVAILABILITY_TEXT.checking);
    availability.update({ path: "Work", refusal: "Access is denied.", existing: [] });
    expect(availability.disabledReason(false)).toBe("Access is denied.");
    availability.update({ path: "Work", refusal: null, existing: [] });
    expect(availability.disabledReason(false)).toBe(FAVORITES_AVAILABILITY_TEXT.queriesUnknown);
    expect(availability.disabledReason(true)).toBeNull();
  });

  it("keeps the last status enabled while a later refresh is pending", async () => {
    const next = deferred<CatalogFavoritesStatus>();
    const { availability, status } = setup();
    status
      .mockResolvedValueOnce({ path: "Work", refusal: null, existing: [] })
      .mockReturnValueOnce(next.promise);

    availability.refresh();
    await vi.waitFor(() => expect(availability.disabledReason(true)).toBeNull());
    availability.refresh();

    expect(availability.disabledReason(true)).toBeNull();
    next.resolve({ path: "Work", refusal: null, existing: [] });
    await next.promise;
  });

  it("discards stale refreshes and popup updates", async () => {
    const first = deferred<CatalogFavoritesStatus>();
    const second = deferred<CatalogFavoritesStatus>();
    const { availability, status } = setup();
    status.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    availability.refresh();
    availability.refresh();
    second.resolve({ path: "Work", refusal: "Second", existing: [] });
    await second.promise;
    first.resolve({ path: "Work", refusal: null, existing: [] });
    await first.promise;
    await vi.waitFor(() => expect(availability.disabledReason(true)).toBe("Second"));

    const pending = deferred<CatalogFavoritesStatus>();
    status.mockReturnValueOnce(pending.promise);
    availability.refresh();
    availability.update({ path: "Work", refusal: "Popup", existing: [] });
    pending.resolve({ path: "Work", refusal: null, existing: [] });
    await pending.promise;
    expect(availability.disabledReason(true)).toBe("Popup");
  });
});

describe("CatalogFavoritesAvailability failures and logging", () => {
  it("logs a superseded refresh failure without replacing the latest status", async () => {
    const first = deferred<CatalogFavoritesStatus>();
    const second = deferred<CatalogFavoritesStatus>();
    const firstError = new Error("first request failed");
    const { availability, logger, status } = setup();
    status.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    availability.refresh();
    availability.refresh();
    second.resolve({ path: "Work", refusal: "Second result", existing: [] });
    await second.promise;
    first.reject(firstError);
    await vi.waitFor(() =>
      expect(logger.error).toHaveBeenCalledWith("Could not check the Favorites setup", firstError),
    );

    expect(availability.disabledReason(true)).toBe("Second result");
  });

  it("logs an original status failure and disables the command", async () => {
    const error = new Error("offline");
    const { availability, logger, status } = setup();
    status.mockRejectedValueOnce(error);

    availability.refresh();

    await vi.waitFor(() =>
      expect(availability.disabledReason(true)).toBe(FAVORITES_AVAILABILITY_TEXT.checkFailed),
    );
    expect(logger.error).toHaveBeenCalledWith("Could not check the Favorites setup", error);
  });

  it("logs availability decisions only when the effective reason changes", () => {
    const { availability, logger } = setup();

    availability.disabledReason(true);
    availability.disabledReason(true);
    availability.update({ path: "Work", refusal: null, existing: [] });
    availability.disabledReason(true);
    availability.disabledReason(true);
    availability.disabledReason(false);

    expect(logger.info).toHaveBeenCalledTimes(3);
    expect(logger.info).toHaveBeenNthCalledWith(
      1,
      `Sync projects to Favorites for query catalog: disabled — ${FAVORITES_AVAILABILITY_TEXT.checking}`,
    );
    expect(logger.info).toHaveBeenNthCalledWith(
      2,
      "Sync projects to Favorites for query catalog: enabled.",
    );
  });
});
