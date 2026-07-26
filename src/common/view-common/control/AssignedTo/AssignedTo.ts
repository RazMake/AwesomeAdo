import type { DirectoryUser, IUserDirectory } from "../../../ado/IUserDirectory";
import type { TrackedUser } from "../../../ado/TrackedWorkItem";
import { MIN_IDENTITY_SEARCH_LENGTH } from "../../../ado/fetchAdoIdentities";
import { renderTagPill, tagPillBackground, UNTAGGED_LABEL } from "../TagPill/TagPill";
import { createPopupHost } from "../popupHost/popupHost";

/** The most characters a hand-added Feature Crew tag may have. */
export const MAX_TAG_LENGTH = 15;

/**
 * Options for rendering an assignee control.
 */
export interface AssignedToOptions {
  /** The currently assigned user; null means unassigned. */
  user: TrackedUser | null;
  /** The user directory for searching and resolving users. */
  userDirectory: IUserDirectory;
  /**
   * The people offered the moment the picker opens, before anything is typed — normally the
   * project's Feature Crew, which is who an assignment changes to almost every time. Read fresh on
   * each open so someone assigned a moment ago is already on the list. Defaults to nobody, in which
   * case the picker offers only what the directory search returns. Each suggestion may carry the
   * person's crew `tag`, which the picker shows alongside their name when `showTag` is on.
   */
  suggestions?: () => TrackedUser[];
  /** Called when a new user is picked from the directory. */
  onChange?: (user: DirectoryUser) => void;
  /**
   * When true, render the assigned person's Feature Crew tag as a colored pill after their name (and
   * the neutral "??" pill when they have no tag yet). Off by default so views that do not use tags
   * stay uncluttered; the tag is read from `user.tag`. This governs the CHIP only — the picker tags
   * the people it offers whenever `suggestions` carry tags, since a tagless chip (the Tech Lead, a
   * dense list) still benefits from seeing which crew a candidate belongs to.
   */
  showTag?: boolean;
  /**
   * The tags already in use across the board, offered as one-click choices in the tag editor. Only
   * meaningful alongside `showTag` and `onTagChange`.
   */
  assignableTags?: string[];
  /**
   * Called with the tag the user picked (an existing one) or added (a non-empty, space-free name of
   * at most {@link MAX_TAG_LENGTH} characters that does not duplicate an existing tag) for this
   * assignee. Providing it turns the tag pill into a clickable editor; omit it for a read-only pill.
   */
  onTagChange?: (tag: string) => void;
}

/**
 * The rendered control plus the hook its owner uses to reflect a committed assignment.
 *
 * Mirrors `StatusBadgeHandle` and `EtaBadgeHandle`: the control never repaints itself when a value
 * is picked, so the owner can write to Azure DevOps first and only show what ADO actually accepted.
 */
export interface AssignedToHandle extends HTMLElement {
  /** Show `user` as the current assignee (and their tag); `null` renders "Unassigned". */
  setUser(user: TrackedUser | null): void;
}

/**
 * Build the assignee chip's root container and its clickable name button (the popup trigger).
 * Returns both so the caller can anchor the picker popup to the root and re-label the button on pick.
 */
