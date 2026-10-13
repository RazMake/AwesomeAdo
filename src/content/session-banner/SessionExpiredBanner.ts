import type { ILogger } from "../../common/logging/ILogger";
import type { Theme } from "../../common/settings/ExtensionSettings";
import { applyContentTheme } from "../content-theme/applyContentTheme";

const ROOT_ID = "awesomeado-session-banner";
// Above the enhanced-view overlay (1000) and the item collector, so it cannot be hidden by either.
const BANNER_Z_INDEX = "2147483647";

export const SESSION_EXPIRED_TEXT =
  "Your Azure DevOps sign-in has expired and AwesomeADO could not renew it automatically. " +
  "Sign in again, then retry what did not save.";

/**
 * The page-level banner shown when the background worker found the Azure DevOps sign-in expired and
 * could not renew it silently.
 *
 * Mounted on the page body rather than inside a view, because an expired sign-in breaks every view
 * alike and the reader may be on ADO's own page when it happens. **Sign in** opens the sign-in flow
 * in a new tab rather than reloading this one, so edits waiting in the page are not thrown away.
 */
export class SessionExpiredBanner {
  private root: HTMLElement | undefined;
  private theme: Theme = "auto";

  constructor(
    private readonly doc: Document,
    private readonly openSignIn: () => void,
    private readonly logger: ILogger,
  ) {}

  get isShown(): boolean {
    return this.root !== undefined;
  }

  /** Apply the selected AwesomeADO theme; the banner lives outside the themed view host. */
  applyTheme(theme: Theme): void {
    this.theme = theme;
    if (this.root) {
      applyContentTheme(this.root, this.theme, this.doc);
    }
  }

  show(): void {
    if (this.root) {
      return;
    }
    this.root = this.render();
    this.doc.body.append(this.root);
    this.logger.info("Showing the Azure DevOps sign-in expired banner.");
  }

  hide(): void {
    if (!this.root) {
      return;
    }
    this.root.remove();
    this.root = undefined;
    this.logger.info("Hid the Azure DevOps sign-in expired banner.");
  }

  private render(): HTMLElement {
    const root = this.doc.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("role", "alert");
    root.style.cssText = [
      "position:fixed",
      "top:12px",
      "left:50%",
      "transform:translateX(-50%)",
      `z-index:${BANNER_Z_INDEX}`,
      "display:flex",
      "align-items:center",
      "gap:12px",
      "max-width:min(720px, calc(100vw - 32px))",
      "padding:10px 12px 10px 16px",
      "border-radius:6px",
      "border:1px solid var(--status-red-border)",
      "background:var(--callout-background-color)",
      "color:var(--text-primary-color)",
      "box-shadow:0 4px 16px var(--shadow)",
      "font:13px/1.4 'Segoe UI', system-ui, sans-serif",
    ].join(";");
    applyContentTheme(root, this.theme, this.doc);

    const message = this.doc.createElement("span");
    message.textContent = SESSION_EXPIRED_TEXT;
    message.style.cssText = "flex:1 1 auto";

    const signIn = this.button("Sign in", "Open the Azure DevOps sign-in in a new tab", () => {
      this.logger.info("Sign-in banner: opening the Azure DevOps sign-in in a new tab.");
      this.openSignIn();
    });
    signIn.style.background = "var(--accent)";
    signIn.style.color = "var(--accent-contrast)";
    signIn.style.borderColor = "var(--accent)";

    const dismiss = this.button("×", "Dismiss", () => this.hide());
    dismiss.style.fontSize = "16px";

    root.append(message, signIn, dismiss);
    return root;
  }

  private button(label: string, title: string, onClick: () => void): HTMLButtonElement {
    const button = this.doc.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.title = title;
    button.setAttribute("aria-label", title);
    button.style.cssText = [
      "flex:0 0 auto",
      "padding:4px 12px",
      "border-radius:4px",
      "border:1px solid var(--control-border-strong)",
      "background:transparent",
      "color:inherit",
      "font:inherit",
      "cursor:pointer",
    ].join(";");
    button.addEventListener("click", onClick);
    return button;
  }
}
