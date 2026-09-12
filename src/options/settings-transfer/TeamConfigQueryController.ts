import type { StorageObservation } from "../../common/browser/observeStorageKeys";
import type { ILogger } from "../../common/logging/ILogger";
import type { ITeamPublishingSettingsStore } from "../../common/settings-transfer/ITeamPublishingSettingsStore";
import type {
  TeamConfigQueryItem,
  TeamConfigQueryReader,
} from "../../common/settings-transfer/TeamConfigQuery";
import type { ObservableTeamConfigSource } from "../../common/settings-transfer/TeamConfigSourceStore";

import { renderTransferStatus } from "./transferStatus";

export interface TeamConfigQueryElements {
  queryId: HTMLInputElement;
  loadButton: HTMLButtonElement;
  items: HTMLTableSectionElement;
  status: HTMLElement;
}

export class TeamConfigQueryController {
  private disposed = false;
  private reachable = false;
  private loading = false;
  private switching = false;
  private request = 0;
  private selected: number | null = null;
  private candidates: readonly TeamConfigQueryItem[] = [];
  private observation: StorageObservation | undefined;
  private settingsObservation: StorageObservation | undefined;
  private savedQueryId = "";

  constructor(
    private readonly reader: TeamConfigQueryReader,
    private readonly source: ObservableTeamConfigSource,
    private readonly settings: ITeamPublishingSettingsStore,
    private readonly elements: TeamConfigQueryElements,
    private readonly switchTo: (workItemId: number) => Promise<void>,
    private readonly logger: ILogger,
  ) {}

  async init(): Promise<void> {
    this.elements.queryId.addEventListener("change", this.handleLoad);
    this.elements.loadButton.addEventListener("click", this.handleLoad);
    this.elements.items.addEventListener("click", this.handleSelect);
    this.observation = this.source.observe((id) => {
      this.selected = id;
      this.renderItems();
    });
    this.settingsObservation = this.settings.observe(({ configurationQueryId }) => {
      if (configurationQueryId === this.savedQueryId) return;
      this.savedQueryId = configurationQueryId;
      this.elements.queryId.value = configurationQueryId;
      if (!this.switching) void this.load(false);
    });
    await Promise.all([this.observation.ready, this.settingsObservation.ready]);
    if (this.disposed) return;
    this.updateControls();
  }

  setAdoReachable(reachable: boolean): void {
    this.reachable = reachable;
    this.updateControls();
    if (reachable && this.elements.queryId.value !== "") void this.load(false);
  }

  dispose(): void {
    this.disposed = true;
    this.request += 1;
    this.observation?.unsubscribe();
    this.settingsObservation?.unsubscribe();
    this.elements.queryId.removeEventListener("change", this.handleLoad);
    this.elements.loadButton.removeEventListener("click", this.handleLoad);
    this.elements.items.removeEventListener("click", this.handleSelect);
  }

