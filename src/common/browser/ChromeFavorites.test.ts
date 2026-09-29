import { afterEach, describe, expect, it, vi } from "vitest";

import { ChromeFavorites } from "./ChromeFavorites";
import { FAVORITES_REFUSALS } from "./Favorites";

interface BookmarkNode extends Pick<
  chrome.bookmarks.BookmarkTreeNode,
  "id" | "title" | "url" | "unmodifiable"
> {
  children?: BookmarkNode[];
  folderType?: chrome.bookmarks.BookmarkTreeNode["folderType"];
}

function findNode(node: BookmarkNode, id: string): BookmarkNode | undefined {
  if (node.id === id) return node;
  return node.children?.map((child) => findNode(child, id)).find(Boolean);
}

function removeNode(node: BookmarkNode, id: string): boolean {
  const index = node.children?.findIndex((child) => child.id === id) ?? -1;
  if (index >= 0) {
    node.children?.splice(index, 1);
    return true;
  }
  return node.children?.some((child) => removeNode(child, id)) ?? false;
}

function harness(children: BookmarkNode[] = []) {
  const bar: BookmarkNode = { id: "1", title: "Localized bar", children };
  let nextId = 100;
  const bookmarks = {
    getTree: vi.fn(async () => structuredClone([{ id: "0", title: "", children: [bar] }])),
    get: vi.fn(async (id: string) => {
      const node = findNode(bar, id);
      if (!node) throw new Error("Bookmark missing");
      return [structuredClone(node)];
    }),
    create: vi.fn(async (details: chrome.bookmarks.CreateDetails) => {
      const parent = findNode(bar, details.parentId ?? "1");
      if (!parent) throw new Error("Parent missing");
      const node: BookmarkNode = {
        id: String(nextId++),
        title: details.title ?? "",
        url: details.url,
      };
      (parent.children ??= []).push(node);
      return structuredClone(node);
    }),
    remove: vi.fn(async (id: string) => {
      const node = findNode(bar, id);
      if (!node) throw new Error("Bookmark missing");
      if (node.url === undefined && (node.children?.length ?? 0) > 0) {
        throw new Error("Cannot remove a non-empty folder");
      }
      removeNode(bar, id);
    }),
    removeTree: vi.fn(),
  };
  vi.stubGlobal("chrome", { bookmarks });
  const logger = { info: vi.fn(), error: vi.fn() };
  return { bar, bookmarks, logger, favorites: new ChromeFavorites(logger) };
}

function workFolder(
  children: BookmarkNode[] = [],
  unmodifiable?: chrome.bookmarks.BookmarkTreeNode["unmodifiable"],
): BookmarkNode {
  return { id: "2", title: "Work", children, unmodifiable };
}

const LINKS = [
  { title: "Project", url: "https://dev.azure.com/org/project/_queries/query/id" },
  { title: "Catalog", url: "https://dev.azure.com/org/project/_queries/query/catalog?tags=api" },
];

afterEach(() => vi.unstubAllGlobals());