function buildAssignedRoot(
  doc: Document,
  label: string,
): { root: HTMLElement; nameButton: HTMLButtonElement } {
  // Root container: position:relative so the popup can anchor to it.
  const root = doc.createElement("span");
  root.className = "awesomeado-assigned";
  root.style.cssText = [
    "position:relative",
    "display:inline-flex",
    "align-items:center",
    // Snug gap so the tag pill sits close to the name and to the chip's edge (keeps the chip short).
    "gap:4px",
    // A very faint fixed-grey fill (not a theme token) so the control reads as a subtle chip on every
    // theme, including Follow ADO where surface tokens can collapse into the page color.
    "background:rgba(128,128,128,0.12)",
    "border-radius:6px",
    // The chip carries NO border, so to stand the same 18px tall as the (bordered) status badge it
    // sits beside — and stay vertically centered with it on a tree row — its vertical padding (4px)
    // absorbs the 2px the badge spends on its border. 4px top/bottom + 10px text = 18px.
    "padding:4px 5px",
  ].join(";");

  // The name button showing the current assignee (clickable text, no border/background).
  const nameButton = doc.createElement("button");
  nameButton.className = "awesomeado-assigned__name";
  nameButton.type = "button";
  nameButton.textContent = label;
  nameButton.style.cssText = [
    "cursor:pointer",
    "border:none",
    "background:transparent",
    "padding:0",
    "font:inherit",
    // Match the status badge's type size and collapse the inherited 1.8 line-height so the name does
    // not inflate the chip; this keeps the assignee chip the same height as the status badge.
    "font-size:10px",
    "line-height:1",
    // Slightly muted (secondary) so the assignee reads as supporting detail, not a primary heading.
    "color:var(--text-secondary-color, #8a8886)",
  ].join(";");

  root.append(nameButton);
  return { root, nameButton };
}

/** The class the spinner's keyframes are bound to, shared by the rule and the element. */
const SPINNER_CLASS = "awesomeado-assigned__spinner";

/**
 * Build the spinning ring that says a directory round-trip is still running, plus the stylesheet its
 * animation needs.
 *
 * The rule lives INSIDE the popup (not in `document.head`) so it is created and discarded with the
 * popup it belongs to, and so it still applies if this control is ever mounted inside a shadow root.
 * Its colors are fixed low-alpha greys rather than palette tokens: under "Follow ADO" those tokens
 * resolve to the surface the popup is already painted with, which is how the old text-only status
 * could be there and still be missed.
 */
function buildSearchSpinner(doc: Document): { spinner: HTMLElement; style: HTMLStyleElement } {
  const style = doc.createElement("style");
  style.textContent = `@keyframes awesomeado-assigned-spin{to{transform:rotate(360deg)}}.${SPINNER_CLASS}{animation:awesomeado-assigned-spin 0.7s linear infinite}`;

  const spinner = doc.createElement("span");
  spinner.className = SPINNER_CLASS;
  spinner.style.cssText = [
    "display:none",
    "flex:0 0 auto",
    "width:10px",
    "height:10px",
    "border:2px solid rgba(128,128,128,0.35)",
    "border-top-color:rgba(128,128,128,0.95)",
    "border-radius:50%",
  ].join(";");
  return { spinner, style };
}

/**
 * Build the picker popup shell: the floating container, its search input, the status line, and the
 * (empty) results list, already mounted. Wiring the search + result behavior is the caller's.
 */
