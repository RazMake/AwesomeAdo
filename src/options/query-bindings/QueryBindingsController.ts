import type { IQueryBindingStore } from "../../common/bindings/IQueryBindingStore";
import type { QueryBinding, QueryBindings } from "../../common/bindings/QueryBinding";
import {
  resolveViewTypePropertyValue,
  viewTypePropertyKind,
  type ViewType,
  type ViewTypeProperty,
} from "../../common/view-common/ViewType";
import { VIEW_TYPES } from "../../content/views/viewCatalog";

/** The Query Bindings tab's elements. Passed in so the controller stays DOM-agnostic and testable. */
export interface QueryBindingsElements {
  /** Shown when there is nothing to add (no query in context) and nothing bound to edit. */
  emptyState: HTMLElement;

  /** "Add enhanced query" card — the only section shown while binding a brand-new query. */
  addCard: HTMLElement;
  /** Single read-only line naming the query being added ("{name}  QueryId:{id}"), scraped from its page. */
  addQuery: HTMLElement;
  /** View picker for the new binding; no per-view settings are shown until the query is saved. */
  addViewSelect: HTMLSelectElement;
  /** Persists the new binding with the chosen view's default settings, then switches to edit mode. */
  addSaveButton: HTMLButtonElement;

  /** "Edit enhanced query" card — the picker over every bound query plus Delete. */
  editCard: HTMLElement;
  /** Dropdown of bound queries, each labelled "{name} ({id})". */
  querySelect: HTMLSelectElement;
  deleteButton: HTMLButtonElement;

  /** "Query View Configuration" card — the view picker, its settings, and Save (edit mode only). */
  viewConfigCard: HTMLElement;
  viewSelect: HTMLSelectElement;
  /** Container the controller fills with one input per property of the selected view. */
  properties: HTMLElement;
  saveButton: HTMLButtonElement;

  /** Shared line confirming a save/delete or surfacing a failure to the user. */
  status: HTMLElement;
}

type ReportError = (error: unknown) => void;

/** The optional collaborators, grouped so no caller ever passes a positional `undefined`. */
export interface QueryBindingsOptions {
  /** The catalog the view picker offers. Defaults to the shipped catalog. */
  viewTypes?: readonly ViewType[];
  /** Resolves the query id of the ADO tab the user is on. Defaults to "none". */
  resolveCurrentQueryId?: CurrentQueryIdResolver;
}

/**
 * Resolves the query id of the ADO tab the user is currently on, or null when none can be
 * determined. Injected (Dependency Inversion) so the controller can preselect that query in options
 * mode without ever touching chrome.tabs, and so tests can drive the behavior with a fake.
 */
export type CurrentQueryIdResolver = () => Promise<string | null>;

/**
 * Drives the Query Bindings tab, which binds Azure DevOps queries to an enhanced view.
 *
 * The tab has two mutually exclusive layouts. Reaching it for a query that is not yet bound (from
 * that query's top-bar button) shows only the **Add enhanced query** card: the query named read-only
 * on a single line, a view picker, and Save — which persists the binding with the chosen view's
 * default settings so the choice survives navigating away, then switches the tab to edit mode. Reaching it
 * for a query that is already bound, or from the options menu with at least one binding, shows the
 * **Edit enhanced query** card (a picker over every bound query plus Delete) alongside the **Query
 * View Configuration** card (the view type and its per-query settings plus Save). Delete removes the
 * binding and moves selection to the next one, collapsing to guidance when the last one is removed.
 *
 * The view catalog and the current-query resolver are injected (Dependency Inversion) so tests can
 * exercise the flow with fakes and without a browser.
 */
export class QueryBindingsController {
  private readonly propertyInputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
  private readonly queryNames = new Map<string, string | null>();
  private bindings: QueryBindings = {};
  private selectedQueryId: string | null = null;
  private editing: QueryBinding | undefined;

  private readonly viewTypes: readonly ViewType[];
  private readonly resolveCurrentQueryId: CurrentQueryIdResolver;

  // `reportError` is REQUIRED, not defaulted: it is the only route a failure here has to the user
  // and to the device-local diagnostics log, so a default would silently opt a caller out of the
  // observability the rest of the extension guarantees. The remaining collaborators are grouped in
  // an options object so nobody has to pass a positional `undefined` to skip one.
  constructor(
    private readonly store: IQueryBindingStore,
    private readonly elements: QueryBindingsElements,
    private readonly reportError: ReportError,
    options: QueryBindingsOptions = {},
  ) {
    this.viewTypes = options.viewTypes ?? VIEW_TYPES;
    this.resolveCurrentQueryId = options.resolveCurrentQueryId ?? (async () => null);
  }

