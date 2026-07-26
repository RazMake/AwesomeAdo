import { describe, expect, it } from "vitest";

import {
  buildAdoIdentitySearchRequest,
  IDENTITY_SEARCH_MAX_RESULTS,
  MIN_IDENTITY_SEARCH_LENGTH,
  parseAdoIdentities,
} from "./fetchAdoIdentities";

const QUERY_PAGE = "https://dev.azure.com/contoso/Web/_queries/query/abc";

describe("buildAdoIdentitySearchRequest", () => {
  it("targets the organization's identity picker under the collection base", () => {
    const request = buildAdoIdentitySearchRequest(QUERY_PAGE, "ada");

    expect(request?.url).toBe(
      "https://dev.azure.com/contoso/_apis/IdentityPicker/Identities?api-version=5.0-preview.1",
    );
  });

  it("builds the collection base from the host itself on a legacy visualstudio.com org", () => {
    const request = buildAdoIdentitySearchRequest(
      "https://contoso.visualstudio.com/Web/_queries/query/abc",
      "ada",
    );

    expect(request?.url).toBe(
      "https://contoso.visualstudio.com/_apis/IdentityPicker/Identities?api-version=5.0-preview.1",
    );
  });

  it("asks for users across both the organization and its backing directory", () => {
    const request = buildAdoIdentitySearchRequest(QUERY_PAGE, "  ada  ");

    expect(JSON.parse(request!.body)).toEqual({
      query: "ada",
      identityTypes: ["user"],
      operationScopes: ["ims", "source"],
      properties: ["DisplayName", "Mail", "SignInAddress"],
      options: { MinResults: 1, MaxResults: IDENTITY_SEARCH_MAX_RESULTS },
    });
  });

  it("returns null for a query shorter than the search minimum", () => {
    const tooShort = "a".repeat(MIN_IDENTITY_SEARCH_LENGTH - 1);

    expect(buildAdoIdentitySearchRequest(QUERY_PAGE, tooShort)).toBeNull();
    expect(buildAdoIdentitySearchRequest(QUERY_PAGE, "   ")).toBeNull();
  });

  it("returns null when the page is not a project-scoped ADO location", () => {
    expect(buildAdoIdentitySearchRequest("https://example.com/whatever", "ada")).toBeNull();
    expect(buildAdoIdentitySearchRequest("https://dev.azure.com/contoso", "ada")).toBeNull();
  });
});

describe("parseAdoIdentities - mapping a person", () => {
  it("maps each identity to a directory user, preferring the sign-in address", () => {
    const users = parseAdoIdentities({
      results: [
        {
          identities: [
            {
              displayName: "Ada Lovelace",
              signInAddress: "ada@example.com",
              mail: "ada.contact@example.com",
              image: "https://example.com/ada.png",
            },
          ],
        },
      ],
    });

    expect(users).toEqual([
      {
        displayName: "Ada Lovelace",
        uniqueName: "ada@example.com",
        imageUrl: "https://example.com/ada.png",
      },
    ]);
  });

  it("falls back to the contact mail and to no unique name at all", () => {
    const users = parseAdoIdentities({
      results: [
        {
          identities: [
            { displayName: "Mail Only", mail: "mail@example.com" },
            { displayName: "Nameless" },
          ],
        },
      ],
    });

    expect(users).toEqual([
      { displayName: "Mail Only", uniqueName: "mail@example.com", imageUrl: null },
      { displayName: "Nameless", uniqueName: null, imageUrl: null },
    ]);
  });
});

describe("parseAdoIdentities - who it keeps", () => {
  it("keeps a person the backing directory reports as not yet in the organization", () => {
    // `active:false` means "not a member of THIS org (yet)" — the very people the search exists to
    // find. Dropping them was why the picker could not offer anyone ADO's own picker offered.
    const users = parseAdoIdentities({
      results: [
        {
          identities: [
            { displayName: "New Hire", signInAddress: "new@example.com", active: false },
            { displayName: "Here", signInAddress: "here@example.com", active: true },
          ],
        },
      ],
    });

    expect(users.map((user) => user.displayName)).toEqual(["New Hire", "Here"]);
  });

  it("drops identities with no display name to show", () => {
    const users = parseAdoIdentities({
      results: [
        {
          identities: [
            { displayName: "", signInAddress: "blank@example.com" },
            { signInAddress: "missing@example.com" },
            { displayName: "Here", signInAddress: "here@example.com" },
          ],
        },
      ],
    });

    expect(users.map((user) => user.displayName)).toEqual(["Here"]);
  });

  it("returns one entry for a person matched by more than one operation scope", () => {
    const users = parseAdoIdentities({
      results: [
        { identities: [{ displayName: "Ada", signInAddress: "ada@example.com" }] },
        { identities: [{ displayName: "Ada Lovelace", signInAddress: "ADA@example.com" }] },
      ],
    });

    expect(users).toHaveLength(1);
    expect(users[0]?.displayName).toBe("Ada");
  });
});

describe("parseAdoIdentities - response envelopes", () => {
  it("reads the identity groups from a 'value' envelope or a bare array too", () => {
    const group = { identities: [{ displayName: "Ada", signInAddress: "ada@example.com" }] };

    // An envelope the picker does not expect must not read as "nobody matched".
    expect(parseAdoIdentities({ value: [group] }).map((user) => user.displayName)).toEqual(["Ada"]);
    expect(parseAdoIdentities([group]).map((user) => user.displayName)).toEqual(["Ada"]);
  });

  it("returns an empty list for a missing or malformed body", () => {
    expect(parseAdoIdentities(null)).toEqual([]);
    expect(parseAdoIdentities({})).toEqual([]);
    expect(parseAdoIdentities({ results: "nope" })).toEqual([]);
    expect(parseAdoIdentities({ results: [{ identities: "nope" }, null] })).toEqual([]);
  });
});
