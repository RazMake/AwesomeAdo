import { buildQueryFolderChildrenUrl, parseQueryFolders } from "../ado/fetchAdoMetadata";

import { executeAdoRequestInPage, type AdoPageRequestOutcome } from "./executeAdoRequestInPage";
import { readCurrentAdoTabContext } from "./pickAdoQueryTab";

/** Lists the folders nested inside one saved-query folder. */
export interface IQueryFolderReader {
  /** The folders under `folderPath`, or an empty list when they cannot be read. */
  readChildFolders(folderPath: string): Promise<readonly string[]>;
}

/**
 * `IQueryFolderReader` backed by chrome.tabs + chrome.scripting.
 *
 * WHY this exists at all: Azure DevOps answers the saved-query hierarchy at most two levels deep and
 * caps a node at 1000 children, so a large project's folders cannot be listed in one read — an
 * O365-sized project has thousands of folders below that boundary. Walking the whole tree up front
 * would be both enormously slow and still incomplete, so the folders under a given folder are read
 * only when the user shows interest in that folder.
 *
 * Like the other options-page readers this goes through an open ADO tab's MAIN world, the only
 * context that is both same-origin with the REST API and carries the signed-in session. Every
 * failure answers an empty list: this only adds suggestions to a field the user can type by hand.
 */
export class ChromeQueryFolderReader implements IQueryFolderReader {
  async readChildFolders(folderPath: string): Promise<readonly string[]> {
    const resolved = await readCurrentAdoTabContext();
    const url = resolved === null ? null : buildQueryFolderChildrenUrl(resolved.url, folderPath);
    if (resolved === null || url === null) {
      return [];
    }
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: resolved.tabId },
        world: "MAIN",
        func: executeAdoRequestInPage,
        args: [{ operation: "read", url }],
      });
      const outcome = results[0]?.result as AdoPageRequestOutcome | undefined;
      return parseQueryFolders(outcome?.raw);
    } catch {
      // Injection fails on a closed, navigated, or restricted tab; the field keeps what it had.
      return [];
    }
  }
}
