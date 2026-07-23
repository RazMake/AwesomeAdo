import type { AdoMetadata } from "../ado/AdoMetadata";
import type { AdoContext } from "../navigation/AdoContext";

/** The detected ADO organization/project together with its team list and area paths. */
export interface AdoMetadataContext extends AdoContext, AdoMetadata {}

/**
 * Reads the ADO project metadata (teams + area paths) the options page's Azure DevOps tab needs.
 *
 * Segregated from IAdoTabReader (Interface Segregation): identity/theme and project metadata are
 * fetched differently — metadata needs a credentialed REST call run in the ADO tab's page world —
 * so the options page depends on whichever slice it needs, and each stays testable with a fake.
 */
export interface IAdoMetadataReader {
  /** Resolve the current ADO Query tab's metadata, or null when no such tab is open. */
  read(): Promise<AdoMetadataContext | null>;
}
