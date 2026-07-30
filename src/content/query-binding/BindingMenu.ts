import type { Theme } from "../../common/settings/ExtensionSettings";
import { THEME_COLOR_VARIABLES } from "../../common/view-common/themes/ThemeDefinition";
import { resolveTheme } from "../../common/view-common/themes/themes";
import { detectAdoTheme } from "../ado-probe/AdoThemeProbe";

/** A selectable row in the popup menu. */
export interface MenuItem {
  readonly kind: "item";
  readonly label: string;
  /** When true, the row shows a check mark — used for the active-view choice. */
  readonly checked?: boolean;
  readonly onSelect: () => void;
}

/** A horizontal divider between groups of items. */
export interface MenuSeparator {
  readonly kind: "separator";
}

export type MenuEntry = MenuItem | MenuSeparator;

const MENU_ID = "awesomeado-button-menu";
// Above ADO's own top bar and any overlay it paints, matching the button's own stacking.
const MENU_Z_INDEX = "2147483647";
const MENU_RADIUS_PX = 10;
const MENU_PADDING_PX = 4;
const ROW_RADIUS_PX = MENU_RADIUS_PX - MENU_PADDING_PX;

/**
 * A small popup menu anchored under a trigger element.
 *
 * Owns nothing but the menu DOM (Single Responsibility): callers pass the anchor and a list of
 * entries with their own `onSelect` callbacks, so this class never knows what the items mean. It is
 * transient — opened on demand and dismissed on selection, an outside click, Escape, or when the
 * viewport shifts — so it needs no persistence observer the way the always-present button does.
 *
 * Styling is self-contained and pins the selected AwesomeADO palette because the menu is mounted
 * outside the enhanced-view host that normally supplies those theme roles.
 */
export class BindingMenu {
  private menu: HTMLElement | undefined;
  private anchor: HTMLElement | undefined;
  private theme: Theme = "auto";

  constructor(private readonly doc: Document) {}

  get isOpen(): boolean {
    return this.menu?.isConnected ?? false;
  }

  /** Apply the selected AwesomeADO theme, updating an open menu in place. */
  applyTheme(theme: Theme): void {
    this.theme = theme;
    this.applyThemeToMenu();
  }

  /** Replace any open menu with one built from `entries`, aligned under `anchor`. */
  open(anchor: HTMLElement, entries: readonly MenuEntry[]): void {
    this.close();
    const menu = this.doc.createElement("div");
    menu.id = MENU_ID;
    menu.setAttribute("role", "menu");
    this.applyMenuStyle(menu);
    for (const entry of entries) {
      menu.append(entry.kind === "separator" ? this.buildSeparator() : this.buildItem(entry));
    }
    this.menu = menu;
    this.anchor = anchor;
    this.applyThemeToMenu();
    (this.doc.body ?? this.doc.documentElement).append(menu);
    this.position();
    // Capture so a click that also lands on an ADO handler still dismisses the menu first.
    this.doc.addEventListener("pointerdown", this.handleOutsidePointer, true);
    this.doc.addEventListener("keydown", this.handleKeydown, true);
    // The menu is position:fixed, so it must follow (or dismiss on) any viewport shift.
    this.doc.defaultView?.addEventListener("resize", this.handleReposition, true);
    this.doc.addEventListener("scroll", this.handleReposition, true);
  }

  /** Remove the menu and detach its listeners. Safe to call when nothing is open. */
  close(): void {
    if (!this.menu) {
      return;
    }
    this.doc.removeEventListener("pointerdown", this.handleOutsidePointer, true);
    this.doc.removeEventListener("keydown", this.handleKeydown, true);
    this.doc.defaultView?.removeEventListener("resize", this.handleReposition, true);
    this.doc.removeEventListener("scroll", this.handleReposition, true);
    this.menu.remove();
    this.menu = undefined;
    this.anchor = undefined;
  }

  private buildItem(item: MenuItem): HTMLElement {
    const row = this.doc.createElement("button");
    row.type = "button";
    row.setAttribute("role", "menuitem");
    this.applyItemStyle(row);
    // A fixed check gutter keeps every label left-aligned whether or not the row is checked.
    const check = this.doc.createElement("span");
    check.textContent = item.checked ? "\u2713" : "";
    check.style.cssText = "width:16px;flex:0 0 auto;text-align:center";
    const label = this.doc.createElement("span");
    label.textContent = item.label;
    row.append(check, label);
    row.addEventListener("mouseenter", () => {
      row.style.backgroundColor = "var(--control-background-hover)";
    });
    row.addEventListener("mouseleave", () => {
      row.style.backgroundColor = "transparent";
    });
    row.addEventListener("click", () => {
      this.close();
      item.onSelect();
    });
    return row;
  }

  private buildSeparator(): HTMLElement {
    const line = this.doc.createElement("div");
    line.setAttribute("role", "separator");
    line.style.cssText =
      "height:0;margin:4px 0;border-top-width:1px;border-top-style:solid;border-top-color:var(--control-border-strong);opacity:0.7";
    return line;
  }

  private applyMenuStyle(menu: HTMLElement): void {
    menu.style.cssText = [
      "position:fixed",
      `z-index:${MENU_Z_INDEX}`,
      "min-width:160px",
      "width:max-content",
      "max-width:calc(100vw - 16px)",
      `padding:${MENU_PADDING_PX}px`,
      "background:var(--callout-background-color)",
      "color:var(--text-primary-color)",
      "border:1px solid var(--control-border-strong)",
      `border-radius:${MENU_RADIUS_PX}px`,
      "box-shadow:0 2px 8px var(--shadow-subtle)",
      'font:13px "Segoe UI", system-ui, sans-serif',
    ].join(";");
  }

  private applyItemStyle(row: HTMLButtonElement): void {
    row.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:8px",
      "width:100%",
      "box-sizing:border-box",
      "padding:6px 10px",
      "background-color:transparent",
      "border:none",
      `border-radius:${ROW_RADIUS_PX}px`,
      "color:inherit",
      "font:inherit",
      "font-size:12px",
      "line-height:1.6",
      "text-align:left",
      "white-space:nowrap",
      "cursor:pointer",
    ].join(";");
  }

  private applyThemeToMenu(): void {
    if (!this.menu) {
      return;
    }
    const adoTheme = this.theme === "auto" ? detectAdoTheme(this.doc) : null;
    const resolved = resolveTheme(this.theme, adoTheme);
    for (const variable of THEME_COLOR_VARIABLES) {
      this.menu.style.setProperty(variable, resolved.colors[variable]);
    }
    this.menu.style.setProperty("color-scheme", resolved.colorScheme);
  }

  private position(): void {
    if (!this.menu || !this.anchor) {
      return;
    }
    const rect = this.anchor.getBoundingClientRect();
    const view = this.doc.defaultView;
    const viewportWidth = view?.innerWidth ?? rect.right;
    // Align the menu's right edge with the button's right edge and drop it just below the button, so
    // it reads as belonging to that button even though it sits near the right edge of the top bar.
    this.menu.style.top = `${rect.bottom + 4}px`;
    this.menu.style.right = `${Math.max(0, viewportWidth - rect.right)}px`;
    this.menu.style.left = "auto";
  }

  private readonly handleOutsidePointer = (event: Event): void => {
    const target = event.target as Node | null;
    // Ignore clicks on the anchor so its own handler can toggle the menu without a close/reopen race.
    if (target && (this.menu?.contains(target) || this.anchor?.contains(target))) {
      return;
    }
    this.close();
  };

  private readonly handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      this.close();
    }
  };

  private readonly handleReposition = (): void => {
    this.position();
  };
}
