import {
  type ActiveView,
  type QueryBindings,
  resolveActiveView,
} from "../common/bindings/QueryBinding";
import { getViewType } from "../common/bindings/ViewType";
import { parseAdoQueryId } from "../common/navigation/AdoQueryRoute";
import { DEFAULT_SETTINGS, type DefaultView } from "../common/settings/ExtensionSettings";

import type { BindingButton } from "./BindingButton";
import type { BindingMenu, MenuEntry } from "./BindingMenu";

/**
 * The actions the top-bar menu can trigger. Injected (Dependency Inversion) so this controller
 * stays free of chrome APIs and the binding store, and can be unit-tested with plain spies.
 */
export interface QueryMenuActions {
  /** Open the general options page. */
  openOptions(): void;
  /** Begin binding this query — opens the options binding form for it. */
  enableEnhancedView(queryId: string): void;
  /** Remove this query's binding. */
  disableEnhancedView(queryId: string): void;
  /** Switch a bound query between its enhanced view and ADO's standard view. */
  setActiveView(queryId: string, active: ActiveView): void;
}

const STANDARD_VIEW_LABEL = "Standard View";

/**
 * Owns the top-bar button's visibility policy and the menu it opens.
 *
 * The button appears on any single-query ADO route (bound or not) and toggles a popup menu whose
 * contents depend on the query's binding: an unbound query offers to enable the enhanced view,
 * while a bound query can switch between its view and ADO's standard view or be unbound. Kept
 * separate from BindingButton and BindingMenu (Single Responsibility): those own DOM, this owns the
 * policy and reacts to navigation and binding changes.
 */
export class QueryBindingController {
  private queryId: string | null;
  private bindings: QueryBindings | undefined;
  private buttonShown = false;
  // Mirror the shipped default until the first settings snapshot arrives, so a bound query's menu
  // check marks resolve the same way the page blanker does. Derived from DEFAULT_SETTINGS rather
  // than hardcoded so the default view lives in exactly one place.
  private defaultEnhanced = DEFAULT_SETTINGS.defaultView === "enhanced";

  constructor(
    private readonly button: BindingButton,
    private readonly menu: BindingMenu,
    private readonly actions: QueryMenuActions,
    url: string,
  ) {
    this.queryId = parseAdoQueryId(url);
  }

  navigate(url: string): void {
    this.queryId = parseAdoQueryId(url);
    // A menu built for the previous route would act on the wrong query, so drop it on navigation.
    this.menu.close();
    this.refresh();
  }

  applyBindings(bindings: QueryBindings): void {
    this.bindings = bindings;
    // Close rather than live-patch: the next open rebuilds from the fresh snapshot, so the menu can
    // never show a stale bound/unbound state (e.g. right after the user toggles it).
    this.menu.close();
    this.refresh();
  }

  /**
   * Track the global default view so a bound query with no explicit override shows the correct
   * check mark. Closes any open menu so it rebuilds against the new default.
   */
  applyDefaultView(defaultView: DefaultView): void {
    this.defaultEnhanced = defaultView === "enhanced";
    this.menu.close();
  }

  private refresh(): void {
    // Hold off until the first binding snapshot arrives, so the button's menu never opens against an
    // unknown binding state.
    if (this.bindings === undefined) {
      return;
    }
    if (this.queryId === null) {
      if (this.buttonShown) {
        this.button.hide();
        this.buttonShown = false;
      }
      return;
    }
    if (!this.buttonShown) {
      // The handler reads live state each time, so one stable wiring covers every query and binding.
      this.button.show((anchor) => this.toggleMenu(anchor));
      this.buttonShown = true;
    }
  }

  private toggleMenu(anchor: HTMLElement): void {
    if (this.menu.isOpen) {
      this.menu.close();
      return;
    }
    this.menu.open(anchor, this.buildEntries());
  }

  private buildEntries(): MenuEntry[] {
    const queryId = this.queryId;
    if (queryId === null || this.bindings === undefined) {
      return [];
    }
    const binding = this.bindings[queryId];
    if (binding === undefined) {
      return [
        { kind: "item", label: "Options", onSelect: () => this.actions.openOptions() },
        {
          kind: "item",
          label: "Enable Enhanced View",
          onSelect: () => this.actions.enableEnhancedView(queryId),
        },
      ];
    }
    // Preserve a binding whose view id this build does not recognize by showing the raw id.
    const viewLabel = getViewType(binding.view)?.label ?? binding.view;
    const active = resolveActiveView(binding.active, this.defaultEnhanced);
    return [
      {
        kind: "item",
        label: viewLabel,
        checked: active === "enhanced",
        onSelect: () => this.actions.setActiveView(queryId, "enhanced"),
      },
      {
        kind: "item",
        label: STANDARD_VIEW_LABEL,
        checked: active === "standard",
        onSelect: () => this.actions.setActiveView(queryId, "standard"),
      },
      { kind: "separator" },
      { kind: "item", label: "Options", onSelect: () => this.actions.openOptions() },
      {
        kind: "item",
        label: "Disable Enhanced View",
        onSelect: () => this.actions.disableEnhancedView(queryId),
      },
    ];
  }
}
