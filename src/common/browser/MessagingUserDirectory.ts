import type { DirectoryUser, IUserDirectory } from "../ado/IUserDirectory";
import { parseAdoIdentities, MIN_IDENTITY_SEARCH_LENGTH } from "../ado/fetchAdoIdentities";
import type { ILogger } from "../logging/ILogger";

import {
  SEARCH_ADO_IDENTITIES_MESSAGE,
  type SearchAdoIdentitiesMessage,
  type SearchAdoIdentitiesResponse,
} from "./AdoIdentityRequest";

/** Sends a search-identities request and resolves the background worker's reply, if any. */
export type SendIdentitySearchRequest = (
  message: SearchAdoIdentitiesMessage,
) => Promise<SearchAdoIdentitiesResponse | undefined>;

/**
 * The Azure DevOps user directory, reached by messaging the background service worker.
 *
 * A content script cannot reach the credentialed ADO REST API directly (see `AdoIdentityRequest`'s
 * doc comment), so this directory hands the typed query to the worker and parses whatever raw body
 * comes back. The `send` function is injected so this class never touches `chrome.runtime` itself
 * (Dependency Inversion) — the composition root supplies the real `chrome.runtime.sendMessage`
 * binding, and a test supplies a fake. A failure degrades to an empty result (logged), so a picker
 * falls back to the suggestions it already holds rather than breaking the view.
 *
 * Results for a query are remembered for the lifetime of the directory: a people picker searches on
 * every keystroke, and backspacing over a name would otherwise re-ask ADO for an answer it already
 * gave. That is what keeps the control feeling instant rather than network-bound.
 */
export class MessagingUserDirectory implements IUserDirectory {
  private readonly cache = new Map<string, DirectoryUser[]>();

  constructor(
    private readonly send: SendIdentitySearchRequest,
    private readonly logger: ILogger,
  ) {}

  async search(query: string): Promise<DirectoryUser[]> {
    const normalized = query.trim().toLowerCase();
    // Below the minimum the background worker would refuse to build a request anyway; answering
    // here keeps a one-letter keystroke from costing a message round-trip.
    if (normalized.length < MIN_IDENTITY_SEARCH_LENGTH) {
      return [];
    }
    const cached = this.cache.get(normalized);
    if (cached !== undefined) {
      return cached;
    }

    try {
      const response = await this.send({ type: SEARCH_ADO_IDENTITIES_MESSAGE, query });
      if (response === undefined || response === null || response.raw === null) {
        // Not an error the user caused: an unauthenticated or non-project tab simply has nobody to
        // offer. Logged (not thrown) so an empty picker is diagnosable from the Diagnostics view.
        this.logger.info("Identity search returned no data; the picker shows no ADO matches.");
        return [];
      }
      const users = parseAdoIdentities(response.raw);
      // Only a real answer is remembered. Caching a failure would make one bad round-trip look like
      // a permanently empty directory for the rest of the session.
      this.cache.set(normalized, users);
      this.logger.info(`Identity search matched ${users.length} person(s).`);
      return users;
    } catch (error) {
      this.logger.error("Could not search Azure DevOps identities", error);
      return [];
    }
  }

  async resolve(nameOrUnique: string): Promise<DirectoryUser | null> {
    const users = await this.search(nameOrUnique);
    const target = nameOrUnique.trim().toLowerCase();
    // An exact hit on either handle is the only safe answer: returning the first ranked match would
    // silently assign work to someone whose name merely starts with what was typed.
    return (
      users.find(
        (user) =>
          user.displayName.toLowerCase() === target ||
          (user.uniqueName !== null && user.uniqueName.toLowerCase() === target),
      ) ?? null
    );
  }
}
