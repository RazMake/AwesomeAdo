import type { IQueryBindingStore } from "../common/bindings/IQueryBindingStore";
import type { QueryBinding, QueryBindings } from "../common/bindings/QueryBinding";
import { VIEW_TYPES, type ViewType } from "../common/bindings/ViewType";
import type { IAdoQueryTabsReader } from "../common/browser/IAdoQueryTabsReader";
import type { AdoQueryTab } from "../common/navigation/AdoContext";

/** The Query Bindings tab's elements. Passed in so the controller stays DOM-agnostic and testable. */
export interface QueryBindingsElements {
  /** Wrapper for the query-picker dropdown, shown only in scan (options-menu) mode. */
  pickerField: HTMLElement;
  querySelect: HTMLSelectElement;
  /** Wrapper for the read-only query name, shown only when bound to a single query from its button. */
  nameField: HTMLElement;
  queryName: HTMLElement;
  /** Shown in scan mode when no ADO query tab is open and nothing is bound yet. */
  emptyState: HTMLElement;
  /** Wraps the id/view/properties/actions; hidden until a query is available to bind. */
  form: HTMLElement;
  /** Read-only element displaying the selected query's GUID. */
  queryId: HTMLElement;
  viewSelect: HTMLSelectElement;
  /** Container the controller fills with one input per property of the selected view. */
  properties: HTMLElement;
  saveButton: HTMLButtonElement;
  deleteButton: HTMLButtonElement;
  /** Line used to confirm a save/delete or surface a failure to the user. */
  status: HTMLElement;
}

type ReportError = (error: unknown) => void;

const defaultReportError: ReportError = (error) =>
  console.error("AwesomeADO could not update the query binding", error);

/**
 * Drives the Query Bindings tab, which binds one or more Azure DevOps queries to an enhanced view.
 *
 * Two entry modes share the same form: opened from a query's top-bar button it is locked to that one
 * query (read-only name); opened from the extension's options menu it offers a dropdown of the
 * user's open ADO queries plus any already-bound queries, so several queries can each be given their
 * own view. Selecting a query loads its existing binding; Save persists, Delete unbinds. Save stays
 * disabled until every required property of the chosen view has a value.
 *
 * The view catalog and tabs reader are injected (Dependency Inversion) so tests can exercise the
 * flow with fakes and without a browser.
 */
export class QueryBindingsController {
  private readonly propertyInputs = new Map<string, HTMLInputElement>();
  private readonly queryNames = new Map<string, string | null>();
  private bindings: QueryBindings = {};
  private selectedQueryId: string | null = null;
  private editing: QueryBinding | undefined;

  constructor(
    private readonly store: IQueryBindingStore,
    private readonly tabsReader: IAdoQueryTabsReader,
    private readonly elements: QueryBindingsElements,
    private readonly viewTypes: readonly ViewType[] = VIEW_TYPES,
    private readonly reportError: ReportError = defaultReportError,
  ) {}

  /** Wire the form and enter fixed-query mode (when `queryId` is given) or scan mode (when null). */
  async init(queryId: string | null, queryName: string | null): Promise<void> {
    this.populateViews();
    this.elements.viewSelect.addEventListener("change", this.handleViewChange);
    this.elements.querySelect.addEventListener("change", this.handleQueryChange);
    this.elements.saveButton.addEventListener("click", this.handleSave);
    this.elements.deleteButton.addEventListener("click", this.handleDelete);

    this.bindings = await this.readBindings();

    if (queryId !== null) {
      this.initFixedQuery(queryId, queryName);
    } else {
      await this.initScan();
    }
  }

  dispose(): void {
    this.elements.viewSelect.removeEventListener("change", this.handleViewChange);
    this.elements.querySelect.removeEventListener("change", this.handleQueryChange);
    this.elements.saveButton.removeEventListener("click", this.handleSave);
    this.elements.deleteButton.removeEventListener("click", this.handleDelete);
    this.removePropertyInputs();
  }

  private async readBindings(): Promise<QueryBindings> {
    try {
      return await this.store.read();
    } catch (error: unknown) {
      this.reportError(error);
      return {};
    }
  }

  private initFixedQuery(queryId: string, queryName: string | null): void {
    this.elements.pickerField.hidden = true;
    this.elements.nameField.hidden = false;
    this.elements.emptyState.hidden = true;
    const name = queryName ?? this.bindings[queryId]?.name ?? null;
    this.queryNames.set(queryId, name);
    this.elements.queryName.textContent = name ?? "Unnamed query";
    this.selectQuery(queryId);
  }

  private async initScan(): Promise<void> {
    this.elements.pickerField.hidden = false;
    this.elements.nameField.hidden = true;

    const combined = new Map<string, string | null>();
    for (const tab of await this.readQueryTabs()) {
      combined.set(tab.queryId, tab.queryName);
    }
    // Include already-bound queries whose tab is closed so they can still be edited or deleted.
    for (const [id, binding] of Object.entries(this.bindings)) {
      if (!combined.has(id)) {
        combined.set(id, binding.name ?? null);
      }
    }

    this.queryNames.clear();
    for (const [id, name] of combined) {
      this.queryNames.set(id, name);
    }
    this.renderQueryOptions();

    if (combined.size === 0) {
      this.elements.emptyState.hidden = false;
      this.elements.form.hidden = true;
      this.selectedQueryId = null;
      return;
    }
    this.elements.emptyState.hidden = true;
    const first = [...combined.keys()][0] ?? "";
    this.elements.querySelect.value = first;
    this.selectQuery(first);
  }

