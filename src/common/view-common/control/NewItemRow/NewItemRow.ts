import { renderItemTypeIcon } from "../ItemTypeIcon/ItemTypeIcon";
import { renderTextEditor } from "../TextEditor/TextEditor";

/** Azure DevOps' own limit on `System.Title`; typing past it would only fail at the server. */
const MAX_TITLE_LENGTH = 255;

/** What the inline "add an item" row needs to describe the item it is about to create. */
export interface NewItemRowOptions {
  doc: Document;
  /** The work item type the new item is created as, named on the button and in the placeholder. */
  typeName: string;
  /** That type's ADO icon, or null for the neutral glyph. */
  iconUrl: string | null;
  /** The type's color, already resolved to a CSS color by the caller; null leaves it neutral. */
  color: string | null;
  /**
   * One line stating everything about the new item the reader is NOT being asked to type — the
   * parent it lands under, the tags and paths it inherits. Composed by the caller, because what is
   * decided for the reader is a fact about the surface rather than about this row.
   */
  summary: string;
  /** Creates the item. Resolving `false` keeps the box open with the typed title still in it. */
  onSubmit(title: string): Promise<boolean>;
  onCancel(): void;
}

/**
 * The row a list grows at the top of itself while a new item is being added.
 *
 * Inline rather than a dialog because the answer being typed IS a row in the list underneath: it
 * lines up with the items already there, so the reader can see what they are adding to and where it
 * will land. Everything except the title is stated rather than asked — those values are what make
 * the new item belong where it is being added, so leaving them editable here would only invite
 * creating something the surface cannot show.
 */
export function renderNewItemRow(options: NewItemRowOptions): HTMLElement {
  const { doc } = options;
  const row = doc.createElement("div");
  row.className = "awesomeado-new-item";
  row.style.cssText = [
    "display:flex",
    "flex-direction:column",
    "gap:4px",
    "padding:6px 4px",
    "margin-bottom:4px",
    "border:1px dashed var(--control-border)",
    "border-radius:4px",
  ].join(";");

  const line = doc.createElement("div");
  line.style.cssText = "display:flex;align-items:center;gap:8px";
  line.append(
    renderItemTypeIcon(doc, {
      iconUrl: options.iconUrl,
      color: options.color,
      typeName: options.typeName,
    }).element,
  );

  const editor = renderTextEditor(doc, {
    initialText: "",
    submitLabel: `Add ${options.typeName}`,
    singleLine: true,
    maxLength: MAX_TITLE_LENGTH,
    placeholder: `New ${options.typeName} title`,
    onSubmit: options.onSubmit,
    onCancel: options.onCancel,
  });
  editor.style.flex = "1 1 auto";
  editor.style.minWidth = "0";
  line.append(editor);

  row.append(line, renderSummary(doc, options.summary));
  // Focused on mount so the command that opened this row leaves the caret where the answer goes.
  queueMicrotask(() => row.querySelector("input")?.focus());
  return row;
}

function renderSummary(doc: Document, text: string): HTMLElement {
  const summary = doc.createElement("div");
  summary.className = "awesomeado-new-item__summary";
  summary.style.cssText = "font-size:11px;color:var(--text-secondary-color);padding-left:24px";
  summary.textContent = text;
  return summary;
}
