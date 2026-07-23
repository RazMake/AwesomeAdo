import { parseAdoContext, type AdoContext } from "../navigation/AdoContext";
import { ADO_HOST_MATCH_PATTERNS } from "../navigation/AdoHost";
import { isAdoQueryUrl } from "../navigation/AdoQueryRoute";

/**
 * Finds the open ADO Query tab that best represents where the user is working.
 *
 * Shared by every chrome.tabs-backed reader (theme/identity and project metadata) so the tab-choice
 * heuristic lives in exactly one place. This and the readers are the only code allowed to touch
 * chrome.tabs.
 */
export async function pickCurrentAdoQueryTab(): Promise<chrome.tabs.Tab | undefined> {
  // Scan every open ADO tab, NOT just active ones: the options page uses open_in_tab, so opening
  // it makes the options tab active and pushes the ADO Query tab the user came from into the
  // background of the same window — an { active: true } scan would miss that tab entirely.
  // Reading tab URLs here is allowed by the manifest host permissions for these origins.
  const tabs = await chrome.tabs.query({ url: [...ADO_HOST_MATCH_PATTERNS] });
  return pickQueryTab(tabs);
}

/** The current ADO Query tab's messageable id and URL paired with its parsed organization/project. */
export interface AdoQueryTabContext {
  tabId: number;
  url: string;
  context: AdoContext;
}

/**
 * Pick the current ADO Query tab and parse its org/project, or null when no such tab is messageable.
 *
 * Both chrome.tabs-backed readers first need the same thing — a tab with both a numeric id (to send
 * a message to its content script) and a parseable ADO context — so this pairs the two lookups in
 * one place to keep the readers free of duplicated guard logic.
 */
export async function readCurrentAdoQueryContext(): Promise<AdoQueryTabContext | null> {
  const queryTab = await pickCurrentAdoQueryTab();
  if (!queryTab?.url || queryTab.id === undefined) {
    return null;
  }
  const context = parseAdoContext(queryTab.url);
  if (context === null) {
    return null;
  }
  return { tabId: queryTab.id, url: queryTab.url, context };
}

/**
 * Choose the ADO Query tab that best represents where the user is working. Prefer one still active
 * in its window; otherwise fall back to the most recently accessed Query tab so the panel reflects
 * the tab the user most likely came from when several ADO tabs are open.
 */
function pickQueryTab(tabs: chrome.tabs.Tab[]): chrome.tabs.Tab | undefined {
  const queryTabs = tabs.filter((tab) => typeof tab.url === "string" && isAdoQueryUrl(tab.url));
  const activeQueryTab = queryTabs.find((tab) => tab.active);
  if (activeQueryTab) {
    return activeQueryTab;
  }
  return queryTabs.reduce<chrome.tabs.Tab | undefined>((mostRecent, tab) => {
    if (mostRecent === undefined) {
      return tab;
    }
    return (tab.lastAccessed ?? 0) > (mostRecent.lastAccessed ?? 0) ? tab : mostRecent;
  }, undefined);
}
