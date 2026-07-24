/**
 * The contract for opening the options page to bind one query.
 *
 * The top-bar prompt lives in a content script, which cannot open an extension page directly, so it
 * asks the background service worker to do it via this typed message. The service worker turns the
 * request into an options-page URL carrying the query id; the options page reads that id back to
 * pre-select the query on the binding form. Keeping the query-string key and its parsing here means
 * both ends agree on one contract.
 */
export const OPEN_BINDING_SETTINGS_MESSAGE = "awesomeado:open-binding-settings";

export interface OpenBindingSettingsMessage {
  type: typeof OPEN_BINDING_SETTINGS_MESSAGE;
  queryId: string;
  /**
   * The query's display name, read best-effort from the ADO page the button was clicked on. Carried
   * alongside the id so the binding form can show a read-only name without re-scraping ADO; absent
   * when the name could not be determined.
   */
  queryName?: string;
}

export function isOpenBindingSettingsMessage(value: unknown): value is OpenBindingSettingsMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<OpenBindingSettingsMessage>;
  return (
    candidate.type === OPEN_BINDING_SETTINGS_MESSAGE &&
    typeof candidate.queryId === "string" &&
    (candidate.queryName === undefined || typeof candidate.queryName === "string")
  );
}

/**
 * Request to open the general options page (no specific query). Like the bind request, the content
 * script cannot open an extension page itself, so it asks the background service worker to do it.
 */
export const OPEN_OPTIONS_MESSAGE = "awesomeado:open-options";

/**
 * The options-page sections the top-bar menu can deep-link into. Kept as a named union (rather than
 * a bare string) so both ends agree on the exact set of link targets and an unknown value is
 * rejected instead of silently activating no tab. Only "diagnostics" is deep-linkable today.
 */
export type OptionsSection = "diagnostics";

const OPTIONS_SECTIONS: readonly OptionsSection[] = ["diagnostics"];

function isOptionsSection(value: unknown): value is OptionsSection {
  return typeof value === "string" && (OPTIONS_SECTIONS as readonly string[]).includes(value);
}

export interface OpenOptionsMessage {
  type: typeof OPEN_OPTIONS_MESSAGE;
  /**
   * The section to reveal when the page opens (e.g. the Diagnostics log for "View Log"). Absent when
   * the general options page should open on its default tab.
   */
  section?: OptionsSection;
}

export function isOpenOptionsMessage(value: unknown): value is OpenOptionsMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<OpenOptionsMessage>;
  return (
    candidate.type === OPEN_OPTIONS_MESSAGE &&
    (candidate.section === undefined || isOptionsSection(candidate.section))
  );
}

/**
 * Sent from the service worker to an options page that is already open, telling it to reveal a
 * section without a reload. A fresh options tab reads the section from its URL on load, but an
 * already-open tab has finished loading and would otherwise stay on whichever tab the user left it
 * on — so reusing that tab (instead of spawning a duplicate) needs this in-page nudge to switch.
 */
export const REVEAL_OPTIONS_SECTION_MESSAGE = "awesomeado:reveal-options-section";

export interface RevealOptionsSectionMessage {
  type: typeof REVEAL_OPTIONS_SECTION_MESSAGE;
  section: OptionsSection;
}

export function isRevealOptionsSectionMessage(
  value: unknown,
): value is RevealOptionsSectionMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<RevealOptionsSectionMessage>;
  return candidate.type === REVEAL_OPTIONS_SECTION_MESSAGE && isOptionsSection(candidate.section);
}

const QUERY_ID_PARAM = "queryId";
const QUERY_NAME_PARAM = "queryName";
const SECTION_PARAM = "section";
const OPTIONS_PAGE = "options/options.html";

/**
 * Build the extension-relative options-page URL that pre-selects `queryId` for binding, carrying the
 * query's `queryName` when it is known. Pass the result to `chrome.runtime.getURL` before opening it
 * in a tab.
 */
export function bindingSettingsPath(queryId: string, queryName?: string): string {
  const params = new URLSearchParams({ [QUERY_ID_PARAM]: queryId });
  if (queryName !== undefined && queryName.length > 0) {
    params.set(QUERY_NAME_PARAM, queryName);
  }
  return `${OPTIONS_PAGE}?${params.toString()}`;
}

/**
 * The extension-relative options-page URL. Passing a `section` deep-links into that tab (e.g.
 * "diagnostics" for "View Log"); with no section the page opens on its default tab. Pass the result
 * to `chrome.runtime.getURL`.
 */
export function optionsPath(section?: OptionsSection): string {
  if (section === undefined) {
    return OPTIONS_PAGE;
  }
  const params = new URLSearchParams({ [SECTION_PARAM]: section });
  return `${OPTIONS_PAGE}?${params.toString()}`;
}

/** Read the query id the top-bar prompt passed in the options-page URL, or null when absent. */
export function readQueryIdFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get(QUERY_ID_PARAM);
  return value !== null && value.length > 0 ? value : null;
}

/** Read the query name the top-bar prompt passed in the options-page URL, or null when absent. */
export function readQueryNameFromSearch(search: string): string | null {
  const value = new URLSearchParams(search).get(QUERY_NAME_PARAM);
  return value !== null && value.length > 0 ? value : null;
}

/** Read the section to reveal from the options-page URL, or null when absent or unrecognized. */
export function readOptionsSectionFromSearch(search: string): OptionsSection | null {
  const value = new URLSearchParams(search).get(SECTION_PARAM);
  return isOptionsSection(value) ? value : null;
}

// One place maps a deep-linkable section to the options-page tab element that presents it, so the
// load-time deep-link and the already-open "reveal" path can never drift onto different tab ids.
const SECTION_TAB_IDS: Record<OptionsSection, string> = { diagnostics: "tab-diagnostics" };

/** The options-page tab element id that presents `section` (e.g. the Diagnostics log). */
export function sectionTabId(section: OptionsSection): string {
  return SECTION_TAB_IDS[section];
}
