import {
  ADO_THEME_REQUEST,
  type AdoTabContext,
  type AdoTheme,
  type AdoThemeResponse,
} from "../navigation/AdoContext";
import { parseAdoQueryId } from "../navigation/AdoQueryRoute";

import type { IAdoTabReader } from "./IAdoTabReader";
import { pickCurrentAdoQueryTab, readCurrentAdoQueryContext } from "./pickAdoQueryTab";
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
    const resolved = await readCurrentAdoQueryContext();
    if (resolved === null) {
      return null;
    }
    return { ...resolved.context, theme: await this.readTheme(resolved.tabId) };
  }

  /**
   * The GUID of the single saved query the user's current ADO tab is on, or null when that tab is a
   * query folder/list (no GUID) or no ADO Query tab is open. Deliberately lighter than `read()`: the
   * binding form only needs to preselect the query, so this skips the content-script theme round-trip.
   */
  async readCurrentQueryId(): Promise<string | null> {
    const queryTab = await pickCurrentAdoQueryTab();
    return queryTab?.url ? parseAdoQueryId(queryTab.url) : null;
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
