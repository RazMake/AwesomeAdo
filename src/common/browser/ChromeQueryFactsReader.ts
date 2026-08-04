import {
  buildAdoQueryDefinitionUrl,
  parseQueryDefinition,
  parseQueryFolder,
  parseQueryTagFilter,
} from "../ado/QueryDefinition";

import { executeAdoRequestInPage, type AdoPageRequestOutcome } from "./executeAdoRequestInPage";
import { readCurrentAdoTabContext } from "./pickAdoQueryTab";

/** What a saved query itself says, used to pre-fill the binding form's matching fields. */
export interface QueryFacts {
  /** The tag the query selects its results by, or null when it filters on no single tag. */
  tag: string | null;
  /** The folder the query is filed in, or null when its location could not be read. */
  folder: string | null;
}

/** Reads the values a saved query can pre-fill a binding with. */
export interface IQueryFactsReader {
  read(queryId: string): Promise<QueryFacts>;
}

/** Nothing could be read; every field the user could have typed themselves simply stays empty. */
const NO_FACTS: QueryFacts = { tag: null, folder: null };

/**
 * `IQueryFactsReader` backed by chrome.tabs + chrome.scripting.
 *
 * The options page cannot reach the credentialed Azure DevOps REST API from its own origin, so the
 * saved query is read by injecting a fetch into an open ADO tab's MAIN world — the same route the
 * project metadata takes (see `ChromeAdoMetadataReader`).
 *
 * Tag and folder are answered from ONE read because they come from the same query record; asking
 * twice would only double the cost of pre-filling a form the user can fill in by hand.
 *
 * Every failure answers empty facts rather than throwing: this only pre-fills fields the user can
 * type themselves, so a closed tab or a refused read must never block editing the binding.
 */
export class ChromeQueryFactsReader implements IQueryFactsReader {
  async read(queryId: string): Promise<QueryFacts> {
    const resolved = await readCurrentAdoTabContext();
    const url = resolved === null ? null : buildAdoQueryDefinitionUrl(resolved.url, queryId);
    if (resolved === null || url === null) {
      return NO_FACTS;
    }
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: resolved.tabId },
        world: "MAIN",
        func: executeAdoRequestInPage,
        args: [{ operation: "read", url }],
      });
      const raw = (results[0]?.result as AdoPageRequestOutcome | undefined)?.raw;
      return {
        tag: parseQueryTagFilter(parseQueryDefinition(raw)),
        folder: parseQueryFolder(raw),
      };
    } catch {
      // Injection fails on a closed, navigated, or restricted tab; the fields simply stay empty.
      return NO_FACTS;
    }
  }
}
