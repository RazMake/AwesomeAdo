import { describe, expect, it } from "vitest";

import { favoritesPathSegments } from "./Favorites";

describe("Favorites destination paths", () => {
  it("accepts nested paths relative to the favorites bar", () => {
    expect(favoritesPathSegments(" Work / Projects ")).toEqual(["Work", "Projects"]);
    expect(favoritesPathSegments("Work\\Projects")).toEqual(["Work", "Projects"]);
  });

  it.each(["", " ", "/", "/Work", "Work/", "Work//Projects", ".", "..", "Work/../Projects"])(
    "refuses unsafe destination %j",
    (path) => {
      expect(() => favoritesPathSegments(path)).toThrow("beneath Favorites bar");
    },
  );
});
