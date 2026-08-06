import type { IQueryBindingStore } from "../../common/bindings/IQueryBindingStore";
import type { QueryBinding, QueryBindings } from "../../common/bindings/QueryBinding";
import type { SharedQueryConfigResolver } from "../../common/settings-transfer/SharedQueryConfigResolver";
import type { SharedQuerySourceStore } from "../../common/settings-transfer/SharedQuerySourceStore";
import {
  resolveViewTypePropertyValue,
  viewTypePropertyKind,
  type ViewType,
  type ViewTypeDerivedSource,
  type ViewTypeDerivedValues,
  type ViewTypeProperty,
  type ViewTypeSuggestionSource,
} from "../../common/view-common/ViewType";
import { VIEW_TYPES } from "../../content/views/viewCatalog";
import { AutocompleteInput } from "../ado-config/AutocompleteInput";

import { AreaPathListEditor } from "./AreaPathListEditor";
import {
  QueryFolderVocabulary,
  type ReadFolderChildren,
  type ReadRootFolders,
} from "./QueryFolderVocabulary";
import type { MetadataSuggestionSource } from "./suggestionSources";

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

  /** "Query View Configuration" card — the view picker and its settings (edit mode only). */
  viewConfigCard: HTMLElement;
  viewSelect: HTMLSelectElement;
  /** Container the controller fills with one input per property of the selected view. */
  properties: HTMLElement;
  /** Explains, for a shared query, that its configuration is owned by someone else's work item. */
  sharedNotice: HTMLElement;

  /** Shared line confirming a save/delete or surfacing a failure to the user. */
  status: HTMLElement;
}

type RecordError = (error: unknown) => void;

/** Where the read-only shared queries and their published configuration are read from. */
export interface SharedQueryAccess {
  sources: SharedQuerySourceStore;
  /** Memoizes per work item, so many queries shared from one item cost a single read. */
  resolver: SharedQueryConfigResolver;
}

/** One query whose configuration is published by a work item this user may not write to. */
interface SharedQueryLink {
  workItemId: number;
  binding: QueryBinding | null;
}

/** The optional collaborators, grouped so no caller ever passes a positional `undefined`. */
export interface QueryBindingsOptions {
  /** The catalog the view picker offers. Defaults to the shipped catalog. */
  viewTypes?: readonly ViewType[];
  /** Resolves the query id of the ADO tab the user is on. Defaults to "none". */
  resolveCurrentQueryId?: CurrentQueryIdResolver;
  /** Loads the Azure DevOps vocabulary one autocomplete source suggests from. */
  resolveSuggestions?: (source: MetadataSuggestionSource) => Promise<readonly string[]>;
  /** Loads the saved-query folders the folder picker starts from, in one read. */
  resolveRootFolders?: ReadRootFolders;
  /** Lists the folders nested inside one saved-query folder, read only when the user asks for it. */
  resolveFolderChildren?: ReadFolderChildren;
  /** Reads what a saved query itself says, used to pre-fill the properties derived from it. */
  resolveDerivedValues?: (queryId: string) => Promise<ViewTypeDerivedValues>;
  /** Publishes the proposed full binding map before local observers can trigger a stale pull. */
  publishBindings?: (bindings: QueryBindings) => Promise<void>;
  /** The shared queries this user reads but cannot change. Absent means there are none. */
  sharedQueries?: SharedQueryAccess;
}

/**
 * Every vocabulary one memoized metadata read answers, all from that single read.
 *
 * That read is broad and credentialed (it walks the project's whole area and iteration hierarchies),
 * so the form never waits for it: it opens with empty lists and each live control is refreshed when
 * the values land. Saved-query folders are not here — they load a folder at a time
 * (`QueryFolderVocabulary`).
 */
const SUGGESTION_SOURCES: readonly MetadataSuggestionSource[] = ["area-paths", "iteration-paths"];