  /**
   * Wire the form and enter fixed-query mode (when `queryId` is given — the user started a bind from a
   * query's button) or options mode (when null — the user opened the menu to edit existing bindings).
   */
  async init(queryId: string | null, queryName: string | null): Promise<void> {
    this.populateViews(this.elements.addViewSelect);
    this.populateViews(this.elements.viewSelect);
    this.elements.viewSelect.addEventListener("change", this.handleViewChange);
    this.elements.querySelect.addEventListener("change", this.handleQueryChange);
    this.elements.addSaveButton.addEventListener("click", this.handleAddSave);
    this.elements.saveButton.addEventListener("click", this.handleSave);
    this.elements.deleteButton.addEventListener("click", this.handleDelete);

    this.bindings = await this.readBindings();
    this.syncQueryNames();
    await this.show(queryId, queryName);
  }

  /**
   * Re-open the form after `init`, used when the options tab was already open and the user clicked a
   * query's "Enable Enhanced View" again. A fresh tab reads the query from its URL on load, but an
   * already-open tab has finished loading, so the current bindings are re-read (in case one was
   * added since) and the form is re-populated for `queryId` in place.
   */
  async revealFixedQuery(queryId: string, queryName: string | null): Promise<void> {
    this.bindings = await this.readBindings();
    this.syncQueryNames();
    await this.show(queryId, queryName);
  }