describe("browser Favorites", () => {
  it("suggests only writable folder paths beneath the localized favorites bar", async () => {
    const { favorites } = harness([
      workFolder([
        { id: "3", title: "Projects" },
        { id: "4", title: "Website", url: "https://example.com" },
        { id: "5", title: "Managed", unmodifiable: "managed" },
        { id: "6", title: "a/b" },
      ]),
    ]);
    expect(await favorites.folderPaths()).toEqual(["Work", "Work/Projects"]);
  });

  it("keeps managed and non-empty subfolders while replacing only direct links", async () => {
    const nested = { id: "4", title: "Nested", children: [{ id: "5", title: "Kept", url: "x:" }] };
    const managed = { id: "6", title: "Managed", unmodifiable: "managed", children: [] };
    const { favorites, bar, bookmarks } = harness([
      workFolder([{ id: "3", title: "Old", url: "https://example.com" }, nested, managed]),
    ]);
    await favorites.replace("Work", LINKS);
    expect(bar.children?.[0]?.children?.map((node) => node.id)).toEqual(["4", "6", "100", "101"]);
    expect(bookmarks.remove).toHaveBeenCalledWith("3");
    expect(bookmarks.removeTree).not.toHaveBeenCalled();
  });

  it("appends new links in supplied order after kept subfolders", async () => {
    const { favorites, bar } = harness([workFolder([{ id: "3", title: "Nested", children: [] }])]);
    await favorites.replace("Work", LINKS);
    expect(bar.children?.[0]?.children?.map(({ title, url }) => ({ title, url }))).toEqual([
      { title: "Nested", url: undefined },
      ...LINKS,
    ]);
  });

  it("creates every replacement before removing an old link", async () => {
    const { favorites, bookmarks } = harness([
      workFolder([{ id: "3", title: "Old", url: "https://example.com" }]),
    ]);
    await favorites.replace("Work", LINKS);
    expect(bookmarks.create.mock.invocationCallOrder.at(-1)).toBeLessThan(
      bookmarks.remove.mock.invocationCallOrder[0]!,
    );
  });

  it("reports only removed links not re-created one-for-one", async () => {
    const identical = { id: "3", title: "Project", url: LINKS[0]!.url };
    const duplicate = { id: "4", title: "Project", url: LINKS[0]!.url };
    const renamed = { id: "5", title: "Renamed", url: LINKS[0]!.url };
    const other = { id: "6", title: "Other", url: "https://example.com" };
    const { favorites } = harness([workFolder([identical, duplicate, renamed, other])]);
    const result = await favorites.replace("Work", [...LINKS, LINKS[0]!]);
    expect(result.removed).toEqual([
      { id: "5", title: "Renamed", url: LINKS[0]?.url },
      { id: "6", title: "Other", url: "https://example.com" },
    ]);
  });

  it("keeps a failed removal, logs it, and excludes it from the removal report", async () => {
    const { favorites, bookmarks, logger, bar } = harness([
      workFolder([
        { id: "3", title: "Old", url: "https://example.com" },
        { id: "4", title: "Other", url: "https://other.example" },
      ]),
    ]);
    bookmarks.remove.mockRejectedValueOnce(new Error("Removal refused"));
    const result = await favorites.replace("Work", LINKS);
    expect(result.removed).toEqual([{ id: "4", title: "Other", url: "https://other.example" }]);
    expect(bar.children?.[0]?.children?.some((node) => node.id === "3")).toBe(true);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("id=3"), expect.any(Error));
  });
});

describe("existing Favorites and user-kept links", () => {
  it("lists only direct links and nothing for a folder that does not exist yet", async () => {
    const { favorites } = harness([
      workFolder([
        { id: "3", title: "Old", url: "https://example.com" },
        { id: "4", title: "Nested", children: [] },
      ]),
    ]);
    expect(await favorites.existing("Work")).toEqual([
      { id: "3", title: "Old", url: "https://example.com" },
    ]);
    expect(await favorites.existing("Missing")).toEqual([]);
  });

  it("leaves kept links in place and out of the removal report", async () => {
    const { favorites, bar, bookmarks } = harness([
      workFolder([
        { id: "3", title: "Keep", url: "https://keep.example" },
        { id: "4", title: "Drop", url: "https://drop.example" },
      ]),
    ]);
    const result = await favorites.replace("Work", LINKS, ["3"]);
    expect(result.removed).toEqual([{ id: "4", title: "Drop", url: "https://drop.example" }]);
    expect(bookmarks.remove).not.toHaveBeenCalledWith("3");
    expect(bar.children?.[0]?.children?.map((node) => node.id)).toEqual(["3", "100", "101"]);
  });
});

