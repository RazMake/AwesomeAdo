import type { ExistingFavorite, FavoriteLink } from "../../../common/browser/Favorites";

export interface FavoritesKeepList {
  element: HTMLElement;
  selectedIds(): string[];
}

/**
 * Only favorites the sync would delete outright are offered: one whose URL is being written again
 * is replaced, not lost, so offering to keep it would just create a duplicate.
 */
export function favoritesDeletedBySync(
  existing: readonly ExistingFavorite[],
  links: readonly FavoriteLink[],
): ExistingFavorite[] {
  const synced = new Set(links.map((link) => link.url));
  return existing.filter((favorite) => !synced.has(favorite.url));
}

export function renderFavoritesKeepList(
  doc: Document,
  favorites: readonly ExistingFavorite[],
): FavoritesKeepList {
  const element = doc.createElement("div");
  element.className = "awesomeado-favorites-keep";
  element.style.cssText = "display:flex;flex-direction:column;gap:5px";
  const heading = doc.createElement("div");
  heading.textContent = `${favorites.length} existing favorite(s) will be deleted by the sync. Select any you want to keep:`;
  const rows = doc.createElement("div");
  rows.style.cssText = "display:flex;flex-direction:column;gap:5px;max-height:240px;overflow:auto";
  const checkboxes = favorites.map((favorite) => {
    const checkbox = doc.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.favoriteId = favorite.id;
    checkbox.style.accentColor = "var(--communication-background)";
    rows.append(renderRow(doc, checkbox, favorite));
    return checkbox;
  });
  element.append(heading, rows);
  return {
    element,
    selectedIds: () =>
      checkboxes.flatMap((checkbox) =>
        checkbox.checked && checkbox.dataset.favoriteId ? [checkbox.dataset.favoriteId] : [],
      ),
  };
}

function renderRow(
  doc: Document,
  checkbox: HTMLInputElement,
  favorite: ExistingFavorite,
): HTMLElement {
  const label = doc.createElement("label");
  label.style.cssText = "display:flex;align-items:center;gap:6px;min-width:0";
  label.title = favorite.url;
  const caption = doc.createElement("span");
  caption.textContent = favorite.title.trim() || favorite.url;
  caption.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
  label.append(checkbox, caption);
  return label;
}
