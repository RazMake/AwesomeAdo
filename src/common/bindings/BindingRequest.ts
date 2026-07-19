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

export interface OpenOptionsMessage {
  type: typeof OPEN_OPTIONS_MESSAGE;
}

export function isOpenOptionsMessage(value: unknown): value is OpenOptionsMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (value as Partial<OpenOptionsMessage>).type === OPEN_OPTIONS_MESSAGE;
}

const QUERY_ID_PARAM = "queryId";
const QUERY_NAME_PARAM = "queryName";
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

/** The extension-relative options-page URL with no query pre-selected. Pass to `chrome.runtime.getURL`. */
export function optionsPath(): string {
  return OPTIONS_PAGE;
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
