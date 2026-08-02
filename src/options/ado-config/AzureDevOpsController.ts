import type { AdoTeam } from "../../common/ado/AdoMetadata";
import type {
  AdoMetadataContext,
  IAdoMetadataReader,
} from "../../common/browser/IAdoMetadataReader";
import {
  DEFAULT_SETTINGS,
  normalizeFutureSprintsCount,
  normalizePastSprintsCount,
  type ExtensionSettings,
  type TeamRef,
} from "../../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../../common/settings/ISettingsStore";

import { AutocompleteInput } from "./AutocompleteInput";
import { DetectedValueField, type DetectedValueElements } from "./DetectedValueField";
import { MarkerTagsController, type MarkerTagsElements } from "./MarkerTagsController";
import { WorkItemTypesController, type WorkItemTypesElements } from "./WorkItemTypesController";

/** The Azure DevOps tab's elements. Passed in so the controller stays DOM-agnostic and testable. */
export interface AzureDevOpsElements {
  /** Editable organization, reconciled against the open query tab. */
  organization: DetectedValueElements;
  /** Editable project, reconciled against the open query tab. */
  project: DetectedValueElements;
  /** Searchable input for the current team; the controller wraps it in a suggestion dropdown. */
  teamInput: HTMLInputElement;
  /** Whole-number input (1..12) for how many future sprints the picker offers. */
  futureSprintsInput: HTMLInputElement;
  /** Whole-number input (0..6) for how many past sprints the picker offers. */
  pastSprintsInput: HTMLInputElement;
  /** The nested work-item-types section, driven by a delegated sub-controller. */
  workItemTypes: WorkItemTypesElements;
  /** The nested marker-tags section, driven by a delegated sub-controller. */
  markerTags: MarkerTagsElements;
}

type ReportError = (error: unknown) => void;

const defaultReportError: ReportError = (error) =>
  console.error("AwesomeADO could not save Azure DevOps settings", error);

/** The empty metadata used when no ADO tab is open, so `renderMetadata` never optional-chains. */
const EMPTY_METADATA_CONTEXT: AdoMetadataContext = {
  organization: "",
  project: null,
  teams: [],
  areaPaths: [],
  workItemTypes: [],
};

/**
 * Drives the Azure DevOps tab: binds the organization/project scope, the current-team picker and the
 * future/past sprint counts to the synced settings store.
 *
 * The store is read once to seed the controls and written on each change (per-key, so unrelated
 * settings are untouched). The org/project proposals and the datalist options come from the injected
 * metadata reader, which fetches them through the open ADO tab's content script; both the store and
 * the reader are injected (Dependency Inversion) so the flow is fully testable without a browser.
 */
export class AzureDevOpsController {
  private disposed = false;
  private teams: readonly AdoTeam[] = [];
  private confirmedTeam: TeamRef | null = null;
  private confirmedSprints = DEFAULT_SETTINGS.futureSprintsCount;
  private confirmedPastSprints = DEFAULT_SETTINGS.pastSprintsCount;
  // Two independent gates gone through by the ADO-backed pickers: the stored values must have
  // loaded, AND an ADO tab must be reachable to name a team or list the org's work item types.
  // Settings and metadata are read concurrently, so each records its own gate and re-applies both.
  private settingsLoaded = false;
  private adoReachable = false;
  private readonly teamCombobox: AutocompleteInput;
  // The scope boxes are the one pair of settings an open ADO tab can also answer for, so they share
  // one field that owns the stored-value-versus-detected-value reconciliation.
  private readonly organization: DetectedValueField;
  private readonly project: DetectedValueField;
  // The work-item-types section is a cohesive sub-feature, so it lives in its own controller that
  // shares this controller's single metadata read and settings load (fed in via render/setAvailableTypes).
  private readonly workItemTypes: WorkItemTypesController;
  // The marker-tags section is likewise its own writer of one settings slice, so it lives in its own
  // controller fed by this controller's single settings load (via render).
  private readonly markerTags: MarkerTagsController;

