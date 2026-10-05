import type { CollectedItem } from "./ItemCollection";

/** The collected ids as one comma-separated line, ready to paste into a WIQL `IN (…)` or a search. */
export function formatCollectedIds(items: readonly CollectedItem[]): string {
  return items.map((item) => String(item.id)).join(", ");
}

/**
 * The collected items as plain text, one `#id Type Title` line each with its link after it.
 *
 * Plain text cannot hide a URL behind the id, so the link trails the line where a paste target that
 * auto-links (chat, mail, work item discussions) still turns it into something clickable.
 */
export function formatCollectedLinksText(items: readonly CollectedItem[]): string {
  return items
    .map((item) => {
      const line = `#${item.id} ${item.type} ${item.title}`;
      return item.url === null ? line : `${line} - ${item.url}`;
    })
    .join("\n");
}

/** The collected items as HTML, each `#id` a link, laid out exactly like the collected-items list. */
export function formatCollectedLinksHtml(items: readonly CollectedItem[]): string {
  return items
    .map((item) => {
      const id = `#${item.id}`;
      const link = item.url === null ? id : `<a href="${escapeHtml(item.url)}">${id}</a>`;
      return `${link} ${escapeHtml(item.type)} ${escapeHtml(item.title)}`;
    })
    .join("<br>");
}

// Titles are user-authored, so they must never be pasted as markup.
function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
