import type { DirectoryUser, IUserDirectory } from "../../../ado/IUserDirectory";
import { MIN_IDENTITY_SEARCH_LENGTH } from "../../../ado/fetchAdoIdentities";
import { MENTION_TOKEN_PATTERN } from "../../../ado/mentionIdentities";
import type { ILogger } from "../../../logging/ILogger";

import { createFieldLayer } from "./fieldMetrics";

/** The services a Markdown editor needs to turn typed names into ADO mention references. */
export interface TextEditorMentionOptions {
  userDirectory: IUserDirectory;
  logger: ILogger;
  /**
   * Display names for the `@<guid>` tokens already in the text being edited, keyed by lowercase
   * GUID. Without it an author re-opening their own note is shown the raw identity ids they wrote.
   */
  mentionNames?: ReadonlyMap<string, string>;
}

/** The small part of the mention dropdown the editor's input events drive. */
export interface MentionSuggestions {
  refresh(): void;
  handleKeydown(event: KeyboardEvent): boolean;
  /** The stored source as the AUTHOR should see it: each `@<id>` reference shown as the person. */
  toDisplayText(source: string): string;
  /** The typed text as ADO must STORE it: each shown name back in its `@<id>` reference form. */
  toStoredText(text: string): string;
  /** The mention labels currently standing in for an identity, for the layer that paints them. */
  labels(): readonly string[];
}

interface ActiveMention {
  start: number;
  end: number;
  query: string;
}

interface MentionableUser extends DirectoryUser {
  id: string;
}

interface PopupParts {
  popup: HTMLElement;
  list: HTMLUListElement;
  status: HTMLElement;
}

/** ADO identity ids are GUIDs; anything else cannot become a valid `@<id>` reference. */
const IDENTITY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The separators after which `@` begins a mention, plus the beginning of the field. */
const ACTIVE_MENTION_PATTERN = /(?:^|[ ./\\\t])@([^@\r\n<>]*)$/;

/** How a mention READS while it is being edited: the person, not the id stored behind them. */
export function mentionLabel(displayName: string): string {
  return `@${displayName}`;
}

/** Kept in step with the popup's own `min-width`, so clamping cannot cut the list narrower. */
const POPUP_MIN_WIDTH_PX = 220;

/** Build a mention dropdown controlled by the textarea's own input and keyboard events. */
export function createMentionSuggestions(
  doc: Document,
  mount: HTMLElement,
  input: HTMLTextAreaElement,
  options: TextEditorMentionOptions,
): MentionSuggestions {
  return new MentionSuggestionController(doc, mount, input, options);
}

class MentionSuggestionController implements MentionSuggestions {
  private readonly popup: HTMLElement;
  private readonly list: HTMLUListElement;
  private readonly status: HTMLElement;
  private active: ActiveMention | null = null;
  private users: MentionableUser[] = [];
  private rows: HTMLButtonElement[] = [];
  private highlighted = -1;
  private sequence = 0;
  /** Each name this editor inserted, against the reference it stands for. */
  private readonly inserted = new Map<string, string>();

  constructor(
    private readonly doc: Document,
    private readonly mount: HTMLElement,
    private readonly input: HTMLTextAreaElement,
    private readonly options: TextEditorMentionOptions,
  ) {
    const parts = buildPopup(doc);
    this.popup = parts.popup;
    this.list = parts.list;
    this.status = parts.status;
    input.addEventListener("blur", () => {
      setTimeout(() => {
        if (!mount.contains(doc.activeElement)) {
          this.close();
        }
      }, 0);
    });
  }

  refresh(): void {
    const active = activeMentionAt(this.input);
    if (active === null || this.isSettled(active)) {
      this.close();
      return;
    }
    this.active = active;
    this.open();
    this.position();
    const query = active.query.trim();
    if (query.length < MIN_IDENTITY_SEARCH_LENGTH) {
      this.sequence++;
      this.show([], query.length === 0 ? "Type a name…" : "Keep typing…");
      return;
    }
    this.search(query);
  }

  handleKeydown(event: KeyboardEvent): boolean {
    // A closed list owns no keys: Escape must still cancel the editor and the arrows must still move
    // the caret.
    if (!this.popup.isConnected) {
      return false;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return true;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      this.move(event.key === "ArrowDown" ? 1 : -1);
      return true;
    }
    if (event.key === "Enter" && !event.ctrlKey && !event.metaKey && this.highlighted >= 0) {
      event.preventDefault();
      this.insertHighlighted();
      return true;
    }
    return false;
  }

