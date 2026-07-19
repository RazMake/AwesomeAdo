import {
  ADO_QUERY_NAME_REQUEST,
  type AdoQueryNameResponse,
  type AdoQueryTab,
} from "../navigation/AdoContext";
import { ADO_HOST_MATCH_PATTERNS } from "../navigation/AdoHost";
import { parseAdoQueryId } from "../navigation/AdoQueryRoute";

import type { IAdoQueryTabsReader } from "./IAdoQueryTabsReader";
import { requestFromTab } from "./requestFromTab";

/**
 * IAdoQueryTabsReader backed by chrome.tabs. Like ChromeAdoTabReader, this is one of the only places
 * allowed to reference chrome.tabs, keeping the options controllers browser-agnostic and testable.
 *
 * The query id comes from each tab's URL (allowed by the manifest host permissions); the display
 * name only exists in the rendered page, so it is requested from the tab's already-injected content
 * script — no extra scripting permission required. A tab with no receiver yields a null name.
 */
export class ChromeAdoQueryTabsReader implements IAdoQueryTabsReader {
  async readQueryTabs(): Promise<AdoQueryTab[]> {
    const tabs = await chrome.tabs.query({ url: [...ADO_HOST_MATCH_PATTERNS] });
    const byId = new Map<string, number>();
    for (const tab of tabs) {
      if (typeof tab.url !== "string" || tab.id === undefined) {
        continue;
      }
      const queryId = parseAdoQueryId(tab.url);
      // The same query can be open in several tabs; keep the first so each query appears once.
      if (queryId !== null && !byId.has(queryId)) {
        byId.set(queryId, tab.id);
      }
    }
    const result: AdoQueryTab[] = [];
    for (const [queryId, tabId] of byId) {
      result.push({ queryId, queryName: await this.readQueryName(tabId) });
    }
    return result;
  }

  private async readQueryName(tabId: number): Promise<string | null> {
    // No content-script receiver yet (e.g. a tab loaded before the extension) → name unknown.
    return requestFromTab<AdoQueryNameResponse, string | null>(
      tabId,
      { type: ADO_QUERY_NAME_REQUEST },
      (response) => {
        const name = response?.name;
        return typeof name === "string" && name.length > 0 ? name : null;
      },
      null,
    );
  }
}