  constructor(
    private readonly store: ISettingsStore,
    private readonly metadataReader: IAdoMetadataReader,
    private readonly elements: AzureDevOpsElements,
    private readonly reportError: ReportError = defaultReportError,
  ) {
    elements.teamInput.disabled = true;
    elements.futureSprintsInput.disabled = true;
    elements.pastSprintsInput.disabled = true;
    this.teamCombobox = new AutocompleteInput(elements.teamInput);
    this.organization = new DetectedValueField(
      elements.organization,
      "organization",
      (value) => store.write({ organization: value }),
      this.reportError,
    );
    this.project = new DetectedValueField(
      elements.project,
      "project",
      (value) => store.write({ project: value }),
      this.reportError,
    );
    this.workItemTypes = new WorkItemTypesController(
      store,
      elements.workItemTypes,
      this.reportError,
    );
    this.markerTags = new MarkerTagsController(store, elements.markerTags, this.reportError);
  }

  async init(): Promise<void> {
    this.wireEvents();
    await Promise.all([this.loadSettings(), this.loadMetadata()]);
  }

  /**
   * Re-read the stored settings into this tab's controls, without re-wiring anything.
   *
   * This tab loads its values once and then treats its own DOM as the working copy, so an outside
   * replacement of the stored configuration (a configuration file import) would otherwise leave it
   * showing — and, on the next edit, re-saving — the configuration the file just replaced. The ADO
   * metadata is deliberately not re-read: it describes the tab the user has open, which an import
   * cannot change; the scope fields re-compare the imported values against it on their own.
   */
  async reload(): Promise<void> {
    await this.loadSettings();
  }

  dispose(): void {
    this.disposed = true;
    this.teamCombobox.dispose();
    this.organization.dispose();
    this.project.dispose();
    this.workItemTypes.dispose();
    this.markerTags.dispose();
    this.elements.teamInput.removeEventListener("change", this.handleTeamChange);
    this.elements.futureSprintsInput.removeEventListener("change", this.handleSprintsChange);
    this.elements.pastSprintsInput.removeEventListener("change", this.handlePastSprintsChange);
  }

  private wireEvents(): void {
    this.elements.teamInput.addEventListener("change", this.handleTeamChange);
    this.elements.futureSprintsInput.addEventListener("change", this.handleSprintsChange);
    this.elements.pastSprintsInput.addEventListener("change", this.handlePastSprintsChange);
    this.organization.init();
    this.project.init();
    this.workItemTypes.init();
    this.markerTags.init();
  }

  private async loadSettings(): Promise<void> {
    let settings: ExtensionSettings = DEFAULT_SETTINGS;
    try {
      settings = await this.store.read();
    } catch (error: unknown) {
      this.reportError(error);
    }
    if (this.disposed) {
      return;
    }
    this.organization.render(settings.organization);
    this.project.render(settings.project);
    this.renderTeam(settings.currentTeam);
    this.renderFutureSprints(settings.futureSprintsCount);
    this.renderPastSprints(settings.pastSprintsCount);
    this.workItemTypes.render(settings.workItemTypes, settings.boardColumns);
    this.markerTags.render(settings.markerTags);
    this.enableControls();
  }

  private async loadMetadata(): Promise<void> {
    const metadata = await this.readMetadata();
    if (this.disposed) {
      return;
    }
    this.renderMetadata(metadata);
  }

  private async readMetadata(): Promise<AdoMetadataContext | null> {
    try {
      return await this.metadataReader.read();
    } catch (error: unknown) {
      // Metadata is best-effort; a failure must not break the still-usable settings controls.
      this.reportError(error);
      return null;
    }
  }

