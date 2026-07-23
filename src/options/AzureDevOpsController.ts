import type { AdoTeam } from "../common/ado/AdoMetadata";
import type { AdoMetadataContext, IAdoMetadataReader } from "../common/browser/IAdoMetadataReader";
import {
  DEFAULT_SETTINGS,
  defaultAreaPathLabel,
  normalizeFutureSprintsCount,
  type AreaPath,
  type ExtensionSettings,
  type TeamRef,
} from "../common/settings/ExtensionSettings";
import type { ISettingsStore } from "../common/settings/ISettingsStore";

import { AutocompleteInput } from "./AutocompleteInput";

/** The Azure DevOps tab's elements. Passed in so the controller stays DOM-agnostic and testable. */
export interface AzureDevOpsElements {
  /** Read-only detected organization. */
  organization: HTMLElement;
  /** Read-only detected project. */
  project: HTMLElement;
  /** Searchable input for the current team; the controller wraps it in a suggestion dropdown. */
  teamInput: HTMLInputElement;
  /** Whole-number input (1..12) for how many future sprints the picker offers. */
  futureSprintsInput: HTMLInputElement;
  /** Container the controller fills with one editable row per pinned area path. */
  areaPathsList: HTMLElement;
  /** Notice shown only while no area-path rows exist. */
  areaPathsEmpty: HTMLElement;
  /** Button that appends a new, empty area-path row. */
  areaPathAddButton: HTMLButtonElement;
}

type ReportError = (error: unknown) => void;

const defaultReportError: ReportError = (error) =>
  console.error("AwesomeADO could not save Azure DevOps settings", error);

const ROLE_ATTRIBUTE = "data-role";
const PATH_ROLE = "path";
const LABEL_ROLE = "label";
const DELETE_ROLE = "delete";
const ROW_SELECTOR = ".area-path-row";

/**
 * Drives the Azure DevOps tab: shows the detected organization/project, and binds the current-team
 * picker, the future-sprints count, and the pinned area-path list to the synced settings store.
 *
 * The store is read once to seed the controls and written on each change (per-key, so unrelated
 * settings are untouched). The detected org/project and the datalist options come from the injected
 * metadata reader, which fetches them through the open ADO tab's content script; both the store and
 * the reader are injected (Dependency Inversion) so the flow is fully testable without a browser.
 */
export class AzureDevOpsController {
  private disposed = false;
  private teams: readonly AdoTeam[] = [];
  private confirmedTeam: TeamRef | null = null;
  private confirmedSprints = DEFAULT_SETTINGS.futureSprintsCount;
  private areaPathSuggestions: readonly string[] = [];
  private readonly teamCombobox: AutocompleteInput;
  // Each area-path row's path field gets its own suggestion dropdown; keyed by the input so a
  // removed row's combobox drops out with the input (no manual bookkeeping) and metadata updates
  // reach every still-present row.
  private readonly pathComboboxes = new WeakMap<HTMLInputElement, AutocompleteInput>();

  constructor(
    private readonly store: ISettingsStore,
    private readonly metadataReader: IAdoMetadataReader,
    private readonly elements: AzureDevOpsElements,
    private readonly reportError: ReportError = defaultReportError,
  ) {
    elements.teamInput.disabled = true;
    elements.futureSprintsInput.disabled = true;
    elements.areaPathAddButton.disabled = true;
    this.teamCombobox = new AutocompleteInput(elements.teamInput);
  }

  async init(): Promise<void> {
    this.wireEvents();
    await Promise.all([this.loadSettings(), this.loadMetadata()]);
  }

  dispose(): void {
    this.disposed = true;
    this.teamCombobox.dispose();
    this.disposePathComboboxes();
    this.elements.teamInput.removeEventListener("change", this.handleTeamChange);
    this.elements.futureSprintsInput.removeEventListener("change", this.handleSprintsChange);
    this.elements.areaPathAddButton.removeEventListener("click", this.handleAddAreaPath);
    this.elements.areaPathsList.removeEventListener("input", this.handleAreaInput);
    this.elements.areaPathsList.removeEventListener("change", this.handleAreaChange);
    this.elements.areaPathsList.removeEventListener("click", this.handleAreaClick);
  }

