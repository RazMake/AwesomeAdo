import { EMPTY_ADO_METADATA, type AdoMetadata } from "../ado/AdoMetadata";
import {
  buildAdoMetadataUrls,
  parseDateFieldReferenceNames,
  parseTeams,
  parseWorkItemTypes,
  type AdoMetadataUrls,
} from "../ado/fetchAdoMetadata";

import type { AdoMetadataContext, IAdoMetadataReader } from "./IAdoMetadataReader";
import { fetchAdoRawInPage, type AdoRawMetadata } from "./fetchAdoRawInPage";
import { readCurrentAdoQueryContext } from "./pickAdoQueryTab";

/**
 * IAdoMetadataReader backed by chrome.tabs + chrome.scripting. Identity (org/project) is parsed from
 * the tab URL; project metadata is fetched by injecting a fetch into the ADO tab's MAIN
 * (page) world — the only context that is both same-origin with the ADO REST APIs and carries the
 * user's SameSite session cookies (see `fetchAdoRawInPage`). This is the only place allowed to
 * reference chrome.tabs/chrome.scripting, keeping the options controller browser-agnostic.
 */
export class ChromeAdoMetadataReader implements IAdoMetadataReader {
  async read(): Promise<AdoMetadataContext | null> {
    const resolved = await readCurrentAdoQueryContext();
    if (resolved === null) {
      return null;
    }
    const metadata = await this.readMetadata(resolved.tabId, resolved.url);
    return { ...resolved.context, ...metadata };
  }

  private async readMetadata(tabId: number, href: string): Promise<AdoMetadata> {
    const urls = buildAdoMetadataUrls(href);
    if (urls === null) {
      // A folder/org-level tab has no project to query, so org/project render with empty pickers.
      return { ...EMPTY_ADO_METADATA };
    }
    const raw = await this.fetchInPage(tabId, urls);
    return {
      teams: parseTeams(raw?.teams),
      // The type list names each type's fields but not their data type, so the field list resolves
      // which are dates; passing the set attaches each type's ETA-eligible date fields.
      workItemTypes: parseWorkItemTypes(
        raw?.workItemTypes,
        parseDateFieldReferenceNames(raw?.fields),
      ),
    };
  }

  private async fetchInPage(
    tabId: number,
    urls: AdoMetadataUrls,
  ): Promise<AdoRawMetadata | undefined> {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: "MAIN",
        func: fetchAdoRawInPage,
        args: [urls.teamsUrl, urls.workItemTypesUrl, urls.fieldsUrl],
      });
      return results[0]?.result as AdoRawMetadata | undefined;
    } catch {
      // Injection fails on a closed/navigated/restricted tab; degrade to empty so org/project show.
      return undefined;
    }
  }
}