  private renderMetadata(metadata: AdoMetadataContext | null): void {
    // Normalize once so each field read below is a plain property access, not another optional-chain
    // + fallback. An absent tab yields empty strings/lists, which the scope fields read as "nothing
    // detected" — so they simply offer no proposal — leaving the stored values in place.
    const context = metadata ?? EMPTY_METADATA_CONTEXT;
    this.adoReachable = metadata !== null;
    this.organization.setDetected(context.organization);
    this.project.setDetected(context.project ?? "");
    this.teams = context.teams;
    this.teamCombobox.setOptions(this.teams.map((team) => team.name));
    this.workItemTypes.setAvailableTypes(context.workItemTypes);
    this.applyEnabledState();
  }

  private enableControls(): void {
    this.settingsLoaded = true;
    this.organization.enable();
    this.project.enable();
    this.elements.futureSprintsInput.disabled = false;
    this.elements.pastSprintsInput.disabled = false;
    this.applyEnabledState();
  }

  /**
   * Leave the two ADO-backed controls off until ADO can actually answer them: without a reachable
   * tab the team picker offers no teams and a new row could name no type, so an enabled control
   * would read as a broken one rather than an unavailable one. Everything else on this tab edits
   * stored values and stays usable.
   */
  private applyEnabledState(): void {
    const usable = this.settingsLoaded && this.adoReachable;
    this.elements.teamInput.disabled = !usable;
    this.workItemTypes.setEnabled(usable);
  }

  // ── Current team ──────────────────────────────────────────────────────────

  private renderTeam(team: TeamRef | null): void {
    this.confirmedTeam = team;
    this.elements.teamInput.value = team?.name ?? "";
  }

  private readonly handleTeamChange = (): void => {
    const typed = this.elements.teamInput.value.trim();
    if (typed === "") {
      this.persistTeam(null);
      return;
    }
    const match = this.teams.find((team) => team.name === typed);
    if (match) {
      this.persistTeam({ id: match.id, name: match.name });
    } else {
      // Free text that is not a known team: restore the last saved selection rather than store junk.
      this.elements.teamInput.value = this.confirmedTeam?.name ?? "";
    }
  };

  private persistTeam(team: TeamRef | null): void {
    const previous = this.confirmedTeam;
    this.confirmedTeam = team;
    void this.store.write({ currentTeam: team }).catch((error: unknown) => {
      this.confirmedTeam = previous;
      this.elements.teamInput.value = previous?.name ?? "";
      this.reportError(error);
    });
  }

  // ── Future sprints ────────────────────────────────────────────────────────

  private renderFutureSprints(count: number): void {
    this.confirmedSprints = count;
    this.elements.futureSprintsInput.value = String(count);
  }

  private readonly handleSprintsChange = (): void => {
    const clamped = normalizeFutureSprintsCount(this.elements.futureSprintsInput.valueAsNumber);
    // Reflect the clamp/normalization back so the field never shows an out-of-range value.
    this.elements.futureSprintsInput.value = String(clamped);
    this.persistSprints(clamped);
  };

  private persistSprints(count: number): void {
    const previous = this.confirmedSprints;
    this.confirmedSprints = count;
    void this.store.write({ futureSprintsCount: count }).catch((error: unknown) => {
      this.confirmedSprints = previous;
      this.elements.futureSprintsInput.value = String(previous);
      this.reportError(error);
    });
  }

  // ── Past sprints ──────────────────────────────────────────────────────────

  private renderPastSprints(count: number): void {
    this.confirmedPastSprints = count;
    this.elements.pastSprintsInput.value = String(count);
  }

  private readonly handlePastSprintsChange = (): void => {
    const clamped = normalizePastSprintsCount(this.elements.pastSprintsInput.valueAsNumber);
    // Reflect the clamp/normalization back so the field never shows an out-of-range value.
    this.elements.pastSprintsInput.value = String(clamped);
    this.persistPastSprints(clamped);
  };

  private persistPastSprints(count: number): void {
    const previous = this.confirmedPastSprints;
    this.confirmedPastSprints = count;
    void this.store.write({ pastSprintsCount: count }).catch((error: unknown) => {
      this.confirmedPastSprints = previous;
      this.elements.pastSprintsInput.value = String(previous);
      this.reportError(error);
    });
  }
}
