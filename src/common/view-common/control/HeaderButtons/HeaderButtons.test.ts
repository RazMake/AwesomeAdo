import { describe, expect, it } from "vitest";

import { refreshRequestOf } from "./HeaderButtons";

describe("refreshRequestOf", () => {
  it("reads a plain click as an ordinary re-read", () => {
    expect(refreshRequestOf(new MouseEvent("click"))).toEqual({ discardCaches: false });
  });

  it("reads a Ctrl+click as a request to discard cached data", () => {
    expect(refreshRequestOf(new MouseEvent("click", { ctrlKey: true }))).toEqual({
      discardCaches: true,
    });
  });

  it("reads a Cmd+click (macOS) as a request to discard cached data", () => {
    expect(refreshRequestOf(new MouseEvent("click", { metaKey: true }))).toEqual({
      discardCaches: true,
    });
  });
});
