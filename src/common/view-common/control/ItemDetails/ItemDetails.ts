import { renderItemLifecycleInfo } from "../ItemLifecycleInfo/ItemLifecycleInfo";
import { renderMarkdownText } from "../MarkdownText/MarkdownText";

export interface ItemDetailsUser {
  displayName: string;
  uniqueName: string | null;
  imageUrl: string | null;
}

export interface ItemDetailsData {
  description: string;
  createdDate: string;
  createdBy: ItemDetailsUser | null;
  changedDate: string;
  changedBy: ItemDetailsUser | null;
}

export interface ItemDetailsButtonHandle extends HTMLButtonElement {
  setExpanded(expanded: boolean): void;
}

function discColor(expanded: boolean, hasDescription: boolean, typeColor: string | null): string {
  if (!hasDescription || typeColor === null) {
    return expanded
      ? "var(--description-neutral-active-background)"
      : "var(--description-neutral-background)";
  }
  const lightStrength = expanded ? 24 : 14;
  const darkStrength = expanded ? 80 : 50;
  return `light-dark(color-mix(in srgb, ${typeColor} ${lightStrength}%, var(--type-tint-background)), color-mix(in srgb, ${typeColor} ${darkStrength}%, var(--type-tint-background)))`;
}

/** The shared `?` button used wherever item lifecycle and description details open. */
export function renderItemDetailsButton(
  doc: Document,
  options: { hasDescription: boolean; typeColor: string | null; className?: string },
): ItemDetailsButtonHandle {
  const button = doc.createElement("button") as ItemDetailsButtonHandle;
  button.className = options.className ?? "awesomeado-item-details__button";
  button.type = "button";
  button.textContent = "?";
  button.style.cssText = [
    "cursor:pointer",
    "border:1px solid var(--palette-neutral-20)",
    "border-radius:50%",
    "width:16px",
    "height:16px",
    "font-size:10px",
    "font-weight:bold",
    "line-height:1",
    "color:light-dark(var(--text-secondary-color), var(--text-on-communication-background))",
    "padding:0",
    "margin:1px",
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "transition:background 120ms ease",
  ].join(";");
  button.setExpanded = (expanded) => {
    button.setAttribute("aria-expanded", String(expanded));
    button.title = expanded ? "Hide description" : "Show description";
    button.style.background = discColor(expanded, options.hasDescription, options.typeColor);
  };
  button.setExpanded(false);
  return button;
}

/** Lifecycle metadata followed by the safely rendered item description. */
export function renderItemDetailsContent(
  doc: Document,
  data: ItemDetailsData,
  mentionNames: ReadonlyMap<string, string>,
): HTMLElement {
  const content = doc.createElement("div");
  content.className = "awesomeado-item-details__content";
  const meta = doc.createElement("div");
  meta.className = "awesomeado-item-details__meta";
  meta.style.cssText = "font-size:11px;color:var(--text-secondary-color);margin-bottom:8px";
  meta.append(
    renderItemLifecycleInfo(doc, {
      event: "created",
      timestamp: data.createdDate,
      user: data.createdBy,
    }),
    doc.createTextNode(", "),
    renderItemLifecycleInfo(doc, {
      event: "last-modified",
      timestamp: data.changedDate,
      user: data.changedBy,
    }),
  );
  const description = renderMarkdownText(doc, { text: data.description, mentionNames });
  description.classList.add("awesomeado-item-details__description");
  description.style.cssText = "font-size:11px;color:var(--text-primary-color)";
  content.append(meta, description);
  return content;
}
