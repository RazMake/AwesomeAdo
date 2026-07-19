import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ADO_HOST_MATCH_PATTERNS, isSupportedAdoHost, VISUAL_STUDIO_SUFFIX } from "./AdoHost";

describe("isSupportedAdoHost", () => {
  const supported = [
    "https://dev.azure.com/org/project/_queries",
    "https://contoso.visualstudio.com/project/_queries",
  ];
  for (const url of supported) {
    it(`accepts ${url}`, () => {
      expect(isSupportedAdoHost(new URL(url))).toBe(true);
    });
  }

  it("rejects non-HTTPS ADO URLs", () => {
    expect(isSupportedAdoHost(new URL("http://dev.azure.com/org/_queries"))).toBe(false);
  });

  it("rejects unrelated hosts", () => {
    expect(isSupportedAdoHost(new URL("https://example.com/_queries"))).toBe(false);
  });

  it("rejects a lookalike that only embeds the suffix earlier in the host", () => {
    // Security: the suffix check must be anchored so `fake.visualstudio.com.evil.com` is not ADO.
    expect(isSupportedAdoHost(new URL("https://fake.visualstudio.com.evil.com/_queries"))).toBe(
      false,
    );
  });
});

describe("ADO_HOST_MATCH_PATTERNS", () => {
  it("uses the visualstudio suffix wildcard", () => {
    expect(ADO_HOST_MATCH_PATTERNS).toContain(`https://*${VISUAL_STUDIO_SUFFIX}/*`);
  });

  it("stays in sync with the manifest content_scripts matches", () => {
    // The manifest cannot import TypeScript, so this pins the two hand-maintained copies together:
    // if they diverge, the tab readers would scan a different origin set than where the content
    // script is injected, and probes would silently return null for tabs that do have a receiver.
    const manifestPath = resolve(process.cwd(), "src/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      content_scripts: { matches: string[] }[];
    };
    expect(manifest.content_scripts[0]?.matches).toEqual([...ADO_HOST_MATCH_PATTERNS]);
  });
});
