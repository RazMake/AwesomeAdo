import { describe, expect, it } from "vitest";

import {
  buildAdoIdentityNamesUrls,
  collectMentionIdentityIds,
  MAX_MENTION_IDS,
  MENTION_BATCH_SIZE,
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

describe("buildAdoIdentityNamesUrls", () => {
  it("targets the organization's identity service host, not the collection base", () => {
    // Bulk identity reads are served from `vssps`, not from dev.azure.com/{org}; pointing them at
    // the collection base answers 404 and silently anonymizes every mention.
    expect(buildAdoIdentityNamesUrls(QUERY_PAGE, [ADA])).toEqual([
      `https://vssps.dev.azure.com/contoso/_apis/identities?identityIds=${ADA}` +
        "&queryMembership=None&api-version=7.1",
    ]);
  });

  it("uses the per-organization identity host on the legacy visualstudio.com shape", () => {
    expect(
      buildAdoIdentityNamesUrls(`https://contoso.visualstudio.com/Fabrikam/_queries`, [ADA])[0],
    ).toContain("https://contoso.vssps.visualstudio.com/_apis/identities?");
  });

  it("returns nothing when the URL is not a recognized ADO location", () => {
    expect(buildAdoIdentityNamesUrls("https://example.com/whatever", [ADA])).toEqual([]);
  });

  it("returns nothing when there is nobody to ask about", () => {
    expect(buildAdoIdentityNamesUrls(QUERY_PAGE, [])).toEqual([]);
  });

  it("drops anything that is not a well-formed GUID", () => {
    // The ids arrive from the content side and are interpolated into a query string, so a value that
    // is not a GUID must never reach the URL.
    const urls = buildAdoIdentityNamesUrls(QUERY_PAGE, [
      "not-a-guid",
      "&api-version=1.0&identityIds=evil",
      ADA,
    ]);

    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain(`identityIds=${ADA}&`);
    expect(urls[0]).not.toContain("evil");
  });

  it("rejects an id list that is entirely invalid rather than issuing an empty read", () => {
    expect(buildAdoIdentityNamesUrls(QUERY_PAGE, ["../../_apis/git/repositories"])).toEqual([]);
  });

  it("splits the ids into batches so no single URL grows unbounded", () => {
    const urls = buildAdoIdentityNamesUrls(QUERY_PAGE, guids(MENTION_BATCH_SIZE + 1));

    expect(urls).toHaveLength(2);
    expect(urls[0]!.split(",")).toHaveLength(MENTION_BATCH_SIZE);
    expect(urls[1]!.split(",")).toHaveLength(1);
  });

  it("caps how many identities one request may ask about", () => {
    // Without a ceiling a single message could turn into an unbounded number of credentialed reads.
    const urls = buildAdoIdentityNamesUrls(QUERY_PAGE, guids(MAX_MENTION_IDS + MENTION_BATCH_SIZE));

    expect(urls).toHaveLength(MAX_MENTION_IDS / MENTION_BATCH_SIZE);
  });
});

describe("parseAdoIdentityNames", () => {
  it("keys names by lowercase GUID across every batch body", () => {
    const names = parseAdoIdentityNames([
      { value: [{ id: ADA.toUpperCase(), providerDisplayName: "Ada Lovelace" }] },
      { value: [{ id: GRACE, providerDisplayName: "Grace Hopper" }] },
    ]);

    expect([...names]).toEqual([
      [ADA, "Ada Lovelace"],
      [GRACE, "Grace Hopper"],
    ]);
  });

  it("prefers the organization's custom display name over the directory's", () => {
    // The custom name is the one ADO's own mention chips show, so matching it keeps the board and
    // the ADO page reading the same.
    const names = parseAdoIdentityNames([
      {
        value: [
          { id: ADA, customDisplayName: "Ada L. (Contoso)", providerDisplayName: "Ada Lovelace" },
        ],
      },
    ]);

    expect(names.get(ADA)).toBe("Ada L. (Contoso)");
  });

  it("falls back to the sign-in account so a mention still reads as a person", () => {
    const names = parseAdoIdentityNames([
      { value: [{ id: ADA, properties: { Account: { $value: "ada@contoso.com" } } }] },
    ]);

    expect(names.get(ADA)).toBe("ada@contoso.com");
  });

  it("skips an identity with no usable name rather than showing a blank one", () => {
    expect(
      parseAdoIdentityNames([{ value: [{ id: ADA, providerDisplayName: "   " }, { id: GRACE }] }])
        .size,
    ).toBe(0);
  });

  it("skips an entry with no id, which nothing could be keyed by", () => {
    expect(parseAdoIdentityNames([{ value: [{ providerDisplayName: "Ada" }] }]).size).toBe(0);
  });

  it("degrades to no names for a malformed or missing body", () => {
    expect(parseAdoIdentityNames([null, undefined, {}, { value: "nope" }, 7]).size).toBe(0);
  });
});
