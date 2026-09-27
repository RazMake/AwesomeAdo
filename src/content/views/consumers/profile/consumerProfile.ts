import {
  contactColumnsOf,
  peopleIn,
  peopleInTableRow,
  type ContactColumns,
  type MentionNames,
} from "./contactEntries";
import {
  sectionOf,
  structureLineOf,
  type SectionContext,
  type StructureLine,
} from "./descriptionSections";
import {
  emptyToNull,
  isDecorativeLine,
  isRichText,
  isTableSeparator,
  keyedLineOf,
  listItemBodyOf,
  normalizeKey,
  plainText,
  readableLines,
  tableCellsOf,
} from "./descriptionText";

/** A labelled link listed in the description's Details section. */
export interface ConsumerDetailLink {
  /** What the link is FOR (the key it was listed under, or the link's own text). */
  label: string;
  url: string;
}

/** One person the description's Contacts section names for this consumer. */
export interface ConsumerContact {
  fullName: string;
  /** The person's short identity, or null when the entry named only a person. */
  alias: string | null;
  /** The role they hold for this consumer (`M1`, `Owner`, …), or null when none was given. */
  role: string | null;
  /**
   * The identity GUID, when the entry named the person with an Azure DevOps `@`-mention. Kept so a
   * rewritten entry still mentions them rather than replacing the mention with a plain name.
   */
  mentionId?: string;
}

/**
 * What a consumer's Azure DevOps description says about the service behind it.
 *
 * Descriptions are written by whoever onboarded the consumer, so EVERY field is optional: a
 * description that names none of them yields nulls and empty lists rather than an error. Nothing
 * here is inferred — a value is reported only where the description actually stated it.
 */
export interface ConsumerProfile {
  /** The consumer service's own name, e.g. `IPSimulationService`. */
  serviceName: string | null;
  /** The identity (or audience) this service reaches us as, normally a GUID. */
  clientId: string | null;
  /**
   * The Scenario section's prose, with its Markdown inline markup left intact so a renderer can
   * hand it to the shared Markdown control instead of showing pre-flattened text.
   */
  scenario: string | null;
  details: ConsumerDetailLink[];
  contacts: ConsumerContact[];
}

/**
 * How a contact is written, which decides whether it can be rewritten in place: only an entry with
 * a line of its own can be, since any other shape shares its line with text the edit must not lose.
 *
 * - `own-line` — the one person on a list item or line of the Contacts section.
 * - `shared-line` — one of several people named on the same line.
 * - `table-row` — a row of a Markdown table.
 * - `inline` — named by a `Contacts:` / `Owner:` line outside any Contacts section.
 */
export type ContactShape = "own-line" | "shared-line" | "table-row" | "inline";

/** Where one entry of `ConsumerProfile.contacts` was read from. */
export interface ContactPlacement {
  line: number;
  shape: ContactShape;
}

/**
 * Where a description's contacts sit in its SOURCE, so an edit can be written back to the line it
 * was read from instead of regenerating (and silently reformatting) the whole description.
 */
export interface ContactsLayout {
  /**
   * The description's source lines, or null when they cannot be edited line by line: a rich-text
   * HTML description has no line that maps back to a contact, and guessing would rewrite the wrong
   * part of someone's document.
   */
  sourceLines: string[] | null;
  /**
   * The LAST line of the (first) Contacts heading — its underline, for an underlined heading — or
   * null when the description has none. A first entry goes right after it.
   */
  headingLine: number | null;
  /** Where each entry of `ConsumerProfile.contacts` was read from, in the same order. */
  entries: ContactPlacement[];
}

/** A description read both for what it says and for where its contacts are written. */
export interface ConsumerProfileReading {
  profile: ConsumerProfile;
  layout: ContactsLayout;
}

export interface ConsumerProfileReadOptions {
  /** Who the description's `@<guid>` mentions are, keyed by lowercase GUID. */
  mentionNames?: MentionNames;
}

/**
 * Keys naming each field. A key CONTAINING the core word also counts (`Client Id (Prod)`), but a
 * bare word only when it is one of these: descriptions mention services and GUIDs in prose all the
 * time, and guessing from those would put another team's identity on a consumer's row.
 */
const SERVICE_NAME_KEYS = new Set([
  "service",
  "consumerservice",
  "consumer",
  "consumername",
  "appname",
  "applicationname",
]);
const CLIENT_ID_KEYS = new Set(["client", "identity", "aadapp", "entraapp", "managedidentity"]);
/** Keys outside a Contacts section that name a person BY role (`Owner: Jane Doe`). */
const INLINE_ROLE_KEYS = new Set(["owner", "owners", "pm", "em", "manager", "lead", "poc", "pocs"]);

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const MARKDOWN_LINK = /\[([^\]]*)\]\(([^)\s]+)\)/;
const BARE_URL = /https?:\/\/\S+/;
/** `Key - value`, the separator people reach for when they do not use a colon. */
const DASH_KEYED_LINE = /^([^-\u2013\u2014]{1,40}?)\s[-\u2013\u2014]\s+(.+)$/;

