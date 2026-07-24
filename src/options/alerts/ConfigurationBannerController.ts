import type { IQueryBindingStore } from "../../common/bindings/IQueryBindingStore";
import type { QueryBindings } from "../../common/bindings/QueryBinding";
import type { StorageObservation } from "../../common/browser/observeSyncKeys";
import {
  DEFAULT_SETTINGS,
  isAdoConfigured,
  type ExtensionSettings,
} from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";

type ReportError = (error: unknown) => void;

const defaultReportError: ReportError = (error) =>
  console.error("AwesomeADO could not evaluate the configuration banner", error);

/**
 * Shows a page-level banner when at least one query is bound but the Azure DevOps settings are still
 * incomplete. That combination is the one case where the user asked to see the enhanced view yet the
 * content script silently falls back to ADO's own page, so the banner explains why.
 *
 * It observes both the settings store and the binding store (Dependency Inversion) so it re-evaluates
 * live as the user edits either, without either store needing to know about this UI.
 */
export class ConfigurationBannerController {
  private disposed = false;
  private settings: ExtensionSettings = DEFAULT_SETTINGS;
  private hasBindings = false;
  private settingsObservation: StorageObservation | null = null;
  private bindingObservation: StorageObservation | null = null;

  constructor(
    private readonly settingsStore: ISettingsStore,
    private readonly bindingStore: IQueryBindingStore,
    private readonly banner: HTMLElement,
    private readonly reportError: ReportError = defaultReportError,
  ) {
    this.banner.hidden = true;
  }

  async init(): Promise<void> {
    this.settingsObservation = this.settingsStore.observe(this.handleSettings);
    this.bindingObservation = this.bindingStore.observe(this.handleBindings);
    try {
      await Promise.all([this.settingsObservation.ready, this.bindingObservation.ready]);
    } catch (error: unknown) {
      this.reportError(error);
    }
  }

  dispose(): void {
    this.disposed = true;
    this.settingsObservation?.unsubscribe();
    this.bindingObservation?.unsubscribe();
  }

  private readonly handleSettings = (settings: ExtensionSettings): void => {
    this.settings = settings;
    this.refresh();
  };

  private readonly handleBindings = (bindings: QueryBindings): void => {
    this.hasBindings = Object.keys(bindings).length > 0;
    this.refresh();
  };

  private refresh(): void {
    if (this.disposed) {
      return;
    }
    this.banner.hidden = !(this.hasBindings && !isAdoConfigured(this.settings));
  }
}
