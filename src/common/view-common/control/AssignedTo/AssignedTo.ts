import type { DirectoryUser, IUserDirectory } from "../../../ado/IUserDirectory";
import type { TrackedUser } from "../../../ado/TrackedWorkItem";
import { renderTagPill } from "../TagPill/TagPill";

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
  const { user, userDirectory, onChange, showTag = false } = options;

  // Root container: position:relative so the popup can anchor to it.
  const root = doc.createElement("span");
  root.className = "awesomeado-assigned";
  root.style.cssText = [
    "position:relative",
    "display:inline-flex",
    "align-items:center",
    "gap:6px",
    // A very faint fixed-grey fill (not a theme token) so the control reads as a subtle chip on every
    // theme, including Follow ADO where surface tokens can collapse into the page color.
    "background:rgba(128,128,128,0.12)",
    "border-radius:6px",
    // Vertical padding is sized so this chip's outer height matches the status badge (10px text +
    // 4px top/bottom = 18px, equal to the badge's 10px text + 3px padding + 1px border on each side).
    "padding:4px 7px",
  ].join(";");

  // The name button showing the current assignee (clickable text, no border/background).
  const nameButton = doc.createElement("button");
  nameButton.className = "awesomeado-assigned__name";
  nameButton.type = "button";
  nameButton.textContent = user?.displayName ?? "Unassigned";
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

  // Show the person's Feature Crew tag as a colored pill beside their name (the neutral "??" pill
  // when they have no tag yet). Only for a real assignee — an unassigned slot wears no tag.
  if (showTag && user !== null) {
    root.append(renderTagPill(doc, { tag: user.tag ?? null }));
  }

  // Track popup state and out-of-order response guard.
  let popup: HTMLElement | null = null;
  let requestSeq = 0;

  // Open the picker popup.
  const openPopup = () => {
    if (popup) return; // Already open.

    popup = doc.createElement("div");
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
    root.append(popup);

    // Search on every input event (no debounce; must be deterministic).
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.trim();
      const mySeq = ++requestSeq;

      userDirectory.search(query).then((users) => {
        // Guard against out-of-order responses: ignore stale results.
        if (mySeq !== requestSeq) return;

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

          button.addEventListener("click", () => {
            onChange?.(directoryUser);
            // Update the name button label.
            nameButton.textContent = directoryUser.displayName;
            closePopup();
          });

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