describe("Favorites safeguards and inspection", () => {
  it("validates malformed paths before any bookmarks API call", async () => {
    const { favorites, bookmarks } = harness();
    for (const path of ["", "/", "Work//Projects", ".", ".."]) {
      await expect(favorites.replace(path, LINKS)).rejects.toThrow(FAVORITES_REFUSALS.invalidPath);
    }
    await expect(
      favorites.replace("Work", [{ title: "Bad", url: "javascript:alert(1)" }]),
    ).rejects.toThrow("HTTP");
    expect(bookmarks.getTree).not.toHaveBeenCalled();
  });

  it("refuses duplicate folders, managed folders, and managed direct links", async () => {
    const duplicate = harness([workFolder(), { id: "3", title: "Work" }]);
    await expect(duplicate.favorites.replace("Work", LINKS)).rejects.toThrow(
      FAVORITES_REFUSALS.duplicateFolders,
    );
    const managedFolder = harness([workFolder([], "managed")]);
    await expect(managedFolder.favorites.replace("Work", LINKS)).rejects.toThrow(
      FAVORITES_REFUSALS.managedFolder,
    );
    const managedLink = harness([
      workFolder([
        { id: "3", title: "Managed", url: "https://example.com", unmodifiable: "managed" },
      ]),
    ]);
    await expect(managedLink.favorites.replace("Work", LINKS)).rejects.toThrow(
      FAVORITES_REFUSALS.managedEntries,
    );
  });

  it("reports a missing destination as ready and returns refusal texts without writes", async () => {
    const { favorites, bookmarks } = harness([workFolder([], "managed")]);
    expect(await favorites.inspect("Missing")).toBeNull();
    expect(await favorites.inspect("Work")).toBe(FAVORITES_REFUSALS.managedFolder);
    expect(await favorites.inspect("")).toBe(FAVORITES_REFUSALS.invalidPath);
    expect(bookmarks.create).not.toHaveBeenCalled();
  });

  it("finds managed direct links and duplicate folders while ignoring managed subfolders", async () => {
    const managedLink = harness([
      workFolder([
        { id: "3", title: "Managed", url: "https://example.com", unmodifiable: "managed" },
      ]),
    ]);
    expect(await managedLink.favorites.inspect("Work")).toBe(FAVORITES_REFUSALS.managedEntries);
    const managedSubfolder = harness([
      workFolder([{ id: "3", title: "Managed", unmodifiable: "managed", children: [] }]),
    ]);
    expect(await managedSubfolder.favorites.inspect("Work")).toBeNull();
    const duplicate = harness([workFolder(), { id: "3", title: "Work" }]);
    expect(await duplicate.favorites.inspect("Work")).toBe(FAVORITES_REFUSALS.duplicateFolders);
  });

  it("returns no-access and read failures from inspection", async () => {
    vi.unstubAllGlobals();
    const logger = { info: vi.fn(), error: vi.fn() };
    const unavailable = new ChromeFavorites(logger);
    expect(await unavailable.inspect("Work")).toBe(FAVORITES_REFUSALS.noAccess);
    const failing = harness();
    failing.bookmarks.getTree.mockRejectedValueOnce(new Error("Browser refused"));
    expect(await failing.favorites.inspect("Work")).toBe(
      "Could not read your Favorites: Browser refused",
    );
    expect(failing.logger.error).toHaveBeenCalled();
  });

  it("rejects all public operations without bookmarks access", async () => {
    vi.unstubAllGlobals();
    const favorites = new ChromeFavorites({ info: vi.fn(), error: vi.fn() });
    await expect(favorites.folderPaths()).rejects.toThrow(FAVORITES_REFUSALS.noAccess);
    await expect(favorites.replace("Work", LINKS)).rejects.toThrow(FAVORITES_REFUSALS.noAccess);
    await expect(favorites.restore("2", [])).rejects.toThrow(FAVORITES_REFUSALS.noAccess);
  });
});

describe("Favorites restore", () => {
  it("restores in order and reports partial failures", async () => {
    const { favorites, bookmarks, logger, bar } = harness([workFolder()]);
    bookmarks.create.mockRejectedValueOnce(new Error("Denied"));
    const result = await favorites.restore("2", [
      { id: "old-1", title: "One", url: "custom:one" },
      { id: "old-2", title: "Two", url: "custom:two" },
    ]);
    expect(result).toEqual({
      restored: ["old-2"],
      failed: [{ id: "old-1", error: "Denied" }],
    });
    expect(bar.children?.[0]?.children).toEqual([{ id: "100", title: "Two", url: "custom:two" }]);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("id=old-1"),
      expect.any(Error),
    );
  });

  it("refuses a missing, non-folder, or managed restore destination", async () => {
    const missing = harness([workFolder()]);
    missing.bookmarks.get.mockRejectedValueOnce(new Error("Gone"));
    await expect(missing.favorites.restore("2", [])).rejects.toThrow(FAVORITES_REFUSALS.folderGone);
    expect(missing.logger.error).toHaveBeenCalledWith(
      "Could not find Favorites folder for restore",
      expect.any(Error),
    );
    const empty = harness([workFolder()]);
    empty.bookmarks.get.mockResolvedValueOnce([]);
    await expect(empty.favorites.restore("2", [])).rejects.toThrow(FAVORITES_REFUSALS.folderGone);
    const link = harness([{ id: "2", title: "Link", url: "https://example.com" }]);
    await expect(link.favorites.restore("2", [])).rejects.toThrow(FAVORITES_REFUSALS.folderGone);
    const managed = harness([workFolder([], "managed")]);
    await expect(managed.favorites.restore("2", [])).rejects.toThrow(
      FAVORITES_REFUSALS.managedFolder,
    );
  });

  it("serializes restore after a replacement", async () => {
    const { favorites, bookmarks } = harness([
      workFolder([{ id: "3", title: "Old", url: "https://example.com" }]),
    ]);
    let releaseRemoval: (() => void) | undefined;
    bookmarks.remove.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseRemoval = resolve;
        }),
    );
    const replace = favorites.replace("Work", LINKS);
    const restore = favorites.restore("2", [{ id: "old", title: "Old", url: "custom:old" }]);
    await vi.waitFor(() => expect(releaseRemoval).toBeDefined());
    expect(bookmarks.get).not.toHaveBeenCalled();
    releaseRemoval?.();
    await Promise.all([replace, restore]);
    expect(bookmarks.get).toHaveBeenCalledAfter(bookmarks.remove);
  });
});
