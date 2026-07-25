import { describe, expect, it } from "vitest";

import { renderBreadcrumbs } from "./Breadcrumbs";

const A = "https://dev.azure.com/contoso/proj/_queries/all/";
const B = "https://dev.azure.com/contoso/proj/_queries/folder/Release%201";

describe("renderBreadcrumbs", () => {
  it("returns null when there are no segments", () => {
    expect(renderBreadcrumbs(document, { segments: [] })).toBeNull();
  });

  it("renders a nav with one linked segment per entry, in order", () => {
    const nav = renderBreadcrumbs(document, {
      segments: [
        { label: "Shared Queries", url: A },
        { label: "Release 1", url: B },
      ],
    });

    expect(nav).not.toBeNull();
    expect(nav?.className).toBe("awesomeado-breadcrumbs");

    const links = nav?.querySelectorAll(".awesomeado-breadcrumb");
    expect(links?.length).toBe(2);
    expect(links?.[0]?.textContent).toBe("Shared Queries");
    expect((links?.[0] as HTMLAnchorElement).href).toBe(A);
    expect(links?.[1]?.textContent).toBe("Release 1");
    expect((links?.[1] as HTMLAnchorElement).href).toBe(B);
  });

  it("places a separator between segments but not before the first", () => {
    const nav = renderBreadcrumbs(document, {
      segments: [
        { label: "Shared Queries", url: A },
        { label: "Release 1", url: B },
      ],
    });

    const separators = nav?.querySelectorAll(".awesomeado-breadcrumb-sep");
    expect(separators?.length).toBe(1);
    expect(separators?.[0]?.textContent).toBe("\\");
    expect(separators?.[0]?.getAttribute("aria-hidden")).toBe("true");
  });

  it("renders no separator for a single segment", () => {
    const nav = renderBreadcrumbs(document, { segments: [{ label: "Shared Queries", url: A }] });

    expect(nav?.querySelectorAll(".awesomeado-breadcrumb-sep").length).toBe(0);
  });

  it("uses the default aria-label and allows overriding it", () => {
    const nav = renderBreadcrumbs(document, { segments: [{ label: "A", url: A }] });
    expect(nav?.getAttribute("aria-label")).toBe("Breadcrumb");

    const labelled = renderBreadcrumbs(document, {
      segments: [{ label: "A", url: A }],
      ariaLabel: "Query folder",
    });
    expect(labelled?.getAttribute("aria-label")).toBe("Query folder");
  });

  it("uses a custom separator glyph when provided", () => {
    const nav = renderBreadcrumbs(document, {
      segments: [
        { label: "A", url: A },
        { label: "B", url: B },
      ],
      separator: "›",
    });

    expect(nav?.querySelector(".awesomeado-breadcrumb-sep")?.textContent).toBe("›");
  });
});
