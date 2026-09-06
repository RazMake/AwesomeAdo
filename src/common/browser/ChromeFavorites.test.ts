import { afterEach, describe, expect, it, vi } from "vitest";

import { ChromeFavorites } from "./ChromeFavorites";

interface BookmarkNode extends Pick<
  chrome.bookmarks.BookmarkTreeNode,
  "id" | "title" | "url" | "unmodifiable"
> {
  children?: BookmarkNode[];
}

function harness(children: BookmarkNode[] = []) {
  const bar: BookmarkNode = { id: "1", title: "Localized bar", children };
  let nextId = 100;
  const find = (node: BookmarkNode, id: string): BookmarkNode | undefined =>
    node.id === id ? node : node.children?.map((child) => find(child, id)).find(Boolean);
  const bookmarks = {
    getTree: vi.fn(async () => structuredClone([{ id: "0", title: "", children: [bar] }])),
    create: vi.fn(async (details: chrome.bookmarks.CreateDetails) => {
      const node: BookmarkNode = {
        id: String(nextId++),
        title: details.title ?? "",
        url: details.url,
      };
      const parent = find(bar, details.parentId ?? "1");
      if (!parent) throw new Error("Parent missing");
      (parent.children ??= []).push(node);
      return structuredClone(node);
    }),
    removeTree: vi.fn(async (id: string) => {
      const remove = (node: BookmarkNode): void => {
        node.children = node.children?.filter((child) => child.id !== id);
        node.children?.forEach(remove);
      };
      remove(bar);
    }),
  };
  vi.stubGlobal("chrome", { bookmarks });
  const logger = { info: vi.fn(), error: vi.fn() };
  return { bar, bookmarks, logger, favorites: new ChromeFavorites(logger) };
}

afterEach(() => vi.unstubAllGlobals());

const LINKS = [
  { title: "Project", url: "https://dev.azure.com/org/project/_queries/query/id" },
  { title: "Catalog", url: "https://dev.azure.com/org/project/_queries/query/catalog?tags=api" },
];

describe("browser Favorites", () => {
  it("suggests only folder paths beneath the localized favorites bar", async () => {
    const { favorites } = harness([
      {
        id: "2",
        title: "Work",
        children: [
          { id: "3", title: "Projects" },
          { id: "4", title: "Website", url: "https://example.com" },
          { id: "5", title: "Managed", unmodifiable: "managed" },
          { id: "6", title: "a/b" },
        ],
      },
    ]);
    expect(await favorites.folderPaths()).toEqual(["Work", "Work/Projects"]);
  });

  it("creates missing folders and replaces their contents in the supplied order on repeat sync", async () => {
    const { favorites, bar } = harness([
      { id: "2", title: "Unrelated", url: "https://example.com" },
    ]);
    await favorites.replace("Work/Projects", LINKS);
    await favorites.replace("Work/Projects", LINKS);
    const destination = bar.children?.[1]?.children?.[0];
    expect(destination?.children?.map(({ title, url }) => ({ title, url }))).toEqual(LINKS);
    expect(bar.children?.[0]?.id).toBe("2");
  });

  it("removes stale favorites and nested folders only after creating the replacements", async () => {
    const { favorites, bar, bookmarks } = harness([
      {
        id: "2",
        title: "Work",
        children: [
          { id: "3", title: "Old", url: "https://example.com" },
          { id: "4", title: "Nested", children: [] },
        ],
      },
    ]);
    await favorites.replace("Work", LINKS);
    expect(bar.children?.[0]?.children?.map(({ title, url }) => ({ title, url }))).toEqual(LINKS);
    expect(bookmarks.create.mock.invocationCallOrder[1]).toBeLessThan(
      bookmarks.removeTree.mock.invocationCallOrder[0]!,
    );
  });
});

describe("Favorites replacement safeguards", () => {
  it("does not remove old contents when creation fails and permits a later retry", async () => {
    const { favorites, bookmarks, logger } = harness([
      { id: "2", title: "Work", children: [{ id: "3", title: "Old" }] },
    ]);
    bookmarks.create.mockRejectedValueOnce(new Error("Write refused"));
    await expect(favorites.replace("Work", LINKS)).rejects.toThrow("Write refused");
    expect(bookmarks.removeTree).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
    await expect(favorites.replace("Work", LINKS)).resolves.toBeUndefined();
  });

  it("rejects duplicate or managed destinations without creating links", async () => {
    const { favorites, bookmarks } = harness([
      { id: "2", title: "Work" },
      { id: "3", title: "Work" },
    ]);
    await expect(favorites.replace("Work", LINKS)).rejects.toThrow("duplicate");
    expect(bookmarks.create).not.toHaveBeenCalled();
    const managed = harness([
      {
        id: "2",
        title: "Work",
        children: [{ id: "3", title: "Managed", unmodifiable: "managed" }],
      },
    ]);
    await expect(managed.favorites.replace("Work", LINKS)).rejects.toThrow("managed");
    expect(managed.bookmarks.create).not.toHaveBeenCalled();
  });

  it("validates the path and URLs before touching bookmarks", async () => {
    const { favorites, bookmarks } = harness();
    await expect(favorites.replace("", LINKS)).rejects.toThrow("beneath Favorites bar");
    await expect(
      favorites.replace("Work", [{ title: "Bad", url: "javascript:alert(1)" }]),
    ).rejects.toThrow("HTTP");
    expect(bookmarks.getTree).not.toHaveBeenCalled();
  });
});
