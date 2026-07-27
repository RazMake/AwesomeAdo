import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The options page is wired entirely by string id: `src/options/index.ts` resolves every control
 * with `document.querySelector("#…")` and reports a generic "the options page is missing required
 * elements" error when one is absent.
 *
 * That coupling is invisible to every other gate. Renaming or deleting an id in the markup passes
 * formatting, lint, typecheck and the coverage threshold — `index.ts` is a composition root and is
 * excluded from coverage, so even its missing-element fallbacks are never exercised — and the only
 * signal is a human loading the extension. Reading the real file off disk is the same technique
 * `AdoHost.test.ts` uses to pin the manifest, applied to the largest string-coupled contract here.
 *
 * Keep this list in step with the `querySelector` calls in `src/options/index.ts`.
 */
const REQUIRED_ELEMENT_IDS: readonly string[] = [
  // Shell + alerts
  "status",
  "config-banner",
  // Appearance
  "theme-select",
  "default-view-select",
  // Configuration import/export
  "settings-export",
  "settings-import",
  "settings-import-file",
  "settings-transfer-status",
  // Azure DevOps configuration
  "ado-organization",
  "ado-project",
  "ado-team-input",
  "ado-future-sprints",
  "ado-past-sprints",
  "ado-area-paths",
  "ado-area-paths-empty",
  "ado-area-path-add",
  "ado-wit-columns",
  "ado-wit-rows",
  "ado-work-item-types-empty",
  "ado-work-item-type-add",
  "ado-wit-eta",
  "ado-wit-eta-empty",
  "ado-wit-hierarchy",
  "ado-wit-hierarchy-empty",
  "ado-marker-tags",
  // Query bindings
  "binding-empty",
  "binding-add-card",
  "binding-add-query",
  "binding-add-view",
  "binding-add-save",
  "binding-edit-card",
  "binding-query-select",
  "binding-delete",
  "binding-view-config-card",
  "binding-view-select",
  "binding-properties",
  "binding-save",
  "binding-status",
  // Diagnostics
  "log-list",
  "log-empty",
  "log-errors-only",
  "log-sources",
  "log-export",
  "log-clear",
];

function loadOptionsDocument(): Document {
  const html = readFileSync(resolve(process.cwd(), "src/options/options.html"), "utf8");
  // Parsed with the test environment's own DOM rather than a separate jsdom instance, so this test
  // needs no extra dependency and sees the markup exactly as the browser would.
  return new DOMParser().parseFromString(html, "text/html");
}

describe("options.html element contract", () => {
  it("declares every id the options composition root resolves", () => {
    const doc = loadOptionsDocument();

    const missing = REQUIRED_ELEMENT_IDS.filter((id) => doc.getElementById(id) === null);

    expect(missing).toEqual([]);
  });

  it("declares each of those ids exactly once", () => {
    const doc = loadOptionsDocument();

    // A duplicate id makes `querySelector` resolve to whichever copy happens to come first, so the
    // page can wire a control the user is not looking at.
    const duplicated = REQUIRED_ELEMENT_IDS.filter(
      (id) => doc.querySelectorAll(`[id="${id}"]`).length > 1,
    );

    expect(duplicated).toEqual([]);
  });
});
