/**
 * How loudly the icon renders.
 *
 * The control deliberately does NOT know what the levels mean — a caller decides that. It only
 * guarantees they are distinguishable at a glance, and that they read as a progression:
 *
 * - `quiet` — drained of color and dimmed. Reads as "nothing here", without hiding the icon.
 * - `muted` — the type's own color, dimmed. Reads as "there is something here".
 * - `full` — the type's own color at full strength. Reads as "you are looking at it".
 */
export type ItemTypeIconEmphasis = "quiet" | "muted" | "full";

/** What the icon shows and how loudly. */
export interface ItemTypeIconOptions {
  /** The ADO work item type icon URL (already tinted with the type's color by ADO's own query string). */
  iconUrl: string | null;
  /** The type's color (`#rrggbb`), used for the fallback glyph when no icon URL is available. */
  color: string | null;
  /** The work item type name, so the icon is announced rather than being a decorative blank. */
  typeName: string;
  /** How loudly the icon starts. Defaults to `full`. */
  emphasis?: ItemTypeIconEmphasis;
}

/** A rendered type icon plus the one thing a caller changes about it after the fact. */
export interface ItemTypeIconHandle {
  element: HTMLElement;
  /** Change how loudly the icon renders. */
  setEmphasis(emphasis: ItemTypeIconEmphasis): void;
}

/**
 * The look of each level: opacity plus how much color is drained.
 *
 * `quiet` desaturates rather than just dimming further. Two dim states separated only by opacity are
 * a brightness judgement the reader has to make against a row they have nothing to compare it to;
 * grey-vs-colored is a difference they can see in one pass down the column.
 */
const EMPHASIS_STYLES: Readonly<Record<ItemTypeIconEmphasis, { opacity: string; filter: string }>> =
  {
    quiet: { opacity: "0.35", filter: "grayscale(1)" },
    muted: { opacity: "0.55", filter: "none" },
    full: { opacity: "1", filter: "none" },
  };

/**
 * The work item type icon that sits in front of an item's title.
 *
 * It is sized in `em`, not pixels, so it always matches the title it precedes — including in the
 * nested rows of a tree board, where each level renders slightly smaller than its parent.
 *
 * Azure DevOps serves the icon already tinted with the type's color, so this control varies
 * brightness and saturation rather than hue: every level is the same ADO icon, which keeps the type
 * recognizable in all of them. When the icon URL is missing or fails to load, a colored dot in the
 * same color takes its place rather than a broken-image glyph.
 */
export function renderItemTypeIcon(
  doc: Document,
  options: ItemTypeIconOptions,
): ItemTypeIconHandle {
  const element = doc.createElement("span");
  element.className = "awesomeado-type-icon";
  element.title = options.typeName;
  element.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "vertical-align:middle",
    "width:1em",
    "height:1em",
    "flex:0 0 auto",
    // A hair of separation from the title without stealing a whole space.
    "margin-right:4px",
    // Instant enough to feel like a direct response, slow enough to be seen as a change of state.
    "transition:opacity 120ms ease, filter 120ms ease",
  ].join(";");

  element.append(createIcon(doc, options));
  const handle: ItemTypeIconHandle = {
    element,
    setEmphasis: (emphasis) => {
      const style = EMPHASIS_STYLES[emphasis];
      element.style.opacity = style.opacity;
      element.style.filter = style.filter;
    },
  };
  handle.setEmphasis(options.emphasis ?? "full");
  return handle;
}

/** The icon image, or the colored fallback dot when there is no URL to load. */
function createIcon(doc: Document, options: ItemTypeIconOptions): HTMLElement {
  const { iconUrl, color } = options;
  if (iconUrl === null || iconUrl.length === 0) {
    return createFallbackDot(doc, color);
  }
  const image = doc.createElement("img");
  image.className = "awesomeado-type-icon__image";
  image.alt = "";
  // The icon is served from whatever host the tenant configured, so the request carries no referrer.
  image.referrerPolicy = "no-referrer";
  image.style.cssText = ["width:100%", "height:100%", "display:block"].join(";");
  image.src = iconUrl;
  image.addEventListener("error", () => {
    // A URL that will not load from this page leaves a broken-image glyph, which reads as a bug;
    // the colored dot still says "this is a Feature" at a glance.
    image.replaceWith(createFallbackDot(doc, color));
  });
  return image;
}

/** A filled circle in the type's color, the stand-in when ADO's icon is unavailable. */
function createFallbackDot(doc: Document, color: string | null): HTMLElement {
  const dot = doc.createElement("span");
  dot.className = "awesomeado-type-icon__dot";
  dot.style.cssText = [
    "width:0.7em",
    "height:0.7em",
    "border-radius:50%",
    `background:${color ?? "currentColor"}`,
  ].join(";");
  return dot;
}