/**
 * Read the structured facts out of a consumer's description.
 *
 * The input is whatever Azure DevOps stored — Markdown, plain text, or the rich-text HTML the
 * classic editor writes — and whoever wrote it may have followed the onboarding template loosely:
 * see {@link readConsumerProfile}.
 */
export function parseConsumerProfile(
  description: string,
  options: ConsumerProfileReadOptions = {},
): ConsumerProfile {
  return readConsumerProfile(description, options).profile;
}

/**
 * The roles every board offers a contact before anyone has been given one: the management levels and
 * the disciplines a consumer's contacts almost always hold.
 */
export const DEFAULT_CONTACT_ROLES: readonly string[] = ["M1", "M2", "M3", "DEV", "PM"];

/**
 * The choices a role editor offers: {@link DEFAULT_CONTACT_ROLES} first, then every other role the
 * given descriptions assign someone, in the order first written. Each appears once (compared
 * case-insensitively), in its default or first-written spelling.
 */
export function contactRolesIn(descriptions: readonly string[]): string[] {
  const roles = new Map(DEFAULT_CONTACT_ROLES.map((role) => [role.toLowerCase(), role]));
  for (const description of descriptions) {
    for (const { role } of parseConsumerProfile(description).contacts) {
      if (role !== null && !roles.has(role.toLowerCase())) roles.set(role.toLowerCase(), role);
    }
  }
  return [...roles.values()];
}

/** Everything one pass over a description has read so far. */
interface ProfileScan {
  profile: ConsumerProfile;
  layout: ContactsLayout;
  mentionNames: MentionNames;
  at: SectionContext;
  /** The label the current Contacts lines are listed under (`Owners:`), if any. */
  groupRole: string | null;
  /** The columns of the contacts table being read, or null outside one (or for a plain table). */
  tableColumns: ContactColumns | null;
  scenario: string[];
}

/**
 * {@link parseConsumerProfile}, plus where each contact was written (see {@link ContactsLayout}).
 *
 * Descriptions are human-edited, so this reads as loosely as it can without guessing: headings in
 * any Markdown form (or a bold line, or a `Label:` line naming a section), sections under other
 * names ("Points of Contact", "Links"), list items or plain lines, `Key: value` / `Key = value` /
 * table rows, and contacts written in any order of name, alias, address, mention, and role. Text
 * that fits none of it — notes, prose, placeholders — is skipped rather than misread.
 */
export function readConsumerProfile(
  description: string,
  options: ConsumerProfileReadOptions = {},
): ConsumerProfileReading {
  const scan: ProfileScan = {
    profile: { serviceName: null, clientId: null, scenario: null, details: [], contacts: [] },
    layout: { sourceLines: null, headingLine: null, entries: [] },
    mentionNames: options.mentionNames ?? new Map(),
    at: { section: "other", level: 0 },
    groupRole: null,
    tableColumns: null,
    scenario: [],
  };
  const lines = readableLines(description);
  lines.forEach((line, index) => readLine(scan, line, index, lines[index + 1]));
  scan.profile.scenario = emptyToNull(
    scan.scenario
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );
  scan.layout.sourceLines = isRichText(description)
    ? null
    : description.replace(/\r\n?/g, "\n").split("\n");
  return { profile: scan.profile, layout: scan.layout };
}

function readLine(scan: ProfileScan, line: string, index: number, nextLine?: string): void {
  if (isDecorativeLine(line)) return;
  const structure = structureLineOf(line, nextLine, scan.at);
  if (structure !== null) {
    enterStructure(scan, structure, index);
    return;
  }
  // Scenario is prose, not data: its blank lines are paragraph breaks and are kept. A field line
  // written into it is still the field, since a person may put one anywhere.
  if (scan.at.section === "scenario") {
    if (!readField(scan.profile, listItemBodyOf(line))) scan.scenario.push(line);
    return;
  }
  if (line.length === 0) return;
  const cells = tableCellsOf(line);
  if (cells !== null) {
    readTableRow(scan, cells, index, nextLine);
    return;
  }
  scan.tableColumns = null;
  readBody(scan, listItemBodyOf(line), index);
}

function enterStructure(scan: ProfileScan, structure: StructureLine, index: number): void {
  scan.tableColumns = null;
  if (structure.kind === "group") {
    scan.groupRole = structure.role;
    return;
  }
  scan.at = { section: structure.section, level: structure.level };
  scan.groupRole = null;
  if (structure.section === "contacts") {
    scan.layout.headingLine ??= structure.underlined ? index + 1 : index;
  }
}