function buildPickerPopup(doc: Document): {
  popup: HTMLElement;
  searchInput: HTMLInputElement;
  resultsList: HTMLUListElement;
  statusText: HTMLElement;
  spinner: HTMLElement;
} {
  const popup = doc.createElement("div");
  popup.className = "awesomeado-assigned__popup";
  // Theme-aware colors: use ADO custom properties with fallbacks.
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "background:var(--callout-background-color, var(--background-color, #fff))",
    "border:1px solid var(--palette-neutral-20, #ddd)",
    "border-radius:3px",
    "box-shadow:0 2px 8px rgba(0,0,0,0.15)",
    "min-width:200px",
    "max-width:300px",
    "padding:8px",
    "z-index:1000",
  ].join(";");

  const searchInput = doc.createElement("input");
  searchInput.className = "awesomeado-assigned__search";
  searchInput.type = "text";
  searchInput.placeholder = "Search people…";
  searchInput.style.cssText = [
    "width:100%",
    "box-sizing:border-box",
    "border:1px solid var(--palette-neutral-20, #ddd)",
    "border-radius:3px",
    "padding:4px 8px",
    "font:inherit",
    "margin-bottom:8px",
  ].join(";");

  const resultsList = doc.createElement("ul");
  resultsList.className = "awesomeado-assigned__results";
  resultsList.style.cssText = [
    "list-style:none",
    "margin:0",
    "padding:0",
    "max-height:200px",
    "overflow-y:auto",
    // Never scroll sideways: each row truncates instead (see `truncatedLine`). A directory address
    // is one unbreakable token, so without this a single long address would widen every row and put
    // a horizontal scrollbar under the whole list — forcing the user to scroll just to see who is
    // next, and stealing vertical space from the list at the same time.
    "overflow-x:hidden",
  ].join(";");

  // The picker used to render an empty box while it had nothing to offer, which is indistinguishable
  // from a broken directory. This row always says which of the two it is — and while a search is
  // running it spins, so a slow round-trip reads as "wait" rather than as "nobody matched".
  const statusLine = doc.createElement("div");
  statusLine.className = "awesomeado-assigned__status";
  statusLine.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:6px",
    "font-size:11px",
    "padding:4px 8px",
    // Muted with opacity over the INHERITED color rather than a secondary-color token: those tokens
    // collapse into the surrounding text (or the surface) under "Follow ADO", which is how the
    // status could be present and invisible at the same time.
    "color:inherit",
    "opacity:0.75",
  ].join(";");

  const { spinner, style } = buildSearchSpinner(doc);
  const statusText = doc.createElement("span");
  statusText.className = "awesomeado-assigned__status-text";
  statusLine.append(spinner, statusText);

  popup.append(style, searchInput, resultsList, statusLine);
  return { popup, searchInput, resultsList, statusText, spinner };
}

/**
 * The fill worn by the one result row that Enter would commit.
 *
 * A fixed low-alpha grey, not `--palette-neutral-4`: under "Follow ADO" that token resolves to ADO's
 * own surface color, which is what the popup is already painted with — so the highlighted row was
 * indistinguishable from the rest of the list on exactly the theme most people run. Grey at this
 * alpha darkens a light popup and lightens a dark one, so the highlight reads on every theme (the
 * same self-contained fix the ETA picker's chrome uses).
 */
const HIGHLIGHT_BACKGROUND = "rgba(128,128,128,0.28)";

/**
 * The declarations that keep one line of a result row on a single line, clipped with an ellipsis.
 *
 * Named once because both lines of the row need identical treatment: the popup is width-capped, and
 * a display name or directory address longer than that cap would otherwise push the row wider than
 * the list and drag a horizontal scrollbar in behind it. An address is a single unbreakable token,
 * so wrapping is not an option either. The full value stays reachable through the element's `title`,
 * so truncating costs the reader nothing.
 */
function truncatedLine(...extra: string[]): string {
  return [
    "display:block",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
    ...extra,
  ].join(";");
}

/**
 * Build one selectable result row. The unique name is shown underneath because a directory search
 * routinely returns two people who share a display name, and the address is the only thing that
 * tells them apart; the crew tag (or the neutral "??" pill for anyone without one) sits at the end
 * so the crew a name belongs to is visible while choosing, not only after the pick.
 */
