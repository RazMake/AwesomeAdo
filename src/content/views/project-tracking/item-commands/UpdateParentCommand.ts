import type { TrackedWorkItem, TypeCatalogEntry } from "../../../../common/ado/TrackedWorkItem";
import { parseWorkItemId } from "../../../../common/ado/workItemIdText";
import {
  workItemTypeDisplayColor,
  workItemTypeTextColor,
} from "../../../../common/ado/workItemTypes";
import type { ItemContextMenuCommand } from "../../../../common/view-common/control/ItemContextMenu/ItemContextMenu";
import { renderItemTypeIcon } from "../../../../common/view-common/control/ItemTypeIcon/ItemTypeIcon";
import { createEditorButton } from "../../../../common/view-common/control/TextEditor/TextEditor";
import { createSpinnerIcon } from "../../../../common/view-common/control/WriteQueueStatus/WriteQueueStatus";

import { EDITOR_WIDTH_PX, panelFor, type ItemCommandTarget } from "./itemCommandCore";

/** What "Update parent" needs beyond any item command. */
export interface ParentCommandOptions extends ItemCommandTarget {
  /** The bound query, which the id lookup runs against so it reaches the same project. */
  queryId: string;
  /**
   * Re-reads the board after the parent changed. A repaint is not enough: the item now belongs under
   * a different branch, and only the query knows where (or whether) that branch is on this board.
   */
  onReload: () => void;
}

/**
 * How long typing must pause before the id is looked up — long enough that `1`, `12`, `123` are not
 * three round-trips, short enough that the result appears while the reader is still looking.
 */
export const PARENT_LOOKUP_DELAY_MS = 400;

const LOOKUP_PROMPT = "Enter a work item ID or URL.";

/** The resolved destination, or why there is none to set yet. */
type Lookup =
  | { kind: "idle"; message: string }
  | { kind: "resolving" }
  | { kind: "resolved"; parent: TrackedWorkItem };

/**
 * Moves the item under another parent, chosen by id.
 *
 * Unknown ids are resolved before Set is offered so the reader sees exactly which item they are
 * about to file this one under — a mistyped digit otherwise silently files it somewhere unrelated.
 */
export function buildUpdateParentCommand(options: ParentCommandOptions): ItemContextMenuCommand {
  const team = options.services.currentTeam();
  return {
    label: "Update parent",
    // The move rides the same per-team backlog endpoint as a drag, which needs a team to rank in.
    disabledReason:
      team === null ? "No team is configured, and Azure DevOps ranks moved items per team." : null,
    panel: (close) =>
      panelFor(options.doc, options.item, { withTitle: true, widthPx: EDITOR_WIDTH_PX }, [
        renderParentPicker(options, team ?? "", close),
      ]),
  };
}

function renderParentPicker(
  options: ParentCommandOptions,
  team: string,
  close: () => void,
): HTMLElement {
  const { doc } = options;
  const view = createPickerElements(doc);
  let lookup: Lookup = { kind: "idle", message: LOOKUP_PROMPT };
  let saving = false;
  let lookupToken = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const show = (next: Lookup): void => {
    lookup = next;
    renderLookup(options, view, lookup);
    setEnabled(view.set, !saving && lookup.kind === "resolved");
  };

  const resolve = (): void => {
    const id = parseWorkItemId(view.input.value);
    const token = ++lookupToken;
    if (id === null) return show({ kind: "idle", message: LOOKUP_PROMPT });
    if (id === options.item.id) {
      return show({ kind: "idle", message: "An item cannot be its own parent." });
    }
    show({ kind: "resolving" });
    void lookUpWorkItem(options, id).then((parent) => {
      // A slower answer for an id the reader has since replaced must not overwrite the newer one.
      if (token !== lookupToken) return;
      show(
        parent === null
          ? { kind: "idle", message: `Item ${id} was not found.` }
          : { kind: "resolved", parent },
      );
    });
  };

  const scheduleResolve = (): void => {
    clearTimeout(timer);
    // The previous answer belongs to the old text; it must not stay settable while the new id waits.
    lookupToken++;
    show({ kind: "resolving" });
    timer = setTimeout(resolve, PARENT_LOOKUP_DELAY_MS);
  };

  const save = (): void => {
    if (saving || lookup.kind !== "resolved") return;
    saving = true;
    show(lookup);
    view.cancel.disabled = true;
    void moveUnderParent(options, lookup.parent, team).then((moved) => {
      saving = false;
      view.cancel.disabled = false;
      if (moved) {
        close();
        options.onReload();
        return;
      }
      show(lookup);
      view.failure.textContent = "Not saved \u2014 see the diagnostics log.";
    });
  };

  wirePickerEvents(view, { onInput: scheduleResolve, save, close });
  show(lookup);
  prefillFromClipboard(options, view.input, resolve);
  return view.root;
}

/** The editor buttons are inline-styled, so a disabled one must be dimmed explicitly to read as off. */
function setEnabled(button: HTMLButtonElement, enabled: boolean): void {
  button.disabled = !enabled;
  button.style.opacity = enabled ? "" : "0.5";
  button.style.cursor = enabled ? "pointer" : "default";
}

interface PickerElements {
  root: HTMLElement;
  input: HTMLInputElement;
  result: HTMLElement;
  failure: HTMLElement;
  set: HTMLButtonElement;
  cancel: HTMLButtonElement;
}