  dispose(): void {
    this.elements.viewSelect.removeEventListener("change", this.handleViewChange);
    this.elements.querySelect.removeEventListener("change", this.handleQueryChange);
    this.elements.addSaveButton.removeEventListener("click", this.handleAddSave);
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

  /** Rebuild the id → name lookup from the current bindings so the pickers and labels agree. */
  private syncQueryNames(): void {
    this.queryNames.clear();
    for (const [id, binding] of Object.entries(this.bindings)) {
      this.queryNames.set(id, binding.name ?? null);
    }
  }

  /**
   * Choose the layout: a query in context that is not yet bound goes to add mode; an already-bound
   * query (or, in options mode, the current or first binding) goes to edit mode; nothing bound and
   * no query in context shows the guidance.
   */
  private async show(queryId: string | null, queryName: string | null): Promise<void> {
    if (queryId !== null) {
      if (this.bindings[queryId] !== undefined) {
        // A freshly scraped name fills in a binding that never captured one, so its picker option
        // and any re-save carry a human label instead of "Unnamed query".
        if (queryName !== null && (this.queryNames.get(queryId) ?? null) === null) {
          this.queryNames.set(queryId, queryName);
        }
        this.enterEdit(queryId);
      } else {
        this.enterAdd(queryId, queryName);
      }
      return;
    }
    if (this.queryNames.size === 0) {
      this.enterEmpty();
      return;
    }
    const current = await this.currentBoundQueryId();
    const [firstBound] = [...this.queryNames.keys()];
    this.enterEdit(current ?? firstBound ?? "");
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

  private enterEmpty(): void {
    this.selectedQueryId = null;
    this.editing = undefined;
    this.elements.emptyState.hidden = false;
    this.elements.addCard.hidden = true;
    this.elements.editCard.hidden = true;
    this.elements.viewConfigCard.hidden = true;
  }

  private enterAdd(queryId: string, queryName: string | null): void {
    this.selectedQueryId = queryId;
    this.editing = undefined;
    // Remember the scraped name so a Save can persist it, and re-opening the query still shows it.
    this.queryNames.set(queryId, queryName);
    this.elements.emptyState.hidden = true;
    this.elements.addCard.hidden = false;
    this.elements.editCard.hidden = true;
    this.elements.viewConfigCard.hidden = true;
    this.setAddQueryLabel(queryId, queryName);
    this.elements.addViewSelect.value = this.viewTypes[0]?.id ?? "";
    // With no view to bind there is nothing to save; otherwise the picker always has a default.
    this.elements.addSaveButton.disabled = this.viewTypes.length === 0;
    this.elements.status.textContent = "";
  }

  /** Render the single read-only "ADO Query to enhance" line, with the id italicised after the name. */
  private setAddQueryLabel(queryId: string, queryName: string | null): void {
    const doc = this.elements.addQuery.ownerDocument;
    const id = doc.createElement("i");
    id.textContent = queryId;
    this.elements.addQuery.replaceChildren(
      doc.createTextNode(`${queryName ?? "Unnamed query"}  QueryId:`),
      id,
    );
  }

  private enterEdit(queryId: string): void {
    this.elements.emptyState.hidden = true;
    this.elements.addCard.hidden = true;
    this.elements.editCard.hidden = false;
    this.elements.viewConfigCard.hidden = false;
    this.renderQueryOptions();
    this.selectQuery(queryId);
  }

  private renderQueryOptions(): void {
    this.elements.querySelect.replaceChildren();
    const doc = this.elements.querySelect.ownerDocument;
    for (const queryId of Object.keys(this.bindings)) {
      const option = doc.createElement("option");
      option.value = queryId;
      const name = this.queryNames.get(queryId) ?? "Unnamed query";
      // The label deliberately omits the view type: it can change from the configuration card and
      // would otherwise read as stale until the picker is rebuilt.
      option.textContent = `${name} (${queryId})`;
      this.elements.querySelect.append(option);
    }
  }

  /** Load `queryId`'s binding into the view-configuration card without rebuilding the picker. */
  private selectQuery(queryId: string): void {
    this.selectedQueryId = queryId;
    this.editing = this.bindings[queryId];
    this.elements.querySelect.value = queryId;
    // Preselect the bound view; a binding whose view this build does not know falls back to the
    // first view in the catalog.
    this.elements.viewSelect.value = this.editing?.view ?? this.viewTypes[0]?.id ?? "";
    if (this.elements.viewSelect.value === "") {
      this.elements.viewSelect.value = this.viewTypes[0]?.id ?? "";
    }
    this.renderProperties();
    this.elements.deleteButton.disabled = this.editing === undefined;
    this.elements.status.textContent = "";
  }

  private populateViews(select: HTMLSelectElement): void {
    select.replaceChildren();
    const doc = select.ownerDocument;
    for (const view of this.viewTypes) {
      const option = doc.createElement("option");
      option.value = view.id;
      option.textContent = view.label;
      select.append(option);
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
    // switching view type starts the new view's inputs from their own defaults.
    const prefill = this.editing?.view === view.id ? this.editing.properties : undefined;
    const doc = this.elements.properties.ownerDocument;
    for (const property of view.properties) {
      this.elements.properties.append(
        this.createPropertyField(doc, property, prefill?.[property.key]),
      );
    }
    this.updateSaveEnabled();
  }

  /** Build one labeled input (plus its optional hint) for a property, seeded from the binding. */
  private createPropertyField(
    doc: Document,
    property: ViewTypeProperty,
    stored: string | undefined,
  ): HTMLElement {
    const setting = doc.createElement("div");
    setting.className = "setting";
    const field = doc.createElement("label");
    field.className = "field";
    const label = doc.createElement("span");
    label.className = "field__label";
    label.textContent = property.required ? `${property.label} (required)` : property.label;
    const control = this.createPropertyControl(doc, property, stored);
    field.append(label, control);
    setting.append(field);
    this.propertyInputs.set(property.key, control);
    if (property.hint !== undefined) {
      const hint = doc.createElement("p");
      hint.className = "field__hint";
      hint.textContent = property.hint;
      setting.append(hint);
    }
    return setting;
  }

  /** The value control for a property: a dropdown for `select`, otherwise a text/number input. */
  private createPropertyControl(
    doc: Document,
    property: ViewTypeProperty,
    stored: string | undefined,
  ): HTMLInputElement | HTMLSelectElement {
    if (viewTypePropertyKind(property) === "select") {
      const select = doc.createElement("select");
      select.dataset.propertyKey = property.key;
      for (const option of property.options ?? []) {
        const element = doc.createElement("option");
        element.value = option.value;
        element.textContent = option.label;
        select.append(element);
      }
      // Seed the stored value, or the property's default when the binding has none or stored an
      // option this build no longer offers.
      select.value = resolveViewTypePropertyValue(property, stored);
      select.addEventListener("change", this.handleInput);
      return select;
    }
    const input = doc.createElement("input");
    const kind = viewTypePropertyKind(property);
    input.type = kind === "number" ? "number" : "text";
    input.dataset.propertyKey = property.key;
    if (kind === "number") {
      input.inputMode = "numeric";
      input.step = "1";
      if (property.min !== undefined) {
        input.min = String(property.min);
      }
      if (property.max !== undefined) {
        input.max = String(property.max);
      }
    }
    // Seed the stored value, or the property's default when the binding has none, so an unconfigured
    // field opens with the behavior the view expects.
    input.value = resolveViewTypePropertyValue(property, stored);
    input.addEventListener("input", this.handleInput);
    if (kind === "number") {
      // A number is forced into range only once the user leaves the field, so deleting digits mid-edit
      // is not fought.
      input.addEventListener("change", this.handleNumberChange);
    }
    return input;
  }

  private selectedView(): ViewType | undefined {
    return this.viewTypes.find((view) => view.id === this.elements.viewSelect.value);
  }

  private collectProperties(): Record<string, string> {
    const view = this.selectedView();
    const properties: Record<string, string> = {};
    if (view === undefined) {
      return properties;
    }
    for (const property of view.properties) {
      // Route through the shared resolver so a saved binding stores the same defaulted, clamped value
      // the form shows.
      properties[property.key] = resolveViewTypePropertyValue(
        property,
        this.propertyInputs.get(property.key)?.value,
      );
    }
    return properties;
  }

  /** The chosen view's properties at their defaults, stored so a new binding survives navigation. */
  private defaultProperties(view: ViewType): Record<string, string> {
    const properties: Record<string, string> = {};
    for (const property of view.properties) {
      properties[property.key] = resolveViewTypePropertyValue(property, undefined);
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
      // Covers both a number input's clamp-on-change and a select's change; removing a listener that
      // was never added is a no-op, so detaching both from every control is safe.
      input.removeEventListener("change", this.handleNumberChange);
      input.removeEventListener("change", this.handleInput);
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

  /** Force a number property into its declared range once the user leaves the field. */
  private readonly handleNumberChange = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const property = this.selectedView()?.properties.find(
      (candidate) => candidate.key === input.dataset.propertyKey,
    );
    if (property !== undefined) {
      input.value = resolveViewTypePropertyValue(property, input.value);
    }
    this.updateSaveEnabled();
  };

  private readonly handleAddSave = (): void => {
    const queryId = this.selectedQueryId;
    const view = this.viewTypes.find(
      (candidate) => candidate.id === this.elements.addViewSelect.value,
    );
    if (queryId === null || view === undefined) {
      return;
    }
    // Persist the view's defaults now so the binding is usable even if the user never opens the
    // configuration card before navigating away.
    const binding: QueryBinding = { view: view.id, properties: this.defaultProperties(view) };
    const name = this.queryNames.get(queryId) ?? null;
    if (name !== null) {
      binding.name = name;
    }
    this.elements.addSaveButton.disabled = true;
    void this.store
      .bind(queryId, binding)
      .then(() => {
        this.bindings[queryId] = binding;
        // The query is now bound, so hand off to edit mode where it can be reconfigured or removed.
        this.enterEdit(queryId);
        this.elements.status.textContent = "Saved.";
      })
      .catch((error: unknown) => {
        this.reportError(error);
        this.elements.addSaveButton.disabled = false;
      });
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
    this.elements.saveButton.disabled = true;
    void this.store
      .bind(queryId, binding)
      .then(() => {
        this.bindings[queryId] = binding;
        this.editing = binding;
        this.elements.deleteButton.disabled = false;
        // The picker label is just name and id, so a view/property change leaves it correct as-is.
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
    const nextQueryId = this.queryIdAfter(queryId);
    this.elements.deleteButton.disabled = true;
    void this.store
      .unbind(queryId)
      .then(() => {
        delete this.bindings[queryId];
        this.queryNames.delete(queryId);
        this.editing = undefined;
        if (nextQueryId !== null) {
          // Move to the query that took the deleted one's place so the picker keeps a valid selection.
          this.renderQueryOptions();
          this.selectQuery(nextQueryId);
        } else {
          // Nothing bound is left, and a new binding must start from a query's page, so show guidance.
          this.enterEmpty();
        }
        this.elements.status.textContent = "Deleted.";
      })
      .catch((error: unknown) => {
        this.reportError(error);
        this.elements.deleteButton.disabled = false;
      });
  };

  /** The binding to select after removing `queryId`: the next one in order, else the last remaining. */
  private queryIdAfter(queryId: string): string | null {
    const ids = Object.keys(this.bindings);
    const index = ids.indexOf(queryId);
    const remaining = ids.filter((id) => id !== queryId);
    if (remaining.length === 0) {
      return null;
    }
    return remaining[Math.min(index, remaining.length - 1)] ?? null;
  }
}