  private async readQueryTabs(): Promise<AdoQueryTab[]> {
    try {
      return await this.tabsReader.readQueryTabs();
    } catch (error: unknown) {
      // Best-effort: a failure to enumerate tabs must not break editing already-bound queries.
      this.reportError(error);
      return [];
    }
  }

  private renderQueryOptions(): void {
    this.elements.querySelect.replaceChildren();
    const doc = this.elements.querySelect.ownerDocument;
    for (const [queryId, name] of this.queryNames) {
      const option = doc.createElement("option");
      option.value = queryId;
      option.textContent = name ?? queryId;
      this.elements.querySelect.append(option);
    }
  }

  private selectQuery(queryId: string): void {
    this.selectedQueryId = queryId;
    this.editing = this.bindings[queryId];
    this.elements.form.hidden = false;
    this.elements.queryId.textContent = queryId;
    // Preselect the bound view; a new binding (or one bound to a view this build doesn't know)
    // falls back to the first view in the catalog.
    this.elements.viewSelect.value = this.editing?.view ?? this.viewTypes[0]?.id ?? "";
    if (this.elements.viewSelect.value === "") {
      this.elements.viewSelect.value = this.viewTypes[0]?.id ?? "";
    }
    this.renderProperties();
    this.elements.deleteButton.disabled = this.editing === undefined;
    this.elements.status.textContent = "";
  }

  private populateViews(): void {
    this.elements.viewSelect.replaceChildren();
    const doc = this.elements.viewSelect.ownerDocument;
    for (const view of this.viewTypes) {
      const option = doc.createElement("option");
      option.value = view.id;
      option.textContent = view.label;
      this.elements.viewSelect.append(option);
    }
  }

  private renderProperties(): void {
    this.removePropertyInputs();
    const view = this.selectedView();
    if (view === undefined) {
      this.updateSaveEnabled();
      return;
    }
    // Prefill from the existing binding only when it targets the currently selected view, so
    // switching view type starts the new view's inputs blank.
    const prefill = this.editing?.view === view.id ? this.editing.properties : undefined;
    const doc = this.elements.properties.ownerDocument;
    for (const property of view.properties) {
      const field = doc.createElement("label");
      field.className = "field";
      field.textContent = property.required ? `${property.label} (required)` : property.label;
      const input = doc.createElement("input");
      input.type = "text";
      input.dataset.propertyKey = property.key;
      input.value = prefill?.[property.key] ?? "";
      input.addEventListener("input", this.handleInput);
      field.append(input);
      this.elements.properties.append(field);
      this.propertyInputs.set(property.key, input);
    }
    this.updateSaveEnabled();
  }

  private selectedView(): ViewType | undefined {
    return this.viewTypes.find((view) => view.id === this.elements.viewSelect.value);
  }

  private collectProperties(): Record<string, string> {
    const properties: Record<string, string> = {};
    for (const [key, input] of this.propertyInputs) {
      properties[key] = input.value.trim();
    }
    return properties;
  }

  private hasAllRequiredProperties(): boolean {
    const view = this.selectedView();
    if (view === undefined) {
      return false;
    }
    return view.properties.every(
      (property) =>
        !property.required || (this.propertyInputs.get(property.key)?.value.trim() ?? "") !== "",
    );
  }

  private updateSaveEnabled(): void {
    this.elements.saveButton.disabled =
      this.selectedQueryId === null || !this.hasAllRequiredProperties();
  }

  private removePropertyInputs(): void {
    for (const input of this.propertyInputs.values()) {
      input.removeEventListener("input", this.handleInput);
    }
    this.propertyInputs.clear();
    this.elements.properties.replaceChildren();
  }

  private readonly handleQueryChange = (): void => {
    this.selectQuery(this.elements.querySelect.value);
  };

  private readonly handleViewChange = (): void => {
    this.renderProperties();
  };

  private readonly handleInput = (): void => {
    this.updateSaveEnabled();
  };

  private readonly handleSave = (): void => {
    const view = this.selectedView();
    const queryId = this.selectedQueryId;
    if (queryId === null || view === undefined || !this.hasAllRequiredProperties()) {
      return;
    }
    const binding: QueryBinding = { view: view.id, properties: this.collectProperties() };
    const name = this.queryNames.get(queryId) ?? null;
    if (name !== null) {
      binding.name = name;
    }
    // Preserve an explicit per-query view override; a brand-new binding follows the global default.
    if (this.editing?.active !== undefined) {
      binding.active = this.editing.active;
    }
    this.elements.saveButton.disabled = true;
    void this.store
      .bind(queryId, binding)
      .then(() => {
        this.bindings[queryId] = binding;
        this.editing = binding;
        this.elements.deleteButton.disabled = false;
        this.elements.status.textContent = "Saved.";
      })
      .catch((error: unknown) => {
        this.reportError(error);
        this.updateSaveEnabled();
      });
  };

  private readonly handleDelete = (): void => {
    const queryId = this.selectedQueryId;
    if (queryId === null || this.editing === undefined) {
      return;
    }
    this.elements.deleteButton.disabled = true;
    void this.store
      .unbind(queryId)
      .then(() => {
        delete this.bindings[queryId];
        this.editing = undefined;
        this.elements.status.textContent = "Deleted.";
        this.updateSaveEnabled();
      })
      .catch((error: unknown) => {
        this.reportError(error);
        this.elements.deleteButton.disabled = false;
      });
  };
}
