import { buildSprintWindow } from "../common/ado/sprintWindow";
import {
  OPEN_BINDING_SETTINGS_MESSAGE,
  OPEN_OPTIONS_MESSAGE,
  type OpenBindingSettingsMessage,
  type OpenOptionsMessage,
} from "../common/bindings/BindingRequest";
import type { ActiveView } from "../common/bindings/QueryBinding";
import { createQueryBindingStore } from "../common/bindings/createQueryBindingStore";
import {
  type SearchAdoIdentitiesMessage,
  type SearchAdoIdentitiesResponse,
} from "../common/browser/AdoIdentityRequest";
import {
  type LoadTeamIterationsMessage,
  type LoadTeamIterationsResponse,
} from "../common/browser/AdoIterationsRequest";
import {
  type LoadQueryTreeMessage,
  type LoadQueryTreeResponse,
} from "../common/browser/AdoTreeRequest";
import {
  type ReconcileFeatureCrewMessage,
  type ReconcileFeatureCrewResponse,
} from "../common/browser/FeatureCrewRequest";
import {
  MessagingFeatureCrewWriter,
  type SendReconcileRequest,
} from "../common/browser/MessagingFeatureCrewWriter";
import {
  MessagingTeamIterationsLoader,
  type SendIterationsRequest,
} from "../common/browser/MessagingTeamIterationsLoader";
import {
  MessagingUserDirectory,
  type SendIdentitySearchRequest,
} from "../common/browser/MessagingUserDirectory";
import {
  MessagingWorkItemFieldWriter,
  type SendUpdateFieldRequest,
} from "../common/browser/MessagingWorkItemFieldWriter";
import {
  MessagingWorkItemTreeLoader,
  type SendTreeRequest,
} from "../common/browser/MessagingWorkItemTreeLoader";
import {
  type UpdateWorkItemFieldMessage,
  type UpdateWorkItemFieldResponse,
} from "../common/browser/WorkItemFieldRequest";
import { createLoggerFactory } from "../common/logging/createLogger";
import { type AdoThemeResponse, isAdoThemeRequest } from "../common/navigation/AdoContext";
import { isAdoNavigationMessage } from "../common/navigation/AdoQueryRoute";
import type { ExtensionSettings } from "../common/settings/ExtensionSettings";
import { DEFAULT_SETTINGS, isAdoConfigured } from "../common/settings/ExtensionSettings";
import { createSettingsStore } from "../common/settings/createSettingsStore";
import type { EnhancedViewServices } from "../common/view-common/EnhancedView";

import { SessionActiveViewOverrides } from "./active-view/SessionActiveViewOverrides";
import { detectAdoQueryName } from "./ado-probe/AdoQueryNameProbe";
import { detectAdoTheme } from "./ado-probe/AdoThemeProbe";
import { BindingButton } from "./query-binding/BindingButton";
import { BindingMenu } from "./query-binding/BindingMenu";
import {
  type QueryMenuActions,
  QueryBindingController,
} from "./query-binding/QueryBindingController";
import { EnhancedViewSurface } from "./query-page/EnhancedViewSurface";
import { QueryPageController } from "./query-page/QueryPageController";

// Performance posture: this script is injected on every hosted ADO page, because host-wide
// injection is the only way to catch SPA navigation into a Query route (see navigation/README.md).
// It must therefore stay light on pages that are not queries. The only always-on cost is the two
// synced-storage observers and the one runtime message listener wired below — no DOM scanning, no
// MutationObserver, and no blanking happen off a Query route. Every heavier action is gated behind a
// parsed query id: PageBlanker paints only when QueryPageController's enhance decision is true, and
// the top-bar button's MutationObserver is created only when QueryBindingController sees a query id
// (see BindingButton.show). The theme probe runs only when the options page asks for it; the
// query-name probe runs only when the user starts a bind from the top-bar button.
//
// One logger factory backs every source in this context so all their lines share the same
// device-local diagnostics log (chrome.storage.local, never synced — see logging/README.md); each
// collaborator is stamped with the component folder that owns the emitting code — e.g.
// `content/query-page`, `common/settings`, or `content` for this composition-root wiring.
const loggers = createLoggerFactory();
const logger = loggers.forSource("content");

const store = createSettingsStore(loggers.forSource("common/settings"));

