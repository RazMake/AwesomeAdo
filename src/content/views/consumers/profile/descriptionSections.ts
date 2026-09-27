import {
  isHeadingUnderline,
  isListItem,
  listItemBodyOf,
  normalizeKey,
  plainText,
  wordCount,
} from "./descriptionText";

/** The sections of a consumer description that carry data; anything else is `other`. */
export type DescriptionSection = "contacts" | "details" | "scenario" | "other";

/** The section a line sits in, and the level of the heading that opened it (0 for none). */
export interface SectionContext {
  section: DescriptionSection;
  level: number;
}

/**
 * What a line says about the description's STRUCTURE rather than its content: it opens a section,
 * or — inside Contacts — labels the group of people listed under it (`Owners:`, `### Engineering`).
 */
export type StructureLine =
  | {
      kind: "section";
      section: DescriptionSection;
      /** The heading's level: 1–6 for a Markdown heading, below all of those for a label line. */
      level: number;
      /** Whether the heading is underlined, so the line AFTER it still belongs to the heading. */
      underlined: boolean;
    }
  | { kind: "group"; role: string };

/**
 * Sections that carry no data but still END the one above them. Only these (and the data sections)
 * are recognized from a label-shaped line, because a bold line mid-list is just as often a
 * person's name.
 */
const PROSE_SECTION_KEYS = new Set(
  (
    "overview summary notes note background description status history timeline context " +
    "nextsteps openquestions questions risks faq"
  ).split(" "),
);
const CONTACT_SECTION_KEYS = new Set(["poc", "pocs", "people", "stakeholders", "keypeople"]);
const SCENARIO_SECTION_KEYS = new Set(["usecase", "usecases"]);
const DETAILS_SECTION_KEYS = new Set(["resources", "references", "documentation", "docs"]);
/** Words a title never needs but a sentence always has. */
const SENTENCE_WORDS = new Set(
  "a an are at be by email for if in is on or our please reach see the to us we with your".split(
    " ",
  ),
);

