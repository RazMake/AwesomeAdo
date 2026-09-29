import { FAVORITES_REFUSALS, normalizeFavoritesFolderPath } from "../../common/browser/Favorites";
import type { FavoritesAccess } from "../../common/browser/FavoritesAccess";
import type { QueryFavoritesPaths } from "../../common/settings/QueryFavoritesPaths";
import { AutocompleteInput } from "../ado-config/AutocompleteInput";

const FAVORITES_WARNING =
  "Sync projects to Favorites replaces the favorites in this folder with this catalog's project queries. Subfolders are left untouched, and you can restore removed favorites right after each sync.";
const EMPTY_PATH_HINT = "Leave empty to keep syncing off for this catalog.";
const ACCESS_REQUIRED =
  "Allow Favorites access to choose a folder. Until then, Sync projects to Favorites stays disabled for this catalog.";

/** Progress of the explicit request for the browser's optional Favorites access. */
type AccessRequestState = "idle" | "asking" | "denied" | "failed";

const ACCESS_MESSAGES: Readonly<Record<AccessRequestState, string>> = {
  idle: ACCESS_REQUIRED,
  asking: ACCESS_REQUIRED,
  denied:
    "Favorites access wasn't allowed. Allow it to choose a folder; until then, Sync projects to Favorites stays disabled for this catalog.",
  failed: "Could not ask for Favorites access. Use Allow Favorites access to try again.",
};

export interface FavoritesPathEditorOptions {
  paths: QueryFavoritesPaths;
  access: FavoritesAccess;
  folderPaths(): Promise<readonly string[]>;
  recordError(error: unknown): void;
  recordDecision(message: string): void;
}

/**
 * Edits one catalog's personal Favorites folder. The field stays disabled until the browser grants
 * the optional Favorites access: without it, folder suggestions cannot load and sync cannot run.
 */
