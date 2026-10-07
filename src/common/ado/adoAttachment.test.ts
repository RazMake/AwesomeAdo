import { describe, expect, it } from "vitest";

import {
  buildAdoAttachmentUrl,
  buildAttachmentDiscardUrl,
  buildAttachmentUploadUrl,
  parseUploadedAttachmentId,
  parseUploadedAttachmentUrl,
} from "./adoAttachment";

const HOSTED_PAGE = "https://dev.azure.com/contoso/proj/_queries/query/q1";
const LEGACY_PAGE = "https://contoso.visualstudio.com/proj/_queries/query/q1";
const ATTACHMENT = "4f76001f-8f25-4e7e-80a1-b3a3f54e9a73";

describe("buildAdoAttachmentUrl — what ADO's own rich text points at", () => {
  it("addresses the organization, keeping the file name ADO put on the reference", () => {
    expect(buildAdoAttachmentUrl(HOSTED_PAGE, `${ATTACHMENT}?fileName=image.png`)).toBe(
      `https://dev.azure.com/contoso/_apis/wit/attachments/${ATTACHMENT}` +
        "?fileName=image.png&api-version=7.1",
    );
  });

  it("resolves the organization from the host on a legacy visualstudio.com page", () => {
    expect(buildAdoAttachmentUrl(LEGACY_PAGE, `${ATTACHMENT}?fileName=image.png`)).toBe(
      `https://contoso.visualstudio.com/_apis/wit/attachments/${ATTACHMENT}` +
        "?fileName=image.png&api-version=7.1",
    );
  });

  it("still builds a request for a reference that carries no file name", () => {
    expect(buildAdoAttachmentUrl(HOSTED_PAGE, ATTACHMENT)).toBe(
      `https://dev.azure.com/contoso/_apis/wit/attachments/${ATTACHMENT}?api-version=7.1`,
    );
  });

  it("works on an org-level page, where no project can be resolved", () => {
    expect(buildAdoAttachmentUrl("https://dev.azure.com/contoso/_queries", ATTACHMENT)).toBe(
      `https://dev.azure.com/contoso/_apis/wit/attachments/${ATTACHMENT}?api-version=7.1`,
    );
  });
});

describe("buildAdoAttachmentUrl — a reference something already joined to the origin", () => {
  // This is the shape a work item COMMENT arrives in: ADO's own `renderedText` hands back the bare
  // reference already glued to the collection root, which addresses nothing and renders as an empty
  // box. Descriptions, which arrive unrendered, carry the bare id instead — hence both shapes.
  it("rebuilds an attachment URL ADO resolved against the org root", () => {
    expect(
      buildAdoAttachmentUrl(
        LEGACY_PAGE,
        `https://contoso.visualstudio.com/${ATTACHMENT}?fileName=image.png`,
      ),
    ).toBe(
      `https://contoso.visualstudio.com/_apis/wit/attachments/${ATTACHMENT}` +
        "?fileName=image.png&api-version=7.1",
    );
  });

  it("rebuilds the same shape written root-relative, keeping the page's organization", () => {
    expect(buildAdoAttachmentUrl(HOSTED_PAGE, `/contoso/${ATTACHMENT}?fileName=image.png`)).toBe(
      `https://dev.azure.com/contoso/_apis/wit/attachments/${ATTACHMENT}` +
        "?fileName=image.png&api-version=7.1",
    );
  });

  it("leaves a request that is already addressed to the attachments API alone", () => {
    // Already correct, so rewriting it could only break it.
    expect(
      buildAdoAttachmentUrl(
        HOSTED_PAGE,
        `https://dev.azure.com/contoso/_apis/wit/attachments/${ATTACHMENT}?fileName=image.png`,
      ),
    ).toBeNull();
  });

  it("leaves a GUID that addresses an ADO area, not an attachment, alone", () => {
    // `_queries/query/{guid}` is a saved query: a real URL whose id means something else entirely.
    expect(
      buildAdoAttachmentUrl(
        HOSTED_PAGE,
        `https://dev.azure.com/contoso/_queries/query/${ATTACHMENT}`,
      ),
    ).toBeNull();
  });

  it("leaves an image hosted anywhere but Azure DevOps alone", () => {
    expect(buildAdoAttachmentUrl(HOSTED_PAGE, `https://example.com/${ATTACHMENT}`)).toBeNull();
  });
});

