/**
 * The content→background message contract for loading a team's iterations (sprints).
 *
 * A content script runs in an isolated world whose origin is `chrome-extension://…`, so it cannot
 * reach the credentialed ADO REST API itself (CORS-blocked; a same-origin fetch from the extension
 * page drops ADO's SameSite session cookies). Only the background service worker can run the
 * MAIN-world fetch that carries the signed-in session, so the content side names the team and the
 * worker hands back the raw body for parsing. Keeping the shape here means both ends agree on one
 * contract instead of drifting apart. The team is a plain setting, but the request URL is still built
 * background-side from the SENDER's trusted tab URL, so this stays a closed "read this team's
 * iterations" operation, not a fetch-any-URL proxy.
 */
export const LOAD_TEAM_ITERATIONS_MESSAGE = "awesomeado:load-team-iterations";

export interface LoadTeamIterationsMessage {
  type: typeof LOAD_TEAM_ITERATIONS_MESSAGE;
  team: string;
}

export interface LoadTeamIterationsResponse {
  /** The raw `_apis/work/teamsettings/iterations` body, or null on any failure. */
  raw: unknown;
}

export function isLoadTeamIterationsMessage(value: unknown): value is LoadTeamIterationsMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<LoadTeamIterationsMessage>;
  return candidate.type === LOAD_TEAM_ITERATIONS_MESSAGE && typeof candidate.team === "string";
}
