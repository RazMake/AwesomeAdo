import type { IMentionDirectory } from "../ado/IMentionDirectory";
import { collectMentionIdentityIds, parseAdoIdentityNames } from "../ado/mentionIdentities";
import type { ILogger } from "../logging/ILogger";

import {
  RESOLVE_ADO_IDENTITY_NAMES_MESSAGE,
  type ResolveAdoIdentityNamesMessage,
  type ResolveAdoIdentityNamesResponse,
} from "./AdoIdentityNamesRequest";

/** Sends a resolve-identity-names request and resolves the background worker's reply, if any. */
export type SendIdentityNamesRequest = (
  message: ResolveAdoIdentityNamesMessage,
) => Promise<ResolveAdoIdentityNamesResponse | undefined>;

/**
 * How many unresolved identity ids one log line names before it stops.
 *
 * Enough to chase down "why is that mention anonymous?" without letting one bad board push every
 * other line out of the bounded diagnostics buffer.
 */
const UNRESOLVED_IDS_LOGGED = 10;

/**
 * The `@`-mention directory, reached by messaging the background service worker.
 *
 * A content script cannot reach the credentialed ADO REST API directly (see
 * `AdoIdentityNamesRequest`'s doc comment), so this directory hands the collected identity ids to
 * the worker and parses whatever raw bodies come back. The `send` function is injected so this class
 * never touches `chrome.runtime` itself (Dependency Inversion). A failure degrades to "no names
 * resolved" (logged), so a mention keeps its neutral placeholder rather than breaking the view.
 *
 * Every answer is remembered for the lifetime of the directory, and an id is only ever asked about
 * ONCE: the same people are mentioned across a board's descriptions and its notes, panels open one
 * at a time, and each repaint re-renders the same content. Without the memo, opening five notes
 * panels would re-ask ADO about the same handful of teammates five times.
 */
export class MessagingMentionDirectory implements IMentionDirectory {
  private readonly names = new Map<string, string>();
  /**
   * Ids with a SETTLED answer: named, or put to Azure DevOps and authoritatively not recognized.
   *
   * An id only lands here after a read that actually COMPLETED. A failed or truncated read leaves it
   * out, so the next render asks again instead of remembering a transient outage as "this person has
   * no name" for the rest of the session.
   */
  private readonly settled = new Set<string>();
  /**
   * The read currently covering each id.
   *
   * Keyed per id rather than per call because callers overlap constantly: the board resolves its
   * descriptions while a notes panel resolves its notes, and the same teammates appear in both. A
   * second caller must AWAIT the read a first one already started — being told "already asked" and
   * returning immediately is what left a mention anonymous purely because another panel had asked
   * about that person a moment earlier.
   */
  private readonly inFlight = new Map<string, Promise<void>>();

  constructor(
    private readonly send: SendIdentityNamesRequest,
    private readonly logger: ILogger,
  ) {}

  knownNames(): ReadonlyMap<string, string> {
    return this.names;
  }

  async resolveNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    const wanted = [...new Set(ids.map((id) => id.toLowerCase()))];
    const reads = new Set<Promise<void>>();
    const missing: string[] = [];
    for (const id of wanted) {
      const running = this.inFlight.get(id);
      if (running !== undefined) {
        reads.add(running);
      } else if (!this.settled.has(id)) {
        missing.push(id);
      }
    }
    if (missing.length > 0) {
      const read = this.read(missing);
      for (const id of missing) {
        this.inFlight.set(id, read);
      }
      reads.add(read);
    }
    // Awaiting every read that covers a wanted id — including ones another caller started — is what
    // makes the returned map complete for THIS caller, whoever happened to ask first.
    await Promise.all(reads);
    return this.names;
  }

  /** One round-trip for `ids`; never rejects, and always releases its in-flight claim. */
  private async read(ids: readonly string[]): Promise<void> {
    try {
      const response = await this.send({
        type: RESOLVE_ADO_IDENTITY_NAMES_MESSAGE,
        ids: [...ids],
      });
      this.record(ids, response);
    } catch (error) {
      // Left unsettled on purpose: a rejected round-trip (the worker restarted, the port closed) is
      // exactly the case a later render should retry.
      this.logger.error("Could not resolve Azure DevOps mention identities", error);
    } finally {
      for (const id of ids) {
        this.inFlight.delete(id);
      }
    }
  }

  /** Fold one worker reply into the directory, and say in the log what it did NOT answer. */
  private record(
    ids: readonly string[],
    response: ResolveAdoIdentityNamesResponse | undefined,
  ): void {
    const complete = response?.complete === true;
    for (const [id, name] of parseAdoIdentityNames(response?.raw ?? [])) {
      this.names.set(id, name);
    }
    const named = ids.filter((id) => this.names.has(id));
    const unnamed = ids.filter((id) => !this.names.has(id));
    // A name in hand is settled for good. An id with no name is only settled when the read itself
    // COMPLETED — Azure DevOps answered and simply does not recognize that identity, which no amount
    // of retrying will change. Anything else stays open for the next render.
    for (const id of complete ? ids : named) {
      this.settled.add(id);
    }
    this.logger.info(
      unnamed.length === 0
        ? `Mention resolution named all ${ids.length} requested identity id(s).`
        : describeMiss(ids.length, named.length, unnamed, complete),
    );
  }
}

/**
 * The log line for a read that left someone anonymous.
 *
 * The unresolved IDS are named, never the names that resolved: a display name IS a person's name
 * (AGENTS.md §9), while an identity id is the identifier that makes "why is this mention anonymous?"
 * answerable at all. The line also says whether it is worth waiting for — a completed read means ADO
 * gave its final answer, anything else will be tried again.
 */
function describeMiss(
  requested: number,
  named: number,
  unnamed: readonly string[],
  complete: boolean,
): string {
  const listed = unnamed.slice(0, UNRESOLVED_IDS_LOGGED).join(", ");
  const rest = unnamed.length > UNRESOLVED_IDS_LOGGED ? ", …" : "";
  const reason = complete ? "Azure DevOps did not recognize" : "no answer arrived for";
  const outcome = complete
    ? "Those mentions stay unresolved."
    : "They are retried on the next render.";
  return (
    `Mention resolution named ${named} of ${requested} identity id(s); ` +
    `${reason} ${unnamed.length} (${listed}${rest}). ${outcome}`
  );
}

/**
 * Resolve every `@`-mention found in `sources` (descriptions, note bodies, ADO's own rendered HTML).
 *
 * The collect-then-resolve pair is the whole point of the bulk contract, and both callers — the
 * board before it paints its descriptions, and a notes panel after it fetches — need exactly this
 * sequence, so it lives here rather than being written out twice.
 */
export function resolveMentionsIn(
  directory: IMentionDirectory,
  sources: Iterable<string | null | undefined>,
): Promise<ReadonlyMap<string, string>> {
  const ids = collectMentionIdentityIds(sources);
  return ids.length === 0 ? Promise.resolve(directory.knownNames()) : directory.resolveNames(ids);
}
