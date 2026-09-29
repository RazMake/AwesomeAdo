import { afterEach, describe, expect, it, vi } from "vitest";

import type { CatalogFavorites, CatalogFavoritesStatus } from "../../../common/browser/Favorites";

import {
  renderProjectsFavoritesPanel,
  type ProjectsFavoritesOptions,
} from "./ProjectsFavoritesPanel";

const PROJECTS = [
  { id: 1, title: "Payments", url: "https://dev.azure.com/org/other/_queries/query/payment" },
  { id: 2, title: "Reporting", url: null },
];

function setup(overrides: Partial<ProjectsFavoritesOptions> = {}) {
  const favorites = {
    status: vi.fn(async (): Promise<CatalogFavoritesStatus> => ({
      path: "Work/Projects",
      refusal: null,
      existing: [],
    })),
    sync: vi.fn<CatalogFavorites["sync"]>(async () => ({ syncId: "sync", removed: [] })),
    restore: vi.fn<CatalogFavorites["restore"]>(async () => ({ restored: [], failed: [] })),
    openSettings: vi.fn(),
  };
  const logger = { info: vi.fn(), error: vi.fn() };
  const close = vi.fn();
  const options = {
    queryId: "catalog",
    projects: PROJECTS,
    queriesKnown: true,
    catalog: {
      title: "All Projects Catalog View",
      url: "https://dev.azure.com/org/project/_queries/query/catalog?tags=api&notTags=docs&tagMatch=all",
    },
    favorites,
    logger,
    close,
    onStatus: vi.fn(),
    ...overrides,
  };
  const panel = renderProjectsFavoritesPanel(document, options);
  document.body.append(panel);
  return { panel, favorites, logger, close, options };
}

function click(panel: HTMLElement, label: string): void {
  const button = [...panel.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  expect(button).toBeDefined();
  button!.click();
}

async function confirm(panel: HTMLElement): Promise<void> {
  await vi.waitFor(() => expect(panel.textContent).toContain("Sync replaces"));
  click(panel, "Sync");
}

afterEach(() => document.body.replaceChildren());

describe("catalog Favorites confirmations", () => {
  it("warns about missing queries and Sync writes named projects followed by the filtered catalog", async () => {
    const { panel, favorites, logger, options } = setup();
    await vi.waitFor(() => expect(panel.textContent).toContain("Reporting"));
    expect(favorites.sync).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Favorites sync for query catalog: 2 filtered project(s), 1 without queries.",
    );
    click(panel, "Sync");
    await vi.waitFor(() => expect(panel.textContent).toContain("Synced 1 project"));
    expect(favorites.sync).toHaveBeenCalledWith(
      "catalog",
      "Work/Projects",
      [{ title: "Payments", url: PROJECTS[0]!.url }, options.catalog],
      [],
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Favorites sync for query catalog: confirmed; 0 favorite(s) offered for deletion, 0 kept, 1 project(s) omitted.",
    );
  });

  it("Cancel leaves Favorites unchanged", async () => {
    const { panel, favorites, close } = setup();
    await vi.waitFor(() => expect(panel.textContent).toContain("Reporting"));
    click(panel, "Cancel");
    expect(close).toHaveBeenCalledOnce();
    expect(favorites.sync).not.toHaveBeenCalled();
  });

  it("shows a refusal with Open Options without attempting a sync", async () => {
    const { panel, favorites, close, options } = setup();
    favorites.status.mockResolvedValueOnce({
      path: "",
      refusal: "Set a Favorites folder first.",
      existing: [],
    });

    panel.remove();
    const refused = setup({ favorites, close, onStatus: options.onStatus });
    await vi.waitFor(() => expect(refused.panel.textContent).toContain("Set a Favorites folder"));
    click(refused.panel, "Open Options");
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(favorites.openSettings).toHaveBeenCalledWith("catalog");
    expect(favorites.sync).not.toHaveBeenCalled();
    expect(options.onStatus).toHaveBeenCalledWith({
      path: "",
      refusal: "Set a Favorites folder first.",
      existing: [],
    });
    expect(refused.logger.info).toHaveBeenCalledWith(
      "Favorites sync for query catalog: refused — Set a Favorites folder first.",
    );
    expect(refused.logger.info).toHaveBeenCalledTimes(2);
    expect(refused.logger.info).toHaveBeenCalledWith(
      "Favorites sync for query catalog: opening binding settings.",
    );
  });
});

