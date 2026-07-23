/**
 * The Azure DevOps project metadata the options page needs to fill its team picker and area-path
 * autocomplete: the list of teams and the project's flattened area paths.
 *
 * The credentialed REST fetch that populates these is injected into the ADO tab's page world (see
 * `src/common/browser/fetchAdoRawInPage.ts`); this file only defines the shared data shapes.
 */

/** An ADO team the picker offers: its stable id plus the name shown to the user. */
export interface AdoTeam {
  id: string;
  name: string;
}

/**
 * A work item type ADO defines for the project, with everything the options UI needs to offer it:
 * its display `name`, the `color` and `icon` URL used to render it the way ADO does, and the ordered
 * list of `states` the user routes onto the board columns.
 */
export interface AdoWorkItemType {
  name: string;
  /** The ADO type color as a hex string without a leading `#` (e.g. `CC293D`). */
  color: string;
  /** The ADO icon URL for the type (already colored via its query string). */
  icon: string;
  /** The type's state names, in the order ADO returns them. */
  states: string[];
}

/** Everything the Azure DevOps options tab lists for the detected organization/project. */
export interface AdoMetadata {
  teams: AdoTeam[];
  /** User-facing area paths (e.g. `Project\Area\Team`), flattened from the classification tree. */
  areaPaths: string[];
  /** The project's work item types with their states, for the work-item-types picker. */
  workItemTypes: AdoWorkItemType[];
}

/** The empty result used whenever metadata cannot be determined, so callers never see `undefined`. */
export const EMPTY_ADO_METADATA: AdoMetadata = { teams: [], areaPaths: [], workItemTypes: [] };
