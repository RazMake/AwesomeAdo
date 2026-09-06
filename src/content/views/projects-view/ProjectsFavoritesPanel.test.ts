import { afterEach, describe, expect, it, vi } from "vitest";

import type { CatalogFavorites } from "../../../common/browser/Favorites";

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
    readPath: vi.fn(async () => "Work/Projects"),
    sync: vi.fn<CatalogFavorites["sync"]>(async () => {}),
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

afterEach(() => document.body.replaceChildren());

describe("catalog Favorites confirmations", () => {
  it("warns about missing queries and Continue writes named projects followed by the filtered catalog", async () => {
    const { panel, favorites, options } = setup();
    await vi.waitFor(() => expect(panel.textContent).toContain("Reporting"));
    expect(favorites.sync).not.toHaveBeenCalled();
    click(panel, "Continue");
    await vi.waitFor(() => expect(panel.textContent).toContain("Synced 1 project"));
    expect(favorites.sync).toHaveBeenCalledWith("catalog", "Work/Projects", [
      { title: "Payments", url: PROJECTS[0]!.url },
      options.catalog,
    ]);
  });

  it("Cancel leaves Favorites unchanged", async () => {
    const { panel, favorites, close } = setup();
    await vi.waitFor(() => expect(panel.textContent).toContain("Reporting"));
    click(panel, "Cancel");
    expect(close).toHaveBeenCalledOnce();
    expect(favorites.sync).not.toHaveBeenCalled();
  });

  it("offers Set/Cancel for a missing path and Set opens this catalog's binding", async () => {
    const { panel, favorites, close } = setup();
    favorites.readPath.mockResolvedValue("");
    panel.remove();
    const missing = setup({ favorites });
    await vi.waitFor(() => expect(missing.panel.textContent).toContain("No Favorites path"));
    click(missing.panel, "Cancel");
    expect(missing.close).toHaveBeenCalledOnce();
    click(missing.panel, "Set");
    expect(favorites.openSettings).toHaveBeenCalledWith("catalog");
    expect(favorites.sync).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });
});

describe("catalog Favorites completion and failure", () => {
  it("deduplicates project IDs and syncs without a warning when every project has a query", async () => {
    const { favorites } = setup({ projects: [PROJECTS[0]!, PROJECTS[0]!] });
    await vi.waitFor(() => expect(favorites.sync).toHaveBeenCalledOnce());
    expect(favorites.sync.mock.calls[0]?.[2]).toHaveLength(2);
  });

  it("still includes the catalog when no projects are visible", async () => {
    const { favorites, options } = setup({ projects: [] });
    await vi.waitFor(() =>
      expect(favorites.sync).toHaveBeenCalledWith("catalog", "Work/Projects", [options.catalog]),
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
    await vi.waitFor(() => expect(panel.textContent).toContain("Permission denied"));
    expect(logger.error).toHaveBeenCalled();
  });

  it("does not sync after the panel is dismissed while the path loads", async () => {
    const { panel, favorites } = setup({ projects: [] });
    panel.remove();
    await Promise.resolve();
    expect(favorites.sync).not.toHaveBeenCalled();
  });
});
