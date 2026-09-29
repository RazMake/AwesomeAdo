import type { FavoritesRestoreOutcome, RemovedFavorite } from "../../../common/browser/Favorites";
import type { ILogger } from "../../../common/logging/ILogger";
import { renderConfirmButton } from "../../../common/view-common/control/ConfirmPanel/ConfirmPanel";

export interface RemovedFavoritesListOptions {
  summary: string;
  removed: readonly RemovedFavorite[];
  restore(ids: readonly string[]): Promise<FavoritesRestoreOutcome>;
  logger: ILogger;
  close(): void;
}

interface RemovedFavoriteState extends RemovedFavorite {
  selected: boolean;
  error: string | null;
}

interface ListState {
  readonly options: RemovedFavoritesListOptions;
  readonly favorites: RemovedFavoriteState[];
  readonly panel: HTMLElement;
  restoring: boolean;
  result: string | null;
  error: string | null;
}

export function renderRemovedFavoritesList(
  doc: Document,
  options: RemovedFavoritesListOptions,
): HTMLElement {
  const panel = doc.createElement("div");
  panel.className = "awesomeado-removed-favorites";
  panel.style.cssText = "display:flex;flex-direction:column;gap:10px;font-size:12px";
  const state: ListState = {
    options,
    favorites: options.removed.map((favorite) => ({ ...favorite, selected: false, error: null })),
    panel,
    restoring: false,
    result: null,
    error: null,
  };
  render(panel, state);
  return panel;
}

function render(panel: HTMLElement, state: ListState): void {
  const doc = panel.ownerDocument;
  const content = doc.createDocumentFragment();
  content.append(createMessage(doc, state.options.summary, "status"));
  if (state.favorites.length === 0) content.append(renderEmptyState(doc, state));
  else content.append(renderFavoritesState(doc, state));
  panel.replaceChildren(content);
}

function renderEmptyState(doc: Document, state: ListState): HTMLElement {
  const content = doc.createElement("div");
  content.style.cssText = "display:flex;flex-direction:column;gap:10px";
  content.append(
    createMessage(
      doc,
      state.options.removed.length === 0
        ? "No other favorites were removed."
        : "All removed favorites were restored.",
      "status",
    ),
    renderButtons(doc, state, false),
  );
  return content;
}

function renderFavoritesState(doc: Document, state: ListState): HTMLElement {
  const content = doc.createElement("div");
  content.style.cssText = "display:flex;flex-direction:column;gap:8px";
  content.append(
    createMessage(doc, `Removed ${state.favorites.length} favorite(s). Select any you want back:`),
  );
  if (state.favorites.length > 1) content.append(renderSelectAll(doc, state));
  content.append(renderRows(doc, state));
  if (state.result) content.append(createMessage(doc, state.result, "status"));
  if (state.error) content.append(createMessage(doc, state.error, "alert"));
  const hint = createMessage(
    doc,
    "Restored favorites are replaced again by the next sync unless you move them out of this folder.",
  );
  hint.style.color = "var(--text-secondary-color)";
  content.append(hint, renderButtons(doc, state, true));
  return content;
}

function renderSelectAll(doc: Document, state: ListState): HTMLElement {
  const checkbox = doc.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.role = "select-all";
  checkbox.style.accentColor = "var(--communication-background)";
  checkbox.addEventListener("change", () => {
    for (const favorite of state.favorites) favorite.selected = checkbox.checked;
    syncSelectionControls(state);
  });
  syncSelectAllCheckbox(checkbox, state);
  return createCheckboxRow(doc, checkbox, "Select all");
}

function renderRows(doc: Document, state: ListState): HTMLElement {
  const rows = doc.createElement("div");
  rows.className = "awesomeado-removed-favorites__rows";
  rows.style.cssText = "display:flex;flex-direction:column;gap:5px;max-height:240px;overflow:auto";
  for (const favorite of state.favorites) rows.append(renderFavoriteRow(doc, state, favorite));
  return rows;
}

function renderFavoriteRow(
  doc: Document,
  state: ListState,
  favorite: RemovedFavoriteState,
): HTMLElement {
  const checkbox = doc.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.favoriteId = favorite.id;
  checkbox.checked = favorite.selected;
  checkbox.disabled = state.restoring;
  checkbox.style.accentColor = "var(--communication-background)";
  checkbox.addEventListener("change", () => {
    favorite.selected = checkbox.checked;
    syncSelectionControls(state);
  });
  const label = createCheckboxRow(doc, checkbox, favorite.title.trim() || favorite.url);
  label.title = favorite.error ? `${favorite.url} — ${favorite.error}` : favorite.url;
  const text = label.lastElementChild as HTMLElement;
  text.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  if (favorite.error) {
    const marker = doc.createElement("span");
    marker.textContent = "Could not restore";
    marker.style.color = "var(--error)";
    label.append(marker);
  }
  return label;
}