  private open(): void {
    if (!this.popup.isConnected) {
      this.mount.append(this.popup);
    }
  }

  /** Put the list under the `@` being completed, not under a box that may be many lines tall. */
  private position(): void {
    if (this.active === null) {
      return;
    }
    const caret = caretPositionIn(this.doc, this.input, this.active.start);
    const rightmost = Math.max(0, this.input.clientWidth - POPUP_MIN_WIDTH_PX);
    this.popup.style.top = `${Math.max(0, caret.top)}px`;
    this.popup.style.left = `${Math.max(0, Math.min(caret.left, rightmost))}px`;
  }

  private close(): void {
    this.sequence++;
    this.active = null;
    this.users = [];
    this.rows = [];
    this.highlighted = -1;
    this.popup.remove();
  }

  private search(query: string): void {
    const sequence = ++this.sequence;
    this.show([], "Searching Azure DevOps…");
    void this.options.userDirectory
      .search(query)
      .then((users) => {
        if (sequence !== this.sequence) {
          return;
        }
        const mentionable = users.filter(isMentionableUser);
        this.show(mentionable, mentionable.length === 0 ? "No people found." : "");
      })
      .catch((error: unknown) => {
        if (sequence !== this.sequence) {
          return;
        }
        this.options.logger.error("Could not search Azure DevOps for an @-mention", error);
        this.show([], "Could not search people.");
      });
  }

  private show(users: MentionableUser[], message: string): void {
    this.users = users;
    this.list.replaceChildren();
    this.rows = users.map((user, index) => {
      const row = buildUserRow(this.doc, user);
      row.addEventListener("mousedown", (event) => event.preventDefault());
      row.addEventListener("mouseenter", () => {
        this.highlighted = index;
        this.paintHighlight();
      });
      row.addEventListener("click", () => this.insert(index));
      const item = this.doc.createElement("li");
      item.append(row);
      this.list.append(item);
      return row;
    });
    this.highlighted = users.length > 0 ? 0 : -1;
    this.status.textContent = message;
    this.status.style.display = message.length > 0 ? "block" : "none";
    this.paintHighlight();
  }

  private move(delta: number): void {
    if (this.rows.length === 0) {
      return;
    }
    this.highlighted = (this.highlighted + delta + this.rows.length) % this.rows.length;
    this.paintHighlight();
  }

  private paintHighlight(): void {
    this.rows.forEach((row, index) => {
      const selected = index === this.highlighted;
      row.style.background = selected ? "rgba(128,128,128,0.28)" : "transparent";
      row.setAttribute("aria-selected", selected ? "true" : "false");
    });
    this.rows[this.highlighted]?.scrollIntoView?.({ block: "nearest" });
  }

  private insertHighlighted(): void {
    this.insert(this.highlighted);
  }

