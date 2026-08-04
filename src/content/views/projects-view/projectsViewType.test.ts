import { describe, expect, it } from "vitest";

import {
  configuredNewProjectTags,
  newProjectIterationPathOf,
  projectQueryFolderOf,
} from "./projectsViewType";

describe("All Projects Catalog binding values", () => {
  it("uses the configured catalog tag as the new project's only membership tag", () => {
    expect(configuredNewProjectTags({ projectTag: " Catalog " })).toEqual(["Catalog"]);
  });

  it("keeps reading the earlier comma-separated tag setting", () => {
    expect(configuredNewProjectTags({ newProjectTags: "Catalog, FY26" })).toEqual([
      "Catalog",
      "FY26",
    ]);
  });

  it("defaults the iteration path to the Azure DevOps project root", () => {
    expect(newProjectIterationPathOf({}, "Fabrikam")).toBe("Fabrikam");
    expect(
      newProjectIterationPathOf({ newProjectIterationPath: "Fabrikam\\Backlog" }, "Fabrikam"),
    ).toBe("Fabrikam\\Backlog");
  });

  it("defaults generated queries to the catalog query's folder", () => {
    expect(projectQueryFolderOf({}, "Shared Queries/Team A")).toBe("Shared Queries/Team A");
    expect(
      projectQueryFolderOf(
        { projectQueryFolder: "Shared Queries/Delivery" },
        "Shared Queries/Team A",
      ),
    ).toBe("Shared Queries/Delivery");
  });
});