interface PropertyControl {
  element: HTMLElement;
  read(): string;
  /** Replaces the value. Absent on controls no derived value can seed (the area-path list). */
  write?(value: string): void;
  /** Re-reads the form's vocabularies. Absent on controls that offer no suggestions. */
  refreshSuggestions?(): void;
  dispose(): void;
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
 * View Configuration** card (the view type and its per-query settings). Delete removes the
 * binding and moves selection to the next one, collapsing to guidance when the last one is removed.
 *
 * The configuration card has no Save: every change is persisted the moment the user commits it, the
 * way the rest of the options page behaves. A binding is only written once its required properties
 * are answered — an incomplete view would be one the content script cannot render — so until then
 * the status line names what is still missing and the last valid binding stands. It confirms nothing
 * otherwise: a line that appeared after every keystroke would be noise, so it carries only what the
 * user has to act on — a setting still blank, or a write that was refused.
 *
 * The view catalog and the current-query resolver are injected (Dependency Inversion) so tests can
 * exercise the flow with fakes and without a browser.
 */
export class QueryBindingsController {
  private readonly propertyInputs = new Map<string, PropertyControl>();
  private readonly queryNames = new Map<string, string | null>();
  /** Queries whose configuration is published by a work item this user may not write to. */
  private shared = new Map<string, SharedQueryLink>();
  private bindings: QueryBindings = {};
  private selectedQueryId: string | null = null;
  private editing: QueryBinding | undefined;

  private readonly viewTypes: readonly ViewType[];
  private readonly resolveCurrentQueryId: CurrentQueryIdResolver;
  private readonly resolveSuggestions: (
    source: MetadataSuggestionSource,
  ) => Promise<readonly string[]>;
  private readonly resolveDerivedValues: (queryId: string) => Promise<ViewTypeDerivedValues>;
  private readonly publishBindings: (bindings: QueryBindings) => Promise<void>;
  private readonly sharedQueries: SharedQueryAccess | undefined;
  private suggestions = new Map<MetadataSuggestionSource, readonly string[]>();
  private suggestionsLoading = true;
  /** The saved-query folders, which Azure DevOps only hands over a folder at a time. */
  private readonly folders: QueryFolderVocabulary;
  /** Each query's own answers, read at most once: the saved query is not going to change here. */
  private readonly derivedValues = new Map<string, ViewTypeDerivedValues>();

  // `recordError` is REQUIRED, not defaulted: local status gives the user the failure while this
  // callback preserves its detail in diagnostics. The remaining collaborators are grouped in an
  // options object so nobody has to pass a positional `undefined` to skip one.
  constructor(
    private readonly store: IQueryBindingStore,
    private readonly elements: QueryBindingsElements,
    private readonly recordError: RecordError,
    options: QueryBindingsOptions = {},
  ) {
    this.viewTypes = options.viewTypes ?? VIEW_TYPES;
    this.resolveCurrentQueryId = options.resolveCurrentQueryId ?? (async () => null);
    this.resolveSuggestions = options.resolveSuggestions ?? (async () => []);
    this.resolveDerivedValues = options.resolveDerivedValues ?? (async () => ({}));
    this.publishBindings = options.publishBindings ?? (async () => {});
    this.sharedQueries = options.sharedQueries;
    this.folders = new QueryFolderVocabulary({
      readRoot: options.resolveRootFolders ?? (async () => []),
      readChildren: options.resolveFolderChildren ?? (async () => []),
      onChange: () => this.refreshPropertyControls(),
      onError: (error) => this.recordError(error),
    });
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
    this.elements.deleteButton.addEventListener("click", this.handleDelete);

    [this.bindings, this.shared] = await Promise.all([
      this.readBindings(),
      this.readSharedQueries(),
    ]);
    this.syncQueryNames();
    await this.show(queryId, queryName);
    // Deliberately not awaited: the vocabularies come from a broad Azure DevOps read, and holding the
    // whole tab blank until it lands is what made this page feel like it never opened.
    void this.loadSuggestions();
    void this.folders.loadRoot();
  }

  /** Fill every rendered suggestion list once the project's vocabularies have been read. */
  private async loadSuggestions(): Promise<void> {
    this.suggestions = await this.readSuggestions();
    this.suggestionsLoading = false;
    this.refreshPropertyControls();
  }

  /** Re-read every live control's vocabulary and busy state, after either lands or changes. */
  private refreshPropertyControls(): void {
    for (const control of this.propertyInputs.values()) {
      control.refreshSuggestions?.();
    }
  }

