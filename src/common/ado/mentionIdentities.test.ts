import { describe, expect, it } from "vitest";

import {
  buildAdoIdentityPickerRequest,
  collectMentionIdentityIds,
  MAX_MENTION_IDS,
  parseAdoIdentityNames,
} from "./mentionIdentities";

const QUERY_PAGE = "https://dev.azure.com/contoso/Fabrikam/_queries/query/abc123";
const ADA = "11111111-2222-3333-4444-555555555555";
const GRACE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

/** `count` distinct, well-formed identity GUIDs, numbered so a batch boundary is checkable. */
function guids(count: number): string[] {
  return Array.from(
    { length: count },
    (_unused, index) => `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
  );
}

/** One Identity Picker answer: the token echoed back, and whatever it matched. */
function pickerBody(queryToken: string, identities: readonly unknown[]): unknown {
  return { results: [{ queryToken, identities, pagingToken: "" }] };
}

describe("collectMentionIdentityIds", () => {
  it("finds the GUID in a Markdown mention token", () => {
    expect(collectMentionIdentityIds([`Ping @<${ADA}> about this.`])).toEqual([ADA]);
  });

  it("finds the GUID in an ADO rich-text mention anchor", () => {
    // A description stored as ADO rich text carries mention ANCHORS, not Markdown tokens; missing
    // this encoding is what leaves a rich-text description full of anonymous mentions.
    const html = `<p><a href="#" data-vss-mention="version:2.0,${ADA}">@Ada</a></p>`;

    expect(collectMentionIdentityIds([html])).toEqual([ADA]);
  });

  it("finds a mention anchor however the attribute was quoted", () => {
    // The attribute is re-serialized by whichever editor last touched the item, so the quote style
    // is not ours to assume — and missing it silently anonymizes that one person.
    const html = `<a href='#' data-vss-mention='version:2.0,${ADA}'>@Ada</a>`;

    expect(collectMentionIdentityIds([html])).toEqual([ADA]);
  });

  it("collects both encodings across many sources, de-duplicated and lowercased", () => {
    const ids = collectMentionIdentityIds([
      `@<${ADA.toUpperCase()}>`,
      `<a data-vss-mention="version:1.0,${ADA}">@Ada</a>`,
      `cc @<${GRACE}>`,
    ]);

    // One id per person no matter how many items mentioned them: that is what keeps a whole board's
    // mentions inside a single bulk read.
    expect(ids).toEqual([ADA, GRACE]);
  });

  it("ignores content with no mentions, and sources that are not text", () => {
    expect(collectMentionIdentityIds(["plain text", "", null, undefined])).toEqual([]);
  });

  it("ignores something GUID-shaped that is not a mention", () => {
    // A bare GUID in prose (a build id, a pasted link) is not a person, and asking about it would
    // spend the batch budget on an id the directory can never answer.
    expect(collectMentionIdentityIds([`See run ${ADA} for the failure.`])).toEqual([]);
  });
});

describe("buildAdoIdentityPickerRequest", () => {
  it("targets the collection base, which is the only host the page session can read", () => {
    // The bulk `vssps` read this replaced answers a credentialed cross-origin fetch with a wildcard
    // allow-origin, which the browser rejects outright — every mention went anonymous.
    expect(buildAdoIdentityPickerRequest(QUERY_PAGE, [ADA])).toEqual({
      url: "https://dev.azure.com/contoso/_apis/IdentityPicker/Identities?api-version=5.2-preview.1",
      ids: [ADA],
    });
  });

  it("uses the origin as the base on the legacy visualstudio.com shape", () => {
    expect(
      buildAdoIdentityPickerRequest(`https://contoso.visualstudio.com/Fabrikam/_queries`, [ADA])
        ?.url,
    ).toBe(
      "https://contoso.visualstudio.com/_apis/IdentityPicker/Identities?api-version=5.2-preview.1",
    );
  });

  it("returns nothing when the URL is not a recognized ADO location", () => {
    expect(buildAdoIdentityPickerRequest("https://example.com/whatever", [ADA])).toBeNull();
  });

  it("returns nothing when there is nobody to ask about", () => {
    expect(buildAdoIdentityPickerRequest(QUERY_PAGE, [])).toBeNull();
  });

  it("de-duplicates and lowercases, so one person costs one request", () => {
    // The picker answers one identity per request, so a duplicate id is a wasted credentialed call.
    expect(buildAdoIdentityPickerRequest(QUERY_PAGE, [ADA.toUpperCase(), ADA, GRACE])?.ids).toEqual(
      [ADA, GRACE],
    );
  });

  it("drops anything that is not a well-formed GUID", () => {
    // The ids arrive from the content side, so a value that is not a GUID must never be sent — it
    // would turn a mention resolve into an arbitrary directory search.
    expect(
      buildAdoIdentityPickerRequest(QUERY_PAGE, ["not-a-guid", "Ada Lovelace", ADA])?.ids,
    ).toEqual([ADA]);
  });

  it("rejects an id list that is entirely invalid rather than issuing an empty read", () => {
    expect(buildAdoIdentityPickerRequest(QUERY_PAGE, ["../../_apis/git/repositories"])).toBeNull();
  });

  it("caps how many identities one request may ask about", () => {
    // Each id costs its own credentialed request, so without a ceiling one message could turn into
    // an unbounded number of them.
    expect(
      buildAdoIdentityPickerRequest(QUERY_PAGE, guids(MAX_MENTION_IDS + 10))?.ids,
    ).toHaveLength(MAX_MENTION_IDS);
  });
});

