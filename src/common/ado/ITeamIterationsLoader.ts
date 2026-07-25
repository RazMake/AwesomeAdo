import type { TeamIteration } from "./TeamIteration";

/**
 * Loads a team's iterations (sprints) so the sprint picker can offer a window around the current one.
 *
 * The real implementation fetches from Azure DevOps (via the background worker's MAIN-world fetch); a
 * test fake returns canned iterations. Kept as an abstraction so sprint-filtering views depend on the
 * contract, not on `chrome.runtime` (Dependency Inversion).
 */
export interface ITeamIterationsLoader {
  /** Load the given team's iterations in chronological order; empty on any failure or unknown team. */
  loadIterations(team: string): Promise<TeamIteration[]>;
}