function buildResultRow(doc: Document, user: TrackedUser, showTags: boolean): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.style.cssText = [
    "cursor:pointer",
    "border:none",
    "background:transparent",
    "padding:4px 8px",
    "width:100%",
    // Without this the row's intrinsic (untruncated) content sets its width, so `width:100%` is a
    // floor rather than a ceiling and a long name still widens the list.
    "box-sizing:border-box",
    "max-width:100%",
    "min-width:0",
    "text-align:left",
    "font:inherit",
    "color:inherit",
    "display:flex",
    "align-items:center",
    "gap:6px",
  ].join(";");

  const identity = doc.createElement("span");
  identity.className = "awesomeado-assigned__result-identity";
  // Takes the slack so the tag pill is pushed to the row's trailing edge and every pill lines up.
  identity.style.cssText = "flex:1 1 auto;min-width:0";

  const name = doc.createElement("span");
  name.className = "awesomeado-assigned__result-name";
  name.style.cssText = truncatedLine();
  name.textContent = user.displayName;
  // The tooltip is the escape hatch for a name the row had to clip.
  name.title = user.displayName;
  identity.append(name);

  if (user.uniqueName !== null && user.uniqueName.length > 0) {
    const unique = doc.createElement("span");
    unique.className = "awesomeado-assigned__result-unique";
    unique.style.cssText = truncatedLine(
      "font-size:10px",
      "color:var(--text-secondary-color, #8a8886)",
    );
    unique.textContent = user.uniqueName;
    unique.title = user.uniqueName;
    identity.append(unique);
  }
  button.append(identity);

  if (showTags) {
    // A person the directory returned who has never worked on this project carries no tag at all,
    // which reads the same as a known-but-untagged person: the neutral "??" pill.
    const pill = renderTagPill(doc, { tag: user.tag ?? null });
    compactTagPill(pill);
    pill.style.flex = "0 0 auto";
    button.append(pill);
  }
  return button;
}

/** The result list, plus the keyboard-driven highlight that decides what Enter commits. */
interface ResultRows {
  /** Repaint the list for `users`; the first row is highlighted so Enter commits the top match. */
  setUsers(users: TrackedUser[]): void;
  /** Move the highlight by `delta` rows, wrapping around both ends like a native dropdown. */
  move(delta: number): void;
  /** Commit the highlighted row; a no-op when the list is empty. */
  commitHighlighted(): void;
}

/**
 * Own the results list and its highlight.
 *
 * The highlight is a single index rather than DOM focus so typing never leaves the search box: a
 * native dropdown lets you keep refining the query while the arrows walk the list, and moving focus
 * onto a row would swallow the next keystroke. Hovering a row moves the same highlight, so the mouse
 * and the arrow keys can never disagree about what Enter would pick.
 */
function createResultRows(
  doc: Document,
  resultsList: HTMLElement,
  showTags: boolean,
  onPick: (user: TrackedUser) => void,
): ResultRows {
  let offered: TrackedUser[] = [];
  let rows: HTMLButtonElement[] = [];
  let highlighted = -1;

  const paintHighlight = (): void => {
    rows.forEach((row, index) => {
      row.style.background = index === highlighted ? HIGHLIGHT_BACKGROUND : "transparent";
    });
    // Keep the highlight visible while arrowing through a list taller than its scroll box. Guarded
    // because layout-free environments (jsdom) do not implement scrollIntoView.
    rows[highlighted]?.scrollIntoView?.({ block: "nearest" });
  };

  return {
    setUsers: (users) => {
      offered = users;
      resultsList.innerHTML = "";
      rows = users.map((user, index) => {
        const row = buildResultRow(doc, user, showTags);
        row.addEventListener("click", () => onPick(user));
        row.addEventListener("mouseenter", () => {
          highlighted = index;
          paintHighlight();
        });
        const li = doc.createElement("li");
        li.className = "awesomeado-assigned__result";
        li.append(row);
        resultsList.append(li);
        return row;
      });
      // Pre-highlighting the top row makes Enter alone accept the most likely choice, which is what
      // a native dropdown does; a fresh list must never keep a stale index from the previous query.
      highlighted = rows.length > 0 ? 0 : -1;
      paintHighlight();
    },
    move: (delta) => {
      if (rows.length === 0) {
        return;
      }
      highlighted = (highlighted + delta + rows.length) % rows.length;
      paintHighlight();
    },
    commitHighlighted: () => {
      const user = offered[highlighted];
      if (user) {
        onPick(user);
      }
    },
  };
}

/** Whether `user` matches the typed text on either the display name or the unique name. */
function matchesQuery(user: TrackedUser, lowerQuery: string): boolean {
  return (
    user.displayName.toLowerCase().includes(lowerQuery) ||
    (user.uniqueName?.toLowerCase().includes(lowerQuery) ?? false)
  );
}

