import type { DirectoryUser, IUserDirectory } from "../../../ado/IUserDirectory";
import type { TrackedUser } from "../../../ado/TrackedWorkItem";
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
  /** Called when a new user is picked from the directory. */
  onChange?: (user: DirectoryUser) => void;
  /**
   * When true, render the assigned person's Feature Crew tag as a colored pill after their name (and
   * the neutral "??" pill when they have no tag yet). Off by default so views that do not use tags
   * stay uncluttered; the tag is read from `user.tag`.
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

/**
 * Build the picker popup shell: the floating container, its search input, and the (empty) results
 * list, with the input and list already mounted. Wiring the search + result behavior is the caller's.
 */
function buildPickerPopup(doc: Document): {
  popup: HTMLElement;
  searchInput: HTMLInputElement;
  resultsList: HTMLUListElement;
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
  ].join(";");

  popup.append(searchInput, resultsList);
  return { popup, searchInput, resultsList };
}

/**
 * Replace the results list with one selectable button per directory user. Each button reports the
 * picked user through `onPick`; a themed hover highlight makes the focused row obvious.
 */
function renderUserResults(
  doc: Document,
  resultsList: HTMLElement,
  users: DirectoryUser[],
  onPick: (user: DirectoryUser) => void,
): void {
  // Clear and repopulate the results list.
  resultsList.innerHTML = "";
  users.forEach((directoryUser) => {
    const li = doc.createElement("li");
    li.className = "awesomeado-assigned__result";

    const button = doc.createElement("button");
    button.type = "button";
    button.textContent = directoryUser.displayName;
    button.style.cssText = [
      "cursor:pointer",
      "border:none",
      "background:transparent",
      "padding:4px 8px",
      "width:100%",
      "text-align:left",
      "font:inherit",
      "color:inherit",
    ].join(";");

    button.addEventListener("click", () => onPick(directoryUser));

    // Hover highlight uses ADO theme token.
    button.addEventListener("mouseenter", () => {
      button.style.background = "var(--palette-neutral-4, #f3f2f1)";
    });
    button.addEventListener("mouseleave", () => {
      button.style.background = "transparent";
    });

    li.append(button);
    resultsList.append(li);
  });
}

/**
 * An assignee control showing the current user's name as clickable text that opens a picker popup.
 *
 * Displays "Unassigned" when no user is set. Clicking the name opens a search popup; typing
 * triggers directory searches and displays results. Selecting a result calls onChange and closes
 * the popup. Escape also closes. Theme-aware via ADO CSS custom properties.
 *
 * The popup is positioned absolutely within a relatively-positioned root so it floats under the name.
 */
export function renderAssignedTo(doc: Document, options: AssignedToOptions): HTMLElement {
  const {
    user,
    userDirectory,
    onChange,
    showTag = false,
    assignableTags = [],
    onTagChange,
  } = options;

  const { root, nameButton } = buildAssignedRoot(doc, user?.displayName ?? "Unassigned");

  // Show the person's Feature Crew tag as a colored pill beside their name (the neutral "??" pill
  // when they have no tag yet). Only for a real assignee — an unassigned slot wears no tag. With an
  // `onTagChange` handler the pill becomes a clickable editor for choosing/adding a tag.
  if (showTag && user !== null) {
    root.append(renderAssigneeTagPill(doc, root, user.tag ?? null, assignableTags, onTagChange));
  }

  // Track popup state and out-of-order response guard.
  let popup: HTMLElement | null = null;
  let requestSeq = 0;

  // Open the picker popup.
  const openPopup = () => {
    if (popup) return; // Already open.

    const built = buildPickerPopup(doc);
    popup = built.popup;
    const { searchInput, resultsList } = built;
    root.append(popup);

    // Search on every input event (no debounce; must be deterministic).
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim();
      const mySeq = ++requestSeq;

      userDirectory.search(query).then((users) => {
        // Guard against out-of-order responses: ignore stale results.
        if (mySeq !== requestSeq) return;

        renderUserResults(doc, resultsList, users, (directoryUser) => {
          onChange?.(directoryUser);
          // Update the name button label.
          nameButton.textContent = directoryUser.displayName;
          closePopup();
        });
      });
    });

    // Escape closes the popup.
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closePopup();
      }
    });

    searchInput.focus();
  };

  // Close the picker popup.
  const closePopup = () => {
    if (!popup) return;
    popup.remove();
    popup = null;
    requestSeq++; // Invalidate any in-flight searches.
  };

  // Toggle popup on name button click.
  nameButton.addEventListener("click", () => {
    if (popup) {
      closePopup();
    } else {
      openPopup();
    }
  });

  return root;
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
): HTMLElement {
  const pill = renderTagPill(doc, { tag: currentTag });
  // Collapse the shared pill's tall line-height and trim its box so it nearly fills the short chip
  // instead of stretching it past the status badge's height. The shared pill is already an
  // inline-flex with align-items:center; add justify-content:center so the label sits dead-centre
  // both ways once the taller line-height is removed.
  pill.style.lineHeight = "1";
  pill.style.padding = "2px 7px";
  pill.style.justifyContent = "center";
  pill.style.textAlign = "center";

  if (onTagChange === undefined) {
    return pill;
  }

  pill.style.cursor = "pointer";

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

  return pill;
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
