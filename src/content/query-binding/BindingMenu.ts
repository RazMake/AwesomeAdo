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

/**
 * A small popup menu anchored under a trigger element.
 *
 * Owns nothing but the menu DOM (Single Responsibility): callers pass the anchor and a list of
 * entries with their own `onSelect` callbacks, so this class never knows what the items mean. It is
 * transient — opened on demand and dismissed on selection, an outside click, Escape, or when the
 * viewport shifts — so it needs no persistence observer the way the always-present button does.
 *
 * Styling is self-contained but reads ADO's theme tokens (with hard fallbacks) so the menu follows
 * the account's light or dark theme instead of clashing with it.
 */
export class BindingMenu {
  private menu: HTMLElement | undefined;
  private anchor: HTMLElement | undefined;

  constructor(private readonly doc: Document) {}

  get isOpen(): boolean {
    return this.menu?.isConnected ?? false;
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
      row.style.backgroundColor = "rgba(128,128,128,0.18)";
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
      "height:0;margin:4px 0;border-top:1px solid var(--component-menu-separator-color, rgba(128,128,128,0.35))";
    return line;
  }

  private applyMenuStyle(menu: HTMLElement): void {
    menu.style.cssText = [
      "position:fixed",
      `z-index:${MENU_Z_INDEX}`,
      "min-width:200px",
      "padding:4px 0",
      "background:var(--callout-background-color, var(--background-color, #fff))",
      "color:var(--text-primary-color, #1f1f1f)",
      "border:1px solid var(--component-menu-separator-color, rgba(128,128,128,0.35))",
      "border-radius:4px",
      "box-shadow:0 4px 12px rgba(0,0,0,0.28)",
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
      "padding:6px 12px",
      "background:transparent",
      "border:none",
      "color:inherit",
      "font:inherit",
      "text-align:left",
      "white-space:nowrap",
      "cursor:pointer",
    ].join(";");
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
