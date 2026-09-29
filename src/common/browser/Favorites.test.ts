import { describe, expect, it } from "vitest";

import {
  FAVORITES_REFUSALS,
  favoritesPathSegments,
  favoritesReadFailed,
  normalizeFavoritesFolderPath,
} from "./Favorites";

describe("Favorites destination paths", () => {
  it.each([
    ["/", null],
    ["\\", null],
    ["//", null],
    [" / ", null],
    [".", null],
    ["..", null],
    ["Work//X", null],
    ["Work/", null],
    ["", null],
    ["   ", null],
    [" Work\\Projects ", "Work/Projects"],
  ])("normalizes %j to %j", (path, expected) => {
    expect(normalizeFavoritesFolderPath(path)).toBe(expected);
  });

  it("returns normalized segments for a nested path", () => {
    expect(favoritesPathSegments(" Work / Projects ")).toEqual(["Work", "Projects"]);
  });

  it("refuses unsafe destinations with the user-facing error", () => {
    expect(() => favoritesPathSegments("Work//Projects")).toThrow(FAVORITES_REFUSALS.invalidPath);
  });

  it("formats Favorites read failures", () => {
    expect(favoritesReadFailed(new Error("Bookmarks unavailable"))).toBe(
      "Could not read your Favorites: Bookmarks unavailable",
    );
    expect(favoritesReadFailed("Unavailable")).toBe("Could not read your Favorites: Unavailable");
  });
});