describe("parseAdoIdentityNames", () => {
  it("keys names by the echoed query token across every body", () => {
    const names = parseAdoIdentityNames([
      pickerBody(ADA.toUpperCase(), [{ displayName: "Ada Lovelace" }]),
      pickerBody(GRACE, [{ displayName: "Grace Hopper" }]),
    ]);

    expect([...names]).toEqual([
      [ADA, "Ada Lovelace"],
      [GRACE, "Grace Hopper"],
    ]);
  });

  it("keys by the query token, not by an id field on the identity", () => {
    // The picker returns BOTH the ADO identity id (`localId`, what a mention stores) and the
    // directory object behind it (`originId`). Keying by the wrong one files every name under an id
    // no mention will ever look up, and the board renders placeholders despite a successful read.
    const names = parseAdoIdentityNames([
      pickerBody(ADA, [{ localId: ADA, originId: GRACE, displayName: "Ada Lovelace" }]),
    ]);

    expect([...names.keys()]).toEqual([ADA]);
  });

  it("falls back to the sign-in address so a mention still reads as a person", () => {
    const names = parseAdoIdentityNames([pickerBody(ADA, [{ signInAddress: "ada@contoso.com" }])]);

    expect(names.get(ADA)).toBe("ada@contoso.com");
  });

  it("skips a nameless match ahead of the real one rather than anonymizing the mention", () => {
    const names = parseAdoIdentityNames([
      pickerBody(ADA, [{ displayName: "   " }, { displayName: "Ada Lovelace" }]),
    ]);

    expect(names.get(ADA)).toBe("Ada Lovelace");
  });

  it("skips an id Azure DevOps matched nobody for, rather than showing a blank name", () => {
    expect(parseAdoIdentityNames([pickerBody(ADA, [])]).size).toBe(0);
  });

  it("skips a result with no query token, which nothing could be keyed by", () => {
    expect(
      parseAdoIdentityNames([{ results: [{ identities: [{ displayName: "Ada" }] }] }]).size,
    ).toBe(0);
  });

  it("degrades to no names for a malformed or missing body", () => {
    expect(parseAdoIdentityNames([null, undefined, {}, { results: "nope" }, 7]).size).toBe(0);
  });
});
