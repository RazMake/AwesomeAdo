import type { Theme } from "../../common/settings/ExtensionSettings";
import { THEME_COLOR_VARIABLES } from "../../common/view-common/themes/ThemeDefinition";
import { resolveTheme } from "../../common/view-common/themes/themes";
import { detectAdoTheme } from "../ado-probe/AdoThemeProbe";

/**
 * Pin the selected AwesomeADO palette onto an element mounted in the ADO page, so its subtree reads
 * our theme tokens instead of ADO's inherited ones. `"auto"` follows the theme ADO is painting.
 *
 * `color-scheme` is set too because browser-drawn widgets (date pickers, scrollbars) read it rather
 * than our tokens, and it inherits through the whole subtree.
 */
export function applyContentTheme(element: HTMLElement, theme: Theme, doc: Document): void {
  const resolved = resolveTheme(theme, theme === "auto" ? detectAdoTheme(doc) : null);
  for (const variable of THEME_COLOR_VARIABLES) {
    element.style.setProperty(variable, resolved.colors[variable]);
  }
  element.style.setProperty("color-scheme", resolved.colorScheme);
}
