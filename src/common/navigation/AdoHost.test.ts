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

  it("stays in sync with every host-glob site in the manifest", () => {
    // The manifest cannot import TypeScript, so this pins the hand-maintained copies together.
    // All three sites matter, for different reasons:
    //  - content_scripts.matches: if it diverges, the tab readers scan a different origin set than
    //    where the content script is injected, and probes silently return null for tabs that do
    //    have a receiver.
    //  - host_permissions: this is the key that actually bounds chrome.scripting.executeScript, so
    //    widening it (e.g. to <all_urls>) would silently widen where MAIN-world code can be
    //    injected. Nothing else in the build would notice.
    //  - web_accessible_resources.matches: it decides which origins may load extension resources.
    const manifestPath = resolve(process.cwd(), "src/manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      host_permissions: string[];
      content_scripts: { matches: string[] }[];
      web_accessible_resources: { matches: string[] }[];
    };
    const expected = [...ADO_HOST_MATCH_PATTERNS];
    expect(manifest.content_scripts[0]?.matches).toEqual(expected);
    expect(manifest.host_permissions).toEqual(expected);
    expect(manifest.web_accessible_resources[0]?.matches).toEqual(expected);
  });
});