function createPickerElements(doc: Document): PickerElements {
  const root = doc.createElement("div");
  root.className = "awesomeado-parent-picker";
  root.style.cssText = "display:flex;flex-direction:column;gap:6px;margin:2px 0";

  const input = doc.createElement("input");
  input.type = "text";
  input.className = "awesomeado-parent-picker__input";
  input.placeholder = "Parent work item ID or URL";
  input.setAttribute("aria-label", "Parent work item ID");
  input.style.cssText = [
    "font:inherit",
    "font-size:12px",
    "padding:3px 6px",
    "border:1px solid var(--palette-neutral-20)",
    "border-radius:3px",
    "background:var(--background-color)",
    "color:var(--text-primary-color)",
  ].join(";");

  const result = doc.createElement("div");
  result.className = "awesomeado-parent-picker__result";
  result.style.cssText = "display:flex;align-items:center;gap:4px;min-height:18px;font-size:12px";

  const failure = doc.createElement("span");
  failure.className = "awesomeado-parent-picker__error";
  failure.style.cssText = "font-size:11px;color:var(--error)";

  const set = createEditorButton(doc, "Set", true);
  const cancel = createEditorButton(doc, "Cancel", false);
  const buttons = doc.createElement("div");
  buttons.style.cssText = "display:flex;gap:6px;align-items:center";
  buttons.append(set, cancel, failure);

  root.append(input, result, buttons);
  return { root, input, result, failure, set, cancel };
}

function wirePickerEvents(
  view: PickerElements,
  handlers: { onInput: () => void; save: () => void; close: () => void },
): void {
  view.input.addEventListener("input", handlers.onInput);
  view.set.addEventListener("click", handlers.save);
  view.cancel.addEventListener("click", handlers.close);
  view.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handlers.save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      handlers.close();
    }
    // Typing belongs to the box, not to the menu's own keyboard navigation underneath it.
    event.stopPropagation();
  });
  setTimeout(() => view.input.focus(), 0);
}

/** The resolved item drawn as the boards draw it — type icon, then the title in its type color. */
function renderLookup(options: ParentCommandOptions, view: PickerElements, lookup: Lookup): void {
  const { doc } = options;
  view.failure.textContent = "";
  if (lookup.kind !== "resolved") {
    const note = doc.createElement("span");
    note.style.color = "var(--text-secondary-color)";
    note.textContent = lookup.kind === "resolving" ? "Looking up\u2026" : lookup.message;
    view.result.replaceChildren(note);
    if (lookup.kind === "resolving") {
      const spinner = createSpinnerIcon(doc);
      spinner.classList.add("awesomeado-parent-picker__spinner");
      spinner.style.color = "var(--text-secondary-color)";
      view.result.prepend(spinner);
    }
    return;
  }
  const { parent } = lookup;
  const entry = typeEntry(options, parent.type);
  const icon = renderItemTypeIcon(doc, {
    iconUrl: entry?.icon ?? null,
    color: workItemTypeDisplayColor(entry?.color),
    typeName: parent.type,
  }).element;
  const title = doc.createElement("span");
  title.className = "awesomeado-parent-picker__title";
  title.textContent = parent.title;
  title.title = parent.title;
  title.style.cssText = [
    `color:${workItemTypeTextColor(entry?.color)}`,
    "font-weight:600",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
  ].join(";");
  view.result.replaceChildren(icon, title);
}

function typeEntry(options: ParentCommandOptions, type: string): TypeCatalogEntry | undefined {
  return options.services.getTypes().find((entry) => entry.name === type);
}

/**
 * Starts the box on the id the reader most likely just copied. Best-effort: a page without
 * clipboard access, or a reader who declined it, simply gets an empty box.
 */
function prefillFromClipboard(
  options: ParentCommandOptions,
  input: HTMLInputElement,
  resolve: () => void,
): void {
  const clipboard = options.doc.defaultView?.navigator.clipboard;
  if (clipboard === undefined || typeof clipboard.readText !== "function") return;
  clipboard.readText().then(
    (text) => {
      const id = parseWorkItemId(text);
      // Never overwrite something the reader already started typing while the clipboard answered.
      if (id === null || input.value.length > 0) return;
      input.value = String(id);
      resolve();
    },
    (error: unknown) => {
      options.services.logger.error("Update parent could not read the clipboard", error);
    },
  );
}

/** Reads one item by id through a flat WIQL, so it resolves even when it is not on this board. */
async function lookUpWorkItem(
  options: ParentCommandOptions,
  id: number,
): Promise<TrackedWorkItem | null> {
  const { services } = options;
  try {
    const result = await services.loadTree(
      options.queryId,
      `SELECT [System.Id] FROM WorkItems WHERE [System.Id] = ${id}`,
    );
    if (result.error !== null) {
      services.logger.error(`Update parent could not look up item ${id}: ${result.error}`);
      return null;
    }
    return result.roots.find((candidate) => candidate.id === id) ?? null;
  } catch (error) {
    services.logger.error(`Update parent could not look up item ${id}`, error);
    return null;
  }
}

/**
 * Re-parents through the board's shared queue, exactly as a drag does, so the link patch is
 * serialized behind any in-flight edit of the same item and tested against its current rev.
 *
 * The item's current parent is not part of every board's model, so `0` stands in for it: that only
 * forces the link patch, which replaces whatever parent link the item has. The item is ranked at the
 * end of its new siblings because none of them are known here.
 */
async function moveUnderParent(
  options: ParentCommandOptions,
  parent: TrackedWorkItem,
  team: string,
): Promise<boolean> {
  const { item, services } = options;
  const result = await options.queue.enqueueReorder({
    id: item.id,
    currentRev: () => item.rev,
    parentId: parent.id,
    currentParentId: 0,
    previousId: 0,
    nextId: 0,
    siblingIds: [item.id],
    team,
  });
  if (result.rev !== undefined) item.rev = result.rev;
  // A landed link whose ranking then failed is still a new parent, and the board must show it.
  const moved = result.ok || result.reparented === true;
  if (moved) {
    services.logger.info(`Update parent moved item ${item.id} under ${parent.type} ${parent.id}.`);
  }
  return moved;
}
