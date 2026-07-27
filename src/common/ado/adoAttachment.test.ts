import { describe, expect, it } from "vitest";

import { buildAdoAttachmentUrl } from "./adoAttachment";

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