/** An ATX heading; the `#` needs no space after it, but never opens a `#1234` work item mention. */
const ATX_HEADING = /^(#{1,6})(?:[ \t]+|(?=[^\s\d#]))(.*?)(?:[ \t]+#+)?[ \t]*$/;
/** A line that is nothing but one emphasized run (`**Contacts**`, `_Owners:_`). */
const EMPHASIZED_LINE = /^(\*\*|__|\*|_)(?!\s)(.+?)\1\s*(:?)$/;
/** A bare `Label:` line, short and free of the marks a person or a link would carry. */
const LABEL_LINE = /^([^:()<>@`|[\]]{1,40}?)\s*:$/;
const PLAIN_LABEL = /^[\w &/-]+$/;
const MAX_LABEL_WORDS = 4;
/** The level of a section opened by a label line: below every Markdown heading. */
const LABEL_LEVEL = 7;

/** The data section a heading's text names, however the writer worded it. */
export function sectionOf(label: string): DescriptionSection {
  const key = normalizeKey(label);
  if (key.includes("contact") || CONTACT_SECTION_KEYS.has(key)) return "contacts";
  if (key.includes("scenario") || SCENARIO_SECTION_KEYS.has(key)) return "scenario";
  if (key.includes("detail") || key.includes("link") || DETAILS_SECTION_KEYS.has(key)) {
    return "details";
  }
  return "other";
}

/**
 * What `line` says about the description's structure, if anything.
 *
 * A Markdown heading (`#`, or an underlined line) always does, as it does when rendered — though
 * under Contacts a deeper one that names no section is only a group of people. Every other heading
 * shape (a whole-line emphasis, a bare `Label:`) opens a section only when its label names one, so a
 * bold name or a stray `Note:` does not end the list it sits in.
 */
export function structureLineOf(
  line: string,
  nextLine: string | undefined,
  current: SectionContext,
): StructureLine | null {
  const heading = markdownHeadingOf(line, nextLine);
  if (heading !== null) return headingStructure(heading, current);
  const label = labelOf(line);
  return label === null ? null : labelStructure(label, current.section);
}

interface MarkdownHeading {
  label: string;
  level: number;
  underlined: boolean;
}

function markdownHeadingOf(line: string, nextLine: string | undefined): MarkdownHeading | null {
  return atxHeadingOf(line) ?? setextHeadingOf(line, nextLine);
}

function atxHeadingOf(line: string): MarkdownHeading | null {
  const atx = ATX_HEADING.exec(line);
  if (atx === null) return null;
  return { label: plainText(atx[2] ?? ""), level: atx[1]?.length ?? 1, underlined: false };
}

function setextHeadingOf(line: string, nextLine: string | undefined): MarkdownHeading | null {
  const paragraph = line.length > 0 && !isListItem(line) && !line.startsWith("|");
  if (!paragraph || nextLine === undefined || !isHeadingUnderline(nextLine)) return null;
  return { label: plainText(line), level: nextLine.startsWith("=") ? 1 : 2, underlined: true };
}

function headingStructure(heading: MarkdownHeading, current: SectionContext): StructureLine | null {
  if (heading.label.length === 0) return null;
  const section = sectionOf(heading.label);
  const groupsPeople =
    current.section === "contacts" &&
    heading.level > current.level &&
    section === "other" &&
    !isProseSection(heading.label) &&
    wordCount(heading.label) <= MAX_LABEL_WORDS;
  return groupsPeople
    ? { kind: "group", role: heading.label }
    : { kind: "section", section, level: heading.level, underlined: heading.underlined };
}

interface LineLabel {
  text: string;
  /** Whether the writer ended it with a colon, which is what makes it a group's label. */
  colon: boolean;
  /**
   * Whether the whole line is emphasized, i.e. FORMATTED as a heading. A plain line only reads as
   * one when it is worded like a title, so prose such as "Contact us first" stays prose.
   */
  emphasized: boolean;
}

function labelOf(line: string): LineLabel | null {
  const body = listItemBodyOf(line);
  const emphasized = EMPHASIZED_LINE.exec(body);
  if (emphasized !== null) {
    const inner = emphasized[2] ?? "";
    const colon = inner.endsWith(":") || emphasized[3] === ":";
    return { text: plainText(inner.replace(/:$/, "")), colon, emphasized: true };
  }
  const labelled = LABEL_LINE.exec(body);
  if (labelled !== null) {
    return { text: plainText(labelled[1] ?? ""), colon: true, emphasized: false };
  }
  return PLAIN_LABEL.test(body) ? { text: plainText(body), colon: false, emphasized: false } : null;
}

function labelStructure(label: LineLabel, current: DescriptionSection): StructureLine | null {
  if (label.text.length === 0 || wordCount(label.text) > MAX_LABEL_WORDS) return null;
  const section = sectionOf(label.text);
  if (namesSection(label, section)) {
    return { kind: "section", section, level: LABEL_LEVEL, underlined: false };
  }
  return current === "contacts" && labelsGroup(label) ? { kind: "group", role: label.text } : null;
}

function namesSection(label: LineLabel, section: DescriptionSection): boolean {
  const named = section !== "other" || isProseSection(label.text);
  return named && (label.emphasized || isWordedLikeTitle(label.text));
}

/** A lone emphasized word (`**Primary**`) labels the people after it; two or more are a name. */
function labelsGroup(label: LineLabel): boolean {
  return label.colon || (label.emphasized && wordCount(label.text) === 1);
}

function isProseSection(label: string): boolean {
  return PROSE_SECTION_KEYS.has(normalizeKey(label));
}

function isWordedLikeTitle(text: string): boolean {
  return text.split(/\s+/).every((word) => !SENTENCE_WORDS.has(word.toLowerCase()));
}
