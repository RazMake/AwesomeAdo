import { createMentionHighlight, type MentionHighlight } from "./MentionHighlight";
import {
  createMentionSuggestions,
  type MentionSuggestions,
  type TextEditorMentionOptions,
} from "./MentionSuggestions";
import { FIELD_TEXT_STYLE } from "./fieldMetrics";

/** How the field is shaped, what it opens on, and who it offers to mention. */
export interface MarkdownFieldOptions {
  /** The text the field opens on: empty for a new value, the existing source for a correction. */
  initialText: string;
  /** A one-line field (a title) instead of the multi-line Markdown box. Defaults to multi-line. */
  singleLine?: boolean;
  /** How many characters the field accepts; omitted leaves the browser's own (unbounded) limit. */
  maxLength?: number;
  /** How many lines the multi-line box opens at. Ignored for a one-line field. */
  rows?: number;
  /** The field's hint text. */
  placeholder?: string;
  /** Enables typed `@` identity suggestions. Ignored for a one-line field. */
  mentions?: TextEditorMentionOptions;
  /** Called after every keystroke, so an owner can re-evaluate what the text now allows. */
  onInput?(): void;
}

/** The mounted field plus everything its owner needs to read, focus and save it. */
export interface MarkdownFieldHandle {
  /** The shell to mount: the field, plus the layers that paint and complete its mentions. */
  element: HTMLElement;
  /** The field itself, for focus and for the owner's own key handling. */
  input: HTMLInputElement | HTMLTextAreaElement;
  /** The text as ADO must STORE it: each shown name back in its `@<id>` reference form. */
  storedText(): string;
}

/** The hints each shape carries, naming the keyboard shortcuts the field actually honours. */
export const MULTILINE_HINT = "Markdown supported. Ctrl+Enter to save, Esc to cancel.";
export const SINGLE_LINE_HINT = "Enter to save, Esc to cancel.";

/** How tall the Markdown box opens when the caller does not say — enough for a note. */
const DEFAULT_ROWS = 3;

/**
 * The themed Markdown field every authored value in the extension is typed into.
 *
 * Split out of the editor that owns the Save/Cancel pair because not every Markdown value is edited
 * in place: a creation form asks for a description and an acceptance reason alongside half a dozen
 * other answers, and those are committed by the FORM's button rather than by one of their own. What
 * must not differ is the typing: the bold/italic shortcuts, the pasted link, the `@` mentions and
 * the identity references they are stored as. A second field re-implementing those would teach the
 * reader a different set of rules depending on which surface they happened to be on.
 */
export function renderMarkdownField(
  doc: Document,
  options: MarkdownFieldOptions,
): MarkdownFieldHandle {
  const singleLine = options.singleLine === true;
  const input = createField(doc, options, singleLine);
  const shell = doc.createElement("div");
  shell.className = "awesomeado-markdown-field";
  shell.style.cssText = "position:relative;min-width:0";
  shell.append(input);

  const mentions = createMentionSupport(doc, shell, input, options, singleLine);
  wireFieldEvents(input, singleLine, mentions, options.onInput);

  return {
    element: shell,
    input,
    // The box shows each mention as the person's NAME; what ADO stores has to be the identity
    // reference behind it, so the two are swapped back at the moment of reading.
    storedText: () => mentions?.suggestions.toStoredText(input.value) ?? input.value,
  };
}

/** The mention list and the layer that paints what it inserted, for a field that offers mentions. */
interface MentionSupport {
  suggestions: MentionSuggestions;
  highlight: MentionHighlight;
}

function wireFieldEvents(
  input: HTMLInputElement | HTMLTextAreaElement,
  singleLine: boolean,
  mentions: MentionSupport | null,
  onInput: (() => void) | undefined,
): void {
  (input as HTMLElement).addEventListener("keydown", (event) => {
    if (
      mentions?.suggestions.handleKeydown(event) === true ||
      markdownShortcut(event, singleLine, input)
    ) {
      // Nothing else may act on a key the field just spent: the owner's own Enter/Escape handling
      // would otherwise save or abandon on the very keystroke that picked a name or bolded a word.
      event.stopImmediatePropagation();
    }
  });
  if (!singleLine) {
    (input as HTMLTextAreaElement).addEventListener("paste", (event) =>
      pasteMarkdownLink(event, input),
    );
  }
  input.addEventListener("input", () => {
    mentions?.suggestions.refresh();
    mentions?.highlight.refresh();
    onInput?.();
  });
}

