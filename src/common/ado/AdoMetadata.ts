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

/** Everything the Azure DevOps options tab lists for the detected organization/project. */
export interface AdoMetadata {
  teams: AdoTeam[];
  /** User-facing area paths (e.g. `Project\Area\Team`), flattened from the classification tree. */
  areaPaths: string[];
}

/** The empty result used whenever metadata cannot be determined, so callers never see `undefined`. */
export const EMPTY_ADO_METADATA: AdoMetadata = { teams: [], areaPaths: [] };
