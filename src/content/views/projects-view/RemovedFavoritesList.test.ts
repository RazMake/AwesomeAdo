import { afterEach, describe, expect, it, vi } from "vitest";

import type { FavoritesRestoreOutcome, RemovedFavorite } from "../../../common/browser/Favorites";

import {
  renderRemovedFavoritesList,
  type RemovedFavoritesListOptions,
} from "./RemovedFavoritesList";

const REMOVED: readonly RemovedFavorite[] = [
  { id: "one", title: "One", url: "https://example.test/one" },
  { id: "two", title: "Two", url: "https://example.test/two" },
];

function setup(overrides: Partial<RemovedFavoritesListOptions> = {}): {
  panel: HTMLElement;
  restore: ReturnType<typeof vi.fn>;
  logger: { info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  close: ReturnType<typeof vi.fn>;
} {
  const restore = vi.fn(async (): Promise<FavoritesRestoreOutcome> => ({
    restored: [],
    failed: [],
  }));
  const logger = { info: vi.fn(), error: vi.fn() };
  const close = vi.fn();
  const panel = renderRemovedFavoritesList(document, {
    summary: 'Synced 2 project Favorite(s) and the catalog link to "Work/Projects".',
    removed: REMOVED,
    restore,
    logger,
    close,
    ...overrides,
  });
  document.body.append(panel);
  return { panel, restore, logger, close };
}

function checkbox(panel: HTMLElement, label: string): HTMLInputElement {
  const row = [...panel.querySelectorAll("label")].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  expect(row).toBeDefined();
  return row!.querySelector("input")!;
}

function button(panel: HTMLElement, label: string): HTMLButtonElement {
  const target = [...panel.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  expect(target).toBeDefined();
  return target!;
}

function select(panel: HTMLElement, label: string): void {
  const input = checkbox(panel, label);
  input.click();
}

afterEach(() => document.body.replaceChildren());

describe("removed Favorites list selection", () => {
  it("shows the no-removals variant and closes it", () => {
    const { panel, close } = setup({ removed: [] });

    expect(panel.textContent).toContain("No other favorites were removed.");
    expect(panel.querySelector("input")).toBeNull();
    button(panel, "Close").click();
    expect(close).toHaveBeenCalledOnce();
  });

  it("uses a favorite name or URL fallback with the URL as its tooltip", () => {
    const { panel } = setup({
      removed: [REMOVED[0]!, { id: "blank", title: "  ", url: "https://example.test/fallback" }],
    });

    expect(checkbox(panel, "One").parentElement?.getAttribute("title")).toBe(REMOVED[0]!.url);
    expect(checkbox(panel, "fallback").parentElement?.getAttribute("title")).toBe(
      "https://example.test/fallback",
    );
  });

  it("enables Restore selected only after a selection", () => {
    const { panel } = setup();

    expect(button(panel, "Restore selected").disabled).toBe(true);
    select(panel, "One");
    expect(button(panel, "Restore selected").disabled).toBe(false);
  });

  it("keeps the selected row focused while updating selection controls in place", () => {
    const { panel } = setup();
    const row = checkbox(panel, "One");
    const restore = button(panel, "Restore selected");
    const selectAll = checkbox(panel, "Select all");

    row.focus();
    row.click();

    expect(checkbox(panel, "One")).toBe(row);
    expect(document.activeElement).toBe(row);
    expect(button(panel, "Restore selected")).toBe(restore);
    expect(restore.disabled).toBe(false);
    expect(checkbox(panel, "Select all")).toBe(selectAll);
    expect(selectAll.indeterminate).toBe(true);
  });

  it("selects every row and shows partial selection on Select all", () => {
    const { panel } = setup();
    const all = checkbox(panel, "Select all");

    all.click();
    expect(checkbox(panel, "One").checked).toBe(true);
    expect(checkbox(panel, "Two").checked).toBe(true);
    select(panel, "One");
    expect(checkbox(panel, "Select all").indeterminate).toBe(true);
  });
});

describe("removed Favorites list outcomes", () => {
  it("restores selected IDs in row order and removes restored rows", async () => {
    const restore = vi.fn(async (): Promise<FavoritesRestoreOutcome> => ({
      restored: ["one"],
      failed: [],
    }));
    const { panel } = setup({ restore });
    select(panel, "Two");
    select(panel, "One");
    button(panel, "Restore selected").click();

    await vi.waitFor(() => expect(restore).toHaveBeenCalledWith(["one", "two"]));
    expect(panel.textContent).toContain("Restored 1 favorite(s).");
    expect(panel.textContent).not.toContain("One");
    expect(panel.textContent).toContain("Two");
  });

  it("keeps failed rows selected with failure details", async () => {
    const restore = vi.fn(async (): Promise<FavoritesRestoreOutcome> => ({
      restored: ["one"],
      failed: [{ id: "two", error: "Browser denied it" }],
    }));
    const { panel } = setup({ restore });
    select(panel, "One");
    select(panel, "Two");
    button(panel, "Restore selected").click();

    await vi.waitFor(() => expect(panel.textContent).toContain("Could not restore 1 favorite(s)."));
    expect(panel.textContent).toContain("Restored 1 favorite(s).");
    expect(checkbox(panel, "Two").checked).toBe(true);
    expect(checkbox(panel, "Two").parentElement?.getAttribute("title")).toBe(
      "https://example.test/two — Browser denied it",
    );
  });

  it("retains an earlier failure when that favorite is not retried", async () => {
    const restore = vi
      .fn<() => Promise<FavoritesRestoreOutcome>>()
      .mockResolvedValueOnce({ restored: [], failed: [{ id: "two", error: "First failure" }] })
      .mockResolvedValueOnce({ restored: ["one"], failed: [] });
    const { panel } = setup({ restore });
    select(panel, "One");
    select(panel, "Two");
    button(panel, "Restore selected").click();
    await vi.waitFor(() =>
      expect(checkbox(panel, "Two").parentElement?.getAttribute("title")).toContain(
        "First failure",
      ),
    );
    select(panel, "Two");
    button(panel, "Restore selected").click();

    await vi.waitFor(() => expect(panel.textContent).toContain("Restored 1 favorite(s)."));
    expect(checkbox(panel, "Two").parentElement?.getAttribute("title")).toBe(
      "https://example.test/two — First failure",
    );
  });

  it("shows the all-restored state without a restore action", async () => {
    const { panel } = setup({
      restore: vi.fn(async (): Promise<FavoritesRestoreOutcome> => ({
        restored: ["one", "two"],
        failed: [],
      })),
    });
    checkbox(panel, "Select all").click();
    button(panel, "Restore selected").click();

    await vi.waitFor(() =>
      expect(panel.textContent).toContain("All removed favorites were restored."),
    );
    expect([...panel.querySelectorAll("button")].map((candidate) => candidate.textContent)).toEqual(
      ["Close"],
    );
  });
});

describe("removed Favorites list recovery", () => {
  it("reports and logs a rejected restore while re-enabling controls", async () => {
    const failure = new Error("The record is gone");
    const restore = vi.fn(async (): Promise<FavoritesRestoreOutcome> => Promise.reject(failure));
    const { panel, logger } = setup({ restore });
    select(panel, "One");
    button(panel, "Restore selected").click();

    await vi.waitFor(() =>
      expect(panel.querySelector('[role="alert"]')?.textContent).toContain("The record is gone"),
    );
    expect(logger.error).toHaveBeenCalledWith("Could not restore removed Favorites", failure);
    expect(checkbox(panel, "One").disabled).toBe(false);
    expect(button(panel, "Restore selected").disabled).toBe(false);
  });

  it("disables controls while the restore request is pending", async () => {
    let complete: ((outcome: FavoritesRestoreOutcome) => void) | undefined;
    const restore = vi.fn(
      () =>
        new Promise<FavoritesRestoreOutcome>((resolve) => {
          complete = resolve;
        }),
    );
    const { panel } = setup({ restore });
    select(panel, "One");
    button(panel, "Restore selected").click();

    expect(button(panel, "Restoring...").disabled).toBe(true);
    expect(checkbox(panel, "One").disabled).toBe(true);
    complete!({ restored: [], failed: [] });
    await vi.waitFor(() => expect(button(panel, "Restore selected").disabled).toBe(false));
  });

  it("moves focus to Restore selected or Close after a restore settles", async () => {
    const partial = setup({
      restore: vi.fn(async (): Promise<FavoritesRestoreOutcome> => ({
        restored: ["one"],
        failed: [{ id: "two", error: "Try again" }],
      })),
    });
    checkbox(partial.panel, "Select all").click();
    button(partial.panel, "Restore selected").click();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(button(partial.panel, "Restore selected")),
    );

    document.body.replaceChildren();
    const complete = setup({
      restore: vi.fn(async (): Promise<FavoritesRestoreOutcome> => ({
        restored: ["one", "two"],
        failed: [],
      })),
    });
    checkbox(complete.panel, "Select all").click();
    button(complete.panel, "Restore selected").click();
    await vi.waitFor(() => expect(document.activeElement).toBe(button(complete.panel, "Close")));
  });

  it("moves focus to Close when remaining favorites are not selected", async () => {
    const { panel } = setup({
      restore: vi.fn(async (): Promise<FavoritesRestoreOutcome> => ({
        restored: ["one"],
        failed: [],
      })),
    });
    select(panel, "One");
    button(panel, "Restore selected").click();

    await vi.waitFor(() => expect(document.activeElement).toBe(button(panel, "Close")));
  });

  it("uses the shared error variable for failure markers", async () => {
    const { panel } = setup({
      restore: vi.fn(async (): Promise<FavoritesRestoreOutcome> => ({
        restored: [],
        failed: [{ id: "one", error: "Denied" }],
      })),
    });
    select(panel, "One");
    button(panel, "Restore selected").click();

    await vi.waitFor(() => expect(panel.textContent).toContain("Could not restore"));
    const marker = [...panel.querySelectorAll("span")].find(
      (candidate) => candidate.textContent === "Could not restore",
    );
    expect(marker?.style.color).toBe("var(--error)");
  });
});