/**
 * Append the directory's answer to the locally-matched suggestions, dropping anyone already offered.
 * Suggestions stay first on purpose: they are the people working on this very project, so the person
 * being looked for is almost always among them, and pushing the organization-wide matches below keeps
 * the common case a single glance.
 */
function mergeDirectoryResults(suggested: TrackedUser[], found: DirectoryUser[]): TrackedUser[] {
  const keyOf = (user: DirectoryUser): string =>
    (user.uniqueName ?? user.displayName).toLowerCase();
  const seen = new Set(suggested.map(keyOf));
  return [...suggested, ...found.filter((user) => !seen.has(keyOf(user)))];
}

/** What the picker's status line says about the current query and result set. */
function pickerStatus(query: string, resultCount: number, searching: boolean): string {
  if (searching) {
    return "Searching Azure DevOps…";
  }
  if (query.length > 0 && query.length < MIN_IDENTITY_SEARCH_LENGTH) {
    return "Keep typing to search Azure DevOps…";
  }
  if (resultCount === 0) {
    return query.length === 0 ? "Type a name to search Azure DevOps." : "No people found.";
  }
  return "";
}

/** Everything the picker popup needs to offer people and report the one that was picked. */
interface PickerOptions {
  doc: Document;
  root: HTMLElement;
  nameButton: HTMLButtonElement;
  userDirectory: IUserDirectory;
  /** Read fresh on every open, so a person assigned a moment ago is already offered. */
  suggestions: () => TrackedUser[];
  onChange: ((user: DirectoryUser) => void) | undefined;
}

/**
 * Wire the name button to the people picker.
 *
 * The popup lifecycle (outside-click and Escape dismissal, staying inside the viewport) is delegated
 * to the shared popup host: this control previously rolled its own and only closed when the trigger
 * itself was clicked again, which left the list stranded over the board.
 *
 * Suggestions are painted the instant the popup opens and are filtered locally as the user types, so
 * the common case — reassigning to someone already on this project — never waits on the network. A
 * query long enough to be meaningful additionally asks the directory, and those matches are appended
 * when they arrive; a sequence guard drops the answer to a query the user has already typed past.
 *
 * The picker behaves like a native dropdown: it opens with the caret already in the search box, the
 * arrow keys walk the list, and Enter commits the highlighted person.
 *
 * Rows wear a crew tag pill whenever the suggestions carry tag data — read from the offered people
 * rather than from the chip's own `showTag`, because a chip can have good reason to stay tagless (the
 * Tech Lead, the dense rolled-up children list) while the roomy picker still benefits from showing
 * which crew each candidate belongs to. A view whose people carry no tags gets no pills at all.
 */
function createPicker(options: PickerOptions): void {
  const { doc, root, nameButton, userDirectory, suggestions, onChange } = options;
  // Rebuilt on each open (the popup is discarded on close), so focus always lands on the live input.
  let searchBox: HTMLInputElement | null = null;

  createPopupHost({
    doc,
    trigger: nameButton,
    mountInto: root,
    buildPopup: (close) => {
      const { popup, searchInput, resultsList, statusText, spinner } = buildPickerPopup(doc);
      searchBox = searchInput;
      const offered = suggestions();
      const showTags = offered.some((person) => person.tag !== undefined);
      // A stale directory answer must never overwrite a newer one; the counter is per-open because
      // the popup (and every in-flight search it owns) is discarded on close.
      let requestSeq = 0;

      const rows = createResultRows(doc, resultsList, showTags, (picked) => {
        // Persist-then-reflect (matching the status and ETA controls): the caller writes the
        // change and calls `setUser` once ADO accepts it, so a rejected write never leaves a name
        // on screen that was never saved.
        onChange?.(picked);
        close();
      });

      const show = (users: TrackedUser[], query: string, searching: boolean): void => {
        rows.setUsers(users);
        statusText.textContent = pickerStatus(query, users.length, searching);
        // The spinner is the only signal that survives a glance: a round-trip can outlast the
        // reader's patience, and a still list plus one line of small text reads as "nothing found".
        spinner.style.display = searching ? "inline-block" : "none";
      };

      searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim();
        const mySeq = ++requestSeq;
        const lower = query.toLowerCase();
        const matched =
          query.length === 0 ? offered : offered.filter((user) => matchesQuery(user, lower));
        const willSearch = query.length >= MIN_IDENTITY_SEARCH_LENGTH;
        show(matched, query, willSearch);
        if (!willSearch) {
          return;
        }
        void userDirectory.search(query).then((found) => {
          if (mySeq !== requestSeq) return;
          show(mergeDirectoryResults(matched, found), query, false);
        });
      });

      // Bound to the popup, not the input, so the keys keep working wherever focus wandered inside
      // it. Escape is deliberately left alone — the popup host already closes on it.
      popup.addEventListener("keydown", (event) => handlePickerKey(event, rows));

      show(offered, "", false);
      return popup;
    },
    // Focusing has to wait until the popup is mounted: an element that is still detached cannot
    // take focus, so the picker used to open with the caret left behind on the page.
    onOpened: () => searchBox?.focus(),
  });
}

