import type { SprintWindow, SprintWindowEntry } from "../../../../common/ado/sprintWindow";
import type { ItemContextMenuCommand } from "../../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import { sprintRelationDeclarations } from "../../../../common/view-common/control/SprintPicker/SprintPicker";
import { renderTextEditor } from "../../../../common/view-common/control/TextEditor/TextEditor";
import { renderNotesPanel } from "../notes/NotesPanel";

import {
  EDITOR_WIDTH_PX,
  finish,
  panelFor,
  writeField,
  type ItemCommandTarget,
} from "./itemCommandCore";

/** Everything the item commands need to read an item, change it, and show the result. */
export interface ItemCommandsOptions extends ItemCommandTarget {
  /** The board's sprint window; "Move to another sprint" offers the current one and everything after. */
  sprintWindow: SprintWindow;
  /** ISO 8601 start of the Updates window — how far back "View all notes" reaches. */
  notesSinceIso: string;
}

/** The subset needed anywhere the board offers a direct sprint move. */
export type SprintMoveOptions = ItemCommandTarget & Pick<ItemCommandsOptions, "sprintWindow">;

const TITLE_FIELD = "System.Title";
const DESCRIPTION_FIELD = "System.Description";
const ITERATION_PATH_FIELD = "System.IterationPath";

/** Azure DevOps' own limit on `System.Title`; typing past it would only fail at the server. */
const MAX_TITLE_LENGTH = 255;

/** How tall the description box opens — a description is normally paragraphs, not a line. */
const DESCRIPTION_ROWS = 12;

/**
 * How much of the window the discussion takes.
 *
 * Sized as a share of the window rather than in pixels because what it holds has no natural size: it
 * is however much discussion an item has accumulated, and a fixed box either wastes a large screen
 * or scrolls away most of the thread on a small one.
 */
const NOTES_WINDOW_SHARE = "70v";

/**
 * The per-item commands the board hangs off a right-click: rename it, rewrite its description, move
 * it to another sprint, or read and add to its whole discussion.
 *
 * Built here rather than inside the shared menu because every one of them is a fact about THIS
 * board's data — which field carries a description, which queue serializes a write, which sprints a
 * team has. The menu only shows them.
 *
 * Every command persists first and reflects second, exactly like the row controls: nothing on screen
 * changes until Azure DevOps has accepted it, so a rejected write can never leave a value on the
 * board that was never stored.
 */
export function buildItemCommands(options: ItemCommandsOptions): ItemContextMenuCommand[] {
  return [
    updateTitleCommand(options),
    updateDescriptionCommand(options),
    moveToSprintCommand(options),
    viewAllNotesCommand(options),
  ];
}

/** Renames the item; the board repaints so every place showing the title agrees. */
function updateTitleCommand(options: ItemCommandsOptions): ItemContextMenuCommand {
  const { doc, item } = options;
  return {
    label: "Update title",
    panel: (close) =>
      // No title row above the box: the box IS the title, and repeating it would only show the same
      // words twice — one of them about to be wrong.
      panelFor(doc, item, { withTitle: false, widthPx: EDITOR_WIDTH_PX }, [
        renderTextEditor(doc, {
          initialText: item.title,
          submitLabel: "Save",
          singleLine: true,
          maxLength: MAX_TITLE_LENGTH,
          onSubmit: (text) =>
            writeField(options, { field: TITLE_FIELD, value: text, baseValue: item.title }).then(
              (ok) => {
                if (ok) {
                  item.title = text;
                  finish(options, close);
                }
                return ok;
              },
            ),
          onCancel: close,
        }),
      ]),
  };
}

/**
 * Rewrites the item's description as Markdown.
 *
 * The editor opens on the field's stored SOURCE, whatever that is — an item ADO has only ever held
 * as HTML opens as that HTML. Showing the source rather than a rendering is the honest thing here:
 * it is what the save will replace, and hiding it behind a preview would let an author unknowingly
 * throw away markup they never saw. Saving puts the field into Markdown, so what they typed is what
 * ADO stores and re-renders.
 */
function updateDescriptionCommand(options: ItemCommandsOptions): ItemContextMenuCommand {
  const { doc, item } = options;
  return {
    label: "Update description",
    panel: (close) =>
      panelFor(doc, item, { withTitle: true, widthPx: EDITOR_WIDTH_PX }, [
        renderTextEditor(doc, {
          initialText: item.description,
          submitLabel: "Save",
          rows: DESCRIPTION_ROWS,
          mentions: {
            userDirectory: options.services.userDirectory,
            logger: options.services.logger,
            mentionNames: options.services.mentionDirectory.knownNames(),
          },
          // A description is allowed not to exist, unlike a title, so an empty box is a real answer.
          allowEmpty: true,
          onSubmit: (text) =>
            writeField(options, {
              field: DESCRIPTION_FIELD,
              value: text,
              baseValue: item.description,
              multilineFormat: "Markdown",
            }).then((ok) => {
              if (ok) {
                item.description = text;
                finish(options, close);
              }
              return ok;
            }),
          onCancel: close,
        }),
      ]),
  };
}

