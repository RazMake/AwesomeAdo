import type { IQueryBindingStore } from "../../common/bindings/IQueryBindingStore";
import type { QueryBinding, QueryBindings } from "../../common/bindings/QueryBinding";
import { VIEW_TYPES, type ViewType } from "../../common/bindings/ViewType";

/** The Query Bindings tab's elements. Passed in so the controller stays DOM-agnostic and testable. */
export interface QueryBindingsElements {
  /** Wrapper for the bound-query dropdown, shown only in options (edit) mode. */
  pickerField: HTMLElement;
  querySelect: HTMLSelectElement;
  /** Wrapper for the read-only query name, shown only when bound to a single query from its button. */
  nameField: HTMLElement;
  queryName: HTMLElement;
  /** Shown in options (edit) mode when no query has a binding yet. */
  emptyState: HTMLElement;
  /** Wraps the id/name/view/properties/actions; hidden until a query is selected. */
  form: HTMLElement;
  /** Read-only element displaying the selected query's GUID. */
  queryId: HTMLElement;
  viewSelect: HTMLSelectElement;
  /** Container the controller fills with one input per property of the selected view. */
  properties: HTMLElement;
  saveButton: HTMLButtonElement;
  deleteButton: HTMLButtonElement;
  /** The "Query View Configuration" section (second card), shown only while editing a saved binding. */
  viewConfigCard: HTMLElement;
  /** Destination for the view-configuration group while editing a saved binding (second card). */
  viewConfigSlot: HTMLElement;
  /** Destination for the view-configuration group while binding a new query (Query bindings card). */
  primaryViewSlot: HTMLElement;
  /** The movable group holding the view picker, its properties, and Save. */
  viewGroup: HTMLElement;
  /** Wraps Delete; hidden while binding a new query since there is nothing to remove yet. */
  deleteActions: HTMLElement;
  /** Line used to confirm a save/delete or surface a failure to the user. */
  status: HTMLElement;
}

type ReportError = (error: unknown) => void;

const defaultReportError: ReportError = (error) =>
  console.error("AwesomeADO could not update the query binding", error);

/**
 * Resolves the query id of the ADO tab the user is currently on, or null when none can be
 * determined. Injected (Dependency Inversion) so the controller can preselect that query in options
 * mode without ever touching chrome.tabs, and so tests can drive the behavior with a fake.
 */
export type CurrentQueryIdResolver = () => Promise<string | null>;

/**
 * Drives the Query Bindings tab, which binds Azure DevOps queries to an enhanced view.
 *
 * Two entry paths share one form. Opened from a query's top-bar button (fixed-query mode) it starts
 * on that one query with its id and name read-only; while the query is still unbound the bound-query
 * dropdown is hidden so the user just configures a view and Saves. Opened from the options menu
 * (options mode) — or after that first Save — it shows the bound-query dropdown, preselected to the
 * query the user is currently on (from the ADO tab they came from) so its binding can be edited or
 * removed. Save persists; Delete unbinds. Save stays disabled until every required property of the
 * chosen view has a value.
 *
 * The view catalog and the current-query resolver are injected (Dependency Inversion) so tests can
 * exercise the flow with fakes and without a browser.
 */
export class QueryBindingsController {
  private readonly propertyInputs = new Map<string, HTMLInputElement>();
  private readonly queryNames = new Map<string, string | null>();
  private bindings: QueryBindings = {};
  private selectedQueryId: string | null = null;
  private editing: QueryBinding | undefined;

  constructor(
    private readonly store: IQueryBindingStore,
    private readonly elements: QueryBindingsElements,
    private readonly viewTypes: readonly ViewType[] = VIEW_TYPES,
    private readonly reportError: ReportError = defaultReportError,
    private readonly resolveCurrentQueryId: CurrentQueryIdResolver = async () => null,
  ) {}