/** Drive the picker from the keyboard the way a native dropdown does: arrows walk, Enter commits. */
function handlePickerKey(event: KeyboardEvent, rows: ResultRows): void {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    // Stop the arrows from jumping the caret to either end of the typed query.
    event.preventDefault();
    rows.move(event.key === "ArrowDown" ? 1 : -1);
    return;
  }
  if (event.key === "Enter") {
    // The picker lives inside ADO's own page; an un-prevented Enter can submit a surrounding form.
    event.preventDefault();
    rows.commitHighlighted();
  }
}

/**
 * Mount the assignee's tag pill on the chip when the caller asked for one, or return null when this
 * view does not use crew tags at all. The pill exists for an unassigned slot too — just hidden — so
 * a later reassignment can reveal it without rebuilding the chip.
 */
function mountTagSlot(
  doc: Document,
  root: HTMLElement,
  user: TrackedUser | null,
  options: AssignedToOptions,
): TagPillSlot | null {
  if (options.showTag !== true) {
    return null;
  }
  const slot = renderAssigneeTagPill(
    doc,
    root,
    user?.tag ?? null,
    options.assignableTags ?? [],
    options.onTagChange,
  );
  root.append(slot.pill);
  return slot;
}

/** Paint the chip for `assigned`: their name (or "Unassigned") and, when present, their tag pill. */
function showAssignee(
  nameButton: HTMLButtonElement,
  tagSlot: TagPillSlot | null,
  assigned: TrackedUser | null,
): void {
  nameButton.textContent = assigned?.displayName ?? "Unassigned";
  if (tagSlot === null) {
    return;
  }
  // An unassigned slot wears no tag, so the pill is hidden rather than removed.
  tagSlot.pill.style.display = assigned === null ? "none" : "";
  tagSlot.applyTag(assigned?.tag ?? "");
}

/**
 * An assignee control showing the current user's name as clickable text that opens a picker popup.
 *
 * Displays "Unassigned" when no user is set. Clicking the name opens a people picker that lists the
 * caller's suggestions (the project's Feature Crew) straight away, filters them as you type, and
 * searches Azure DevOps' directory for anything longer than a couple of characters. Picking someone
 * calls `onChange` and closes the popup; an outside click or Escape closes it without changing the
 * assignment. Theme-aware via ADO CSS custom properties.
 *
 * The control does NOT repaint itself when someone is picked. Like the status and ETA controls it is
 * persist-then-reflect: the caller writes to Azure DevOps and calls `setUser` on the returned handle
 * once the write is accepted, so a rejected write can never leave an unsaved name on the board.
 *
 * The popup is positioned absolutely within a relatively-positioned root so it floats under the name.
 */
