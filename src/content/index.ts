import {
  OPEN_BINDING_SETTINGS_MESSAGE,
  OPEN_OPTIONS_MESSAGE,
  type OpenBindingSettingsMessage,
  type OpenOptionsMessage,
} from "../common/bindings/BindingRequest";
import type { ActiveView } from "../common/bindings/QueryBinding";
import { createQueryBindingStore } from "../common/bindings/createQueryBindingStore";
import { type AdoThemeResponse, isAdoThemeRequest } from "../common/navigation/AdoContext";
import { isAdoNavigationMessage } from "../common/navigation/AdoQueryRoute";
import { isAdoConfigured } from "../common/settings/ExtensionSettings";
import { createSettingsStore } from "../common/settings/createSettingsStore";

import { detectAdoQueryName } from "./AdoQueryNameProbe";
import { detectAdoTheme } from "./AdoThemeProbe";
import { BindingButton } from "./BindingButton";
import { BindingMenu } from "./BindingMenu";
import { PageBlanker } from "./PageBlanker";
import { type QueryMenuActions, QueryBindingController } from "./QueryBindingController";
import { QueryPageController } from "./QueryPageController";

// Performance posture: this script is injected on every hosted ADO page, because host-wide
// injection is the only way to catch SPA navigation into a Query route (see navigation/README.md).
// It must therefore stay light on pages that are not queries. The only always-on cost is the two
// synced-storage observers and the one runtime message listener wired below — no DOM scanning, no
// MutationObserver, and no blanking happen off a Query route. Every heavier action is gated behind a
// parsed query id: PageBlanker paints only when QueryPageController.shouldEnhance() is true, and the
// top-bar button's MutationObserver is created only when QueryBindingController sees a query id (see
// BindingButton.show). The theme probe runs only when the options page asks for it; the query-name
// probe runs only when the user starts a bind from the top-bar button.
const store = createSettingsStore();
const controller = new QueryPageController(new PageBlanker(document), location.href);

const bindingStore = createQueryBindingStore();

// A content script cannot open extension pages itself, so both the general options page and the
// per-query binding form are requested from the background service worker. Rejections are surfaced
// (rather than silently swallowed) so a broken round-trip is diagnosable instead of "nothing
// happens" — e.g. after the extension is reloaded but this page's script was not.
const openExtensionPage = (message: OpenOptionsMessage | OpenBindingSettingsMessage): void => {
  void chrome.runtime.sendMessage(message).catch((error: unknown) => {
    console.error("AwesomeADO could not open its extension page", error);
  });
};

const actions: QueryMenuActions = {
  openOptions() {
    openExtensionPage({ type: OPEN_OPTIONS_MESSAGE });
  },
  enableEnhancedView(queryId) {
    // Capture the query name from this page now, while the content script is on it, so the binding
    // form can show a read-only name without re-scraping ADO from the options tab.
    const message: OpenBindingSettingsMessage = {
      type: OPEN_BINDING_SETTINGS_MESSAGE,
      queryId,
      queryName: detectAdoQueryName(document) ?? undefined,
    };
    openExtensionPage(message);
  },
  disableEnhancedView(queryId) {
    void bindingStore.unbind(queryId);
  },
  setActiveView(queryId: string, active: ActiveView) {
    // The store owns the read-modify-write so a concurrent change to this binding's other fields is
    // preserved; this wiring just forwards the user's view choice.
    void bindingStore.setActiveView(queryId, active);
  },
};

const bindingController = new QueryBindingController(
  new BindingButton(document, chrome.runtime.getURL("icons/icon.svg"), "Enhance with AwesomeADO"),
  new BindingMenu(document),
  actions,
  location.href,
);

const observation = store.observe((settings) => {
  controller.applySettings(settings);
  // The menu's check marks resolve a bound query's default presentation from this same setting.
  bindingController.applyDefaultView(settings.defaultView);
  // Incomplete ADO settings force bound queries back to ADO's view, so the menu hides the swap
  // options; the same snapshot the blanker uses drives that decision.
  bindingController.applyConfigured(isAdoConfigured(settings));
});
void observation.ready.catch((error: unknown) => {
  observation.unsubscribe();
  console.error("AwesomeADO could not read synced settings", error);
});

const bindingObservation = bindingStore.observe((bindings) => {
  // The same snapshot drives the button's menu and the per-query blanking decision.
  bindingController.applyBindings(bindings);
  controller.applyBindings(bindings);
});
void bindingObservation.ready.catch((error: unknown) => {
  bindingObservation.unsubscribe();
  console.error("AwesomeADO could not read synced query bindings", error);
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (isAdoNavigationMessage(message)) {
    controller.navigate(message.url);
    bindingController.navigate(message.url);
    return;
  }
  // The options page asks this ADO tab which theme it is rendering so it can resolve "auto".
  if (isAdoThemeRequest(message)) {
    const response: AdoThemeResponse = { theme: detectAdoTheme(document) };
    sendResponse(response);
    return;
  }
});
