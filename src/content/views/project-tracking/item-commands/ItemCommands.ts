import type { TrackedWorkItem } from "../../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import { buildWorkItemUrl } from "../../../../common/ado/fetchAdoTree";
import type { SprintWindow, SprintWindowEntry } from "../../../../common/ado/sprintWindow";
import type { EnhancedViewServices } from "../../../../common/view-common/EnhancedView";
import type { ItemContextMenuCommand } from "../../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import { sprintRelationDeclarations } from "../../../../common/view-common/control/SprintPicker/SprintPicker";
import { renderTextEditor } from "../../../../common/view-common/control/TextEditor/TextEditor";
import { renderNotesPanel } from "../notes/NotesPanel";

/** Everything the item commands need to read an item, change it, and show the result. */
export interface ItemCommandsOptions {
  doc: Document;
  /** The item the commands act on. Mutated in place on a successful write, like every other edit. */
  item: TrackedWorkItem;
  services: EnhancedViewServices;
  /** The board's single serialized write queue, so these edits cannot race the row controls. */
  queue: WorkItemWriteQueue;
  /** The board's sprint window; "Move to another sprint" offers the current one and everything after. */
  sprintWindow: SprintWindow;
  /** ISO 8601 start of the Updates window — how far back "View all notes" reaches. */
  notesSinceIso: string;
  /** Repaints the board, so a changed title or sprint shows without a re-read. */
  onChanged: () => void;
}

const TITLE_FIELD = "System.Title";
const DESCRIPTION_FIELD = "System.Description";
const ITERATION_PATH_FIELD = "System.IterationPath";

/** Azure DevOps' own limit on `System.Title`; typing past it would only fail at the server. */
const MAX_TITLE_LENGTH = 255;

/** How wide an editor opens inside the menu. */
const EDITOR_WIDTH_PX = 420;

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
            writeField(options, TITLE_FIELD, text).then((ok) => {
              if (ok) {
                item.title = text;
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
          // A description is allowed not to exist, unlike a title, so an empty box is a real answer.
          allowEmpty: true,
          onSubmit: (text) =>
            writeField(options, DESCRIPTION_FIELD, text, "Markdown").then((ok) => {
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
  const destinations = (): SprintWindowEntry[] =>
    options.sprintWindow.entries.filter(
      (entry) => entry.relation !== "past" && entry.name !== options.item.sprintName,
    );

  return {
    label: "Move to another sprint",
    disabledReason:
      destinations().length === 0
        ? "No other current or future sprint is configured for this team."
        : null,
    submenu: () =>
      destinations().map((entry) => ({
        label: entry.label,
        // The same declarations the sprint dropdown paints its options with, so the two surfaces
        // cannot disagree about which sprint is which.
        declarations: sprintRelationDeclarations(entry.relation),
        run: () => {
          void writeField(options, ITERATION_PATH_FIELD, entry.path).then((ok) => {
            if (!ok) return;
            options.item.iterationPath = entry.path;
            options.item.sprintName = entry.name;
            options.onChanged();
          });
        },
      })),
  };
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
    panel: () => {
      const notes = renderNotesPanel({
        doc,
        workItemId: item.id,
        sinceIso: options.notesSinceIso,
        loader: services.noteLoader,
        writer: services.noteWriter,
        mentionDirectory: services.mentionDirectory,
        logger: services.logger,
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
      return panelFor(
        doc,
        item,
        {
          withTitle: true,
          width: `${NOTES_WINDOW_SHARE}w`,
          height: `${NOTES_WINDOW_SHARE}h`,
        },
        [notes.element],
      );
    },
  };
}

/** How a panel is sized: a fixed editor width, or a share of the window. */
interface PanelShape {
  /** Whether the item's title is shown under its number — false where the panel EDITS the title. */
  withTitle: boolean;
  widthPx?: number;
  width?: string;
  height?: string;
}

/**
 * Wraps a panel's contents in a heading that says which item it is about.
 *
 * A panel opened from a right-click has nothing else to identify itself with: the menu covers the
 * row it came from, and a box holding one field's text looks the same for every item on the board.
 * The number is the link into Azure DevOps, so the surface that edits an item is also the shortest
 * way to go and look at the rest of it.
 */
function panelFor(
  doc: Document,
  item: TrackedWorkItem,
  shape: PanelShape,
  contents: HTMLElement[],
): HTMLElement {
  const panel = doc.createElement("div");
  panel.className = "awesomeado-item-command__panel";
  panel.style.cssText = ["display:flex", "flex-direction:column", "min-width:0"].join(";");
  panel.style.width = shape.width ?? `${shape.widthPx ?? 0}px`;
  panel.style.maxWidth = "90vw";
  if (shape.height) {
    panel.style.height = shape.height;
  }
  panel.append(renderPanelHeading(doc, item, shape.withTitle), ...contents);
  return panel;
}

/** The heading itself: `#{id}` as a link into ADO, and optionally the item's title beneath it. */
function renderPanelHeading(doc: Document, item: TrackedWorkItem, withTitle: boolean): HTMLElement {
  const heading = doc.createElement("div");
  heading.className = "awesomeado-item-command__heading";
  heading.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "align-items:flex-start",
    "gap:2px",
    "margin-bottom:6px",
  ].join(";");
  heading.append(renderIdLink(doc, item.id));

  if (withTitle) {
    const title = doc.createElement("div");
    title.className = "awesomeado-item-command__title";
    title.textContent = item.title;
    title.style.cssText = [
      "font-size:12px",
      "font-weight:600",
      "color:var(--text-primary-color, #323130)",
    ].join(";");
    heading.append(title);
  }
  return heading;
}

/**
 * The item's number, as the link that opens it in Azure DevOps.
 *
 * A page whose address does not name an ADO project leaves it plain text rather than a link that
 * goes nowhere — the number is still worth showing, it just cannot be followed.
 */
function renderIdLink(doc: Document, id: number): HTMLElement {
  const url = buildWorkItemUrl(doc.location?.href ?? "", id);
  const element = doc.createElement(url === null ? "span" : "a");
  element.className = "awesomeado-item-command__id";
  element.textContent = `#${id}`;
  element.style.cssText = [
    "font-size:11px",
    "font-weight:600",
    `color:var(--communication-foreground, #0078d4)`,
    "text-decoration:none",
  ].join(";");
  if (url !== null) {
    const link = element as HTMLAnchorElement;
    link.href = url;
    // noopener/noreferrer so the opened ADO tab cannot reach back into the page the extension runs in.
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = "Open in Azure DevOps";
  }
  return element;
}

/** Repaint the board and dismiss the menu, in that order, after a command committed. */
function finish(options: ItemCommandsOptions, close: () => void): void {
  options.onChanged();
  close();
}

/**
 * Queue one field write and fold its new rev back onto the item.
 *
 * The rev is the item's own, updated here rather than by each caller, because every subsequent write
 * to the same item is tested against it — a caller that forgot would make its NEXT edit fail as a
 * concurrency conflict against a change it made itself.
 */
async function writeField(
  options: ItemCommandsOptions,
  field: string,
  value: string,
  multilineFormat?: "Markdown",
): Promise<boolean> {
  const { item, queue } = options;
  const result = await queue.enqueue({
    id: item.id,
    currentRev: () => item.rev,
    field,
    value,
    multilineFormat,
  });
  if (!result.ok || result.rev === undefined) {
    return false;
  }
  item.rev = result.rev;
  return true;
}
