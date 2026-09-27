import type { DirectoryUser, IUserDirectory } from "../../../../common/ado/IUserDirectory";
import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import type { ILogger } from "../../../../common/logging/ILogger";

import {
  withContactAdded,
  withContactRemoved,
  withContactReplaced,
} from "./consumerContactsSource";
import { readConsumerProfile, type ConsumerContact, type ContactShape } from "./consumerProfile";
import type { MentionNames } from "./contactEntries";

const DESCRIPTION_FIELD = "System.Description";

/** What a contact editor writes through, and who it tells once a change has settled. */
export interface ConsumerContactEditorOptions {
  /** The board's one serialized write queue. */
  queue: WorkItemWriteQueue;
  /** Where a picked person's alias is looked up when the pick did not carry an address. */
  userDirectory: IUserDirectory;
  logger: ILogger;
  /**
   * Who the descriptions' `@`-mentions are, so a person already listed by mention is recognized
   * when they are added again. Optional; without it a mention matches nobody.
   */
  mentionNames?: () => MentionNames;
  /**
   * Called after every edit settles — accepted, refused, or skipped — so the board redraws the card
   * from the description Azure DevOps actually holds.
   */
  onSettled(): void;
}

/** The contact changes a Consumers View card offers, each written into the consumer's description. */
export interface ConsumerContactEditor {
  /** Append `person` to the consumer's contacts, with no role yet. */
  add(consumer: TrackedWorkItem, person: DirectoryUser): void;
  /** Put `person` in place of the `index`-th contact, keeping the role that contact held. */
  replace(consumer: TrackedWorkItem, index: number, person: DirectoryUser): void;
  /** Give the `index`-th contact `role`. */
  setRole(consumer: TrackedWorkItem, index: number, role: string): void;
  /** Delete the `index`-th contact's line from the description. */
  remove(consumer: TrackedWorkItem, index: number): void;
}

/** A description rewritten by one edit, or why the edit was not written. */
type RewriteOutcome = { description: string } | { skipped: string };

/**
 * An edit, turned into a rewrite of whatever the description holds WHEN ITS TURN COMES.
 *
 * Computing from the description at click time would lose work: a second contact added while the
 * first is still being saved would be written over a description that never had the first one.
 */
type Rewrite = (description: string) => RewriteOutcome;

const RICH_TEXT = "the description is rich text; it has to be Markdown to be editable";

/** Why a contact that shares its line with other text is left for Azure DevOps' own editor. */
const NOT_ON_OWN_LINE: Readonly<Record<Exclude<ContactShape, "own-line">, string>> = {
  "shared-line": "that contact shares its line with other people",
  "table-row": "that contact is written in a table",
  inline: "that contact is written on a labelled line outside the Contacts section",
};

/**
 * The short name a directory identity is reached at: `jdoe` for `jdoe@contoso.com` or for
 * `CONTOSO\jdoe`; null when there is no address to read one from.
 */
export function aliasOfUniqueName(uniqueName: string | null): string | null {
  const local = (uniqueName ?? "").split("\\").at(-1)?.split("@")[0]?.trim() ?? "";
  return local.length > 0 ? local : null;
}

/**
 * Edits a consumer's contacts by rewriting the Contacts section of its description.
 *
 * Edits to one consumer run strictly one after another, each reading the description the previous
 * one left behind, and every write is a single guarded patch through the board's queue with the
 * description it was derived from as `baseValue` — so a concurrent edit made in Azure DevOps is
 * reported as a conflict rather than overwritten.
 */
