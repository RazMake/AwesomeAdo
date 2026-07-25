import type { IQueryBindingStore } from "../../common/bindings/IQueryBindingStore";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";
import {
  CONFIG_FILE_NAME,
  exportConfig,
  importConfig,
} from "../../common/settings-transfer/AwesomeAdoConfig";

/** The options-page elements the controller drives. Passed in so the controller stays testable. */
export interface SettingsTransferElements {
  exportButton: HTMLButtonElement;
  importButton: HTMLButtonElement;
  /** Hidden `<input type="file">` the Import button opens; kept out of the visible layout. */
  fileInput: HTMLInputElement;
  /** Live-region line that reports the outcome of the last import/export to the user. */
  status: HTMLElement;
}

type ReportError = (error: unknown) => void;

const defaultReportError: ReportError = (error) =>
  console.error("AwesomeADO could not transfer settings", error);

/**
 * Binds the Appearance panel's Import/Export controls to BOTH the settings store and the query
 * binding store, so a single file captures and restores the user's entire configuration — every
 * setting plus every enhanced-query binding. Import replaces bindings wholesale (via `replaceAll`)
 * so the imported file is authoritative rather than merged into whatever was already saved.
 *
 * Like the Diagnostics log export, the download/file-read uses ambient browser APIs (`Blob`, `URL`,
 * the file input) directly; only `chrome.*` is injected, and that reaches this controller through
 * the injected store abstractions.
 */
export class SettingsTransferController {
  private disposed = false;

  constructor(
    private readonly settingsStore: ISettingsStore,
    private readonly bindingStore: IQueryBindingStore,
    private readonly elements: SettingsTransferElements,
    private readonly reportError: ReportError = defaultReportError,
  ) {}

  init(): void {
    this.elements.exportButton.addEventListener("click", this.handleExport);
    this.elements.importButton.addEventListener("click", this.handleImport);
    this.elements.fileInput.addEventListener("change", this.handleFileChosen);
  }

  dispose(): void {
    this.disposed = true;
    this.elements.exportButton.removeEventListener("click", this.handleExport);
    this.elements.importButton.removeEventListener("click", this.handleImport);
    this.elements.fileInput.removeEventListener("change", this.handleFileChosen);
  }

  private readonly handleExport = (): void => {
    void this.export();
  };

  private async export(): Promise<void> {
    try {
      // Both stores are the source of truth; read them together so the file is a consistent snapshot.
      const [settings, enhancedQueries] = await Promise.all([
        this.settingsStore.read(),
        this.bindingStore.read(),
      ]);
      this.download(CONFIG_FILE_NAME, exportConfig(settings, enhancedQueries));
      this.setStatus(`Exported your configuration to ${CONFIG_FILE_NAME}.`);
    } catch (error: unknown) {
      this.fail("export your configuration", error);
    }
  }

  private readonly handleImport = (): void => {
    // Delegate to the hidden file input; the OS picker returns through the change handler.
    this.elements.fileInput.click();
  };

  private readonly handleFileChosen = (): void => {
    void this.importSelected();
  };

  private async importSelected(): Promise<void> {
    const file = this.elements.fileInput.files?.[0];
    if (!file) {
      // The user opened the picker but cancelled; nothing to do.
      return;
    }
    try {
      const { settings, enhancedQueries } = importConfig(await file.text());
      // Persist to both stores. Bindings are replaced wholesale so the file is authoritative.
      await Promise.all([
        this.settingsStore.write(settings),
        this.bindingStore.replaceAll(enhancedQueries),
      ]);
      this.setStatus("Imported your configuration.");
    } catch (error: unknown) {
      this.fail("import the selected file", error);
    } finally {
      // Reset so selecting the same file again still fires a `change` event.
      this.elements.fileInput.value = "";
    }
  }

  private download(filename: string, contents: string): void {
    const doc = this.elements.exportButton.ownerDocument;
    const blob = new Blob([contents], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    try {
      const anchor = doc.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
    } finally {
      // Always release the object URL, even if the click throws, so the blob can be collected.
      URL.revokeObjectURL(url);
    }
  }

  private setStatus(message: string): void {
    if (this.disposed) {
      return;
    }
    this.elements.status.textContent = message;
  }

  private fail(action: string, error: unknown): void {
    this.reportError(error);
    const detail = error instanceof Error ? error.message : String(error);
    this.setStatus(`Could not ${action}: ${detail}`);
  }
}
