import type { IAdoTabReader } from "../common/browser/IAdoTabReader";
import type { AdoTheme } from "../common/navigation/AdoContext";
import type { DefaultView, ExtensionSettings, Theme } from "../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../common/settings/ISettingsStore";

import { resolveTheme } from "./theme";

/** The options-page elements the controller drives. Passed in so the controller stays testable. */
export interface OptionsElements {
  /** Element that carries the resolved `data-theme` (normally the document root). */
  root: HTMLElement;
  themeSelect: HTMLSelectElement;
  defaultViewSelect: HTMLSelectElement;
}

type ReportError = (error: unknown) => void;

const defaultReportError: ReportError = (error) =>
  console.error("AwesomeADO could not save synced settings", error);

/**
 * Binds the Appearance panel (theme + default-view selects) to the settings store, in both
 * directions, and resolves the "auto" theme from the active ADO tab's rendered theme.
 */
export class OptionsController {
  private disposed = false;
  private unsubscribe: (() => void) | undefined;
  private adoTheme: AdoTheme | null = null;
  private readonly themeBinding: SettingBinding<Theme>;
  private readonly defaultViewBinding: SettingBinding<DefaultView>;

  constructor(
    private readonly store: ISettingsStore,
    private readonly adoTabReader: IAdoTabReader,
    private readonly elements: OptionsElements,
    private readonly reportError: ReportError = defaultReportError,
  ) {
    elements.themeSelect.disabled = true;
    elements.defaultViewSelect.disabled = true;
    this.themeBinding = new SettingBinding(
      elements.themeSelect,
      (theme) => this.store.write({ theme }),
      this.reportError,
    );
    this.defaultViewBinding = new SettingBinding(
      elements.defaultViewSelect,
      (defaultView) => this.store.write({ defaultView }),
      this.reportError,
    );
  }

  async init(): Promise<void> {
    const observation = this.store.observe((settings) => this.render(settings));
    this.unsubscribe = observation.unsubscribe;
    try {
      await observation.ready;
    } catch (error: unknown) {
      this.unsubscribe?.();
      this.unsubscribe = undefined;
      throw error;
    }
    if (this.disposed) {
      return;
    }
    this.themeBinding.enable();
    this.defaultViewBinding.enable();
    // Apply theme immediately when the user picks one, without waiting for the storage round-trip.
    this.elements.themeSelect.addEventListener("change", this.applyThemeFromSelect);
    await this.loadAdoTheme();
  }

  dispose(): void {
    this.disposed = true;
    this.themeBinding.dispose();
    this.defaultViewBinding.dispose();
    this.elements.themeSelect.removeEventListener("change", this.applyThemeFromSelect);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private render(settings: ExtensionSettings): void {
    if (this.disposed) {
      return;
    }
    this.themeBinding.sync(settings.theme);
    this.defaultViewBinding.sync(settings.defaultView);
    this.applyTheme(settings.theme);
  }

  private readonly applyThemeFromSelect = (): void => {
    this.applyTheme(this.elements.themeSelect.value as Theme);
  };

  private applyTheme(theme: Theme): void {
    this.elements.root.dataset.theme = resolveTheme(theme, this.adoTheme);
  }

  private async loadAdoTheme(): Promise<void> {
    let context: Awaited<ReturnType<IAdoTabReader["read"]>> = null;
    try {
      context = await this.adoTabReader.read();
    } catch (error: unknown) {
      // The ADO theme is best-effort; a failure to read tabs must not break the settings UI.
      this.reportError(error);
    }
    if (this.disposed) {
      return;
    }
    this.adoTheme = context?.theme ?? null;
    // Re-resolve "auto" now that ADO's theme is known.
    this.applyTheme(this.elements.themeSelect.value as Theme);
  }
}

/**
 * Optimistically persists one `<select>` to the settings store: reflects the user's choice
 * immediately, confirms it on a successful write, and rolls back to the last confirmed value on
 * failure. A serial queue keeps rapid changes ordered; a pending write suppresses external updates
 * so the user's in-flight choice is never clobbered.
 */
class SettingBinding<V extends string> {
  private confirmed: V | undefined;
  private pending = 0;
  private live = true;
  private queue = Promise.resolve();

  constructor(
    private readonly select: HTMLSelectElement,
    private readonly persist: (value: V) => Promise<void>,
    private readonly reportError: ReportError,
  ) {}

  sync(value: V): void {
    this.confirmed = value;
    if (this.live && this.pending === 0) {
      this.select.value = value;
    }
  }

  enable(): void {
    this.select.disabled = false;
    this.select.addEventListener("change", this.handleChange);
  }

  dispose(): void {
    this.live = false;
    this.select.disabled = true;
    this.select.removeEventListener("change", this.handleChange);
  }

  private readonly handleChange = (): void => {
    const requested = this.select.value as V;
    this.pending += 1;
    this.queue = this.queue.then(() => this.write(requested));
  };

  private async write(value: V): Promise<void> {
    try {
      await this.persist(value);
      this.confirmed = value;
    } catch (error: unknown) {
      this.reportSafely(error);
      if (this.live && this.confirmed !== undefined) {
        this.select.value = this.confirmed;
      }
    } finally {
      this.pending -= 1;
    }
  }

  private reportSafely(error: unknown): void {
    try {
      this.reportError(error);
    } catch (reportingError: unknown) {
      console.error("AwesomeADO settings error reporter failed", reportingError);
    }
  }
}
