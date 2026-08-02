import { EMPTY_ADO_METADATA, type AdoMetadata } from "../ado/AdoMetadata";
import {
  buildAdoMetadataUrls,
  parseAreaPaths,
  parseDateFieldReferenceNames,
  parseTeams,
  parseWorkItemTypes,
  type AdoMetadataUrls,
} from "../ado/fetchAdoMetadata";
import { buildAdoContextUrl, type AdoContext } from "../navigation/AdoContext";

import type { AdoMetadataContext, IAdoMetadataReader } from "./IAdoMetadataReader";
import { fetchAdoRawInPage, type AdoRawMetadata } from "./fetchAdoRawInPage";
import { readCurrentAdoTabContext } from "./pickAdoQueryTab";

/** Reads the Azure DevOps scope the user has configured, or null when none is stored yet. */
export type ConfiguredAdoScopeReader = () => Promise<AdoContext | null>;

/**
 * IAdoMetadataReader backed by chrome.tabs + chrome.scripting. Identity (org/project) is parsed from
 * the tab URL; project metadata is fetched by injecting a fetch into the ADO tab's MAIN
 * (page) world — the only context that is both same-origin with the ADO REST APIs and carries the
 * user's SameSite session cookies (see `fetchAdoRawInPage`). This is the only place allowed to
 * reference chrome.tabs/chrome.scripting, keeping the options controller browser-agnostic.
 *
 * When the open tab names no project — an org home page, a folder route — the CONFIGURED project is
 * used to address the REST calls instead, which is what lets the options page keep listing teams and
 * work item types away from a project page. That substitution never changes the org/project this
 * reader REPORTS: those stay whatever the tab itself says, so the options page can still tell a
 * detected value apart from one the user already saved.
 */
export class ChromeAdoMetadataReader implements IAdoMetadataReader {
  constructor(
    private readonly readConfiguredScope: ConfiguredAdoScopeReader = () => Promise.resolve(null),
  ) {}

  async read(): Promise<AdoMetadataContext | null> {
    const resolved = await readCurrentAdoTabContext();
    if (resolved === null) {
      return null;
    }
    const metadata = await this.readMetadata(resolved.tabId, resolved.url, resolved.context);
    return { ...resolved.context, ...metadata };
  }

  private async readMetadata(
    tabId: number,
    href: string,
    context: AdoContext,
  ): Promise<AdoMetadata> {
    const urls = buildAdoMetadataUrls(href) ?? (await this.urlsForConfiguredProject(href, context));
    if (urls === null) {
      // Neither the tab nor the settings name a project to query, so the pickers stay empty.
      return { ...EMPTY_ADO_METADATA };
    }
    const raw = await this.fetchInPage(tabId, urls);
    return {
      teams: parseTeams(raw?.teams),
      areaPaths: parseAreaPaths(raw?.areaPaths),
      // The type list names each type's fields but not their data type, so the field list resolves
      // which are dates; passing the set attaches each type's ETA-eligible date fields.
      workItemTypes: parseWorkItemTypes(
        raw?.workItemTypes,
        parseDateFieldReferenceNames(raw?.fields),
      ),
    };
  }

  /**
   * Address the configured project through the open tab's own origin, or null when nothing is
   * configured or it names a different organization than the tab shows — reading one org's project
   * list through another org's session would only fail.
   */
  private async urlsForConfiguredProject(
    href: string,
    context: AdoContext,
  ): Promise<AdoMetadataUrls | null> {
    const configured = await this.readConfiguredScope();
    if (
      configured === null ||
      configured.organization.toLowerCase() !== context.organization.toLowerCase()
    ) {
      return null;
    }
    const projectHref = buildAdoContextUrl(href, configured);
    return projectHref === null ? null : buildAdoMetadataUrls(projectHref);
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
        args: [urls.teamsUrl, urls.workItemTypesUrl, urls.fieldsUrl, urls.areaPathsUrl],
      });
      return results[0]?.result as AdoRawMetadata | undefined;
    } catch {
      // Injection fails on a closed/navigated/restricted tab; degrade to empty so org/project show.
      return undefined;
    }
  }
}