// Services the enhanced views depend on. The Project Tracking tree is fetched live: a content script
// cannot reach the credentialed ADO REST API from its isolated world, so the loader messages the
// background worker (which runs the MAIN-world fetch) and parses the raw bodies it returns — see
// common/browser/MessagingWorkItemTreeLoader. The type catalog and the tree's ETA fields are read
// from the latest synced settings (captured below); the sprint window is fetched live from the
// configured team's iterations; the user directory searches ADO's identity picker the same way; the
// clock is live; the logger is shared.
let latestSettings: ExtensionSettings | undefined;

// Rebuilt per load from the latest settings so a type's configured ETA date field is both requested
// from ADO and read back per type (an empty map means no type has an ETA field configured yet).
const etaFieldByType = (): ReadonlyMap<string, string> => {
  const map = new Map<string, string>();
  for (const type of latestSettings?.workItemTypes ?? []) {
    if (type.etaField) {
      map.set(type.name, type.etaField);
    }
  }
  return map;
};

const sendTreeRequest: SendTreeRequest = (message) =>
  chrome.runtime.sendMessage<LoadQueryTreeMessage, LoadQueryTreeResponse | undefined>(message);
const treeLoader = new MessagingWorkItemTreeLoader(
  sendTreeRequest,
  etaFieldByType,
  loggers.forSource("content/views"),
);

// The sprint picker's iteration list is fetched the same way the tree is: the isolated content world
// cannot reach the credentialed ADO REST API, so the loader messages the background worker (which
// runs the MAIN-world fetch) and parses the raw body it returns.
const sendIterationsRequest: SendIterationsRequest = (message) =>
  chrome.runtime.sendMessage<LoadTeamIterationsMessage, LoadTeamIterationsResponse | undefined>(
    message,
  );
const iterationsLoader = new MessagingTeamIterationsLoader(
  sendIterationsRequest,
  loggers.forSource("content/views"),
);

// The roster write mirrors the tree read: the isolated content world cannot reach the credentialed
// ADO REST API, so the writer messages the background worker (which runs the MAIN-world fetch).
const sendReconcileRequest: SendReconcileRequest = (message) =>
  chrome.runtime.sendMessage<ReconcileFeatureCrewMessage, ReconcileFeatureCrewResponse | undefined>(
    message,
  );
const featureCrewWriter = new MessagingFeatureCrewWriter(
  sendReconcileRequest,
  loggers.forSource("content/views"),
);

// The field write mirrors the tree read and roster write: the isolated content world cannot reach
// the credentialed ADO REST API, so the writer messages the background worker (which runs the
// MAIN-world PATCH with the user's session cookies).
const sendUpdateFieldRequest: SendUpdateFieldRequest = (message) =>
  chrome.runtime.sendMessage<UpdateWorkItemFieldMessage, UpdateWorkItemFieldResponse | undefined>(
    message,
  );
const workItemFieldWriter = new MessagingWorkItemFieldWriter(
  sendUpdateFieldRequest,
  loggers.forSource("content/views"),
);

// The people picker resolves names against ADO's own identity directory the same way: the isolated
// content world cannot reach the credentialed REST API, so the directory messages the background
// worker (which runs the MAIN-world search with the user's session cookies).
const sendIdentitySearchRequest: SendIdentitySearchRequest = (message) =>
  chrome.runtime.sendMessage<SearchAdoIdentitiesMessage, SearchAdoIdentitiesResponse | undefined>(
    message,
  );
const userDirectory = new MessagingUserDirectory(
  sendIdentitySearchRequest,
  loggers.forSource("content/views"),
);