/**
 * The mention support for a field that offers it.
 *
 * Null for a one-line field (a title has no mentions) and for a caller that asked for none. The
 * field's text is switched to the DISPLAY form here, before anything else reads it: what an author
 * gets back to edit has to be the people they wrote, not the identity ids stored behind them.
 */
function createMentionSupport(
  doc: Document,
  shell: HTMLElement,
  input: HTMLInputElement | HTMLTextAreaElement,
  options: MarkdownFieldOptions,
  singleLine: boolean,
): MentionSupport | null {
  if (singleLine || options.mentions === undefined) {
    return null;
  }
  const field = input as HTMLTextAreaElement;
  const suggestions = createMentionSuggestions(doc, shell, field, options.mentions);
  field.value = suggestions.toDisplayText(options.initialText);
  const highlight = createMentionHighlight({
    doc,
    shell,
    input: field,
    labels: () => suggestions.labels(),
  });
  return { suggestions, highlight };
}

/** Apply the Markdown shortcut represented by `event`, when it is one this field owns. */
function markdownShortcut(
  event: KeyboardEvent,
  singleLine: boolean,
  input: HTMLInputElement | HTMLTextAreaElement,
): boolean {
  if (singleLine || (!event.ctrlKey && !event.metaKey) || event.altKey) {
    return false;
  }
  const marker =
    event.key.toLowerCase() === "b" ? "**" : event.key.toLowerCase() === "i" ? "_" : null;
  if (marker === null) {
    return false;
  }
  event.preventDefault();
  wrapSelection(input, marker);
  return true;
}

/** Wrap the current selection, leaving the selected text selected and an empty caret between markers. */
function wrapSelection(input: HTMLInputElement | HTMLTextAreaElement, marker: string): void {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  const selected = input.value.slice(start, end);
  input.setRangeText(`${marker}${selected}${marker}`, start, end);
  input.setSelectionRange(start + marker.length, start + marker.length + selected.length);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** Turn a pasted HTTP(S) URL into an empty Markdown link whose label is ready to type. */
function pasteMarkdownLink(
  event: ClipboardEvent,
  input: HTMLInputElement | HTMLTextAreaElement,
): void {
  const link = pastedHttpUrl(event);
  if (link === null) {
    return;
  }
  event.preventDefault();
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(`[](${link})`, start, end);
  input.setSelectionRange(start + 1, start + 1);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/** The clipboard's URL when it contains only one HTTP(S) link; otherwise leave native paste alone. */
function pastedHttpUrl(event: ClipboardEvent): string | null {
  const text = event.clipboardData?.getData("text/plain").trim();
  if (text === undefined || text.length === 0) {
    return null;
  }
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? text : null;
  } catch {
    return null;
  }
}

/** The field itself: a one-line `input` or the multi-line Markdown `textarea`. */
function createField(
  doc: Document,
  options: MarkdownFieldOptions,
  singleLine: boolean,
): HTMLInputElement | HTMLTextAreaElement {
  // Themed field: ADO's own surface and border tokens so the box reads on light, dark and
  // Follow-ADO alike, with a fixed fallback for the tokens a theme may not define.
  const styles = [
    "width:100%",
    ...FIELD_TEXT_STYLE,
    "border-color:var(--palette-neutral-20)",
    "border-radius:3px",
    "background:var(--callout-background-color)",
    "color:var(--text-primary-color)",
  ];

  let input: HTMLInputElement | HTMLTextAreaElement;
  if (singleLine) {
    const line = doc.createElement("input");
    line.type = "text";
    input = line;
  } else {
    const box = doc.createElement("textarea");
    box.rows = options.rows ?? DEFAULT_ROWS;
    styles.push("resize:vertical");
    input = box;
  }

  input.className = "awesomeado-text-editor__input";
  input.value = options.initialText;
  if (options.maxLength !== undefined) {
    input.maxLength = options.maxLength;
  }
  input.placeholder = options.placeholder ?? (singleLine ? SINGLE_LINE_HINT : MULTILINE_HINT);
  input.style.cssText = styles.join(";");
  return input;
}
