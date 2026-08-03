import { describe, expect, it } from "vitest";

import { buildAdoConnectionDataUrl, parseCurrentUser } from "./currentUser";

/** A project-scoped ADO query page: `dev.azure.com/{org}/{project}/…`, what the URL builder needs. */
const HREF =
  "https://dev.azure.com/myorg/myproject/_queries/query/2f6a1b4c-0000-4a11-9f00-abcdef012345";
/** An org-level ADO location: a real ADO host, but with no project segment to scope an API call to. */
const ORG_HREF = "https://dev.azure.com/myorg/_queries";
const NOT_ADO = "https://example.com/x";

describe("buildAdoConnectionDataUrl", () => {
  it("reads the signed-in identity from the ORG, not from the project", () => {
    expect(buildAdoConnectionDataUrl(HREF)).toBe(
      "https://dev.azure.com/myorg/_apis/ConnectionData?api-version=7.1-preview.1",
    );
  });

  it("asks ConnectionData for a PREVIEW version, the only kind it is served under", () => {
    // A released version answers 400 there, which reaches the parser as an error envelope with no
    // authenticatedUser — indistinguishable from "nobody is signed in". Asserted separately from the
    // exact URL so the requirement survives a re-pin.
    expect(buildAdoConnectionDataUrl(HREF)).toMatch(/api-version=\d+\.\d+-preview(\.\d+)?$/);
  });

  it("builds no URL for a location that is not a project-scoped Azure DevOps page", () => {
    expect(buildAdoConnectionDataUrl(NOT_ADO)).toBeNull();
    expect(buildAdoConnectionDataUrl(ORG_HREF)).toBeNull();
  });
});

describe("parseCurrentUser", () => {
  it("reads the identity GUID and the sign-in address out of the property bag", () => {
    const connection = {
      authenticatedUser: {
        id: "guid-one",
        providerDisplayName: "Alice Smith",
        properties: { Account: { $value: "alice@example.com" } },
      },
    };

    expect(parseCurrentUser(connection)).toEqual({
      displayName: "Alice Smith",
      id: "guid-one",
      uniqueName: "alice@example.com",
    });
  });

  it("still identifies a reader a tenant returned no address for", () => {
    const connection = { authenticatedUser: { id: "guid-one", providerDisplayName: "Alice" } };

    expect(parseCurrentUser(connection)).toEqual({
      displayName: "Alice",
      id: "guid-one",
      uniqueName: null,
    });
  });

  it("falls back to the sign-in address as the display name when no name was supplied", () => {
    const connection = {
      authenticatedUser: { properties: { Account: { $value: "alice@example.com" } } },
    };

    expect(parseCurrentUser(connection)).toEqual({
      displayName: "alice@example.com",
      id: null,
      uniqueName: "alice@example.com",
    });
  });

  it("reports no identity when neither handle is present", () => {
    expect(parseCurrentUser({ authenticatedUser: { providerDisplayName: "Alice" } })).toBeNull();
    expect(parseCurrentUser({ authenticatedUser: { id: "", properties: {} } })).toBeNull();
  });

  it("reports no identity for a body that is not a connection response at all", () => {
    expect(parseCurrentUser(null)).toBeNull();
    expect(parseCurrentUser("nope")).toBeNull();
    expect(parseCurrentUser(42)).toBeNull();
    expect(parseCurrentUser({})).toBeNull();
  });
});