  /**
   * Wire the form and enter fixed-query mode (when `queryId` is given — the user started a bind from a
   * query's button) or options mode (when null — the user opened the menu to edit existing bindings).
   */
  async init(queryId: string | null, queryName: string | null): Promise<void> {
    this.populateViews();
    this.elements.viewSelect.addEventListener("change", this.handleViewChange);
    this.elements.querySelect.addEventListener("change", this.handleQueryChange);
    this.elements.saveButton.addEventListener("click", this.handleSave);
    this.elements.deleteButton.addEventListener("click", this.handleDelete);

    this.bindings = await this.readBindings();
    this.syncQueryNames();

    if (queryId !== null) {
      this.initFixedQuery(queryId, queryName);
    } else {
      await this.initEditExisting();
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

  /** Rebuild the id → name lookup from the current bindings so the picker and read-only name agree. */
  private syncQueryNames(): void {
    this.queryNames.clear();
    for (const [id, binding] of Object.entries(this.bindings)) {
      this.queryNames.set(id, binding.name ?? null);
    }
  }

  private initFixedQuery(queryId: string, queryName: string | null): void {
    this.elements.emptyState.hidden = true;
    // Prefer the name the button scraped from the page; fall back to a stored name when the query
    // turns out to already be bound (so re-opening the form still shows a name).
    const name = queryName ?? this.bindings[queryId]?.name ?? null;
    this.queryNames.set(queryId, name);
    this.selectQuery(queryId);
  }

  /**
   * Options mode: manage the queries that already have a binding. Preselect the query the user is
   * currently on (from the ADO tab they came from) when it is bound; otherwise fall back to the first
   * binding so the form is never empty. New bindings are created from a query's own AwesomeADO button
   * (fixed-query mode), so open but unbound queries are intentionally not offered here.
   */
  private async initEditExisting(): Promise<void> {
    if (this.queryNames.size === 0) {
      // With nothing bound, the dropdown would be an empty control that implies the user could bind
      // here — hide it so only the guidance to bind from a query page remains.
      this.elements.pickerField.hidden = true;
      this.elements.nameField.hidden = true;
      this.elements.emptyState.hidden = false;
      this.elements.form.hidden = true;
      this.elements.viewConfigCard.hidden = true;
      this.selectedQueryId = null;
      return;
    }
    this.elements.emptyState.hidden = true;
    const current = await this.currentBoundQueryId();
    const [firstBound] = [...this.queryNames.keys()];
    this.selectQuery(current ?? firstBound ?? "");
  }

  /** The current ADO tab's query id, but only when it is one of the bound queries; else null. */
  private async currentBoundQueryId(): Promise<string | null> {
    try {
      const current = await this.resolveCurrentQueryId();
      return current !== null && this.bindings[current] !== undefined ? current : null;
    } catch (error: unknown) {
      // Preselection is a convenience; a tab-read failure must not block editing existing bindings.
      this.reportError(error);
      return null;
    }
  }

  private renderQueryOptions(): void {
    this.elements.querySelect.replaceChildren();
    const doc = this.elements.querySelect.ownerDocument;
    for (const queryId of Object.keys(this.bindings)) {
      const option = doc.createElement("option");
      option.value = queryId;
      option.textContent = this.queryNames.get(queryId) ?? queryId;
      this.elements.querySelect.append(option);
    }
  }

  private selectQuery(queryId: string): void {
    this.selectedQueryId = queryId;
    this.editing = this.bindings[queryId];
    this.elements.emptyState.hidden = true;
    this.elements.form.hidden = false;
    this.elements.nameField.hidden = false;
    this.elements.queryName.textContent = this.queryNames.get(queryId) ?? "Unnamed query";
    this.elements.queryId.textContent = queryId;
    this.syncPicker();
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

  /**
   * Show the bound-query dropdown only once the selected query is actually bound: a brand-new binding
   * (from a query's button, before its first Save) is configured on its own, and the dropdown appears
   * after Save so the user can then switch between all bound queries.
   */
  private syncPicker(): void {
    const bound = this.editing !== undefined;
    this.elements.pickerField.hidden = !bound;
    if (bound) {
      this.renderQueryOptions();
      this.elements.querySelect.value = this.selectedQueryId ?? "";
    }
    this.syncSections(bound);
  }

  /**
   * Relocate the enhanced-view configuration to match the current mode. While binding a new query the
   * view picker, its properties, and Save live in the Query bindings card so everything is set in one
   * place, and Delete is hidden because there is nothing to remove yet. Once the query is bound they
   * move to their own Query View Configuration card and Delete stays with the binding it removes.
   */
  private syncSections(bound: boolean): void {
    const slot = bound ? this.elements.viewConfigSlot : this.elements.primaryViewSlot;
    slot.append(this.elements.viewGroup);
    this.elements.viewConfigCard.hidden = !bound;
    this.elements.deleteActions.hidden = !bound;
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
        // The query is now bound, so surface the dropdown — revealing it the first time a query is
        // bound from its button, and keeping it in step with the freshly saved name otherwise.
        this.syncPicker();
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
        this.queryNames.delete(queryId);
        this.editing = undefined;
        const [firstRemaining] = Object.keys(this.bindings);
        if (firstRemaining !== undefined) {
          // Other bindings remain: move to the first so the dropdown keeps a valid selection.
          this.selectQuery(firstRemaining);
        } else {
          // Nothing bound is left; collapse the dropdown and leave the query as a re-bindable form.
          this.syncPicker();
          this.updateSaveEnabled();
        }
        this.elements.status.textContent = "Deleted.";
      })
      .catch((error: unknown) => {
        this.reportError(error);
        this.elements.deleteButton.disabled = false;
      });
  };
}