export function renderAssignedTo(doc: Document, options: AssignedToOptions): AssignedToHandle {
  const { user, userDirectory, suggestions = () => [], onChange } = options;

  const { root, nameButton } = buildAssignedRoot(doc, "Unassigned");
  const tagSlot = mountTagSlot(doc, root, user, options);
  showAssignee(nameButton, tagSlot, user);

  createPicker({ doc, root, nameButton, userDirectory, suggestions, onChange });

  const handle = root as AssignedToHandle;
  handle.setUser = (assigned) => {
    showAssignee(nameButton, tagSlot, assigned);
  };
  return handle;
}

/** The assignee's tag pill plus the hook that repaints it when the tag (or the assignee) changes. */
interface TagPillSlot {
  pill: HTMLElement;
  /** Repaint the pill for `tag`; an empty string means "assigned but untagged" (the "??" pill). */
  applyTag: (tag: string) => void;
}

/**
 * Collapse the shared pill's tall line-height and trim its box so it nearly fills the short chip
 * instead of stretching it past the status badge's height. The shared pill is already an inline-flex
 * with align-items:center; add justify-content:center so the label sits dead-centre both ways once
 * the taller line-height is removed. Shared with the picker's rows so a person's tag looks identical
 * wherever it is shown.
 */
function compactTagPill(pill: HTMLElement): void {
  pill.style.lineHeight = "1";
  pill.style.padding = "2px 7px";
  pill.style.justifyContent = "center";
  pill.style.textAlign = "center";
}

/**
 * Render the assignee's tag as a compact pill. Alone it is a static label; with an `onTagChange`
 * handler it becomes a clickable trigger that opens the tag editor (existing tags to pick from plus
 * an add-a-new-tag field). The pill is compacted so the assignee chip stays as short as the status
 * badge — the shared TagPill's tall line-height would otherwise inflate the chip.
 */
function renderAssigneeTagPill(
  doc: Document,
  root: HTMLElement,
  currentTag: string | null,
  assignableTags: string[],
  onTagChange: ((tag: string) => void) | undefined,
): TagPillSlot {
  const pill = renderTagPill(doc, { tag: currentTag });
  compactTagPill(pill);

  // Reflect a committed choice on the pill immediately. The owner typically re-renders the tree too,
  // but painting here keeps the chip correct in the gap before that refresh lands. Tracked so a
  // reopened editor highlights the now-current tag even without an intervening re-render.
  let activeTag = currentTag;
  const applyTag = (tag: string): void => {
    const normalized = tag.length > 0 ? tag : null;
    activeTag = normalized;
    pill.textContent = normalized ?? UNTAGGED_LABEL;
    pill.style.background = tagPillBackground(normalized);
    pill.classList.toggle("awesomeado-tag-pill--untagged", normalized === null);
  };

  if (onTagChange === undefined) {
    return { pill, applyTag };
  }

  pill.style.cursor = "pointer";

  createPopupHost({
    doc,
    trigger: pill,
    mountInto: root,
    buildPopup: (close) =>
      buildTagEditor(doc, activeTag, assignableTags, (tag) => {
        applyTag(tag);
        onTagChange(tag);
        close();
      }),
  });

  return { pill, applyTag };
}

/**
 * Build the row of existing tags as one-click choices; the current tag reads selected. Picking one
 * commits it through `onPick`.
 */
function buildTagChoices(
  doc: Document,
  activeTag: string | null,
  assignableTags: string[],
  onPick: (tag: string) => void,
): HTMLElement {
  const choices = doc.createElement("div");
  choices.className = "awesomeado-assigned__tag-choices";
  choices.style.cssText = "display:flex;flex-wrap:wrap;gap:6px";
  for (const tag of assignableTags) {
    choices.append(
      renderTagPill(doc, {
        tag,
        interactive: true,
        selected: activeTag !== null && tag.toLowerCase() === activeTag.toLowerCase(),
        onToggle: () => onPick(tag),
      }),
    );
  }
  return choices;
}