  /**
   * Re-open the form after `init`, used when the options tab was already open and the user clicked a
   * query's "Enable Enhanced View" again. A fresh tab reads the query from its URL on load, but an
   * already-open tab has finished loading, so the current bindings are re-read (in case one was
   * added since) and the form is re-populated for `queryId` in place.
   */
  async revealFixedQuery(queryId: string, queryName: string | null): Promise<void> {
    [this.bindings, this.shared] = await Promise.all([
      this.readBindings(),
      this.readSharedQueries(),
    ]);
    this.syncQueryNames();
    await this.show(queryId, queryName);
  }

  /**
   * Re-read the stored bindings and re-populate the form, used when they were replaced from outside
   * (a configuration file import). The in-memory `bindings` map is this form's working copy and is
   * what a save writes back, so leaving it stale would re-save the bindings the file just replaced.
   */
  async reload(): Promise<void> {
    // A pull or import can have changed which work item a shared query reads from, and what that
    // item says, so the memoized reads are dropped before the links are resolved again.
    this.sharedQueries?.resolver.invalidate();
    [this.bindings, this.shared] = await Promise.all([
      this.readBindings(),
      this.readSharedQueries(),
    ]);
    this.syncQueryNames();
    await this.show(null, null);
  }

  dispose(): void {
    this.elements.viewSelect.removeEventListener("change", this.handleViewChange);
    this.elements.querySelect.removeEventListener("change", this.handleQueryChange);
    this.elements.addSaveButton.removeEventListener("click", this.handleAddSave);
    this.elements.deleteButton.removeEventListener("click", this.handleDelete);
    this.removePropertyInputs();
  }

  private async readBindings(): Promise<QueryBindings> {
    try {
      return await this.store.read();
    } catch (error: unknown) {
      this.recordError(error);
      return {};
    }
  }

  private async readSuggestions(): Promise<Map<MetadataSuggestionSource, readonly string[]>> {
    const entries = await Promise.all(
      SUGGESTION_SOURCES.map(async (source) => {
        try {
          return [source, await this.resolveSuggestions(source)] as const;
        } catch (error: unknown) {
          // One unavailable vocabulary must not cost the others their suggestions.
          this.recordError(error);
          return [source, [] as readonly string[]] as const;
        }
      }),
    );
    return new Map(entries);
  }

  /** The values one autocomplete property offers, empty when its source answered nothing. */
  private suggestionsFor(source: ViewTypeSuggestionSource | undefined): readonly string[] {
    if (source === "query-folders") {
      return this.folders.paths;
    }
    return source === undefined ? [] : (this.suggestions.get(source) ?? []);
  }

  /**
   * Resolve every read-only shared query to the binding its work item publishes.
   *
   * The resolver memoizes per work item, so a team that shares five queries from one item is read
   * once rather than five times. A link whose item cannot be read is still listed — with no binding
   * — so the user can see (and remove) a link that has stopped resolving.
   */
  private async readSharedQueries(): Promise<Map<string, SharedQueryLink>> {
    const access = this.sharedQueries;
    if (access === undefined) {
      return new Map();
    }
    try {
      const sources = Object.entries(await access.sources.read());
      const links = await Promise.all(
        sources.map(async ([queryId, workItemId]): Promise<[string, SharedQueryLink]> => {
          const config = await access.resolver.resolve(workItemId);
          return [queryId, { workItemId, binding: config?.bindings[queryId] ?? null }];
        }),
      );
      return new Map(links);
    } catch (error: unknown) {
      this.recordError(error);
      return new Map();
    }
  }

  /** Rebuild the id → name lookup from the current bindings so the pickers and labels agree. */
  private syncQueryNames(): void {
    this.queryNames.clear();
    for (const [id, binding] of Object.entries(this.bindings)) {
      this.queryNames.set(id, binding.name ?? null);
    }
    // A shared query's name comes from its publisher, and overrides any stale local copy, because
    // everything the user sees for that query is the publisher's.
    for (const [id, link] of this.shared) {
      this.queryNames.set(id, link.binding?.name ?? null);
    }
  }

