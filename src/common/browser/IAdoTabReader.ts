import type { AdoTabContext } from "../navigation/AdoContext";

/**
 * Reads the Azure DevOps identity (and rendered theme) of the ADO Query tab the user is on.
 *
 * Segregated from the storage abstraction (Interface Segregation): the options page depends on
 * THIS to fill the "ADO Configuration" panel and resolve the "auto" theme, without ever touching
 * chrome.tabs directly — which keeps the controller unit-testable with a fake.
 */
export interface IAdoTabReader {
  /** Resolve the active ADO Query tab's context, or null when no such tab is open. */
  read(): Promise<AdoTabContext | null>;
}
