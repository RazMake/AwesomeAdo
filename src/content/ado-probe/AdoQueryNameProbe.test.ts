import { describe, expect, it } from "vitest";

import { detectAdoQueryName } from "./AdoQueryNameProbe";

/** Build a jsdom Document with the given body markup and optional <title>. */
function docWith(body: string, title = ""): Document {
  const doc = document.implementation.createHTMLDocument(title);
  doc.body.innerHTML = body;
  return doc;
}

describe("detectAdoQueryName", () => {
  it("reads the name from the aria-labelled query title element", () => {
    const doc = docWith('<h1 aria-label="Query name">My Sprint Board</h1>', "ignored");
    expect(detectAdoQueryName(doc)).toBe("My Sprint Board");
  });

  it("reads the name from the query-title container", () => {
    const doc = docWith(
      '<div class="query-title-container"><span class="title-m">Bugs</span></div>',
    );
    expect(detectAdoQueryName(doc)).toBe("Bugs");
  });

  it("reads the name from the queries-hub breadcrumb", () => {
    const doc = docWith(
      '<div class="queries-hub"><span class="breadcrumb-current">Team Board</span></div>',
    );
    expect(detectAdoQueryName(doc)).toBe("Team Board");
  });

  it("reads the value from an input element rather than its text content", () => {
    const doc = docWith('<input aria-label="Query name" value="Renamed Query" />');
    expect(detectAdoQueryName(doc)).toBe("Renamed Query");
  });

  it("trims surrounding whitespace", () => {
    const doc = docWith('<h1 aria-label="Query name">   Padded   </h1>');
    expect(detectAdoQueryName(doc)).toBe("Padded");
  });

  it("falls back to the first tab-title segment when no DOM element matches", () => {
    const doc = docWith("<div></div>", "Active Bugs - Contoso - Boards - Azure DevOps");
    expect(detectAdoQueryName(doc)).toBe("Active Bugs");
  });

  it.each([" ‹ ", " | ", " · ", " — "])("splits the tab title on the %j separator", (separator) => {
    const doc = docWith("<div></div>", `Release Plan${separator}Rest`);
    expect(detectAdoQueryName(doc)).toBe("Release Plan");
  });

  it("returns null when the first title segment is a generic section label", () => {
    const doc = docWith("<div></div>", "Queries - Contoso - Azure DevOps");
    expect(detectAdoQueryName(doc)).toBeNull();
  });

  it("returns null when neither the DOM nor the title yields a name", () => {
    const doc = docWith("<div></div>", "");
    expect(detectAdoQueryName(doc)).toBeNull();
  });

  it("ignores an empty query-title element and falls back to the title", () => {
    const doc = docWith('<h1 aria-label="Query name">   </h1>', "Fallback Name - Azure DevOps");
    expect(detectAdoQueryName(doc)).toBe("Fallback Name");
  });
});