describe("buildAdoAttachmentUrl — what it refuses to treat as an attachment", () => {
  it("refuses anything that is not a bare attachment id", () => {
    expect(buildAdoAttachmentUrl(HOSTED_PAGE, "https://example.com/image.png")).toBeNull();
    expect(buildAdoAttachmentUrl(HOSTED_PAGE, "/proj/_apis/wit/attachments/abc")).toBeNull();
    expect(buildAdoAttachmentUrl(HOSTED_PAGE, "javascript:alert(1)")).toBeNull();
    expect(buildAdoAttachmentUrl(HOSTED_PAGE, "")).toBeNull();
  });

  it("refuses an id whose query hides a fragment", () => {
    expect(buildAdoAttachmentUrl(HOSTED_PAGE, `${ATTACHMENT}?fileName=a.png#x`)).toBeNull();
  });

  it("refuses to build anything when the page is not an ADO location", () => {
    expect(buildAdoAttachmentUrl("https://example.com/board", ATTACHMENT)).toBeNull();
  });
});

describe("buildAttachmentUploadUrl — where a pasted image is stored", () => {
  it("addresses the page's project and sends the whole file in one request", () => {
    expect(buildAttachmentUploadUrl(HOSTED_PAGE, "my shot.png")).toBe(
      "https://dev.azure.com/contoso/proj/_apis/wit/attachments" +
        "?fileName=my%20shot.png&uploadType=Simple&api-version=7.1",
    );
  });

  it("resolves the organization from the host on a legacy visualstudio.com page", () => {
    expect(buildAttachmentUploadUrl(LEGACY_PAGE, "image.png")).toBe(
      "https://contoso.visualstudio.com/proj/_apis/wit/attachments" +
        "?fileName=image.png&uploadType=Simple&api-version=7.1",
    );
  });

  it("refuses a page that names no project", () => {
    expect(buildAttachmentUploadUrl("https://dev.azure.com/contoso", "image.png")).toBeNull();
    expect(buildAttachmentUploadUrl("https://example.com/proj/_queries", "image.png")).toBeNull();
  });
});

describe("parseUploadedAttachmentUrl — what an uploaded image is embedded as", () => {
  const STORED = `https://dev.azure.com/contoso/0b1c/_apis/wit/attachments/${ATTACHMENT}`;

  it("names the file on ADO's own URL, the way ADO's editors embed it", () => {
    expect(parseUploadedAttachmentUrl({ id: ATTACHMENT, url: STORED }, "my shot.png")).toBe(
      `${STORED}?fileName=my+shot.png`,
    );
  });

  it.each([
    ["no body", null],
    ["no url", { id: ATTACHMENT }],
    ["a blank url", { url: " " }],
    ["an unparseable url", { url: "not a url" }],
    ["a url that is not https", { url: "http://dev.azure.com/contoso/_apis/wit/attachments/a" }],
  ])("refuses %s", (_case, raw) => {
    expect(parseUploadedAttachmentUrl(raw, "image.png")).toBeNull();
  });
});

describe("parseUploadedAttachmentId — what an unsaved image is later removed by", () => {
  it("returns the GUID Azure DevOps assigned", () => {
    expect(parseUploadedAttachmentId({ id: ATTACHMENT, url: "x" })).toBe(ATTACHMENT);
  });

  it.each([
    ["no reply", undefined],
    ["a reply with no id", { url: "x" }],
    ["an id that is not a GUID", { id: "../../projects" }],
  ])("returns null for %s", (_case, raw) => {
    expect(parseUploadedAttachmentId(raw)).toBeNull();
  });
});

describe("buildAttachmentDiscardUrl — where an unsaved image is removed", () => {
  it("addresses the attachment in the page's project through the delete API", () => {
    expect(buildAttachmentDiscardUrl(HOSTED_PAGE, ATTACHMENT)).toBe(
      `https://dev.azure.com/contoso/proj/_apis/wit/attachments/${ATTACHMENT}` +
        "?api-version=7.2-preview.4",
    );
  });

  it("refuses a page that names no project", () => {
    expect(buildAttachmentDiscardUrl("https://dev.azure.com/contoso", ATTACHMENT)).toBeNull();
  });

  it("refuses an id that is not a GUID, so nothing else can be deleted", () => {
    expect(buildAttachmentDiscardUrl(HOSTED_PAGE, "a1/../../x")).toBeNull();
  });
});
