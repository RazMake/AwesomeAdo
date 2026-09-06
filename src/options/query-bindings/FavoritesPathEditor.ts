import type { QueryFavoritesPaths } from "../../common/settings/QueryFavoritesPaths";
import { AutocompleteInput } from "../ado-config/AutocompleteInput";

export interface FavoritesPathEditorOptions {
  paths: QueryFavoritesPaths;
  folderPaths(): Promise<readonly string[]>;
  recordError(error: unknown): void;
}

export class FavoritesPathEditor {
  readonly root: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly status: HTMLElement;
  private readonly autocomplete: AutocompleteInput;
  private disposed = false;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    doc: Document,
    private readonly queryId: string,
    private readonly options: FavoritesPathEditorOptions,
  ) {
    this.root = doc.createElement("div");
    this.root.className = "setting";
    const field = doc.createElement("label");
    field.className = "field";
    const label = doc.createElement("span");
    label.className = "field__label";
    label.textContent = "Favorites path (personal, relative to Favorites bar)";
    this.input = doc.createElement("input");
    this.input.type = "text";
    this.input.dataset.propertyKey = "favoritesPath";
    this.input.setAttribute("aria-label", "Favorites path");
    this.input.placeholder = "Work/Projects";
    this.input.disabled = true;
    this.autocomplete = new AutocompleteInput(this.input);
    this.autocomplete.enableOverflowTitles();
    field.append(label, this.autocomplete.root);
    this.status = doc.createElement("p");
    this.status.className = "field__hint";
    this.status.setAttribute("role", "status");
    this.root.append(field, this.status);
    this.input.addEventListener("change", this.save);
    this.input.addEventListener("focus", this.refreshFolders);
    void this.load();
    this.refreshFolders();
  }

  dispose(): void {
    this.disposed = true;
    this.input.removeEventListener("change", this.save);
    this.input.removeEventListener("focus", this.refreshFolders);
    this.autocomplete.dispose();
  }

  private async load(): Promise<void> {
    try {
      const value = await this.options.paths.read(this.queryId);
      if (this.disposed) return;
      this.input.value = value;
      this.input.disabled = false;
    } catch (error) {
      this.fail("Could not read the Favorites path.", error);
    }
  }

  private fail(message: string, error: unknown): void {
    this.options.recordError(error);
    if (!this.disposed) this.status.textContent = message;
  }

  private readonly refreshFolders = (): void => {
    void this.options
      .folderPaths()
      .then((paths) => {
        if (!this.disposed) this.autocomplete.setOptions(paths);
      })
      .catch((error: unknown) =>
        this.fail("Could not load Favorites folders. You can still enter a path.", error),
      );
  };

  private readonly save = (): void => {
    const value = this.input.value;
    this.pending = this.pending
      .then(async () => {
        await this.options.paths.write(this.queryId, value);
        if (!this.disposed) this.status.textContent = "";
      })
      .catch((error: unknown) =>
        this.fail(
          error instanceof Error ? error.message : "Could not save the Favorites path.",
          error,
        ),
      );
  };
}