/**
 * Moves the item to another sprint.
 *
 * Only the current sprint and the ones after it are offered: moving work BACKWARDS into a sprint
 * that has already been reported on rewrites history rather than plans it. The sprint the item is
 * already on is left out too — it is not a move, and listing it invites the click that does nothing.
 */
function moveToSprintCommand(options: ItemCommandsOptions): ItemContextMenuCommand {
  const destinations = (): ItemContextMenuCommand[] => buildSprintMoveCommands(options);

  return {
    label: "Move to another sprint",
    disabledReason:
      destinations().length === 0
        ? "No other current or future sprint is configured for this team."
        : null,
    submenu: destinations,
  };
}

/**
 * Builds the live destination list shared by the context-menu command and the row's sprint chip.
 *
 * Kept as commands because both surfaces need the same label, relation styling and action. Building
 * on open reads the item's current path after any earlier move, so the value already in use is never
 * offered back as a destination.
 */
export function buildSprintMoveCommands(options: SprintMoveOptions): ItemContextMenuCommand[] {
  return options.sprintWindow.entries
    .filter(
      (entry): entry is SprintWindowEntry =>
        entry.relation !== "past" && entry.path !== options.item.iterationPath,
    )
    .map((entry) => ({
      label: entry.label,
      // The same declarations the sprint dropdown paints its options with, so the two surfaces
      // cannot disagree about which sprint is which.
      declarations: sprintRelationDeclarations(entry.relation),
      run: () => {
        void writeField(options, {
          field: ITERATION_PATH_FIELD,
          value: entry.path,
          baseValue: options.item.iterationPath,
        }).then((ok) => {
          if (!ok) return;
          options.item.iterationPath = entry.path;
          options.item.sprintName = entry.name;
          options.onChanged();
        });
      },
    }));
}

/**
 * Opens the item's whole discussion inside the menu: every note in the Updates window, the reader's
 * own open to correction, and the composer to add another.
 *
 * The panel under a row deliberately shows only the last two days with notes, because dozens of
 * those are on screen at once. This surface was asked for, so it shows everything the window holds.
 */
function viewAllNotesCommand(options: ItemCommandsOptions): ItemContextMenuCommand {
  const { doc, item, services } = options;
  return {
    label: "View all notes",
    // Centred, not anchored: at this size the pointer's position stops being a useful place to put
    // it, and the corrections that keep an anchored surface on screen would land it somewhere
    // different for every row it was opened from.
    centerPanel: true,
    panel: (close) => {
      const notes = renderNotesPanel({
        doc,
        workItemId: item.id,
        sinceIso: options.notesSinceIso,
        services,
        showAllInWindow: true,
      });
      // The panel is built for life under a row: hidden until expanded, and indented to clear the
      // tree's gutter. Neither is true here, so it is opened and un-indented before it is shown.
      notes.setExpanded(true);
      notes.element.style.paddingLeft = "0";
      // Takes the height the heading leaves and scrolls inside it. `min-height:0` is what lets a flex
      // item shrink below its content: without it the list refuses to scroll and pushes the panel
      // past the window instead.
      notes.element.style.flex = "1 1 auto";
      notes.element.style.minHeight = "0";
      notes.element.style.overflowY = "auto";
      const panel = panelFor(
        doc,
        item,
        {
          withTitle: true,
          width: `${NOTES_WINDOW_SHARE}w`,
          height: `${NOTES_WINDOW_SHARE}h`,
        },
        [notes.element],
      );
      panel.style.position = "relative";
      panel.style.boxSizing = "border-box";
      panel.style.paddingRight = "28px";
      panel.append(renderNotesCloseButton(doc, close));
      return panel;
    },
  };
}

/** Dismisses the deliberately large discussion without making the reader reach for Escape. */
function renderNotesCloseButton(doc: Document, close: () => void): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "awesomeado-item-command__close-notes";
  button.setAttribute("aria-label", "Close notes");
  button.title = "Close notes";
  button.textContent = "\u00D7";
  button.style.cssText = [
    "position:absolute",
    "top:0",
    "right:0",
    "width:24px",
    "height:24px",
    "padding:0",
    "border:0",
    "background:transparent",
    "color:var(--text-primary-color, #323130)",
    "font-size:20px",
    "line-height:20px",
    "cursor:pointer",
  ].join(";");
  button.addEventListener("click", close);
  return button;
}