function createCheckboxRow(doc: Document, checkbox: HTMLInputElement, text: string): HTMLElement {
  const label = doc.createElement("label");
  label.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0";
  const caption = doc.createElement("span");
  caption.textContent = text;
  label.append(checkbox, caption);
  return label;
}

function renderButtons(doc: Document, state: ListState, includeRestore: boolean): HTMLElement {
  const row = doc.createElement("div");
  row.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end";
  if (includeRestore) {
    const restore = renderConfirmButton(doc, "Restore selected", true, () => {
      void restoreSelected(state);
    });
    restore.dataset.role = "restore";
    row.append(restore);
  }
  const close = renderConfirmButton(doc, "Close", false, state.options.close);
  close.dataset.role = "close";
  row.append(close);
  syncActionControls(row.parentElement ?? row, state);
  return row;
}

function syncSelectionControls(state: ListState): void {
  for (const checkbox of state.panel.querySelectorAll<HTMLInputElement>("[data-favorite-id]")) {
    const favorite = state.favorites.find(({ id }) => id === checkbox.dataset.favoriteId);
    if (favorite) checkbox.checked = favorite.selected;
    checkbox.disabled = state.restoring;
  }
  const selectAll = state.panel.querySelector<HTMLInputElement>('[data-role="select-all"]');
  if (selectAll) syncSelectAllCheckbox(selectAll, state);
  syncActionControls(state.panel, state);
}

function syncSelectAllCheckbox(checkbox: HTMLInputElement, state: ListState): void {
  checkbox.checked = state.favorites.every((favorite) => favorite.selected);
  checkbox.indeterminate =
    state.favorites.some((favorite) => favorite.selected) && !checkbox.checked;
  checkbox.disabled = state.restoring;
}

function syncActionControls(container: ParentNode, state: ListState): void {
  const restore = container.querySelector<HTMLButtonElement>('[data-role="restore"]');
  if (restore) {
    restore.textContent = state.restoring ? "Restoring..." : "Restore selected";
    restore.disabled = state.restoring || !state.favorites.some((favorite) => favorite.selected);
  }
  const close = container.querySelector<HTMLButtonElement>('[data-role="close"]');
  if (close) close.disabled = state.restoring;
}

async function restoreSelected(state: ListState): Promise<void> {
  const selectedIds = state.favorites
    .filter((favorite) => favorite.selected)
    .map((favorite) => favorite.id);
  if (selectedIds.length === 0) return;
  state.restoring = true;
  state.error = null;
  syncSelectionControls(state);
  try {
    applyRestoreOutcome(state, selectedIds, await state.options.restore(selectedIds));
  } catch (error: unknown) {
    state.error = error instanceof Error ? error.message : String(error);
    state.options.logger.error("Could not restore removed Favorites", error);
  } finally {
    state.restoring = false;
    renderAfterRestore(state);
  }
}

function applyRestoreOutcome(
  state: ListState,
  selectedIds: readonly string[],
  outcome: FavoritesRestoreOutcome,
): void {
  const selected = new Set(selectedIds);
  const restored = new Set(outcome.restored);
  const failed = new Map(outcome.failed.map((failure) => [failure.id, failure.error]));
  state.result = `Restored ${outcome.restored.length} favorite(s).${
    outcome.failed.length === 0 ? "" : ` Could not restore ${outcome.failed.length} favorite(s).`
  }`;
  for (const favorite of state.favorites)
    if (selected.has(favorite.id)) favorite.error = failed.get(favorite.id) ?? null;
  const remaining = state.favorites.filter((favorite) => !restored.has(favorite.id));
  state.favorites.splice(0, state.favorites.length, ...remaining);
}

function renderAfterRestore(state: ListState): void {
  const scrollTop = state.panel.querySelector<HTMLElement>(
    ".awesomeado-removed-favorites__rows",
  )?.scrollTop;
  render(state.panel, state);
  const rows = state.panel.querySelector<HTMLElement>(".awesomeado-removed-favorites__rows");
  if (rows && scrollTop !== undefined) rows.scrollTop = scrollTop;
  const restore = state.panel.querySelector<HTMLButtonElement>('[data-role="restore"]');
  const target =
    restore && !restore.disabled
      ? restore
      : state.panel.querySelector<HTMLButtonElement>('[data-role="close"]');
  target?.focus();
}

function createMessage(doc: Document, text: string, role?: "status" | "alert"): HTMLElement {
  const message = doc.createElement("div");
  if (role) message.setAttribute("role", role);
  message.textContent = text;
  return message;
}