  private wireEvents(): void {
    this.elements.teamInput.addEventListener("change", this.handleTeamChange);
    this.elements.futureSprintsInput.addEventListener("change", this.handleSprintsChange);
    this.elements.areaPathAddButton.addEventListener("click", this.handleAddAreaPath);
    // Delegated on the container so dynamically added rows need no per-row listener bookkeeping.
    this.elements.areaPathsList.addEventListener("input", this.handleAreaInput);
    this.elements.areaPathsList.addEventListener("change", this.handleAreaChange);
    this.elements.areaPathsList.addEventListener("click", this.handleAreaClick);
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
    this.renderTeam(settings.currentTeam);
    this.renderFutureSprints(settings.futureSprintsCount);
    this.renderAreaPaths(settings.areaPaths);
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
    this.setConfigField(this.elements.organization, metadata?.organization ?? null);
    this.setConfigField(this.elements.project, metadata?.project ?? null);
    this.teams = metadata?.teams ?? [];
    this.teamCombobox.setOptions(this.teams.map((team) => team.name));
    this.applyAreaPathSuggestions(metadata?.areaPaths ?? []);
  }

  private applyAreaPathSuggestions(suggestions: readonly string[]): void {
    this.areaPathSuggestions = suggestions;
    // Rows seeded from stored settings may already exist before metadata arrives, so push the
    // suggestions into every current row's dropdown too.
    for (const pathInput of this.pathInputs()) {
      this.pathComboboxes.get(pathInput)?.setOptions(suggestions);
    }
  }

  private enableControls(): void {
    this.elements.teamInput.disabled = false;
    this.elements.futureSprintsInput.disabled = false;
    this.elements.areaPathAddButton.disabled = false;
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

  // ── Area paths ────────────────────────────────────────────────────────────

  private renderAreaPaths(entries: readonly AreaPath[]): void {
    this.disposePathComboboxes();
    this.elements.areaPathsList.replaceChildren();
    for (const entry of entries) {
      const row = this.createAreaPathRow(entry);
      // A stored label that differs from the path's tail was customized by the user; mark it so a
      // later path edit does not clobber it.
      if (entry.label !== defaultAreaPathLabel(entry.path)) {
        row
          .querySelector<HTMLInputElement>(`[${ROLE_ATTRIBUTE}="${LABEL_ROLE}"]`)
          ?.setAttribute("data-edited", "true");
      }
      this.elements.areaPathsList.append(row);
    }
    this.updateAreaPathsEmpty();
  }

  private createAreaPathRow(entry: AreaPath): HTMLElement {
    const doc = this.elements.areaPathsList.ownerDocument;
    const row = doc.createElement("div");
    row.className = "area-path-row";
    const pathInput = this.createAreaInput(doc, PATH_ROLE, "Area path", entry.path);
    const combobox = new AutocompleteInput(pathInput);
    combobox.setOptions(this.areaPathSuggestions);
    this.pathComboboxes.set(pathInput, combobox);
    row.append(
      combobox.root,
      this.createAreaInput(doc, LABEL_ROLE, "Area path label", entry.label),
      this.createDeleteButton(doc),
    );
    return row;
  }

  private createAreaInput(
    doc: Document,
    role: string,
    ariaLabel: string,
    value: string,
  ): HTMLInputElement {
    const input = doc.createElement("input");
    input.type = "text";
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-label", ariaLabel);
    input.setAttribute(ROLE_ATTRIBUTE, role);
    input.placeholder = ariaLabel;
    input.value = value;
    return input;
  }

  private createDeleteButton(doc: Document): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "button button--danger area-path-row__delete";
    button.setAttribute(ROLE_ATTRIBUTE, DELETE_ROLE);
    button.setAttribute("aria-label", "Remove area path");
    button.textContent = "Remove";
    return button;
  }

