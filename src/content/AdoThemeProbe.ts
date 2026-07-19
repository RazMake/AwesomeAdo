import type { AdoTheme } from "../common/navigation/AdoContext";

/**
 * Detects whether the Azure DevOps page is currently rendering a light or dark theme.
 *
 * ADO paints the page with `background-color: var(--background-color, white)` and injects that
 * theme token (a dark or light color) onto the root/body once its theme loads. We classify the
 * *token* rather than the painted color: an un-themed, still-loading, or error page keeps the white
 * `var()` fallback, and reading that white paint would misreport a Dark-theme account as Light —
 * the exact cause of the options page flashing white for Dark users. When no theme token is present
 * we return null (unknown) so the caller can pick a safe default instead of trusting the fallback.
 *
 * Reading the CSS custom property is more stable than matching ADO's internal class names: it is
 * the same token ADO's own `body` rule references, and survives class renames.
 */
export function detectAdoTheme(doc: Document): AdoTheme | null {
  const view = doc.defaultView;
  if (view === null) {
    return null;
  }
  for (const surface of themeSurfaces(doc)) {
    const luminance = themeTokenLuminance(view.getComputedStyle(surface));
    if (luminance !== null) {
      return luminance < 0.5 ? "dark" : "light";
    }
  }
  return null;
}

// ADO exposes its theme surface as CSS custom properties on the root and body. `--background-color`
// is a full `rgba()` string; `--palette-neutral-0` is a bare "r, g, b" triple for the same surface
// and acts as a backstop when only the palette form is present.
function themeTokenLuminance(style: CSSStyleDeclaration): number | null {
  const backgroundToken = parseLuminance(style.getPropertyValue("--background-color").trim());
  if (backgroundToken !== null) {
    return backgroundToken;
  }
  const neutral0 = style.getPropertyValue("--palette-neutral-0").trim();
  return neutral0 === "" ? null : parseLuminance(`rgb(${neutral0})`);
}

// The body carries the most specific token; the root (documentElement) is the inherited fallback.
function themeSurfaces(doc: Document): HTMLElement[] {
  return [doc.body, doc.documentElement].filter(
    (element): element is HTMLElement => element !== null,
  );
}

/**
 * Convert a CSS `rgb()`/`rgba()` color into a 0..1 perceptual luminance, or null when the color is
 * unset, unparseable, or fully transparent (a transparent surface reveals nothing about the theme).
 */
export function parseLuminance(color: string | null | undefined): number | null {
  const channels = parseRgba(color);
  if (channels === null || channels.alpha === 0) {
    return null;
  }
  // Rec. 601 weighting is more than enough to separate light from dark surfaces.
  return (0.299 * channels.red + 0.587 * channels.green + 0.114 * channels.blue) / 255;
}

interface Rgba {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function parseRgba(color: string | null | undefined): Rgba | null {
  if (!color) {
    return null;
  }
  const body = /^rgba?\(([^)]+)\)$/i.exec(color.trim())?.[1];
  if (body === undefined) {
    return null;
  }
  const values = body.split(",").map((part) => Number.parseFloat(part.trim()));
  const [red, green, blue, alpha = 1] = values;
  if (!isChannel(red) || !isChannel(green) || !isChannel(blue) || !isChannel(alpha)) {
    return null;
  }
  return { red, green, blue, alpha };
}

function isChannel(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}
