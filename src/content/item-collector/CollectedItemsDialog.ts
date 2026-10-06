import type { TypeCatalogEntry } from "../../common/ado/TrackedWorkItem";
import { workItemTypeDisplayColor } from "../../common/ado/workItemTypes";
import type { CollectedItem, IItemCollection } from "../../common/item-collection/ItemCollection";
import { renderItemTypeIcon } from "../../common/view-common/control/ItemTypeIcon/ItemTypeIcon";

/** What the dialog needs; the collection is read live so the list follows every change. */
export interface CollectedItemsDialogOptions {
  collection: IItemCollection;
  /** Resolves a work item type's name to its catalog entry, for the type icon. */
  resolveType: (type: string) => TypeCatalogEntry | undefined;
  onClose: () => void;
  onCopyIds: () => void;
  onCopyUrls: () => void;
}

/** The open dialog plus the hook that repaints its list after the collection changes. */
export interface CollectedItemsDialog {
  element: HTMLElement;
  refresh(): void;
}

const PREFIX = "awesomeado-item-collector__dialog";

/**
 * The list of every collected work item: `#id` (opens the item in Azure DevOps), the type icon and
 * the title, each led by a red × that drops the item from the collection.
 *
 * Deliberately non-modal and not dismissed by an outside click: the reader keeps Ctrl+clicking items
 * on the board while it is open, and the list follows along.
 */
export function renderCollectedItemsDialog(
  doc: Document,
  options: CollectedItemsDialogOptions,
): CollectedItemsDialog {
  const dialog = doc.createElement("div");
  dialog.className = PREFIX;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Collected work items");
  dialog.style.cssText = [
    "position:fixed",
    "top:50%",
    "left:50%",
    "transform:translate(-50%,-50%)",
    "display:flex",
    "flex-direction:column",
    "width:min(640px, calc(100vw - 32px))",
    "max-height:min(70vh, calc(100vh - 32px))",
    "box-sizing:border-box",
    "background:var(--callout-background-color)",
    "color:var(--text-primary-color)",
    "border:1px solid var(--control-border-strong)",
    "border-radius:10px",
    "box-shadow:0 4px 16px var(--shadow-subtle)",
    'font:13px "Segoe UI", system-ui, sans-serif',
  ].join(";");

  const heading = doc.createElement("span");
  const list = doc.createElement("div");
  list.className = `${PREFIX}-list`;
  list.style.cssText = "overflow:auto;padding:4px 12px 12px";
  const copyIds = renderActionButton(doc, "Copy IDs", "copy-ids", options.onCopyIds);
  const copyUrls = renderActionButton(doc, "Copy URLs", "copy-urls", options.onCopyUrls);
  const actions = doc.createElement("div");
  actions.className = `${PREFIX}-actions`;
  actions.style.cssText =
    "display:flex;gap:8px;padding:8px 12px;border-top:1px solid var(--control-border-strong)";
  actions.append(copyIds, copyUrls);
  dialog.append(renderHeader(doc, heading, options.onClose), list, actions);

  const refresh = (): void => {
    const items = options.collection.items();
    heading.textContent = `Collected work items (${items.length})`;
    copyIds.disabled = items.length === 0;
    copyUrls.disabled = items.length === 0;
    list.replaceChildren(
      ...(items.length === 0
        ? [renderEmpty(doc)]
        : items.map((item) => renderItemRow(doc, item, options))),
    );
  };
  refresh();
  return { element: dialog, refresh };
}

function renderHeader(doc: Document, heading: HTMLElement, onClose: () => void): HTMLElement {
  const header = doc.createElement("div");
  header.style.cssText = [
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
    "gap:12px",
    "padding:10px 12px",
    "border-bottom:1px solid var(--control-border-strong)",
    "font-weight:600",
  ].join(";");
  const close = doc.createElement("button");
  close.type = "button";
  close.className = `${PREFIX}-close`;
  close.textContent = "\u00d7";
  close.title = "Close";
  close.setAttribute("aria-label", "Close");
  close.style.cssText = [
    "border:none",
    "background:transparent",
    "color:var(--text-secondary-color)",
    "font:inherit",
    "font-size:18px",
    "line-height:1",
    "padding:0 4px",
    "cursor:pointer",
  ].join(";");
  close.addEventListener("click", onClose);
  header.append(heading, close);
  return header;
}

function renderActionButton(
  doc: Document,
  label: string,
  name: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = `${PREFIX}-${name}`;
  button.textContent = label;
  button.style.cssText = [
    "padding:4px 10px",
    "border:1px solid var(--control-border-strong)",
    "border-radius:6px",
    "background:transparent",
    "color:var(--text-primary-color)",
    "font:inherit",
    "cursor:pointer",
  ].join(";");
  button.addEventListener("click", onClick);
  return button;
}

function renderEmpty(doc: Document): HTMLElement {
  const empty = doc.createElement("div");
  empty.className = `${PREFIX}-empty`;
  empty.textContent = "Nothing collected yet. Ctrl+click work items to add them.";
  empty.style.cssText = "padding:12px 0;color:var(--text-secondary-color)";
  return empty;
}

function renderItemRow(
  doc: Document,
  item: CollectedItem,
  options: CollectedItemsDialogOptions,
): HTMLElement {
  const row = doc.createElement("div");
  row.className = `${PREFIX}-item`;
  row.dataset.itemId = String(item.id);
  row.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:6px",
    "padding:4px 0",
    "white-space:nowrap",
  ].join(";");
  const entry = options.resolveType(item.type);
  const icon = renderItemTypeIcon(doc, {
    iconUrl: entry?.icon ?? null,
    color: workItemTypeDisplayColor(entry?.color),
    typeName: item.type,
  }).element;
  const title = doc.createElement("span");
  title.className = `${PREFIX}-title`;
  title.textContent = item.title;
  title.title = item.title;
  title.style.cssText = "overflow:hidden;text-overflow:ellipsis;min-width:0";
  row.append(
    renderRemoveButton(doc, item, options.collection),
    renderIdLink(doc, item),
    icon,
    title,
  );
  return row;
}

function renderRemoveButton(
  doc: Document,
  item: CollectedItem,
  collection: IItemCollection,
): HTMLButtonElement {
  const remove = doc.createElement("button");
  remove.type = "button";
  remove.className = `${PREFIX}-remove`;
  remove.textContent = "\u00d7";
  const label = `Remove #${item.id} from the collection`;
  remove.title = label;
  remove.setAttribute("aria-label", label);
  remove.style.cssText = [
    "flex:none",
    "border:none",
    "background:transparent",
    "padding:0 2px",
    "color:var(--remove-control-color)",
    "font:inherit",
    "font-size:15px",
    "font-weight:700",
    "line-height:1",
    "cursor:pointer",
  ].join(";");
  remove.addEventListener("click", () => collection.remove(item.id));
  return remove;
}

/** `#id` as a link that opens the item in a new tab, or plain text when there is no URL. */
function renderIdLink(doc: Document, item: CollectedItem): HTMLElement {
  const label = `#${item.id}`;
  if (item.url === null) {
    const text = doc.createElement("span");
    text.textContent = label;
    return text;
  }
  const link = doc.createElement("a");
  link.className = `${PREFIX}-id`;
  link.textContent = label;
  link.href = item.url;
  link.target = "_blank";
  // The opened Azure DevOps tab must not be able to reach back into this page.
  link.rel = "noopener noreferrer";
  link.title = "Open in Azure DevOps";
  link.style.cssText = "flex:none;color:var(--open-command-foreground);text-decoration:none";
  return link;
}