const trackingServices: EnhancedViewServices = {
  loadTree: (queryId) => treeLoader.loadTree(queryId),
  featureCrew: featureCrewWriter,
  userDirectory,
  getTypes: () =>
    (latestSettings?.workItemTypes ?? []).map((t) => ({
      name: t.name,
      color: t.color,
      icon: t.icon,
      etaField: t.etaField ?? null,
      columns: t.columns.map((c) => ({ column: c.column, states: [...c.states] })),
    })),
  getBoardColumns: () => [...(latestSettings?.boardColumns ?? [])],
  loadSprintWindow: async () => {
    // The iteration list is team-scoped in ADO, so a team must be configured before there is
    // anything to fetch; without one the picker simply shows nothing. The team's stable id is used
    // for the URL segment because it is GUID-safe, unlike a display name that may contain spaces.
    const team = latestSettings?.currentTeam ?? null;
    if (team === null || team.id.trim().length === 0) {
      return { entries: [], currentName: null };
    }
    const iterations = await iterationsLoader.loadIterations(team.id);
    return buildSprintWindow(iterations, {
      pastCount: latestSettings?.pastSprintsCount ?? DEFAULT_SETTINGS.pastSprintsCount,
      futureCount: latestSettings?.futureSprintsCount ?? DEFAULT_SETTINGS.futureSprintsCount,
    });
  },
  now: () => new Date(),
  logger: loggers.forSource("content/views"),
  writeField: (request) => workItemFieldWriter.writeField(request),
};

// The in-session view choice lives here, in memory only: switching a query between its enhanced view
// and ADO's standard page is deliberately not persisted, so a reopened browser returns every query
// to the configured default view (see content/active-view). Shared by the page controller (to decide
// what to render) and the top-bar menu (to check the active row and to write the user's choice).
const sessionActiveViews = new SessionActiveViewOverrides();
const controller = new QueryPageController(
  new EnhancedViewSurface(document, trackingServices),
  location.href,
  sessionActiveViews,
  loggers.forSource("content/query-page"),
);

const bindingStore = createQueryBindingStore(loggers.forSource("common/bindings"));

// A content script cannot open extension pages itself, so the general options page, the per-query
// binding form, and the Diagnostics log are all requested from the background service worker.
// Rejections are surfaced (rather than silently swallowed) so a broken round-trip is diagnosable
// instead of "nothing happens" — e.g. after the extension is reloaded but this page's script was not.
const openExtensionPage = (message: OpenOptionsMessage | OpenBindingSettingsMessage): void => {
  void chrome.runtime.sendMessage(message).catch((error: unknown) => {
    logger.error("Could not open its extension page", error);
  });
};

const actions: QueryMenuActions = {
  openOptions() {
    logger.info("Top-bar menu: open Options");
    openExtensionPage({ type: OPEN_OPTIONS_MESSAGE });
  },
  enableEnhancedView(queryId) {
    logger.info(`Top-bar menu: enable enhanced view for query ${queryId}`);
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
    logger.info(`Top-bar menu: disable enhanced view for query ${queryId}`);
    void bindingStore.unbind(queryId);
  },
  setActiveView(queryId: string, active: ActiveView) {
    logger.info(`Top-bar menu: switch query ${queryId} to ${active} view for this session`);
    // Not persisted on purpose: the choice lives only in this session's in-memory override, so
    // reopening the browser returns the query to the configured default view. Nudge the page
    // controller to re-render immediately; the menu re-reads the override the next time it opens.
    sessionActiveViews.set(queryId, active);
    controller.applyActiveViewOverride();
  },
  viewLog() {
    logger.info("Top-bar menu: view log");
    openExtensionPage({ type: OPEN_OPTIONS_MESSAGE, section: "diagnostics" });
  },
};

const bindingController = new QueryBindingController(
  new BindingButton(document, chrome.runtime.getURL("icons/icon.svg"), "Enhance with AwesomeADO"),
  new BindingMenu(document),
  actions,
  location.href,
  sessionActiveViews,
  loggers.forSource("content/query-binding"),
);

const observation = store.observe((settings) => {
  latestSettings = settings;
  controller.applySettings(settings);
  // The menu's check marks resolve a bound query's default presentation from this same setting.
  bindingController.applyDefaultView(settings.defaultView);
  // Incomplete ADO settings force bound queries back to ADO's view, so the menu hides the swap
  // options; the same snapshot the blanker uses drives that decision.
  bindingController.applyConfigured(isAdoConfigured(settings));
});
void observation.ready.catch((error: unknown) => {
  observation.unsubscribe();
  logger.error("Could not read synced settings", error);
});

const bindingObservation = bindingStore.observe((bindings) => {
  // The same snapshot drives the button's menu and the per-query blanking decision.
  bindingController.applyBindings(bindings);
  controller.applyBindings(bindings);
});
void bindingObservation.ready.catch((error: unknown) => {
  bindingObservation.unsubscribe();
  logger.error("Could not read synced query bindings", error);
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
