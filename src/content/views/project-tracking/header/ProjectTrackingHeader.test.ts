import { describe, expect, it } from "vitest";

import {
  renderProjectTrackingHeader,
  type ProjectTrackingHeaderOptions,
} from "./ProjectTrackingHeader";

describe("renderProjectTrackingHeader", () => {
  const now = new Date("2026-07-24T10:00:00-07:00");

  function baseOptions(
    overrides: Partial<ProjectTrackingHeaderOptions> = {},
  ): ProjectTrackingHeaderOptions {
    const techLead = document.createElement("div");
    techLead.className = "awesomeado-tracking__techlead";
    techLead.textContent = "TechLead: Alice Smith";

    const sprintPicker = document.createElement("div");
    sprintPicker.className = "awesomeado-sprint-picker";

    return {
      breadcrumbs: [],
      title: "Platform Modernization",
      titleColor: null,
      techLead,
      eta: null,
      now,
      sprintPicker,
      ...overrides,
    };
  }

  it("renders the tile with the title and mounts the sprint picker", () => {
    const { element } = renderProjectTrackingHeader(document, baseOptions());

    expect(element.className).toBe("awesomeado-tracking__header");
    const title = element.querySelector(".awesomeado-tracking__title");
    expect(title?.textContent).toBe("Platform Modernization");
    expect(element.querySelector(".awesomeado-sprint-picker")).toBeTruthy();
  });

  it("applies the title color when provided", () => {
    const { element } = renderProjectTrackingHeader(
      document,
      baseOptions({ titleColor: "#ff6b6b" }),
    );

    const title = element.querySelector(".awesomeado-tracking__title");
    const style = title?.getAttribute("style") ?? "";
    expect(style.includes("#ff6b6b") || style.includes("rgb(255, 107, 107)")).toBe(true);
  });

  it("mounts the Tech Lead control and the ETA badge on the same line", () => {
    const { element } = renderProjectTrackingHeader(document, baseOptions());

    const techLeadRow = element.querySelector(".awesomeado-tracking__techlead-row");
    expect(techLeadRow?.querySelector(".awesomeado-tracking__techlead")).toBeTruthy();
    expect(techLeadRow?.querySelector(".awesomeado-eta")).toBeTruthy();
  });

  it("renders the ETA badge inside the header when an ETA is set", () => {
    const { element } = renderProjectTrackingHeader(
      document,
      baseOptions({ eta: "2026-08-10T00:00:00-07:00" }),
    );

    const eta = element.querySelector(".awesomeado-tracking__header .awesomeado-eta");
    expect(eta?.textContent).toContain("ETA 08/10/2026");
  });

  it("omits the breadcrumb row when there are no parent folders", () => {
    const { element } = renderProjectTrackingHeader(document, baseOptions({ breadcrumbs: [] }));

    expect(element.querySelector(".awesomeado-breadcrumbs")).toBeNull();
  });

  it("renders clickable breadcrumb links with separators between segments", () => {
    const { element } = renderProjectTrackingHeader(
      document,
      baseOptions({
        breadcrumbs: [
          { label: "Shared Queries", url: "https://dev.azure.com/org/proj/_queries/all" },
          { label: "Release 1", url: "https://dev.azure.com/org/proj/_queries/folder/r1" },
        ],
      }),
    );

    const nav = element.querySelector(".awesomeado-breadcrumbs");
    expect(nav).toBeTruthy();
    expect(nav?.getAttribute("aria-label")).toBe("Query folder");

    const links = nav?.querySelectorAll(".awesomeado-breadcrumb");
    expect(links?.length).toBe(2);
    expect(links?.[0]?.textContent).toBe("Shared Queries");
    expect((links?.[0] as HTMLAnchorElement).href).toContain("_queries/all");
    expect(links?.[1]?.textContent).toBe("Release 1");

    // One separator sits between the two segments.
    const separators = nav?.querySelectorAll(".awesomeado-breadcrumb-sep");
    expect(separators?.length).toBe(1);
  });

  it("exposes expand-all and collapse-all buttons carrying the board's wiring classes", () => {
    const { element, expandAllButton, collapseAllButton } = renderProjectTrackingHeader(
      document,
      baseOptions(),
    );

    expect(expandAllButton.className).toBe("awesomeado-tracking__expand-all");
    expect(collapseAllButton.className).toBe("awesomeado-tracking__collapse-all");
    expect(element.querySelector(".awesomeado-tracking__expand-all")).toBe(expandAllButton);
    expect(element.querySelector(".awesomeado-tracking__collapse-all")).toBe(collapseAllButton);
  });

  it("still renders when no Tech Lead control is supplied", () => {
    const { element } = renderProjectTrackingHeader(document, baseOptions({ techLead: null }));

    const techLeadRow = element.querySelector(".awesomeado-tracking__techlead-row");
    expect(techLeadRow?.querySelector(".awesomeado-tracking__techlead")).toBeNull();
    // The ETA badge is still on the tech-lead line even without a Tech Lead control.
    expect(techLeadRow?.querySelector(".awesomeado-eta")).toBeTruthy();
  });
});
