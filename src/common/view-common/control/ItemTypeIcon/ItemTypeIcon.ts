/**
 * How loudly the icon renders, on two INDEPENDENT axes.
 *
 * The control deliberately does NOT know what either axis means — a caller decides that. It only
 * guarantees the four combinations are distinguishable at a glance.
 *
 * They are two axes rather than one ordered scale because a caller needs all four: an icon can be
 * "there is nothing here, but you are looking at it anyway", which no single quiet→loud progression
 * can express without claiming there is something to see.
 */
export interface ItemTypeIconEmphasis {
  /** Keep the type's own color (`true`), or drain the icon to grey (`false`). */
  colored: boolean;
  /** Render at full strength (`true`), or pulled back (`false`). */
  loud: boolean;
}

/** What the icon shows and how loudly. */
export interface ItemTypeIconOptions {
  /** The ADO work item type icon URL (already tinted with the type's color by ADO's own query string). */
  iconUrl: string | null;
  /** The type's color (`#rrggbb`), used for the fallback glyph when no icon URL is available. */
  color: string | null;
  /** The work item type name, so the icon is announced rather than being a decorative blank. */
  typeName: string;
  /**
   * The icon's tooltip. Defaults to `typeName`.
   *
   * Pass `""` when the icon sits inside a control that carries its own tooltip: a `title` on the
   * icon SHADOWS the one on its container, so the reader would hover the thing they are about to
   * click and be told the work item type instead of what clicking it does.
   */
  title?: string;
  /** How loudly the icon starts. Defaults to colored and loud. */
  emphasis?: ItemTypeIconEmphasis;
}

/** A rendered type icon plus the one thing a caller changes about it after the fact. */
export interface ItemTypeIconHandle {
  element: HTMLElement;
  /** Change how loudly the icon renders. */
  setEmphasis(emphasis: ItemTypeIconEmphasis): void;
}

/** Where a pulled-back but still colored icon sits. */
const DIMMED_OPACITY = "0.55";

/**
 * Where a pulled-back, drained icon sits — further back than a dimmed colored one.
 *
 * Two pulled-back states separated only by opacity are a brightness judgement the reader has to make
 * against a row they have nothing to compare to. Letting the drained one recede further as well means
 * "nothing here" and "something here" differ in two ways at once, visible in one pass down a column.
 */
const DRAINED_OPACITY = "0.35";

/** The opacity and filter one emphasis renders at. */
function emphasisStyle(emphasis: ItemTypeIconEmphasis): { opacity: string; filter: string } {
  const filter = emphasis.colored ? "none" : "grayscale(1)";
  if (emphasis.loud) {
    return { opacity: "1", filter };
  }
  return { opacity: emphasis.colored ? DIMMED_OPACITY : DRAINED_OPACITY, filter };
}

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
  const title = options.title ?? options.typeName;
  // Left unset rather than set empty: an empty `title` still shadows the container's, so the reader
  // would get no tooltip at all instead of the container's own.
  if (title.length > 0) {
    element.title = title;
  }
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
      const style = emphasisStyle(emphasis);
      element.style.opacity = style.opacity;
      element.style.filter = style.filter;
    },
  };
  handle.setEmphasis(options.emphasis ?? { colored: true, loud: true });
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