/** One non-heading, non-table line, read as whatever the section it sits in is a list of. */
function readBody(scan: ProfileScan, body: string, index: number): void {
  if (scan.at.section === "details") {
    // A line with a link is a detail even under a field's key; one without may still be a field.
    if (!readDetail(scan.profile, body)) readField(scan.profile, body);
    return;
  }
  if (readField(scan.profile, body)) return;
  if (scan.at.section === "contacts") {
    const people = peopleIn(body, scan.groupRole, scan.mentionNames);
    addContacts(scan, people, index, people.length > 1 ? "shared-line" : "own-line");
    return;
  }
  readInlineContacts(scan, body, index);
}

/**
 * A table row. Its header (the row above the `|---|` line) is only read for which column is which;
 * contacts, details, and fields are read from the rows under it.
 */
function readTableRow(
  scan: ProfileScan,
  cells: readonly string[],
  index: number,
  nextLine: string | undefined,
): void {
  if (isTableSeparator(nextLine)) {
    scan.tableColumns = scan.at.section === "contacts" ? contactColumnsOf(cells) : null;
    return;
  }
  if (scan.at.section === "contacts") {
    const people = peopleInTableRow(cells, scan.tableColumns, scan.groupRole, scan.mentionNames);
    addContacts(scan, people, index, "table-row");
    return;
  }
  const [first = "", ...rest] = cells;
  readBody(scan, rest.length > 0 ? `${first}: ${rest.join(" ")}` : first, index);
}

/** `Contacts: Jane Doe, Bob Ray` or `Owner: Jane Doe`, written outside any Contacts section. */
function readInlineContacts(scan: ProfileScan, body: string, index: number): void {
  const keyed = keyedLineOf(body);
  if (keyed === null) return;
  if (sectionOf(keyed.key) === "contacts") {
    addContacts(scan, peopleIn(keyed.rawValue, null, scan.mentionNames), index, "inline");
  } else if (INLINE_ROLE_KEYS.has(normalizeKey(keyed.key))) {
    addContacts(scan, peopleIn(body, null, scan.mentionNames), index, "inline");
  }
}

function addContacts(
  scan: ProfileScan,
  contacts: readonly ConsumerContact[],
  line: number,
  shape: ContactShape,
): void {
  for (const contact of contacts) {
    scan.profile.contacts.push(contact);
    scan.layout.entries.push({ line, shape });
  }
}

/**
 * Record a service name or client id line, wherever in the description it was written; reports
 * whether the line was one, so it is not read as anything else.
 *
 * The FIRST statement of each wins: the overview states them up front, and a later mention (in a
 * migration note, say) is talking about that same service rather than renaming it.
 */
function readField(profile: ConsumerProfile, body: string): boolean {
  const keyed = keyedLineOf(body) ?? dashKeyedLineOf(body);
  const field = keyed === null ? null : fieldOf(keyed.key);
  if (keyed === null || field === null) return false;
  if (field === "serviceName") profile.serviceName ??= emptyToNull(keyed.value);
  // The GUID is lifted out of whatever was written around it, so a note left on the same line does
  // not become part of the identity.
  else profile.clientId ??= GUID.exec(keyed.value)?.[0] ?? emptyToNull(keyed.value);
  return true;
}

function dashKeyedLineOf(body: string): { key: string; value: string } | null {
  const match = DASH_KEYED_LINE.exec(body);
  return match === null
    ? null
    : { key: plainText(match[1] ?? ""), value: plainText(match[2] ?? "") };
}

function fieldOf(key: string): "serviceName" | "clientId" | null {
  const normalized = normalizeKey(key);
  if (normalized.includes("servicename") || SERVICE_NAME_KEYS.has(normalized)) return "serviceName";
  if (/clientid|appid|applicationid|audience/.test(normalized) || CLIENT_ID_KEYS.has(normalized)) {
    return "clientId";
  }
  return null;
}

/** One Details entry, labelled by the key it was listed under; reports whether it had a link. */
function readDetail(profile: ConsumerProfile, body: string): boolean {
  const markdown = MARKDOWN_LINK.exec(body);
  const match = markdown ?? BARE_URL.exec(body);
  if (match === null) return false;
  const url = markdown === null ? match[0] : (markdown[2] ?? "");
  const key = plainText(body.slice(0, match.index))
    .replace(/[\s:=|\-\u2013\u2014]+$/, "")
    .trim();
  // Without a key, the link's own text is the only label the writer gave it.
  profile.details.push({ label: key.length > 0 ? key : plainText(markdown?.[1] ?? url), url });
  return true;
}
