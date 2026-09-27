import { readConsumerProfile, type ConsumerContact } from "./consumerProfile";

/**
 * The heading a Contacts section is opened with when the description has none yet — the same level
 * the onboarding template writes its sections at.
 */
const CONTACTS_HEADING = "# Contacts";

/** A list item's marker and the spacing after it, which a rewritten entry keeps as it found it. */
const LIST_MARKER = /^(\s*)(?:([-*+\u2022])|(\d+)([.)]))\s+/;

/** Characters that would make the parser read a written name or role back as something else. */
const NAME_BREAKERS = /[:`]/g;
const SPACED_DASH = /\s[-\u2013\u2014]\s/g;
/** An alias safe to italicize: paired `_` or `*` inside it would be read as emphasis instead. */
const PLAIN_ALIAS = /^[^*_()]+$/;

/**
 * The description with one more contact at the end of its Contacts section, or null when the
 * description cannot be edited line by line (see `ContactsLayout.sourceLines`).
 *
 * The new entry follows the list it joins: after the last contact, with that entry's own marker, or
 * — for a description that names nobody yet — under a Contacts heading of its own.
 */
export function withContactAdded(description: string, contact: ConsumerContact): string | null {
  const { layout } = readConsumerProfile(description);
  const lines = layout.sourceLines;
  if (lines === null) return null;
  const entry = formatContactEntry(contact);
  // An `Owner: …` line in the overview is not part of a list this entry could join.
  const lastEntry = layout.entries.filter(({ shape }) => shape !== "inline").at(-1);
  if (lastEntry?.shape === "table-row") {
    // A list item cannot be a table row; it follows the table as a list of its own.
    insertAfter(lines, tableEndAfter(lines, lastEntry.line), `- ${entry}`);
  } else if (lastEntry !== undefined) {
    lines.splice(lastEntry.line + 1, 0, `${nextMarker(lines[lastEntry.line] ?? "")}${entry}`);
  } else if (layout.headingLine !== null) {
    insertAfter(lines, layout.headingLine, `- ${entry}`);
  } else {
    appendContactsSection(lines, `- ${entry}`);
  }
  return joinLines(lines, description);
}

/**
 * The description with its `index`-th contact rewritten as `contact`, or null when there is no such
 * contact, it does not have a line of its own (see `ContactShape`), or the description cannot be
 * edited line by line. Only that one line changes; its list marker and indentation are kept.
 */
export function withContactReplaced(
  description: string,
  index: number,
  contact: ConsumerContact,
): string | null {
  const edit = ownLineOf(description, index);
  if (edit === null) return null;
  const marker = LIST_MARKER.exec(edit.lines[edit.line] ?? "")?.[0] ?? "";
  edit.lines[edit.line] = `${marker}${formatContactEntry(contact)}`;
  return joinLines(edit.lines, description);
}

/**
 * The description without its `index`-th contact: that contact's line is deleted and nothing else
 * changes. Null under the same conditions as {@link withContactReplaced}.
 */
export function withContactRemoved(description: string, index: number): string | null {
  const edit = ownLineOf(description, index);
  if (edit === null) return null;
  edit.lines.splice(edit.line, 1);
  return joinLines(edit.lines, description);
}

/** The source lines and the line of the `index`-th contact, when that contact has one of its own. */
function ownLineOf(description: string, index: number): { lines: string[]; line: number } | null {
  const { layout } = readConsumerProfile(description);
  const entry = layout.entries[index];
  if (layout.sourceLines === null || entry?.shape !== "own-line") return null;
  return { lines: layout.sourceLines, line: entry.line };
}

/** The last row of the table that `line` is in. */
function tableEndAfter(lines: readonly string[], line: number): number {
  let end = line;
  while ((lines[end + 1] ?? "").trim().startsWith("|")) end += 1;
  return end;
}

/**
 * One contact in the template's own shape: `` `Role`: Full Name (_alias_) ``, leaving out the role or
 * the alias when there is none. A contact read from an `@`-mention is written back as that mention.
 *
 * Written so the parser reads back exactly this contact: a colon or backtick would split the name
 * into a role, and a parenthesized note in a directory display name ("Jane Doe (Contractor)") would
 * be taken for the alias, so both are dropped from what is written.
 */
export function formatContactEntry(contact: ConsumerContact): string {
  const role = (contact.role ?? "").replace(NAME_BREAKERS, "").replace(/\s+/g, " ").trim();
  const rolePart = role.length > 0 ? `\`${role}\`: ` : "";
  if (contact.mentionId !== undefined) return `${rolePart}@<${contact.mentionId}>`;
  return `${rolePart}${writtenName(contact.fullName)}${writtenAlias(contact.alias)}`;
}

function writtenName(fullName: string): string {
  const withoutNotes = fullName.replace(/\s*\([^)]*\)/g, "").replace(/[()]/g, "");
  const cleaned = withoutNotes
    .replace(NAME_BREAKERS, "")
    // A spaced dash would be read back as `Name - Role`, splitting the name in two.
    .replace(SPACED_DASH, " ")
    .replace(/\s+/g, " ")
    .trim();
  // A name that was nothing BUT a parenthesized note still has to name somebody.
  return cleaned.length > 0 ? cleaned : fullName.replace(/[():`]/g, "").trim();
}

/** ` (_alias_)` as the template writes it, or plain when emphasis would swallow part of it. */
function writtenAlias(alias: string | null): string {
  const cleaned = (alias ?? "").replace(/[()]/g, "").trim();
  if (cleaned.length === 0) return "";
  return PLAIN_ALIAS.test(cleaned) ? ` (_${cleaned}_)` : ` (${cleaned})`;
}

/** The marker for the entry after `previous`: the same bullet, or the next number. */
function nextMarker(previous: string): string {
  const match = LIST_MARKER.exec(previous);
  if (match === null) return "- ";
  const [, indent = "", bullet, number, delimiter = "."] = match;
  return bullet !== undefined
    ? `${indent}${bullet} `
    : `${indent}${Number(number) + 1}${delimiter} `;
}

/**
 * A new list after `line` (a heading, or a table), set apart by blank lines so Markdown reads it as
 * a list rather than folding it into the heading, the table, or prose that follows.
 */
function insertAfter(lines: string[], line: number, entry: string): void {
  const following = lines[line + 1];
  const block = ["", entry];
  if (following !== undefined && following.trim().length > 0) block.push("");
  lines.splice(line + 1, 0, ...block);
}

function appendContactsSection(lines: string[], entry: string): void {
  while (lines.length > 0 && (lines.at(-1) ?? "").trim().length === 0) lines.pop();
  if (lines.length > 0) lines.push("");
  lines.push(CONTACTS_HEADING, "", entry);
}

/** Rejoin with the line ending the description was written with, so an edit is not a reformat. */
function joinLines(lines: readonly string[], original: string): string {
  return lines.join(original.includes("\r\n") ? "\r\n" : "\n");
}
