import { describe, expect, it } from "vitest";

import { renderEtaBadge } from "../../../../common/view-common/control/EtaBadge/EtaBadge";

import {
  renderProjectTrackingHeader,
  type ProjectTrackingHeaderOptions,
} from "./ProjectTrackingHeader";

// Shared across the sibling describes below so each split group reuses one fixture builder with
// zero duplication (jscpd threshold is 0).
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
    eta: renderEtaBadge(document, { eta: null, now }),
    sprintPicker,
    ...overrides,
  };
}

// Collapsing the breadcrumb DOM lookups into one helper keeps the assertion-heavy breadcrumb test
// below the complexity ceiling without dropping any of the checks it makes.
function readBreadcrumbNav(element: Element): {
  nav: Element | null;
  links: HTMLAnchorElement[];
  separators: NodeListOf<Element> | undefined;
} {
  const nav = element.querySelector(".awesomeado-breadcrumbs");
  const links = Array.from(
    nav?.querySelectorAll<HTMLAnchorElement>(".awesomeado-breadcrumb") ?? [],
  );
  return { nav, links, separators: nav?.querySelectorAll(".awesomeado-breadcrumb-sep") };
}

describe("renderProjectTrackingHeader - title & controls", () => {
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
});

describe("renderProjectTrackingHeader - tech lead & ETA", () => {
  it("mounts the Tech Lead control and the ETA badge on the same line", () => {
    const { element } = renderProjectTrackingHeader(document, baseOptions());

    const techLeadRow = element.querySelector(".awesomeado-tracking__techlead-row");
    expect(techLeadRow?.querySelector(".awesomeado-tracking__techlead")).toBeTruthy();
    expect(techLeadRow?.querySelector(".awesomeado-eta")).toBeTruthy();
  });

  it("renders the ETA badge inside the header when an ETA is set", () => {
    const { element } = renderProjectTrackingHeader(
      document,
      baseOptions({ eta: renderEtaBadge(document, { eta: "2026-08-10T00:00:00-07:00", now }) }),
    );

    const eta = element.querySelector(".awesomeado-tracking__header .awesomeado-eta");
    expect(eta?.textContent).toContain("ETA 08/10/2026");
  });
});

describe("renderProjectTrackingHeader - breadcrumbs", () => {
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

    const { nav, links, separators } = readBreadcrumbNav(element);
    expect(nav).toBeTruthy();
    expect(nav?.getAttribute("aria-label")).toBe("Query folder");

    expect(links.length).toBe(2);
    expect(links[0]?.textContent).toBe("Shared Queries");
    expect(links[0]?.href).toContain("_queries/all");
    expect(links[1]?.textContent).toBe("Release 1");

    // One separator sits between the two segments.
    expect(separators?.length).toBe(1);
  });
});

describe("renderProjectTrackingHeader - controls & write status", () => {
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

  it("mounts the write-queue status indicator on its own row above the sprint picker", () => {
    const writeQueueStatus = document.createElement("span");
    writeQueueStatus.className = "awesomeado-write-queue-status";

    const { element } = renderProjectTrackingHeader(document, baseOptions({ writeQueueStatus }));

    const statusRow = element.querySelector(".awesomeado-tracking__write-status-row");
    expect(statusRow?.contains(writeQueueStatus)).toBe(true);

    // The status row must precede the controls band (which carries the sprint picker) so the
    // indicator sits ABOVE the sprint picker rather than beside or below it.
    const mainRow = element.querySelector(".awesomeado-tracking__header-main");
    const children = [...element.children];
    expect(children.indexOf(statusRow as Element)).toBeLessThan(
      children.indexOf(mainRow as Element),
    );
  });

  it("omits the write-status row when no indicator is supplied", () => {
    const { element } = renderProjectTrackingHeader(document, baseOptions());

    expect(element.querySelector(".awesomeado-tracking__write-status-row")).toBeNull();
  });
});
