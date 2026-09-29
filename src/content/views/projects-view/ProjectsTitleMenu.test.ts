import { describe, expect, it, vi } from "vitest";

import { buildProjectsTitleCommands } from "./ProjectsTitleMenu";

describe("buildProjectsTitleCommands", () => {
  it("offers adding a project, in its own group beneath the copy command", () => {
    const onAddProject = vi.fn();

    const [add] = buildProjectsTitleCommands({
      projectType: "Epic",
      adding: false,
      onAddProject,
    });

    expect(add?.label).toBe("Add new project");
    expect(add?.separatorBefore).toBe(true);
    expect(add?.disabledReason).toBeNull();
    add?.run?.();
    expect(onAddProject).toHaveBeenCalledOnce();
  });

  it("stays visible but inert with no configured types, and says why", () => {
    const [add] = buildProjectsTitleCommands({
      projectType: null,
      adding: false,
      onAddProject: vi.fn(),
    });

    // Left in place rather than dropped: a menu whose commands come and go depending on settings the
    // reader cannot see from here is harder to use than one that says why it is inert.
    expect(add?.disabledReason).toContain("No work item types are configured");
  });

  it("refuses to open a second row while one is already asking for a title", () => {
    const [add] = buildProjectsTitleCommands({
      projectType: "Epic",
      adding: true,
      onAddProject: vi.fn(),
    });

    expect(add?.disabledReason).toContain("already open");
  });

  it("always offers Favorites sync and explains why it is unavailable without a panel", () => {
    const commands = buildProjectsTitleCommands({
      projectType: "Epic",
      adding: false,
      onAddProject: vi.fn(),
    });

    expect(commands[1]?.label).toBe("Sync projects to Favorites");
    expect(commands[1]?.disabledReason).toBe("Favorites are unavailable in this view.");
  });

  it("uses the current Favorites availability reason and leaves a safe command enabled", () => {
    const panel = vi.fn(() => document.createElement("div"));
    const disabled = buildProjectsTitleCommands({
      projectType: "Epic",
      adding: false,
      onAddProject: vi.fn(),
      favoritesPanel: panel,
      favoritesDisabledReason: "Favorites access is required.",
    });
    const enabled = buildProjectsTitleCommands({
      projectType: "Epic",
      adding: false,
      onAddProject: vi.fn(),
      favoritesPanel: panel,
      favoritesDisabledReason: null,
    });

    expect(disabled[1]?.disabledReason).toBe("Favorites access is required.");
    expect(enabled[1]?.disabledReason).toBeNull();
  });
});
