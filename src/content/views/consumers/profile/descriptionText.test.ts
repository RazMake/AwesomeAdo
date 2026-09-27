import { describe, expect, it } from "vitest";

import {
  isDecorativeLine,
  isHeadingUnderline,
  isRichText,
  isTableSeparator,
  keyedLineOf,
  listItemBodyOf,
  plainText,
  readableLines,
  tableCellsOf,
} from "./descriptionText";

describe("isRichText", () => {
  it("recognizes Azure DevOps' own HTML", () => {
    expect(isRichText("<div>Owner: Jane</div>")).toBe(true);
    expect(isRichText('Text with <a href="https://x">a link</a>')).toBe(true);
    expect(isRichText("Line one<br/>Line two")).toBe(true);
  });

  it("does not take a bracketed address or mention in Markdown for markup", () => {
    expect(isRichText("- Ann <a@contoso.com>")).toBe(false);
    expect(isRichText("- @<11111111-2222-3333-4444-555555555555>")).toBe(false);
    expect(isRichText("5 < 6 and 7 > 3")).toBe(false);
  });
});

describe("readableLines, on Markdown", () => {
  it("keeps one line per stored line, even when an entity encodes a newline", () => {
    expect(readableLines("Owner: Jane&#10;Doe\r\nNext")).toEqual(["Owner: Jane\nDoe", "Next"]);
  });

  it("decodes named and numeric entities, and leaves the ones it does not know", () => {
    expect(readableLines("A &amp; B &#x41; &#66; &bogus; &#0;")).toEqual([
      "A & B A B &bogus; &#0;",
    ]);
  });

  it("smooths over the invisible differences pasted text brings", () => {
    expect(readableLines("\u200bOwner\uff1a\u00a0Jane\tDoe  ")).toEqual(["Owner: Jane Doe"]);
  });
});

describe("readableLines, on rich text", () => {
  it("rewrites headings, list items, and links into the Markdown shapes they stand for", () => {
    expect(
      readableLines(
        "<h2>Contacts</h2><ul><li><b>Owner</b>: <a href='mailto:j@x.com'>Jane</a></li>" +
          "<li><code>M1</code>: <a href=https://x/bob>Bob</a></li></ul>",
      ).filter((line) => line.length > 0),
    ).toEqual([
      "## Contacts",
      "- **Owner**: [Jane](mailto:j@x.com)",
      "- `M1`: [Bob](https://x/bob)",
    ]);
  });

  it("breaks lines at line breaks and blocks, and drops every other tag", () => {
    expect(
      readableLines("<p>One<br>Two</p><span>Three</span>").filter((line) => line.length > 0),
    ).toEqual(["One", "Two", "Three"]);
  });
});

describe("listItemBodyOf", () => {
  it.each([
    ["- Jane", "Jane"],
    ["  * Jane", "Jane"],
    ["1. Jane", "Jane"],
    ["2) Jane", "Jane"],
    ["a. Jane", "Jane"],
    ["> - [x] Jane", "Jane"],
    ["\u2022 Jane", "Jane"],
    ["Jane", "Jane"],
  ])("reads %j as %j", (line, body) => {
    expect(listItemBodyOf(line.trim())).toBe(body);
  });
});

describe("keyedLineOf", () => {
  it("splits a key from its value on a colon or an equals sign", () => {
    expect(keyedLineOf("**Owner**: `Jane`")).toEqual({
      key: "Owner",
      value: "Jane",
      rawValue: "`Jane`",
    });
    expect(keyedLineOf("Owner = Jane")?.key).toBe("Owner");
  });

  it("does not split a link at its scheme, or read a sentence as a key", () => {
    expect(keyedLineOf("https://example.com")).toBeNull();
    expect(keyedLineOf("[Jane](mailto:j@x.com)")).toBeNull();
    expect(keyedLineOf("This is a very long sentence that happens to end: here")).toBeNull();
    expect(keyedLineOf("``: value")).toBeNull();
  });
});

describe("table and rule lines", () => {
  it("reads a table row's cells, and nothing from a line that is not one", () => {
    expect(tableCellsOf("| M1 | Jane Doe |")).toEqual(["M1", "Jane Doe"]);
    expect(tableCellsOf("M1 | Jane")).toBeNull();
  });

  it("recognizes a header separator, with or without alignment colons", () => {
    expect(isTableSeparator("|---|:---:|")).toBe(true);
    expect(isTableSeparator("--- | ---")).toBe(true);
    expect(isTableSeparator("| a | b |")).toBe(false);
    expect(isTableSeparator(undefined)).toBe(false);
  });

  it("tells a rule or underline from text", () => {
    expect(isDecorativeLine("***")).toBe(true);
    expect(isDecorativeLine("- - -")).toBe(true);
    expect(isDecorativeLine("|---|---|")).toBe(true);
    expect(isDecorativeLine("- Jane")).toBe(false);
    expect(isHeadingUnderline("====")).toBe(true);
    expect(isHeadingUnderline("- Jane")).toBe(false);
    expect(isHeadingUnderline(undefined)).toBe(false);
  });
});

describe("plainText", () => {
  it("removes paired emphasis, code, strikethrough, and links, keeping their text", () => {
    expect(plainText("**Bold** __strong__ ~~old~~ `code` _it_ *it* [Link](https://x)")).toBe(
      "Bold strong old code it it Link",
    );
  });

  it("keeps an underscore inside a word", () => {
    expect(plainText("first_last and _jdoe_")).toBe("first_last and jdoe");
  });
});
