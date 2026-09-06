// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { FavoritesPathEditor } from "./FavoritesPathEditor";

let editor: FavoritesPathEditor;
async function setup() {
  const paths = { read: vi.fn(async () => "Work"), write: vi.fn(async () => {}) };
  const options = {
    paths,
    folderPaths: vi.fn(async () => ["Work", "Work/Projects"]),
    recordError: vi.fn(),
  };
  editor = new FavoritesPathEditor(document, "catalog-query", options);
  document.body.append(editor.root);
  await Promise.resolve();
  const input = editor.root.querySelector("input")!;
  return { paths, options, input };
}

afterEach(() => {
  editor.dispose();
  document.body.replaceChildren();
});

describe("personal Favorites path editor", () => {
  it("loads a query's path and autocompletes current folders on focus", async () => {
    const { paths, options, input } = await setup();
    expect(input.value).toBe("Work");
    expect(paths.read).toHaveBeenCalledWith("catalog-query");
    input.focus();
    await Promise.resolve();
    expect(options.folderPaths).toHaveBeenCalledTimes(2);
    expect(editor.root.querySelector('[role="listbox"]')?.textContent).toContain("Work/Projects");
  });

  it("saves only the personal path for the bound query", async () => {
    const { paths, input } = await setup();
    input.value = "Work/Projects";
    input.dispatchEvent(new Event("change"));
    await Promise.resolve();
    expect(paths.write).toHaveBeenCalledWith("catalog-query", "Work/Projects");
  });

  it("reports rejected writes and still permits correction", async () => {
    const { paths, options, input } = await setup();
    paths.write.mockRejectedValueOnce(new Error("Invalid path"));
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(options.recordError).toHaveBeenCalled());
    expect(editor.root.textContent).toContain("Invalid path");
    input.value = "Fixed";
    input.dispatchEvent(new Event("change"));
    await vi.waitFor(() => expect(editor.root.textContent).not.toContain("Invalid path"));
  });
});