  private readonly handleLoad = (): void => {
    void this.load();
  };
  private readonly handleSelect = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const marker = target.closest<HTMLButtonElement>("button[data-work-item-id]");
    if (marker === null || !this.elements.items.contains(marker)) return;
    void this.select(Number(marker.dataset.workItemId));
  };

  async load(save = true): Promise<void> {
    if (!this.reachable || this.switching || this.disposed) return;
    const request = ++this.request;
    const queryId = this.elements.queryId.value.trim();
    this.candidates = [];
    this.loading = queryId !== "" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(queryId);
    this.renderItems();
    if (queryId !== "" && !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(queryId)) {
      this.status("Enter a valid Azure DevOps query ID.", true);
      return;
    }
    await this.loadQuery(queryId, request, save);
  }

  private async loadQuery(queryId: string, request: number, save: boolean): Promise<void> {
    this.status("Loading configuration items...");
    let previousQueryId = this.savedQueryId;
    try {
      if (save && queryId !== this.savedQueryId) {
        this.savedQueryId = queryId;
        await this.settings.write({ configurationQueryId: queryId });
        previousQueryId = queryId;
      }
      if (queryId === "") {
        this.status("");
        return;
      }
      const items = await this.reader.readQuery(queryId);
      if (this.disposed || request !== this.request) return;
      this.candidates = items;
      this.loading = false;
      this.renderItems();
      this.status(items.length === 0 ? "No configuration items found." : "");
      this.logger.info(`Loaded configuration query ${queryId}: ${items.length} item(s).`);
    } catch (error) {
      this.logger.error("Could not load configuration query", error);
      if (request === this.request) {
        this.savedQueryId = previousQueryId;
        this.loading = false;
        this.renderItems();
        this.status(String(error), true);
      }
    }
  }

  async select(id: number): Promise<void> {
    if (
      this.disposed ||
      this.switching ||
      !this.reachable ||
      !this.candidates.some((item) => item.id === id)
    )
      return;
    if (id === this.selected) return;
    const queryId = this.savedQueryId;
    this.switching = true;
    this.updateControls();
    try {
      this.logger.info(`Switching configuration item from ${this.selected ?? "none"} to ${id}.`);
      await this.switchTo(id);
    } catch (error) {
      this.logger.error("Could not switch configuration item", error);
      this.status(String(error), true);
    } finally {
      this.switching = false;
      if (!this.disposed) {
        this.renderItems();
        if (queryId !== this.savedQueryId) void this.load(false);
      }
    }
  }

  private renderItems(): void {
    const doc = this.elements.items.ownerDocument;
    this.elements.items.closest("table")?.setAttribute("aria-busy", String(this.loading));
    if (this.loading) {
      this.elements.items.replaceChildren(this.renderLoadingRow(doc));
      this.updateControls();
      return;
    }
    const candidates = [...this.candidates];
    if (this.selected !== null && !candidates.some((item) => item.id === this.selected)) {
      candidates.push({
        id: this.selected,
        title: "Connected item",
        changedBy: "—",
        changedDate: "",
      });
    }
    candidates.sort((left, right) => modifiedAt(right) - modifiedAt(left));
    this.elements.items.replaceChildren(
      ...candidates.map((item) => this.renderRow(doc, item, item.id === this.selected)),
    );
    this.updateControls();
  }

  private renderLoadingRow(doc: Document): HTMLTableRowElement {
    const row = doc.createElement("tr");
    const cell = doc.createElement("td");
    cell.colSpan = 5;
    cell.className = "team-config-items__loading";
    cell.setAttribute("aria-live", "polite");
    const spinner = doc.createElement("span");
    spinner.className = "team-config-items__loading-spinner";
    spinner.setAttribute("aria-hidden", "true");
    const label = doc.createElement("strong");
    label.textContent = "Loading configurations…";
    cell.append(spinner, label);
    row.append(cell);
    return row;
  }

  private renderRow(
    doc: Document,
    item: TeamConfigQueryItem,
    active: boolean,
  ): HTMLTableRowElement {
    const row = doc.createElement("tr");
    row.dataset.workItemId = String(item.id);
    row.classList.toggle("team-config-items__row--active", active);

    const activeCell = doc.createElement("td");
    if (active) {
      const marker = doc.createElement("strong");
      marker.className = "team-config-items__active";
      marker.textContent = "Active";
      activeCell.append(marker);
    } else {
      const marker = doc.createElement("button");
      marker.type = "button";
      marker.className = "team-config-items__inactive";
      marker.dataset.workItemId = String(item.id);
      marker.textContent = "Not active";
      activeCell.append(marker);
    }

    const idCell = doc.createElement("td");
    idCell.textContent = String(item.id);
    const nameCell = doc.createElement("td");
    nameCell.className = "team-config-items__name";
    nameCell.textContent = item.title;
    nameCell.title = item.title;

    const modifiedCell = doc.createElement("td");
    modifiedCell.className = "team-config-items__modified";
    const date = new Date(item.changedDate);
    if (Number.isNaN(date.getTime())) {
      modifiedCell.textContent = "Unknown date";
    } else {
      const datePart = doc.createElement("span");
      datePart.textContent = date.toLocaleDateString();
      const timePart = doc.createElement("span");
      timePart.className = "team-config-items__time";
      timePart.textContent = date.toLocaleTimeString();
      modifiedCell.append(datePart, timePart);
    }

    const changedByCell = doc.createElement("td");
    changedByCell.className = "team-config-items__changed-by";
    changedByCell.textContent = item.changedBy;
    changedByCell.title = item.changedBy;
    row.append(activeCell, idCell, nameCell, modifiedCell, changedByCell);
    return row;
  }

  private updateControls(): void {
    this.elements.loadButton.disabled = !this.reachable || this.switching;
    this.elements.queryId.disabled = this.switching;
    const disabled = !this.reachable || this.switching || this.candidates.length === 0;
    this.elements.items.closest("table")?.setAttribute("aria-disabled", String(disabled));
    for (const marker of this.elements.items.querySelectorAll<HTMLButtonElement>("button")) {
      marker.disabled = disabled;
    }
  }

  private status(message: string, failed = false): void {
    if (!this.disposed) renderTransferStatus(this.elements.status, message, failed);
  }
}

function modifiedAt(item: TeamConfigQueryItem): number {
  const timestamp = Date.parse(item.changedDate);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}