  /**
   * Choose the layout: a query in context that is not yet bound goes to add mode; an already-bound
   * query (or, in options mode, the current or first binding) goes to edit mode; nothing bound and
   * no query in context shows the guidance.
   */
  private async show(queryId: string | null, queryName: string | null): Promise<void> {
    if (queryId !== null) {
      if (this.bindings[queryId] !== undefined || this.shared.has(queryId)) {
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

  /** The current ADO tab's query id, but only when it is one this tab can show; else null. */
  private async currentBoundQueryId(): Promise<string | null> {
    try {
      const current = await this.resolveCurrentQueryId();
      return current !== null && (this.bindings[current] !== undefined || this.shared.has(current))
        ? current
        : null;
    } catch (error: unknown) {
      // Preselection is a convenience; a tab-read failure must not block editing existing bindings.
      this.recordError(error);
      return null;
    }
  }

  private enterEmpty(): void {
    this.selectedQueryId = null;
    this.editing = undefined;
    this.applySharedLink(undefined);
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
    this.setStatus("");
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
    for (const queryId of this.allQueryIds()) {
      const option = doc.createElement("option");
      option.value = queryId;
      const name = this.queryNames.get(queryId) ?? "Unnamed query";
      // The label deliberately omits the view type: it can change from the configuration card and
      // would otherwise read as stale until the picker is rebuilt.
      option.textContent = `${name} (${queryId})`;
      this.elements.querySelect.append(option);
    }
  }

  /** Every query this tab can show: the user's own bindings first, then the shared ones. */
  private allQueryIds(): string[] {
    const own = Object.keys(this.bindings);
    return [...own, ...[...this.shared.keys()].filter((id) => !own.includes(id))];
  }

  /** Load `queryId`'s binding into the view-configuration card without rebuilding the picker. */
  private selectQuery(queryId: string): void {
    this.selectedQueryId = queryId;
    const link = this.shared.get(queryId);
    this.editing = link === undefined ? this.bindings[queryId] : (link.binding ?? undefined);
    this.elements.querySelect.value = queryId;
    this.elements.viewSelect.value = this.viewToShow();
    this.applySharedLink(link);
    // Cleared before the properties are drawn, so the "still missing" notice they may raise stands.
    this.setStatus("");
    this.renderProperties();
    this.elements.deleteButton.disabled = this.editing === undefined && link === undefined;
  }

  /**
   * The view to preselect: the bound one, falling back to the first in the catalog when this build
   * does not know it (a binding written by a newer version, or none at all).
   */
  private viewToShow(): string {
    const fallback = this.viewTypes[0]?.id ?? "";
    const bound = this.editing?.view;
    return bound !== undefined && this.viewTypes.some((view) => view.id === bound)
      ? bound
      : fallback;
  }

  /**
   * Present a shared query as what it is: someone else's configuration, shown but not editable.
   *
   * Editing is removed rather than merely discouraged — the values on screen live in a work item
   * this user cannot write to, so any edit could only ever produce a local copy that silently
   * diverges from the query everyone else is looking at.
   */
  private applySharedLink(link: SharedQueryLink | undefined): void {
    this.elements.viewSelect.disabled = link !== undefined;
    this.elements.deleteButton.textContent = link === undefined ? "Delete" : "Remove link";
    this.elements.sharedNotice.hidden = link === undefined;
    if (link === undefined) {
      this.elements.sharedNotice.textContent = "";
      return;
    }
    this.elements.sharedNotice.textContent =
      link.binding === null
        ? `Shared from work item ${link.workItemId}, which does not currently enhance this query.`
        : `Shared from work item ${link.workItemId}. These settings are read-only and follow that ` +
          `work item; remove the link to stop using them.`;
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
      this.reportMissingRequired();
      return;
    }
    // Prefill from the existing binding only when it targets the currently selected view, so
    // switching view type starts the new view's inputs from their own defaults.
    const prefill = this.editing?.view === view.id ? this.editing.properties : undefined;
    const doc = this.elements.properties.ownerDocument;
    const readOnly = this.selectedQueryId !== null && this.shared.has(this.selectedQueryId);
    for (const property of view.properties) {
      this.elements.properties.append(
        readOnly
          ? createReadOnlyPropertyField(doc, property, prefill?.[property.key])
          : this.createPropertyField(doc, property, prefill?.[property.key]),
      );
    }
    this.reportMissingRequired();
    void this.applyDerivedSeeds(view);
  }

  /**
   * Fill any property the view derives from the bound query, but only where the user has none.
   *
   * A seed, never an override: a stored value is the user's own answer, and replacing it with the
   * query's would quietly undo a deliberate choice. The read is asynchronous, so the selection is
   * re-checked before anything is written — the user can pick another query while it is in flight.
   */
  private async applyDerivedSeeds(view: ViewType): Promise<void> {
    const queryId = this.selectedQueryId;
    const derived = view.properties.filter(isDerivedProperty);
    if (queryId === null || derived.length === 0 || this.shared.has(queryId)) {
      return;
    }
    const values = await this.queryDerivedValues(queryId);
    if (this.selectedQueryId !== queryId || this.selectedView()?.id !== view.id) {
      return;
    }
    // Seeded values are stored, not merely displayed: with no Save button, anything left on screen
    // but unwritten would be a setting the user believes they have and the view never sees.
    const seeded = derived.filter((property) =>
      this.seedProperty(property.key, values[property.derivedFrom]),
    );
    if (seeded.length > 0) {
      this.commit();
      return;
    }
    this.reportMissingRequired();
  }

  /**
   * Write a query-derived value into a property the user has left empty; leave any other alone.
   * Reports whether anything was actually seeded.
   */
  private seedProperty(key: string, value: string | null | undefined): boolean {
    const seed = (value ?? "").trim();
    const control = this.propertyInputs.get(key);
    if (seed === "" || control?.write === undefined || control.read().trim() !== "") {
      return false;
    }
    control.write(seed);
    return true;
  }

  /** What the query itself says, read at most once per query for the life of the tab. */
  private async queryDerivedValues(queryId: string): Promise<ViewTypeDerivedValues> {
    const cached = this.derivedValues.get(queryId);
    if (cached !== undefined) {
      return cached;
    }
    try {
      const values = await this.resolveDerivedValues(queryId);
      this.derivedValues.set(queryId, values);
      return values;
    } catch (error: unknown) {
      // Pre-filling is a convenience; a refused read must not stop the binding being edited.
      this.recordError(error);
      this.derivedValues.set(queryId, {});
      return {};
    }
  }

  /** Build one labeled input (plus its optional hint) for a property, seeded from the binding. */
  private createPropertyField(
    doc: Document,
    property: ViewTypeProperty,
    stored: string | undefined,
  ): HTMLElement {
    const setting = doc.createElement("div");
    setting.className = "setting";
    const isAreaPathList = viewTypePropertyKind(property) === "area-path-list";
    const field = doc.createElement(isAreaPathList ? "div" : "label");
    field.className = isAreaPathList ? "field field--full" : "field";
    const label = doc.createElement("span");
    label.className = "field__label";
    label.textContent = property.required ? `${property.label} (required)` : property.label;
    const control = this.createPropertyControl(doc, property, stored);
    field.append(label, control.element);
    setting.append(field);
    this.propertyInputs.set(property.key, control);
    if (!isAreaPathList && property.hint !== undefined) {
      const hint = doc.createElement("p");
      hint.className = "field__hint";
      hint.textContent = property.hint;
      setting.append(hint);
    }
    return setting;
  }

  /**
   * The value control for a property, chosen by its kind.
   *
   * Every kind is handed the already-resolved value (stored, else the property's default, clamped)
   * so no builder can seed a field differently from what a save would store.
   */
  private createPropertyControl(
    doc: Document,
    property: ViewTypeProperty,
    stored: string | undefined,
  ): PropertyControl {
    const kind = viewTypePropertyKind(property);
    const value = resolveViewTypePropertyValue(property, stored);
    if (kind === "select") {
      return this.createSelectControl(doc, property, value);
    }
    if (kind === "autocomplete") {
      return this.createAutocompleteControl(doc, property, value);
    }
    if (kind === "area-path-list") {
      const editor = new AreaPathListEditor(
        doc,
        value,
        this.suggestionsFor("area-paths"),
        propertyDescription(property),
        () => this.commit(),
      );
      return {
        element: editor.root,
        read: () => editor.value,
        refreshSuggestions: () => editor.setSuggestions(this.suggestionsFor("area-paths")),
        dispose: () => editor.dispose(),
      };
    }
    if (kind === "number") {
      return this.createNumberControl(doc, property, value);
    }
    const input = doc.createElement("input");
    input.type = "text";
    input.dataset.propertyKey = property.key;
    input.value = value;
    return this.editableControl(input);
  }

  private createSelectControl(
    doc: Document,
    property: ViewTypeProperty,
    value: string,
  ): PropertyControl {
    const select = doc.createElement("select");
    select.dataset.propertyKey = property.key;
    for (const option of property.options ?? []) {
      const element = doc.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      select.append(element);
    }
    select.value = value;
    select.addEventListener("change", this.handleCommit);
    return {
      element: select,
      read: () => select.value,
      write: (next) => {
        select.value = next;
      },
      dispose: () => select.removeEventListener("change", this.handleCommit),
    };
  }

  private createNumberControl(
    doc: Document,
    property: ViewTypeProperty,
    value: string,
  ): PropertyControl {
    const input = doc.createElement("input");
    input.type = "number";
    input.dataset.propertyKey = property.key;
    input.inputMode = "numeric";
    input.step = "1";
    if (property.min !== undefined) {
      input.min = String(property.min);
    }
    if (property.max !== undefined) {
      input.max = String(property.max);
    }
    input.value = value;
    // A number is forced into range only once the user leaves the field, so deleting digits mid-edit
    // is not fought.
    input.addEventListener("input", this.handleInput);
    input.addEventListener("change", this.handleNumberChange);
    return {
      element: input,
      read: () => input.value,
      dispose: () => {
        input.removeEventListener("input", this.handleInput);
        input.removeEventListener("change", this.handleNumberChange);
      },
    };
  }

  /**
   * A text box that reports validity as it is typed and persists once the edit is committed.
   *
   * `change` rather than `input` is what "committed" means for a text field — blur or Enter — so a
   * half-typed area path is never written, while `input` keeps the "still missing" notice honest
   * from the first keystroke.
   */
  private editableControl(input: HTMLInputElement): PropertyControl {
    input.addEventListener("input", this.handleInput);
    input.addEventListener("change", this.handleCommit);
    return {
      element: input,
      read: () => input.value,
      write: (value) => {
        input.value = value;
      },
      dispose: () => {
        input.removeEventListener("input", this.handleInput);
        input.removeEventListener("change", this.handleCommit);
      },
    };
  }

  /** A single-line text field whose suggestions come from the project's own Azure DevOps data. */
  private createAutocompleteControl(
    doc: Document,
    property: ViewTypeProperty,
    value: string,
  ): PropertyControl {
    const input = doc.createElement("input");
    input.type = "text";
    input.dataset.propertyKey = property.key;
    input.setAttribute("aria-label", property.label);
    input.value = value;
    const autocomplete = new AutocompleteInput(input);
    const isFolderField = property.suggestions === "query-folders";
    const spinner = isFolderField ? createFolderSpinner(doc) : null;
    if (spinner !== null) {
      autocomplete.enableOverflowTitles();
      autocomplete.root.classList.add("combobox--with-spinner");
      autocomplete.root.append(spinner);
    }
    const refreshSuggestions = (): void => {
      autocomplete.setOptions(this.suggestionsFor(property.suggestions));
      if (spinner !== null) {
        spinner.hidden = !this.folders.loading;
        input.setAttribute("aria-busy", String(this.folders.loading));
      }
    };
    refreshSuggestions();
    input.addEventListener("input", this.handleInput);
    input.addEventListener("change", this.handleCommit);
    // A saved-query folder is the one vocabulary Azure DevOps cannot hand over in full, so the
    // folders inside the one being named are fetched as the user types or picks it.
    const expand = isFolderField ? () => this.folders.expand(input.value) : null;
    if (expand !== null) {
      input.addEventListener("input", expand);
    }
    return {
      // The control's own wrapper, not the raw input: the suggestion list lives inside it.
      element: autocomplete.root,
      read: () => input.value,
      write: (value) => {
        input.value = value;
      },
      refreshSuggestions,
      dispose: () => {
        input.removeEventListener("input", this.handleInput);
        input.removeEventListener("change", this.handleCommit);
        if (expand !== null) {
          input.removeEventListener("input", expand);
        }
        autocomplete.dispose();
      },
    };
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
        this.propertyInputs.get(property.key)?.read(),
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
    return this.missingRequiredProperty() === undefined;
  }

  /** The first required property the user has left blank, or undefined when the form is complete. */
  private missingRequiredProperty(): ViewTypeProperty | undefined {
    return this.selectedView()?.properties.find(
      (property) =>
        property.required && (this.propertyInputs.get(property.key)?.read().trim() ?? "") === "",
    );
  }

  /**
   * Say what still stands between the form and a stored binding, or clear the line when nothing does.
   *
   * With no Save button to disable, this notice IS the feedback that an edit has not been kept: a
   * view missing a required setting cannot be rendered, so it is not written at all.
   */
  private reportMissingRequired(): void {
    const missing = this.missingRequiredProperty();
    this.setStatus(missing === undefined ? "" : `Enter ${missing.label} to save these settings.`);
  }

  /**
   * Persist the form as it now stands.
   *
   * Every control calls this the moment its edit is committed, so the page behaves like the rest of
   * the options: what is on screen is what is stored. A shared query is skipped because its values
   * belong to someone else's work item.
   */
  private commit(): void {
    const view = this.selectedView();
    const queryId = this.selectedQueryId;
    if (queryId === null || view === undefined || this.shared.has(queryId)) {
      return;
    }
    if (!this.hasAllRequiredProperties()) {
      this.reportMissingRequired();
      return;
    }
    const binding: QueryBinding = { view: view.id, properties: this.collectProperties() };
    const name = this.queryNames.get(queryId) ?? null;
    if (name !== null) {
      binding.name = name;
    }
    void this.persistBinding(queryId, binding)
      .then(() => {
        this.editing = binding;
        this.elements.deleteButton.disabled = false;
        // The line is reserved for what needs the user; a save that just worked does not.
        this.setStatus("");
      })
      .catch((error: unknown) => {
        this.reportFailure("Could not save the query enhancement.", error);
      });
  }

  private setStatus(message: string, failed = false): void {
    this.elements.status.textContent = message;
    this.elements.status.classList.toggle("binding__status--error", failed);
  }

  private reportFailure(message: string, error: unknown): void {
    this.setStatus(message, true);
    this.recordError(error);
  }

  private removePropertyInputs(): void {
    for (const input of this.propertyInputs.values()) input.dispose();
    this.propertyInputs.clear();
    this.elements.properties.replaceChildren();
  }

  private readonly handleQueryChange = (): void => {
    this.selectQuery(this.elements.querySelect.value);
  };

  private readonly handleViewChange = (): void => {
    this.renderProperties();
    // A different view is itself a change to keep; its own properties start from their defaults.
    this.commit();
  };

  private readonly handleInput = (): void => {
    this.reportMissingRequired();
  };

  private readonly handleCommit = (): void => {
    this.commit();
  };

  /** Force a number property into its declared range once the user leaves the field, then store it. */
  private readonly handleNumberChange = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const property = this.selectedView()?.properties.find(
      (candidate) => candidate.key === input.dataset.propertyKey,
    );
    if (property !== undefined) {
      input.value = resolveViewTypePropertyValue(property, input.value);
    }
    this.commit();
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
    void this.persistBinding(queryId, binding)
      .then(() => {
        // The query is now bound, so hand off to edit mode where it can be reconfigured or removed.
        // The layout change is the confirmation; a "Saved." line here would only overwrite the
        // notice naming a required setting the new view still needs.
        this.enterEdit(queryId);
      })
      .catch((error: unknown) => {
        this.reportFailure("Could not save the query enhancement.", error);
        this.elements.addSaveButton.disabled = false;
      });
  };

  private async persistBinding(queryId: string, binding: QueryBinding): Promise<void> {
    await this.publishBindings({ ...this.bindings, [queryId]: binding });
    await this.store.bind(queryId, binding);
    this.bindings[queryId] = binding;
  }

  private readonly handleDelete = (): void => {
    const queryId = this.selectedQueryId;
    if (queryId === null) {
      return;
    }
    if (this.shared.has(queryId)) {
      this.removeSharedLink(queryId);
      return;
    }
    if (this.editing === undefined) {
      return;
    }
    const nextBindings = { ...this.bindings };
    delete nextBindings[queryId];
    this.removeQuery(queryId, {
      remove: async () => {
        await this.publishBindings(nextBindings);
        await this.store.unbind(queryId);
        delete this.bindings[queryId];
      },
      success: "Deleted.",
      failure: "Could not delete the query enhancement.",
    });
  };

  /** Stop reading a query's configuration from its publisher's work item. */
  private removeSharedLink(queryId: string): void {
    const access = this.sharedQueries;
    if (access === undefined) {
      return;
    }
    this.removeQuery(queryId, {
      remove: async () => {
        await access.sources.unlink(queryId);
        this.shared.delete(queryId);
      },
      success: "Removed the shared link.",
      failure: "Could not remove the shared link.",
    });
  }

  /**
   * Drop one query from the tab, whichever kind it was, and leave the picker on a valid selection.
   *
   * The selection to move to is computed BEFORE the removal, while the query is still in the list:
   * afterwards there is no position left to reason from.
   */
  private removeQuery(
    queryId: string,
    step: { remove: () => Promise<void>; success: string; failure: string },
  ): void {
    const nextQueryId = this.queryIdAfter(queryId);
    this.elements.deleteButton.disabled = true;
    void step
      .remove()
      .then(() => {
        this.queryNames.delete(queryId);
        this.editing = undefined;
        if (nextQueryId !== null) {
          // Move to the query that took the removed one's place so the picker stays valid.
          this.renderQueryOptions();
          this.selectQuery(nextQueryId);
        } else {
          // Nothing is left, and a new binding must start from a query's page, so show guidance.
          this.enterEmpty();
        }
        this.setStatus(step.success);
      })
      .catch((error: unknown) => {
        this.reportFailure(step.failure, error);
        this.elements.deleteButton.disabled = false;
      });
  }

  /** The query to select after removing `queryId`: the next one in order, else the last remaining. */
  private queryIdAfter(queryId: string): string | null {
    const ids = this.allQueryIds();
    const index = ids.indexOf(queryId);
    const remaining = ids.filter((id) => id !== queryId);
    if (remaining.length === 0) {
      return null;
    }
    return remaining[Math.min(index, remaining.length - 1)] ?? null;
  }
}

/** A property the bound query can pre-fill, narrowed so its source can be looked up directly. */
function isDerivedProperty(
  property: ViewTypeProperty,
): property is ViewTypeProperty & { derivedFrom: ViewTypeDerivedSource } {
  return property.derivedFrom !== undefined;
}

/**
 * The folder picker's busy indicator, which sits INSIDE the field's trailing edge: the suggestion
 * list covers everything below the input, and a folder is fetched exactly while that list is open.
 * Purely visual — the input's `aria-busy` is what carries the state to assistive technology.
 */
function createFolderSpinner(doc: Document): HTMLElement {
  const spinner = doc.createElement("span");
  spinner.className = "combobox__loading";
  spinner.title = "Loading folders";
  spinner.setAttribute("aria-hidden", "true");
  return spinner;
}

/** One label plus the published value, for a query whose configuration the user cannot change. */
function createReadOnlyPropertyField(
  doc: Document,
  property: ViewTypeProperty,
  stored: string | undefined,
): HTMLElement {
  const setting = doc.createElement("div");
  setting.className = "setting";
  const field = doc.createElement("div");
  field.className = "field";
  const label = doc.createElement("span");
  label.className = "field__label";
  label.textContent = property.label;
  const value = doc.createElement("output");
  value.className = "binding__readonly";
  value.textContent = describePropertyValue(property, stored);
  field.append(label, value);
  setting.append(field);
  if (property.hint !== undefined) {
    const hint = doc.createElement("p");
    hint.className = "field__hint";
    hint.textContent = property.hint;
    setting.append(hint);
  }
  return setting;
}

/** The published value as the user reads it, not as it is stored. */
function describePropertyValue(property: ViewTypeProperty, stored: string | undefined): string {
  const value = resolveViewTypePropertyValue(property, stored);
  const kind = viewTypePropertyKind(property);
  if (kind === "select") {
    return property.options?.find((option) => option.value === value)?.label ?? value;
  }
  if (kind === "area-path-list") {
    const paths = value.split(/\r?\n/).filter((path) => path.trim().length > 0);
    return paths.length === 0 ? "None" : paths.join(", ");
  }
  return value.length === 0 ? "Not set" : value;
}

function propertyDescription(property: ViewTypeProperty): string {
  return property.hint ?? "";
}
