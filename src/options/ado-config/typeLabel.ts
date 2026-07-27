import type { AdoWorkItemType } from "../../common/ado/AdoMetadata";

/** The parts of a work item type this label needs: anything carrying a name, color, and icon fits. */
export type LabeledType = Pick<AdoWorkItemType, "name" | "color" | "icon">;

/**
 * Build the shared work-item-type label — ADO's own icon beside the type name in ADO's own color —
 * used by every read-only list on the Azure DevOps tab that mirrors the work-item-types table.
 *
 * The icon URL points at whatever host the tenant configured, so the request carries no referrer,
 * and a URL that will not load from the extension origin drops the image and leaves the colored name
 * alone rather than showing a broken-image glyph.
 */
export function createTypeLabel(doc: Document, type: LabeledType): HTMLElement {
  const label = doc.createElement("span");
  label.className = "wit-type-label";
  if (type.icon) {
    label.append(createIcon(doc, type.icon));
  }
  const name = doc.createElement("span");
  name.className = "wit-type-label__name";
  name.textContent = type.name;
  name.style.color = type.color ? `#${type.color}` : "";
  label.append(name);
  return label;
}

function createIcon(doc: Document, src: string): HTMLImageElement {
  const icon = doc.createElement("img");
  icon.className = "wit-type-label__icon";
  icon.width = 18;
  icon.height = 18;
  icon.alt = "";
  icon.referrerPolicy = "no-referrer";
  icon.src = src;
  icon.addEventListener("error", () => icon.remove());
  return icon;
}