/**
 * Build the add-a-new-tag row: a text field plus an Add button that stays disabled until the entry
 * is valid (non-empty, space-free, at most {@link MAX_TAG_LENGTH} characters, and not a
 * case-insensitive duplicate of an existing tag), so an invalid or duplicate tag can never be
 * committed. Spaces are stripped as they are typed/pasted, and Enter submits when the entry is valid.
 */
function buildTagAddRow(
  doc: Document,
  assignableTags: string[],
  onPick: (tag: string) => void,
): HTMLElement {
  const addRow = doc.createElement("div");
  addRow.className = "awesomeado-assigned__tag-add";
  addRow.style.cssText = "display:flex;gap:6px;margin-top:8px";

  const input = doc.createElement("input");
  input.className = "awesomeado-assigned__tag-input";
  input.type = "text";
  input.maxLength = MAX_TAG_LENGTH;
  input.placeholder = "New tag";
  input.style.cssText = [
    "flex:1 1 auto",
    "min-width:0",
    "box-sizing:border-box",
    "border:1px solid var(--palette-neutral-20, #ddd)",
    "border-radius:3px",
    "padding:2px 6px",
    "font:inherit",
    "font-size:11px",
  ].join(";");

  const addButton = doc.createElement("button");
  addButton.className = "awesomeado-assigned__tag-add-button";
  addButton.type = "button";
  addButton.textContent = "Add";
  addButton.style.cssText = [
    "cursor:pointer",
    "border:1px solid var(--palette-neutral-20, #ddd)",
    "border-radius:3px",
    "background:transparent",
    "padding:2px 8px",
    "font:inherit",
    "font-size:11px",
  ].join(";");

  const existingLower = new Set(assignableTags.map((tag) => tag.toLowerCase()));
  // Spaces are disallowed, so a bare "must not be a duplicate" is the only reason left to show;
  // maxLength on the input already caps the length and strips the ability to type past it.
  const isDuplicate = (value: string): boolean => existingLower.has(value.toLowerCase());
  const isAddable = (value: string): boolean =>
    value.length > 0 && value.length <= MAX_TAG_LENGTH && !isDuplicate(value);

  const refreshAddState = (): void => {
    const value = input.value;
    const addable = isAddable(value);
    addButton.disabled = !addable;
    addButton.style.opacity = addable ? "1" : "0.5";
    addButton.style.cursor = addable ? "pointer" : "default";
  };

  input.addEventListener("input", () => {
    // Strip spaces as they are typed (or pasted) so the field can only ever hold a space-free tag.
    const stripped = input.value.replace(/\s+/g, "");
    if (stripped !== input.value) {
      input.value = stripped;
    }
    refreshAddState();
  });

  const submit = (): void => {
    const value = input.value;
    if (isAddable(value)) {
      onPick(value);
    }
  };

  addButton.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  });

  refreshAddState();
  addRow.append(input, addButton);
  return addRow;
}

/**
 * Build the tag-editor popup: the tags already in use as one-click choices, plus a field to add a
 * new one. The new-tag validation rules live in {@link buildTagAddRow}.
 */
function buildTagEditor(
  doc: Document,
  activeTag: string | null,
  assignableTags: string[],
  onPick: (tag: string) => void,
): HTMLElement {
  const popup = doc.createElement("div");
  popup.className = "awesomeado-assigned__tag-popup";
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "background:var(--callout-background-color, var(--background-color, #fff))",
    "border:1px solid var(--palette-neutral-20, #ddd)",
    "border-radius:3px",
    "box-shadow:0 2px 8px rgba(0,0,0,0.15)",
    "min-width:180px",
    "max-width:260px",
    "padding:8px",
    "z-index:1000",
  ].join(";");

  // Existing tags as one-click choices; nothing to pick from is still fine — the add field below
  // always offers a way forward.
  if (assignableTags.length > 0) {
    popup.append(buildTagChoices(doc, activeTag, assignableTags, onPick));
  }

  popup.append(buildTagAddRow(doc, assignableTags, onPick));
  return popup;
}
