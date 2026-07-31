import type { IQueryBindingStore } from "../../common/bindings/IQueryBindingStore";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";
import {
  CONFIG_FILE_NAME,
  ConfigImportError,
  exportConfig,
  importConfig,
} from "../../common/settings-transfer/AwesomeAdoConfig";
import type { TeamConfigSourceStore } from "../../common/settings-transfer/TeamConfigSourceStore";

import { renderTransferStatus } from "./transferStatus";

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

/**
 * Told that the stored configuration has just been replaced from a file, so the sections that read
 * their values once at load can re-read them. Kept as a callback rather than a reference to those
 * controllers so this one stays unaware of the rest of the page.
 */
type OnImported = () => void;

const defaultReportError: ReportError = (error) =>
  console.error("AwesomeADO could not transfer settings", error);

/**
 * Binds the Appearance panel's Import/Export controls to the settings, query-binding, and team
 * source stores, so one file captures and restores the user's entire configuration. Import replaces
 * bindings wholesale (via `replaceAll`) so the file is authoritative rather than merged into
 * whatever was already saved.
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
    private readonly teamConfigSourceStore: TeamConfigSourceStore,
    private readonly elements: SettingsTransferElements,
    private readonly reportError: ReportError = defaultReportError,
    private readonly onImported: OnImported = () => {},
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
      // Read all stores together so the file is one consistent snapshot.
      const [settings, enhancedQueries, teamConfigWorkItemId] = await Promise.all([
        this.settingsStore.read(),
        this.bindingStore.read(),
        this.teamConfigSourceStore.read(),
      ]);
      this.download(
        CONFIG_FILE_NAME,
        exportConfig(settings, enhancedQueries, teamConfigWorkItemId),
      );
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
      const { settings, enhancedQueries, teamConfigWorkItemId, problems } = importConfig(
        await file.text(),
      );
      // Persist whatever the file offered. Settings arrive as a partial, so a value the file omitted
      // or got wrong keeps what the user has today; bindings are replaced wholesale so the file is
      // authoritative about which queries are enhanced.
      const writes: Promise<void>[] = [
        this.settingsStore.write(settings),
        this.bindingStore.replaceAll(enhancedQueries),
      ];
      if (teamConfigWorkItemId !== undefined) {
        writes.push(this.teamConfigSourceStore.write(teamConfigWorkItemId));
      }
      await Promise.all(writes);
      // The page is showing the configuration the file just replaced, so tell it to re-read before
      // reporting success: leaving it stale would both hide the import and let the next edit save
      // the old values back over it.
      this.onImported();
      this.reportImported(problems);
    } catch (error: unknown) {
      this.fail("import the selected file", error);
    } finally {
      // Reset so selecting the same file again still fires a `change` event.
      this.elements.fileInput.value = "";
    }
  }

  /**
   * Announce what the import actually did. A partly-applied file is reported as a failure — logged
   * in full and shown in red — because the parts that were skipped are exactly the ones the user
   * would otherwise go looking for later, long after "Imported your configuration." scrolled by.
   */
  private reportImported(problems: readonly string[]): void {
    if (problems.length === 0) {
      this.setStatus("Imported your configuration.");
      return;
    }
    this.reportError(new ConfigImportError(problems));
    const count = `${problems.length} problem${problems.length === 1 ? "" : "s"}`;
    this.setStatus(
      `Imported your configuration, but skipped ${count}: ${problems.join(" ")}`,
      true,
    );
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

  private setStatus(message: string, failed = false): void {
    if (this.disposed) {
      return;
    }
    renderTransferStatus(this.elements.status, message, failed);
  }

  private fail(action: string, error: unknown): void {
    // Record first: the log is the only place the full detail (and stack) survives once the user
    // navigates away, and it must be written even if updating the status line is suppressed by a
    // dispose that raced this failure.
    this.reportError(error);
    const detail = error instanceof Error ? error.message : String(error);
    this.setStatus(`Could not ${action}: ${detail}`, true);
  }
}
