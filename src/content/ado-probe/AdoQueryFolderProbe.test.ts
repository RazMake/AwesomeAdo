import { describe, expect, it } from "vitest";

import { detectAdoQueryFolderPath } from "./AdoQueryFolderProbe";

/** Build a jsdom Document with the given body markup. */
function docWith(body: string): Document {
  const doc = document.implementation.createHTMLDocument("");
  doc.body.innerHTML = body;
  return doc;
}

const ORG = "https://dev.azure.com/contoso/proj";

describe("detectAdoQueryFolderPath", () => {
  it("returns [] when the page has no breadcrumb container", () => {
    const doc = docWith("<div>no breadcrumb here</div>");
    expect(detectAdoQueryFolderPath(doc)).toEqual([]);
  });

  it("scrapes folder segments from the Bolt breadcrumb, in order", () => {
    const doc = docWith(`
      <nav class="bolt-breadcrumb">
        <a href="${ORG}/_queries/all/">Shared Queries</a>
        <a href="${ORG}/_queries/folder/Release%201">Release 1</a>
        <span class="breadcrumb-current">My Query</span>
      </nav>
    `);

    expect(detectAdoQueryFolderPath(doc)).toEqual([
      { label: "Shared Queries", url: `${ORG}/_queries/all/` },
      { label: "Release 1", url: `${ORG}/_queries/folder/Release%201` },
    ]);
  });

  it("excludes the leaf query link (…/_queries/query/{guid})", () => {
    const doc = docWith(`
      <nav class="bolt-breadcrumb">
        <a href="${ORG}/_queries/all/">Shared Queries</a>
        <a href="${ORG}/_queries/query/6f9d1e2a-1234-4a5b-8c9d-0123456789ab">My Query</a>
      </nav>
    `);

    expect(detectAdoQueryFolderPath(doc)).toEqual([
      { label: "Shared Queries", url: `${ORG}/_queries/all/` },
    ]);
  });

  it("ignores non-query hub crumbs such as the Boards hub", () => {
    const doc = docWith(`
      <nav class="bolt-breadcrumb">
        <a href="${ORG}/_boards/board">Boards</a>
        <a href="${ORG}/_queries/all/">Shared Queries</a>
      </nav>
    `);

    expect(detectAdoQueryFolderPath(doc)).toEqual([
      { label: "Shared Queries", url: `${ORG}/_queries/all/` },
    ]);
  });

  it("collapses duplicate anchors that point at the same folder", () => {
    const doc = docWith(`
      <div class="breadcrumb">
        <a href="${ORG}/_queries/folder/Release%201"><span class="icon"></span></a>
        <a href="${ORG}/_queries/folder/Release%201">Release 1</a>
      </div>
    `);

    // The icon-only anchor has no label, so the single labelled anchor is what survives.
    expect(detectAdoQueryFolderPath(doc)).toEqual([
      { label: "Release 1", url: `${ORG}/_queries/folder/Release%201` },
    ]);
  });

  it("skips off-host or malformed crumb links", () => {
    const doc = docWith(`
      <nav class="bolt-breadcrumb">
        <a href="https://evil.example.com/_queries/all/">Phishing</a>
        <a href="${ORG}/_queries/all/">Shared Queries</a>
      </nav>
    `);

    expect(detectAdoQueryFolderPath(doc)).toEqual([
      { label: "Shared Queries", url: `${ORG}/_queries/all/` },
    ]);
  });

  it("reads from a legacy queries-hub breadcrumb", () => {
    const doc = docWith(`
      <div class="queries-hub">
        <div class="breadcrumb">
          <a href="${ORG}/_queries/all/">Shared Queries</a>
          <a href="${ORG}/_queries/folder/Team">Team</a>
        </div>
      </div>
    `);

    expect(detectAdoQueryFolderPath(doc)).toEqual([
      { label: "Shared Queries", url: `${ORG}/_queries/all/` },
      { label: "Team", url: `${ORG}/_queries/folder/Team` },
    ]);
  });
});