describe("catalog Favorites completion and failure", () => {
  it("deduplicates project IDs and omits the missing-query warning when every project has a query", async () => {
    const { panel, favorites } = setup({ projects: [PROJECTS[0]!, PROJECTS[0]!] });
    await confirm(panel);
    expect(panel.textContent).not.toContain("no query");
    await vi.waitFor(() => expect(favorites.sync).toHaveBeenCalledOnce());
    expect(favorites.sync.mock.calls[0]?.[2]).toHaveLength(2);
  });

  it("still includes the catalog when no projects are visible", async () => {
    const { panel, favorites, options } = setup({ projects: [] });
    await confirm(panel);
    await vi.waitFor(() =>
      expect(favorites.sync).toHaveBeenCalledWith(
        "catalog",
        "Work/Projects",
        [options.catalog],
        [],
      ),
    );
  });

  it("does not treat a failed query-link read as projects having no queries", async () => {
    const { panel, favorites, logger } = setup({ queriesKnown: false });
    await vi.waitFor(() => expect(panel.textContent).toContain("Refresh the catalog"));
    expect(favorites.sync).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it("reports a failed sync instead of claiming success", async () => {
    const { panel, favorites, logger } = setup({ projects: [] });
    favorites.sync.mockRejectedValueOnce(new Error("Permission denied"));
    await confirm(panel);
    await vi.waitFor(() => expect(panel.textContent).toContain("Permission denied"));
    expect(logger.error).toHaveBeenCalled();
  });

  it("does not sync after the panel is dismissed while the path loads", async () => {
    const { panel, favorites } = setup({ projects: [] });
    panel.remove();
    await Promise.resolve();
    expect(favorites.sync).not.toHaveBeenCalled();
  });

  it("reports a failed status check without syncing", async () => {
    const { panel, favorites, logger } = setup();
    favorites.status.mockRejectedValueOnce(new Error("No worker"));
    panel.remove();
    const failed = setup({ favorites, logger });

    await vi.waitFor(() => expect(failed.panel.textContent).toContain("No worker"));
    expect(favorites.sync).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      "Could not sync projects to Favorites",
      expect.any(Error),
    );
  });
});

describe("catalog Favorites confirmation scope and restore", () => {
  it("uses the safe status path and spells the replacement scope in the confirmation", async () => {
    const { panel, favorites } = setup();

    await vi.waitFor(() =>
      expect(panel.textContent).toContain('Subfolders of "Work/Projects" are not touched.'),
    );
    expect(panel.textContent).toContain('Sync replaces the favorites in "Work/Projects"');
    click(panel, "Sync");
    await vi.waitFor(() => expect(panel.textContent).toContain("Synced 1 project Favorite(s)"));
    expect(favorites.sync).toHaveBeenCalledWith("catalog", "Work/Projects", expect.any(Array), []);
  });

  it("renders removed favorites and restores the selected IDs through the sync record", async () => {
    const { panel, favorites } = setup({ projects: [] });
    favorites.sync.mockResolvedValueOnce({
      syncId: "record",
      removed: [
        { id: "one", title: "Previous query", url: "https://example.test/previous" },
        { id: "two", title: "Other query", url: "https://example.test/other" },
      ],
    });

    await confirm(panel);
    await vi.waitFor(() => expect(panel.textContent).toContain("Removed 2 favorite(s)"));
    const input = [...panel.querySelectorAll("label")]
      .find((label) => label.textContent?.includes("Previous query"))
      ?.querySelector("input");
    expect(input).toBeDefined();
    input!.click();
    click(panel, "Restore selected");

    await vi.waitFor(() =>
      expect(favorites.restore).toHaveBeenCalledWith("catalog", "record", ["one"]),
    );
  });
});

describe("catalog Favorites keep choices", () => {
  const url = (name: string) => `https://dev.azure.com/org/p/_queries/query/${name}`;
  const existing = ["A", "B", "C", "D"].map((name) => ({ id: name, title: name, url: url(name) }));
  const projects = ["C", "D", "E"].map((name, index) => ({
    id: index,
    title: name,
    url: url(name),
  }));

  function keepLabels(panel: HTMLElement): string[] {
    return [...panel.querySelectorAll(".awesomeado-favorites-keep label")].map(
      (label) => label.textContent ?? "",
    );
  }

  it("lists only existing favorites the sync would delete and sends the ids chosen to keep", async () => {
    const { panel, favorites, options } = setup({ projects });
    favorites.status.mockResolvedValueOnce({ path: "Work/Projects", refusal: null, existing });
    panel.remove();
    const shown = setup({ projects, favorites, onStatus: options.onStatus });

    await vi.waitFor(() => expect(keepLabels(shown.panel)).toEqual(["A", "B"]));
    expect(shown.panel.textContent).toContain("2 existing favorite(s) will be deleted");
    shown.panel.querySelector<HTMLInputElement>('[data-favorite-id="B"]')!.click();
    click(shown.panel, "Sync");

    await vi.waitFor(() => expect(favorites.sync).toHaveBeenCalledOnce());
    expect(favorites.sync.mock.calls[0]?.[3]).toEqual(["B"]);
  });

  it("Cancel with a keep list makes no change", async () => {
    const { panel, favorites, options } = setup({ projects });
    favorites.status.mockResolvedValueOnce({ path: "Work/Projects", refusal: null, existing });
    panel.remove();
    const shown = setup({ projects, favorites, onStatus: options.onStatus });

    await vi.waitFor(() => expect(keepLabels(shown.panel)).toHaveLength(2));
    click(shown.panel, "Cancel");
    expect(favorites.sync).not.toHaveBeenCalled();
  });

  it("omits the keep list when nothing would be deleted", async () => {
    const { panel } = setup({ projects });
    await vi.waitFor(() => expect(panel.textContent).toContain("Sync replaces"));
    expect(panel.querySelector(".awesomeado-favorites-keep")).toBeNull();
  });
});
