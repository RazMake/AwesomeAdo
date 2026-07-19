import type { AdoQueryTab } from "../navigation/AdoContext";

/**
 * Lists the open Azure DevOps tabs that each show a single saved query.
 *
 * Segregated from IAdoTabReader (Interface Segregation): the options binding form's "scan all tabs"
 * mode needs the full set of query tabs with their names, not the single active tab's org/project.
 * Depending on THIS keeps the binding controller free of chrome.tabs and unit-testable with a fake.
 */
export interface IAdoQueryTabsReader {
  /** Every open ADO tab that shows a single saved query, each with its best-effort display name. */
  readQueryTabs(): Promise<AdoQueryTab[]>;
}
