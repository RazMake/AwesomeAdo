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
});
