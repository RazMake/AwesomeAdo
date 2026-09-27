import type { ConsumerContact } from "./consumerProfile";
import { keyedLineOf, normalizeKey, plainText, wordCount } from "./descriptionText";

/** Who the description's `@<guid>` mentions are, keyed by lowercase GUID. */
export type MentionNames = ReadonlyMap<string, string>;

/** How Azure DevOps stores an `@`-mention in Markdown. */
const MENTION = /@<([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})>/i;
/** The label for a mention no directory answer has resolved yet, as the Markdown control shows it. */
const UNRESOLVED_MENTION = "@mention";
const EMAIL = /<?(?:mailto:)?([a-z0-9._%+'-]+)@[a-z0-9-]+(?:\.[a-z0-9-]+)+>?/i;
const MAILTO_LINK = /\[([^\]]*)\]\(mailto:([^)\s]+)\)/gi;
/**
 * Any other link, reduced to its text: a person's profile link (or the `#` anchor a rich-text
 * mention becomes) says nothing about who they are that the text does not.
 */
const MARKDOWN_LINK = /\[([^\]]*)\]\([^)]*\)/g;
/** A parenthesized, angle-bracketed, or square-bracketed aside (never a Markdown link's text). */
const ASIDE = /\(([^()]*)\)|<([^<>]*)>|\[([^\]]*)\](?!\()/g;
const LEADING_BRACKETED_ROLE = /^\[([^\]]{1,40})\](?!\()\s*[:\-\u2013\u2014]?\s*(.+)$/;
/** A spaced dash; a hyphenated name (`Anne-Marie`) has no spaces around its hyphen. */
const SPACED_DASH = /\s[-\u2013\u2014]\s+/;
/** Separators between several people on one line, honoured only when every part names someone. */
const PERSON_SEPARATORS = /\s*,\s*|\s+and\s+|\s*&\s*|\s+\/\s+/i;
const PLACEHOLDER = /^(?:tbd|tba|todo|n\/?a|none|nobody|unknown|pending|vacant|open|\?+|-+)$/i;
const SENTENCE_END = /\p{Ll}{2,}\.$/u;
/** `M1`, `L2`: the short level codes people use as roles. */
const LEVEL_CODE = /^[A-Z]{1,2}\d{1,2}$/;
const MAX_NAME_WORDS = 6;
const MAX_BARE_NAME_WORDS = 4;
const MAX_ROLE_WORDS = 4;
/** A word of a bare name: capitalized (particles allowed), nothing a sentence would carry. */
const NAME_WORD =
  /^(?:[A-Z\u00c0-\u024f][\w\u00c0-\u024f.'-]*|de|da|di|du|la|le|van|von|der|den|bin|al|y)$/;

/** Keys that label the PERSON rather than their role (`Name: Jane Doe`). */
const PERSON_KEYS = new Set(
  "name fullname person who contact alias email mail user upn".split(" "),
);
/** Capitalized asides that are a role, not an alias: `Jane Doe (Owner)`. */
const ROLE_WORDS = new Set(
  (
    "owner owners pm pgm tpm em lead manager dev developer engineer architect sponsor sme gm " +
    "director vp cvp admin poc champion approver reviewer escalation stakeholder partner primary " +
    "secondary backup oncall"
  ).split(" "),
);
/** Asides that only describe the person and are no part of their name, alias, or role. */
const NOTE_WORDS = new Set(
  "contractor vendor fte intern external former retired interim acting".split(" "),
);

/**
 * Every person one line of a Contacts section names.
 *
 * `groupRole` is the label the line sits under (`Owners:`), used for anyone the line itself gives
 * no role. Returns nothing for a line that does not look like it names a person — a sentence, a
 * link, or a "TBD" — so notes written between the entries never become contacts.
 */
export function peopleIn(
  text: string,
  groupRole: string | null,
  mentionNames: MentionNames,
): ConsumerContact[] {
  const line = text.replace(MAILTO_LINK, "$1 <$2>").replace(MARKDOWN_LINK, "$1");
  const prefix = rolePrefixOf(line);
  return splitPeople(prefix.rest)
    .map((segment) => personOf(segment, prefix.role, groupRole, mentionNames))
    .filter((contact): contact is ConsumerContact => contact !== null);
}

/** Which column of a contacts table holds which part of an entry. */
export interface ContactColumns {
  name: number | null;
  alias: number | null;
  role: number | null;
}

/** The columns a contacts table's header names, or null when it names none of them. */
export function contactColumnsOf(header: readonly string[]): ContactColumns | null {
  const columns: ContactColumns = { name: null, alias: null, role: null };
  header.forEach((cell, index) => {
    const key = normalizeKey(cell);
    if (/alias|mail|upn|login|account|username|handle/.test(key)) columns.alias ??= index;
    else if (/role|title|responsib|function|type|area/.test(key)) columns.role ??= index;
    else if (/name|person|contact|who|owner|people/.test(key)) columns.name ??= index;
  });
  const named = columns.name !== null || columns.alias !== null || columns.role !== null;
  return named ? columns : null;
}

/** Everyone one row of a contacts table names, read through its header's columns when it has any. */
export function peopleInTableRow(
  cells: readonly string[],
  columns: ContactColumns | null,
  groupRole: string | null,
  mentionNames: MentionNames,
): ConsumerContact[] {
  if (columns === null) {
    const filled = cells.filter((cell) => plainText(cell).length > 0);
    const text = filled.length === 2 ? `${filled[0]}: ${filled[1]}` : filled.join(" - ");
    return peopleIn(text, groupRole, mentionNames);
  }
  const cell = (index: number | null): string => (index === null ? "" : (cells[index] ?? ""));
  const alias = plainText(cell(columns.alias));
  const name = cell(columns.name).trim();
  const person = `${name.length > 0 ? name : alias}${alias.length > 0 ? ` (${alias})` : ""}`;
  const role = plainText(cell(columns.role));
  return peopleIn(person, role.length > 0 ? role : groupRole, mentionNames);
}

/**
 * The role a line states around its people (`` `M1`: …``, `[M1] …`, `Jane (jdoe): M1`), and the
 * text naming them. `role` is null when the line states none, or when its key names the person
 * instead (`Name: Jane Doe`).
 */
function rolePrefixOf(line: string): { role: string | null; rest: string } {
  const bracketed = LEADING_BRACKETED_ROLE.exec(line);
  if (bracketed !== null) {
    return { role: roleText(bracketed[1] ?? ""), rest: bracketed[2] ?? "" };
  }
  const keyed = keyedLineOf(line);
  if (keyed === null) return { role: null, rest: line };
  const rawKey = line.slice(0, line.length - keyed.rawValue.length).replace(/\s*[:=]\s*$/, "");
  // The person may come FIRST, with the role after the colon: `Jane Doe (jdoe): M1`.
  if (hasPersonMarker(rawKey)) {
    return hasPersonMarker(keyed.rawValue)
      ? { role: null, rest: line }
      : { role: roleText(keyed.value), rest: rawKey };
  }
  if (wordCount(keyed.key) > MAX_ROLE_WORDS) return { role: null, rest: line };
  // `Name: Jane Doe` and `Contacts: Jane Doe` label the person, so they hold no role.
  const key = normalizeKey(keyed.key);
  const role = PERSON_KEYS.has(key) || key.includes("contact") ? null : keyed.key;
  return { role, rest: keyed.rawValue };
}

/**
 * One line's people, split only where every part names someone: "Jane Doe, Owner" is one person
 * with a role, while "Jane Doe (jdoe), Bob Ray (bray)" is two.
 */
function splitPeople(text: string): string[] {
  return text
    .split(";")
    .flatMap((part) => {
      const parts = part.split(PERSON_SEPARATORS).filter((piece) => piece.trim().length > 0);
      const separate =
        parts.length > 1 &&
        (parts.every(hasPersonMarker) || parts.every((piece) => isBareName(plainText(piece), 2)));
      return separate ? parts : [part];
    })
    .filter((part) => part.trim().length > 0);
}

/** Whether `text` carries something only a person entry has: an alias, an address, a mention. */
function hasPersonMarker(text: string): boolean {
  if (MENTION.test(text) || EMAIL.test(text)) return true;
  return [...text.matchAll(ASIDE)].some((aside) => isAliasLike(plainText(asideText(aside))));
}

function asideText(match: readonly (string | undefined)[]): string {
  return match[1] ?? match[2] ?? match[3] ?? "";
}

function isAliasLike(text: string): boolean {
  return /^[\w.'-]{2,64}$/.test(text) && !isRoleWord(text) && !isCapitalizedIn(text, NOTE_WORDS);
}

function isRoleWord(text: string): boolean {
  return LEVEL_CODE.test(text) || isCapitalizedIn(text, ROLE_WORDS);
}

/** Whether a capitalized `text` is one of `words`; a lowercase `pm` is somebody's alias. */
function isCapitalizedIn(text: string, words: ReadonlySet<string>): boolean {
  return /^[A-Z]/.test(text) && words.has(text.toLowerCase());
}

/**
 * One person. `lineRole` (the line's own `Role:` prefix) outranks a role written beside the name,
 * which outranks the group the line is listed under.
 */
function personOf(
  segment: string,
  lineRole: string | null,
  groupRole: string | null,
  mentionNames: MentionNames,
): ConsumerContact | null {
  const parts = personPartsOf(segment, mentionNames);
  const role = lineRole ?? parts.sideRole ?? groupRole;
  const vouched = parts.alias !== null || parts.mentionId !== null || role !== null;
  if (parts.name === null || !isPersonName(parts.name, vouched)) return null;
  const contact = { fullName: parts.name, alias: parts.alias, role };
  return parts.mentionId === null ? contact : { ...contact, mentionId: parts.mentionId };
}

/** What one person's text says about them, before it is judged to name someone at all. */
interface PersonParts {
  name: string | null;
  alias: string | null;
  mentionId: string | null;
  /** A role written beside the name: after a dash or a comma, or in an aside. */
  sideRole: string | null;
}

function personPartsOf(segment: string, mentionNames: MentionNames): PersonParts {
  const dashed = splitDashRole(segment);
  const mentionId = MENTION.exec(dashed.person)?.[1]?.toLowerCase() ?? null;
  const withComma = splitCommaRole(dashed.person.replace(MENTION, " "));
  const email = EMAIL.exec(withComma.person);
  const asides = readAsides(withComma.person.replace(EMAIL, " "));
  // A mention already says who this is; an alias beside it would only be a second, weaker answer.
  const alias = mentionId === null ? (email?.[1] ?? asides.alias) : null;
  return {
    name: nameOf(asides.rest, mentionId, alias, mentionNames),
    alias,
    mentionId,
    sideRole: dashed.role ?? withComma.role ?? asides.role,
  };
}

/**
 * `Jane Doe - Owner` or `Owner - Jane Doe`: the side naming the person is the one with an alias,
 * address, or mention; failing that the longer side, and on a tie the left, as the template writes.
 */
function splitDashRole(segment: string): { person: string; role: string | null } {
  const parts = segment.split(SPACED_DASH);
  if (parts.length < 2) return { person: segment, role: null };
  const marked = parts.findIndex(hasPersonMarker);
  const personIndex = marked >= 0 ? marked : longestPartIndex(parts);
  const other = parts.find((_part, index) => index !== personIndex) ?? "";
  return { person: parts[personIndex] ?? segment, role: roleText(other) };
}

function longestPartIndex(parts: readonly string[]): number {
  const words = parts.map((part) => wordCount(plainText(part)));
  return words.reduce((best, count, index) => (count > (words[best] ?? 0) ? index : best), 0);
}

/** `Jane Doe (jdoe), Owner`: a role after a comma, once the person before it is unmistakable. */
function splitCommaRole(text: string): { person: string; role: string | null } {
  const comma = text.lastIndexOf(",");
  const person = text.slice(0, comma);
  const after = text.slice(comma + 1);
  if (comma < 0 || !hasPersonMarker(person) || hasPersonMarker(after)) {
    return { person: text, role: null };
  }
  return { person, role: roleText(after) };
}

/** The first alias-shaped aside is the alias; a role word is the role; anything else is a note. */
function readAsides(text: string): { rest: string; alias: string | null; role: string | null } {
  const found: { alias: string | null; role: string | null } = { alias: null, role: null };
  const rest = text.replace(ASIDE, (...match: (string | undefined)[]) => {
    const aside = plainText(asideText(match));
    if (found.alias === null && isAliasLike(aside)) found.alias = aside;
    else if (found.role === null && (isRoleWord(aside) || match[3] !== undefined)) {
      found.role = roleText(aside);
    }
    return " ";
  });
  return { rest, ...found };
}

function nameOf(
  text: string,
  mentionId: string | null,
  alias: string | null,
  mentionNames: MentionNames,
): string | null {
  const name = plainText(text)
    .replace(/^@/, "")
    .replace(/^[\s,;:.|\-\u2013\u2014]+|[\s,;:|\-\u2013\u2014]+$/g, "")
    .trim();
  if (name.length > 0) return name;
  if (mentionId !== null) return mentionNames.get(mentionId) ?? UNRESOLVED_MENTION;
  return alias;
}

/**
 * Whether `name` reads as someone's name. An entry that also carried an alias, a mention, or a role
 * is trusted with any short text; a bare line has to look like a name on its own.
 */
function isPersonName(name: string, vouched: boolean): boolean {
  if (PLACEHOLDER.test(name) || !/\p{L}/u.test(name) || /:\/\/|[!?]/.test(name)) return false;
  // A full stop after a word ("After.") ends a sentence; after an initial or "Jr." it does not.
  if (!vouched && SENTENCE_END.test(name)) return false;
  return vouched ? wordCount(name) <= MAX_NAME_WORDS : isBareName(name, 1);
}

function isBareName(text: string, minimumWords: number): boolean {
  const words = text
    .replace(/,/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0);
  return (
    words.length >= minimumWords &&
    words.length <= MAX_BARE_NAME_WORDS &&
    words.every((word) => NAME_WORD.test(word))
  );
}

/** A role as written, or null for none, a placeholder, or a phrase too long to be a role. */
function roleText(text: string): string | null {
  const role = plainText(text).replace(/^[\s:,-]+|[\s:,-]+$/g, "");
  const usable = role.length > 0 && !PLACEHOLDER.test(role) && wordCount(role) <= MAX_ROLE_WORDS;
  return usable ? role : null;
}