export class FavoritesPathEditor {
  readonly root: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly error: HTMLElement;
  private readonly accessMessage: HTMLElement;
  private readonly accessButton: HTMLButtonElement;
  private readonly accessRow: HTMLElement;
  private readonly autocomplete: AutocompleteInput;
  private accessGranted = false;
  private accessRequest: AccessRequestState = "idle";
  private disabledDecisionLogged = false;
  private loaded = false;
  private disposed = false;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    doc: Document,
    private readonly queryId: string,
    private readonly options: FavoritesPathEditorOptions,
  ) {
    this.root = doc.createElement("div");
    this.root.className = "setting";
    this.input = this.createInput(doc);
    this.autocomplete = new AutocompleteInput(this.input);
    this.autocomplete.enableOverflowTitles();
    this.error = this.createError(doc);
    this.accessMessage = this.createHint(doc, ACCESS_REQUIRED, "field__hint");
    this.accessButton = this.createAccessButton(doc);
    this.accessRow = this.createAccessRow(doc);
    this.root.append(
      this.createField(doc),
      this.accessRow,
      this.createHint(doc, FAVORITES_WARNING, "field__hint field__hint--warning"),
      this.createHint(doc, EMPTY_PATH_HINT, "field__hint"),
      this.error,
    );
    this.input.addEventListener("input", this.validate);
    this.input.addEventListener("change", this.save);
    this.input.addEventListener("focus", this.refreshFolders);
    void this.load();
  }

  dispose(): void {
    this.disposed = true;
    this.input.removeEventListener("input", this.validate);
    this.input.removeEventListener("change", this.save);
    this.input.removeEventListener("focus", this.refreshFolders);
    this.accessButton.removeEventListener("click", this.requestAccess);
    this.autocomplete.dispose();
  }

  private createInput(doc: Document): HTMLInputElement {
    const input = doc.createElement("input");
    input.type = "text";
    input.dataset.propertyKey = "favoritesPath";
    input.setAttribute("aria-label", "Favorites path");
    input.placeholder = "Work/Projects";
    input.disabled = true;
    return input;
  }

  private createField(doc: Document): HTMLElement {
    const field = doc.createElement("label");
    field.className = "field";
    const label = doc.createElement("span");
    label.className = "field__label";
    label.textContent = "Favorites path (personal, relative to Favorites bar)";
    field.append(label, this.autocomplete.root);
    return field;
  }

  private createHint(doc: Document, text: string, className: string): HTMLElement {
    const hint = doc.createElement("p");
    hint.className = className;
    hint.textContent = text;
    return hint;
  }

  private createError(doc: Document): HTMLElement {
    const error = doc.createElement("p");
    error.className = "status";
    error.setAttribute("role", "alert");
    error.hidden = true;
    return error;
  }

  private createAccessButton(doc: Document): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "button button--connect";
    button.textContent = "Allow Favorites access";
    button.addEventListener("click", this.requestAccess);
    return button;
  }

  private createAccessRow(doc: Document): HTMLElement {
    const row = doc.createElement("div");
    row.className = "favorites-path-access";
    // Hidden until the first access check, so users who already allowed access never see it flash.
    row.hidden = true;
    row.append(this.accessMessage, this.accessButton);
    return row;
  }

  private async load(): Promise<void> {
    await Promise.all([this.loadPath(), this.loadFoldersWhenAllowed()]);
    this.loaded = true;
    this.renderAccess();
  }

  private async loadPath(): Promise<void> {
    try {
      const storedPath = await this.options.paths.read(this.queryId);
      if (!this.disposed) this.input.value = normalizeFavoritesFolderPath(storedPath) ?? "";
    } catch (error) {
      this.fail("Could not read the Favorites path.", error);
    }
  }

  private async checkAccess(): Promise<void> {
    try {
      this.updateAccess(await this.options.access.isGranted());
    } catch (error) {
      this.options.recordError(error);
      this.updateAccess(false);
    }
  }

  private readonly validate = (): void => {
    if (this.input.value.trim() !== "" && normalizeFavoritesFolderPath(this.input.value) === null) {
      this.showError(FAVORITES_REFUSALS.invalidPath);
      return;
    }
    this.clearError();
  };

  private readonly save = (): void => {
    const value = this.input.value;
    if (value.trim() === "") {
      this.savePath("");
      return;
    }
    const path = normalizeFavoritesFolderPath(value);
    if (path === null) {
      this.showError(FAVORITES_REFUSALS.invalidPath);
      return;
    }
    this.input.value = path;
    this.clearError();
    this.savePath(path);
  };

  private savePath(path: string): void {
    this.pending = this.pending
      .then(() => this.options.paths.write(this.queryId, path))
      .catch((error: unknown) =>
        this.fail(
          error instanceof Error ? error.message : "Could not save the Favorites path.",
          error,
        ),
      );
  }

  private readonly requestAccess = (): void => {
    if (this.accessRequest === "asking") return;
    let request: Promise<boolean>;
    try {
      // Chromium shows the permission prompt only while this click's user activation is still
      // active, so nothing may be awaited before asking.
      request = this.options.access.request();
    } catch (error) {
      this.handleAccessRequestFailure(error);
      return;
    }
    this.accessRequest = "asking";
    this.renderAccess();
    void this.completeAccessRequest(request);
  };

  private async completeAccessRequest(request: Promise<boolean>): Promise<void> {
    try {
      const granted = await request;
      this.options.recordDecision(
        `Favorites access for query ${this.queryId} from Allow Favorites access: ${granted ? "allowed" : "not allowed"}.`,
      );
      this.accessRequest = granted ? "idle" : "denied";
      // Suggestions load before the field unlocks, so focusing it opens the complete folder list.
      if (granted && !this.disposed) await this.loadFolders();
      this.updateAccess(granted);
      if (granted) this.focusInput();
    } catch (error) {
      this.handleAccessRequestFailure(error);
    }
  }

  private handleAccessRequestFailure(error: unknown): void {
    this.options.recordError(error);
    this.accessRequest = "failed";
    this.updateAccess(false);
  }

  private updateAccess(granted: boolean): void {
    if (this.disposed) return;
    this.accessGranted = granted;
    if (!granted) this.autocomplete.setOptions([]);
    this.recordAccessDecision(granted);
    this.renderAccess();
  }

  private recordAccessDecision(granted: boolean): void {
    if (granted) {
      this.disabledDecisionLogged = false;
      return;
    }
    if (this.disabledDecisionLogged) return;
    this.disabledDecisionLogged = true;
    this.options.recordDecision(
      `Favorites path for query ${this.queryId}: disabled until Favorites access is allowed.`,
    );
  }

  private renderAccess(): void {
    if (this.disposed) return;
    this.input.disabled = !(this.loaded && this.accessGranted);
    this.accessRow.hidden = this.accessGranted;
    this.accessMessage.textContent = ACCESS_MESSAGES[this.accessRequest];
    this.accessButton.disabled = this.accessRequest === "asking";
  }

  private focusInput(): void {
    // The button that held focus is hidden now, so hand focus to the field it unlocked.
    if (!this.disposed && !this.input.disabled) this.input.focus();
  }

  private readonly refreshFolders = (): void => {
    void this.loadFoldersWhenAllowed();
  };

  private async loadFoldersWhenAllowed(): Promise<void> {
    await this.checkAccess();
    if (!this.accessGranted || this.disposed) return;
    await this.loadFolders();
  }

  private async loadFolders(): Promise<void> {
    try {
      const paths = await this.options.folderPaths();
      if (!this.disposed) this.autocomplete.setOptions(paths);
    } catch (error) {
      this.fail("Could not load Favorites folders. You can still enter a path.", error);
    }
  }

  private showError(message: string): void {
    if (this.disposed) return;
    this.error.textContent = message;
    this.error.hidden = false;
    this.input.setAttribute("aria-invalid", "true");
  }

  private clearError(): void {
    if (this.disposed) return;
    this.error.textContent = "";
    this.error.hidden = true;
    this.input.removeAttribute("aria-invalid");
  }

  private fail(message: string, error: unknown): void {
    this.options.recordError(error);
    this.showError(message);
  }
}