export function createConsumerContactEditor(
  options: ConsumerContactEditorOptions,
): ConsumerContactEditor {
  const { queue, userDirectory, logger } = options;
  const mentionNames = options.mentionNames ?? (() => new Map<string, string>());
  const turns = new Map<number, Promise<void>>();

  const persist = async (consumer: TrackedWorkItem, edit: string, rewrite: Rewrite) => {
    const base = consumer.description;
    const outcome = rewrite(base);
    if ("skipped" in outcome) {
      logger.info(`Consumer ${consumer.id} contacts: ${edit} not written — ${outcome.skipped}.`);
      return;
    }
    const result = await queue.enqueue({
      id: consumer.id,
      currentRev: () => consumer.rev,
      field: DESCRIPTION_FIELD,
      value: outcome.description,
      baseValue: base,
      // What is written is Markdown; a field still on ADO's default HTML format would otherwise show
      // the list markers and backticks as literal text.
      multilineFormat: "Markdown",
    });
    if (!result.ok || result.rev === undefined) return;
    consumer.description = outcome.description;
    consumer.rev = result.rev;
    logger.info(`Consumer ${consumer.id} contacts: ${edit} saved.`);
  };

  const schedule = (
    consumer: TrackedWorkItem,
    edit: string,
    prepare: () => Promise<Rewrite>,
  ): void => {
    const turn = (turns.get(consumer.id) ?? Promise.resolve())
      .then(async () => persist(consumer, edit, await prepare()))
      .catch((error: unknown) => {
        logger.error(`Consumer ${consumer.id} contacts: ${edit} failed.`, error);
      })
      .finally(() => options.onSettled());
    turns.set(consumer.id, turn);
  };

  const contactFor = async (
    person: DirectoryUser,
    role: string | null,
  ): Promise<ConsumerContact> => {
    let alias = aliasOfUniqueName(person.uniqueName);
    if (alias === null) {
      // A pick without an address still names someone Azure DevOps knows, so ask it for the address.
      alias = aliasOfUniqueName(
        (await userDirectory.resolve(person.displayName))?.uniqueName ?? null,
      );
    }
    return { fullName: person.displayName, alias, role };
  };

  return {
    add: (consumer, person) =>
      schedule(consumer, "add", async () => {
        const contact = await contactFor(person, null);
        return (description) => addedContact(description, contact, mentionNames());
      }),
    replace: (consumer, index, person) =>
      schedule(consumer, `replace #${index + 1}`, async () => {
        const contact = await contactFor(person, null);
        return (description) =>
          changedContact(description, index, (current) => ({ ...contact, role: current.role }));
      }),
    setRole: (consumer, index, role) =>
      schedule(
        consumer,
        `role of #${index + 1}`,
        async () => (description) =>
          changedContact(description, index, (current) => ({ ...current, role })),
      ),
    remove: (consumer, index) =>
      schedule(
        consumer,
        `remove #${index + 1}`,
        async () => (description) => changedContact(description, index, null),
      ),
  };
}

function addedContact(
  description: string,
  contact: ConsumerContact,
  mentionNames: MentionNames,
): RewriteOutcome {
  const { contacts } = readConsumerProfile(description, { mentionNames }).profile;
  if (contacts.some((listed) => samePerson(listed, contact))) {
    return { skipped: "that person is already a contact" };
  }
  const next = withContactAdded(description, contact);
  return next === null ? { skipped: RICH_TEXT } : { description: next };
}

/** Rewrite (or, for a null `change`, delete) the `index`-th contact's line. */
function changedContact(
  description: string,
  index: number,
  change: ((current: ConsumerContact) => ConsumerContact) | null,
): RewriteOutcome {
  const reading = readConsumerProfile(description);
  if (reading.layout.sourceLines === null) return { skipped: RICH_TEXT };
  const current = reading.profile.contacts[index];
  const placement = reading.layout.entries[index];
  if (current === undefined || placement === undefined) {
    return { skipped: "that contact is no longer listed" };
  }
  if (placement.shape !== "own-line") return { skipped: NOT_ON_OWN_LINE[placement.shape] };
  const next =
    change === null
      ? withContactRemoved(description, index)
      : withContactReplaced(description, index, change(current));
  if (next === null || next === description) return { skipped: "nothing changed" };
  return { description: next };
}

/** The same person by alias when both entries give one, else by name — never case-sensitively. */
function samePerson(listed: ConsumerContact, candidate: ConsumerContact): boolean {
  if (listed.alias !== null && candidate.alias !== null) {
    return listed.alias.toLowerCase() === candidate.alias.toLowerCase();
  }
  return listed.fullName.toLowerCase() === candidate.fullName.toLowerCase();
}