  private insert(index: number): void {
    const user = this.users[index];
    const active = this.active;
    if (user === undefined || active === null) {
      return;
    }
    // The NAME is what goes in the box, so the author can see who they just picked; ADO's `@<id>`
    // reference is put back by `toStoredText` when the editor saves. The angle brackets are load
    // bearing: `ACTIVE_MENTION_PATTERN` excludes them, so typing on past a finished mention cannot
    // re-open the list and search for the name that is already settled.
    const label = mentionLabel(user.displayName);
    this.inserted.set(label, `@<${user.id}>`);
    this.input.setRangeText(label, active.start, active.end);
    const caret = active.start + label.length;
    this.input.setSelectionRange(caret, caret);
    this.close();
    this.input.focus();
    this.input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  toStoredText(text: string): string {
    let stored = text;
    for (const [label, reference] of this.inserted) {
      // Split/join rather than a regex: a display name is not a pattern and must not be read as one.
      stored = stored.split(label).join(reference);
    }
    return stored;
  }

  toDisplayText(source: string): string {
    const names = this.options.mentionNames;
    return source.replace(new RegExp(MENTION_TOKEN_PATTERN, "g"), (token, id: string) => {
      const name = names?.get(id.toLowerCase());
      if (name === undefined || name.length === 0) {
        // No name to show is not a reason to lose the mention: left as it is stored, it still saves.
        return token;
      }
      const label = mentionLabel(name);
      this.inserted.set(label, token);
      return label;
    });
  }

  labels(): readonly string[] {
    return [...this.inserted.keys()];
  }

  /**
   * Is this `@` a mention that is already settled, rather than one being typed?
   *
   * A name has spaces in it, so the text after a finished mention keeps matching as though it were
   * still the query — the list would reopen on every keystroke and search for the whole sentence.
   */
  private isSettled(active: ActiveMention): boolean {
    const typed = mentionLabel(active.query);
    return [...this.inserted.keys()].some((label) => typed.startsWith(label));
  }
}

/** The mention ending at the caret, or null when `@` was not typed after an allowed separator. */
function activeMentionAt(input: HTMLTextAreaElement): ActiveMention | null {
  const start = input.selectionStart;
  const end = input.selectionEnd;
  if (start === null || end === null || start !== end) {
    return null;
  }
  const match = ACTIVE_MENTION_PATTERN.exec(input.value.slice(0, start));
  if (match === null) {
    return null;
  }
  const at = match[0].lastIndexOf("@");
  return { start: match.index + at, end: start, query: match[1] ?? "" };
}

/** Only identities with the local ADO GUID can be inserted as a mention reference. */
function isMentionableUser(user: DirectoryUser): user is MentionableUser {
  return typeof user.id === "string" && IDENTITY_ID_PATTERN.test(user.id);
}

/**
 * Where the character at `index` sits inside the field, in pixels from its top-left corner.
 *
 * A textarea exposes no geometry for its own caret, so the text before it is laid out again in a
 * hidden copy of the field and the position of a marker at that point is read off. Copying the
 * field's metrics is what makes the copy wrap on the same words, which is the whole point: the line
 * being typed is what the popup has to sit under.
 */
function caretPositionIn(
  doc: Document,
  input: HTMLTextAreaElement,
  index: number,
): { top: number; left: number } {
  const mirror = createFieldLayer(doc, "awesomeado-text-editor__caret-mirror", false);
  mirror.style.visibility = "hidden";

  const marker = doc.createElement("span");
  // A zero-width space keeps the marker measurable when the caret ends a line.
  marker.textContent = "\u200b";
  mirror.textContent = input.value.slice(0, index);
  mirror.append(marker);
  input.parentElement?.append(mirror);
  const top = marker.offsetTop + marker.offsetHeight - input.scrollTop;
  const left = marker.offsetLeft - input.scrollLeft;
  mirror.remove();
  return { top, left };
}

/** The floating list, anchored at the caret by `position()`; it deliberately has no search box. */
function buildPopup(doc: Document): PopupParts {
  const popup = doc.createElement("div");
  popup.className = "awesomeado-text-editor__mentions";
  popup.style.cssText = [
    "position:absolute",
    "top:0",
    "left:0",
    "margin-top:4px",
    `min-width:${POPUP_MIN_WIDTH_PX}px`,
    "max-width:min(320px, 100%)",
    "padding:4px",
    "z-index:1001",
    "background:var(--callout-background-color, var(--background-color, #fff))",
    "border:1px solid rgba(128,128,128,0.45)",
    "border-radius:3px",
    "box-shadow:0 2px 8px rgba(0,0,0,0.15)",
  ].join(";");

  const list = doc.createElement("ul");
  list.className = "awesomeado-text-editor__mention-results";
  list.setAttribute("role", "listbox");
  list.style.cssText = "list-style:none;margin:0;padding:0;max-height:200px;overflow-y:auto";

  const status = doc.createElement("div");
  status.className = "awesomeado-text-editor__mention-status";
  status.style.cssText = "padding:4px 8px;font-size:11px;opacity:0.75";
  popup.append(list, status);
  return { popup, list, status };
}

/** One compact identity row, named and disambiguated by sign-in address when ADO supplied one. */
function buildUserRow(doc: Document, user: MentionableUser): HTMLButtonElement {
  const row = doc.createElement("button");
  row.type = "button";
  row.setAttribute("role", "option");
  row.style.cssText = [
    "display:block",
    "width:100%",
    "padding:4px 8px",
    "border:none",
    "background:transparent",
    "color:inherit",
    "font:inherit",
    "text-align:left",
    "cursor:pointer",
  ].join(";");
  const name = doc.createElement("span");
  name.textContent = user.displayName;
  name.style.cssText = "display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  row.append(name);
  if (user.uniqueName !== null) {
    const unique = doc.createElement("span");
    unique.textContent = user.uniqueName;
    unique.style.cssText =
      "display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;opacity:0.7";
    row.append(unique);
  }
  return row;
}
