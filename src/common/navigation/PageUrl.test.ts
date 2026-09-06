import { afterEach, describe, expect, it } from "vitest";

import { replacePageSearch } from "./PageUrl";

afterEach(() => {
  window.history.replaceState({}, "", "/");
});

describe("replacePageSearch", () => {
  it("writes the rewritten query string, keeping the path and the fragment", () => {
    window.history.replaceState({}, "", "/org/project/_queries/query/abc?_a=query#section");

    replacePageSearch(document, (search) => `${search}&tags=platform`);

    expect(window.location.pathname).toBe("/org/project/_queries/query/abc");
    expect(window.location.search).toBe("?_a=query&tags=platform");
    expect(window.location.hash).toBe("#section");
  });

  it("replaces the history entry rather than pushing one, so Back never walks through filters", () => {
    const before = window.history.length;
    window.history.replaceState({ marker: 1 }, "", "/board");

    replacePageSearch(document, () => "?tags=api");

    expect(window.history.length).toBe(before);
    expect(window.history.state).toEqual({ marker: 1 });
  });

  it("writes nothing when the rewrite leaves the query string alone", () => {
    window.history.replaceState({}, "", "/board?_a=query");
    const state = window.history.state;

    replacePageSearch(document, (search) => search);

    expect(window.location.search).toBe("?_a=query");
    expect(window.history.state).toBe(state);
  });

  it("does nothing for a document with no window to navigate", () => {
    const detached = document.implementation.createHTMLDocument("detached");

    expect(() => replacePageSearch(detached, () => "?tags=api")).not.toThrow();
  });
});