  private readonly handleAddAreaPath = (): void => {
    const row = this.createAreaPathRow({ path: "", label: "" });
    this.elements.areaPathsList.append(row);
    this.updateAreaPathsEmpty();
    // A brand-new row has no path to store yet; persistence happens once the user commits a path.
    row.querySelector<HTMLInputElement>(`[${ROLE_ATTRIBUTE}="${PATH_ROLE}"]`)?.focus();
  };

  private readonly handleAreaInput = (event: Event): void => {
    const target = event.target as HTMLElement;
    const role = target.getAttribute(ROLE_ATTRIBUTE);
    if (role === LABEL_ROLE) {
      // Any keystroke in the label marks it user-owned so path edits stop overwriting it.
      target.setAttribute("data-edited", "true");
    } else if (role === PATH_ROLE) {
      this.autoFillLabel(target as HTMLInputElement);
    }
  };

  private autoFillLabel(pathInput: HTMLInputElement): void {
    const labelInput = pathInput
      .closest(ROW_SELECTOR)
      ?.querySelector<HTMLInputElement>(`[${ROLE_ATTRIBUTE}="${LABEL_ROLE}"]`);
    if (!labelInput || labelInput.getAttribute("data-edited") === "true") {
      return;
    }
    labelInput.value = defaultAreaPathLabel(pathInput.value.trim());
  }

  private readonly handleAreaChange = (): void => {
    this.persistAreaPaths();
  };

  private readonly handleAreaClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.getAttribute(ROLE_ATTRIBUTE) !== DELETE_ROLE) {
      return;
    }
    const row = target.closest<HTMLElement>(ROW_SELECTOR);
    if (row !== null) {
      this.disposeRowCombobox(row);
      row.remove();
    }
    this.updateAreaPathsEmpty();
    this.persistAreaPaths();
  };

  private persistAreaPaths(): void {
    const areaPaths = this.collectAreaPaths();
    void this.store.write({ areaPaths }).catch((error: unknown) => this.reportError(error));
  }

  private collectAreaPaths(): AreaPath[] {
    const rows = this.elements.areaPathsList.querySelectorAll<HTMLElement>(ROW_SELECTOR);
    const result: AreaPath[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const path = this.readRowValue(row, PATH_ROLE);
      if (path === "" || seen.has(path)) {
        continue;
      }
      seen.add(path);
      const label = this.readRowValue(row, LABEL_ROLE);
      result.push({ path, label: label !== "" ? label : defaultAreaPathLabel(path) });
    }
    return result;
  }

  private readRowValue(row: HTMLElement, role: string): string {
    return row.querySelector<HTMLInputElement>(`[${ROLE_ATTRIBUTE}="${role}"]`)?.value.trim() ?? "";
  }

  private updateAreaPathsEmpty(): void {
    this.elements.areaPathsEmpty.hidden =
      this.elements.areaPathsList.querySelector(ROW_SELECTOR) !== null;
  }

  // ── Shared helpers ────────────────────────────────────────────────────────

  /** Every current row's path input, so metadata updates and disposal can reach each combobox. */
  private pathInputs(): HTMLInputElement[] {
    return [
      ...this.elements.areaPathsList.querySelectorAll<HTMLInputElement>(
        `[${ROLE_ATTRIBUTE}="${PATH_ROLE}"]`,
      ),
    ];
  }

  private disposePathComboboxes(): void {
    for (const pathInput of this.pathInputs()) {
      this.pathComboboxes.get(pathInput)?.dispose();
    }
  }

  private disposeRowCombobox(row: HTMLElement): void {
    const pathInput = row.querySelector<HTMLInputElement>(`[${ROLE_ATTRIBUTE}="${PATH_ROLE}"]`);
    if (pathInput !== null) {
      this.pathComboboxes.get(pathInput)?.dispose();
    }
  }

  private setConfigField(element: HTMLElement, value: string | null): void {
    const hasValue = value !== null && value.length > 0;
    element.textContent = hasValue ? value : "No active query tab";
    element.dataset.empty = String(!hasValue);
  }
}
