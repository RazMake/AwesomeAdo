import {
  ADO_THEME_REQUEST,
  parseAdoContext,
  type AdoTabContext,
  type AdoTheme,
  type AdoThemeResponse,
} from "../navigation/AdoContext";
import { ADO_HOST_MATCH_PATTERNS } from "../navigation/AdoHost";
import { isAdoQueryUrl } from "../navigation/AdoQueryRoute";

import type { IAdoTabReader } from "./IAdoTabReader";
import { requestFromTab } from "./requestFromTab";

/**
 * IAdoTabReader backed by chrome.tabs. This is the ONLY place allowed to reference chrome.tabs,
 * keeping the options controller browser-agnostic and testable.
 *
 * Identity (org/project) is parsed from the tab URL; the rendered theme is requested from the
 * tab's already-injected content script, so no extra scripting permission is required.
 */
export class ChromeAdoTabReader implements IAdoTabReader {
  async read(): Promise<AdoTabContext | null> {
    // Scan every open ADO tab, NOT just active ones: the options page uses open_in_tab, so opening
    // it makes the options tab active and pushes the ADO Query tab the user came from into the
    // background of the same window — an { active: true } scan would miss that tab entirely.
    // Reading tab URLs here is allowed by the manifest host permissions for these origins.
    const tabs = await chrome.tabs.query({ url: [...ADO_HOST_MATCH_PATTERNS] });
    const queryTab = this.pickQueryTab(tabs);
    if (!queryTab?.url || queryTab.id === undefined) {
      return null;
    }
    const context = parseAdoContext(queryTab.url);
    if (context === null) {
      return null;
    }
    return { ...context, theme: await this.readTheme(queryTab.id) };
  }

  /**
   * Choose the ADO Query tab that best represents where the user is working. Prefer one still
   * active in its window; otherwise fall back to the most recently accessed Query tab so the panel
   * reflects the tab the user most likely came from when several ADO tabs are open.
   */
  private pickQueryTab(tabs: chrome.tabs.Tab[]): chrome.tabs.Tab | undefined {
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

  private async readTheme(tabId: number): Promise<AdoTheme | null> {
    // No content-script receiver yet (e.g. a tab loaded before the extension) → theme unknown.
    return requestFromTab<AdoThemeResponse, AdoTheme | null>(
      tabId,
      { type: ADO_THEME_REQUEST },
      (response) => {
        const theme = response?.theme;
        return theme === "light" || theme === "dark" ? theme : null;
      },
      null,
    );
  }
}
