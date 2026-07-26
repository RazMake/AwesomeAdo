import {
  buildFeatureCrewUrls,
  FEATURE_CREW_AFFECTED_BY_REL,
  FEATURE_CREW_STATE,
  FEATURE_CREW_TITLE,
} from "../common/ado/FeatureCrew";
import { buildAdoIterationsUrl } from "../common/ado/TeamIteration";
import { buildAdoIdentitySearchRequest } from "../common/ado/fetchAdoIdentities";
import {
  buildAdoTreeUrls,
  buildWorkItemUpdateUrl,
  type AdoRawTree,
} from "../common/ado/fetchAdoTree";
import {
  buildFeatureCrewApplyConfig,
  parseFeatureCrewLookup,
  reconcileFeatureCrewRoster,
} from "../common/ado/reconcileFeatureCrew";
import {
  bindingSettingsPath,
  isOpenBindingSettingsMessage,
  isOpenOptionsMessage,
  optionsPath,
  REVEAL_BINDING_SETTINGS_MESSAGE,
  REVEAL_OPTIONS_SECTION_MESSAGE,
  type RevealBindingSettingsMessage,
  type RevealOptionsSectionMessage,
} from "../common/bindings/BindingRequest";
import {
  isSearchAdoIdentitiesMessage,
  type SearchAdoIdentitiesMessage,
  type SearchAdoIdentitiesResponse,
} from "../common/browser/AdoIdentityRequest";
import {
  isLoadTeamIterationsMessage,
  type LoadTeamIterationsMessage,
  type LoadTeamIterationsResponse,
} from "../common/browser/AdoIterationsRequest";
import {
  isLoadQueryTreeMessage,
  type LoadQueryTreeMessage,
  type LoadQueryTreeResponse,
} from "../common/browser/AdoTreeRequest";
import {
  isReconcileFeatureCrewMessage,
  type ReconcileFeatureCrewMessage,
  type ReconcileFeatureCrewResponse,
} from "../common/browser/FeatureCrewRequest";
import {
  isUpdateWorkItemFieldMessage,
  type UpdateWorkItemFieldMessage,
  type UpdateWorkItemFieldResponse,
} from "../common/browser/WorkItemFieldRequest";
import {
  applyFeatureCrewInPage,
  type FeatureCrewApplyResult,
} from "../common/browser/applyFeatureCrewInPage";
import {
  fetchAdoIdentitiesInPage,
  type AdoIdentitySearchOutcome,
} from "../common/browser/fetchAdoIdentitiesInPage";
import { fetchAdoIterationsInPage } from "../common/browser/fetchAdoIterationsInPage";
import { fetchAdoTreeInPage } from "../common/browser/fetchAdoTreeInPage";
import { findFeatureCrewInPage } from "../common/browser/findFeatureCrewInPage";
import { updateWorkItemFieldInPage } from "../common/browser/updateWorkItemFieldInPage";
import { createLoggerFactory } from "../common/logging/createLogger";
import { notifyNavigation } from "../common/navigation/NavigationNotifier";

const logger = createLoggerFactory().forSource("background");

const handleNavigation = (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
  void notifyNavigation(details, (tabId, message, options) =>
    chrome.tabs.sendMessage(tabId, message, options),
  );
};

chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(handleNavigation);

// The last options tab this worker opened. Reused so a second "Options"/"View Log" click focuses
// that tab instead of piling up duplicates. Held only in memory: if the worker is recycled the id
// is forgotten and the next click simply opens a fresh tab, which is harmless.
let lastOpenedOptionsTabId: number | undefined;

// The message an already-open options tab needs to reveal what a fresh tab would read from its URL:
// a section deep-link ("View Log") or the binding form for a specific query. Sent only on tab reuse.
type RevealMessage = RevealOptionsSectionMessage | RevealBindingSettingsMessage;

// Content scripts can't open an extension page, so the top-bar menu asks the service worker to open
// the options page. When an options tab this worker opened is still around we focus it and — for a
// deep-link like "View Log" or a query's "Enable Enhanced View" — tell it to switch/populate in
// place, because an already-loaded page won't re-read the target from a URL. Failures are logged
// rather than swallowed so a broken open is diagnosable instead of appearing to do nothing.
const openOptionsTab = (path: string, reveal?: RevealMessage): void => {
  void reuseOrOpenOptionsTab(path, reveal).catch((error: unknown) => {
    logger.error("Could not open the options page", error);
  });
};

const reuseOrOpenOptionsTab = async (path: string, reveal?: RevealMessage): Promise<void> => {
  if (lastOpenedOptionsTabId !== undefined) {
    const focused = await focusExistingOptionsTab(lastOpenedOptionsTabId, reveal);
    if (focused) {
      // Log the destination only — never `path`, which carries the query NAME. The diagnostics log
      // is exported and attached to bug reports, and AGENTS.md §9 requires query names to be
      // recorded by identifier, not by value (a title routinely names a team or a customer).
      logger.info("Revealed the options page in the existing tab");
      return;
    }
    // The tab was closed or is no longer ours; drop the stale id and fall through to a fresh open.
    lastOpenedOptionsTabId = undefined;
  }
  logger.info("Opening the options page");
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  lastOpenedOptionsTabId = tab.id;
};

// Returns true when the remembered tab still exists, is still showing the options page, and was
// focused (and, for a reveal, nudged to the requested section or query); false when the caller
// should open a new one instead.
const focusExistingOptionsTab = async (tabId: number, reveal?: RevealMessage): Promise<boolean> => {
  const optionsPrefix = chrome.runtime.getURL("options/");
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch {
    // The only expected reason `get` rejects is that the tab is gone, which is routine and is
    // exactly what the boolean return is for — so this is a recovery, not a swallowed error.
    logger.info(`The remembered options tab ${tabId} is gone; opening a fresh one`);
    return false;
  }
  // A settings tab is an ordinary tab the user can navigate away from. Reusing it blindly would
  // deliver the reveal message to whatever page is there now (our own ADO content script included),
  // which ignores it — so the click would steal focus, do nothing, and still log success.
  if (tab.url === undefined || !tab.url.startsWith(optionsPrefix)) {
    logger.info(`Tab ${tabId} is no longer the options page; opening a fresh one`);
    return false;
  }
  try {
    await chrome.tabs.update(tabId, { active: true });
    if (tab.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    if (reveal !== undefined) {
      await chrome.tabs.sendMessage(tabId, reveal);
    }
    return true;
  } catch (error: unknown) {
    // The tab exists and is ours, so a failure here is NOT the routine "tab was closed" case — it is
    // a real fault (e.g. the page has not registered its listener yet) and must not be reported as
    // if the tab had vanished.
    logger.error(`Could not reveal the options page in tab ${tabId}`, error);
    return false;
  }
};

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isOpenBindingSettingsMessage(message)) {
    openOptionsTab(bindingSettingsPath(message.queryId, message.queryName), {
      type: REVEAL_BINDING_SETTINGS_MESSAGE,
      queryId: message.queryId,
      queryName: message.queryName,
    });
    return;
  }
  if (isOpenOptionsMessage(message)) {
    // Forward the requested section (e.g. "diagnostics" for "View Log") so the page deep-links there.
    const reveal: RevealMessage | undefined =
      message.section !== undefined
        ? { type: REVEAL_OPTIONS_SECTION_MESSAGE, section: message.section }
        : undefined;
    openOptionsTab(optionsPath(message.section), reveal);
  }
});

// The Project Tracking view runs in a content script, which cannot reach the credentialed ADO REST
// API from its isolated world (CORS-blocked; a same-origin fetch from the extension page would drop
// ADO's SameSite session). Only a fetch in the ADO tab's MAIN (page) world is both same-origin and
// signed-in, so the view asks this worker to run it and hand the raw bodies back for parsing. The
// request URLs are built here from the SENDER's own trusted tab URL — never from a content-supplied
// URL — so this stays a closed "load this query's tree" operation, not a fetch-any-URL proxy.
const loadQueryTree = async (
  message: LoadQueryTreeMessage,
  tabId: number,
  tabUrl: string,
): Promise<LoadQueryTreeResponse> => {
  const urls = buildAdoTreeUrls(tabUrl, message.queryId);
  if (urls === null) {
    // A non-project ADO URL (org-level or folder tab) has no query to fetch; the view shows its
    // "could not load" state rather than the worker guessing a URL.
    logger.info(
      `Tree load skipped for query ${message.queryId}: tab is not a project-scoped ADO URL.`,
    );
    return { raw: null };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: fetchAdoTreeInPage,
      args: [urls.wiqlUrl, urls.batchUrl, message.fields, urls.queryUrl],
    });
    return { raw: (results[0]?.result as AdoRawTree | undefined) ?? null };
  } catch (error) {
    // Injection fails on a closed/navigated/restricted tab; report "no data" so the view degrades.
    logger.error(`Could not load query tree for ${message.queryId}`, error);
    return { raw: null };
  }
};

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isLoadQueryTreeMessage(message)) {
    // Not ours — leave it for the other listener above to handle.
    return undefined;
  }
  const tabId = sender.tab?.id;
  const tabUrl = sender.tab?.url;
  if (tabId === undefined || tabUrl === undefined) {
    // Only a real ADO tab can be scripted; a message with no sender tab cannot be served.
    logger.error(`Cannot load query tree for ${message.queryId}: message has no sender tab.`);
    sendResponse({ raw: null } satisfies LoadQueryTreeResponse);
    return undefined;
  }
  void loadQueryTree(message, tabId, tabUrl).then(sendResponse);
  // Keep the message channel open for the async fetch reply above.
  return true;
});

// A sprint-filtering view (e.g. Project Tracking) needs the team's iterations to build its picker,
// but the credentialed team-iterations fetch can only run in the ADO tab's MAIN world (same reason
// as the tree load). The content side names the team; the URL is built here from the SENDER's own
// trusted tab URL — never a content-supplied one — so this stays a closed "read this team's
// iterations" operation.
const loadTeamIterations = async (
  message: LoadTeamIterationsMessage,
  tabId: number,
  tabUrl: string,
): Promise<LoadTeamIterationsResponse> => {
  const iterationsUrl = buildAdoIterationsUrl(tabUrl, message.team);
  if (iterationsUrl === null) {
    // A non-project ADO URL (org-level or folder tab) or a blank team has no iterations to fetch.
    logger.info(
      `Iterations load skipped for team "${message.team}": tab is not a project-scoped ADO URL or team is blank.`,
    );
    return { raw: null };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: fetchAdoIterationsInPage,
      args: [iterationsUrl],
    });
    return { raw: results[0]?.result ?? null };
  } catch (error) {
    // Injection fails on a closed/navigated/restricted tab; report "no data" so the picker degrades.
    logger.error(`Could not load iterations for team "${message.team}"`, error);
    return { raw: null };
  }
};

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isLoadTeamIterationsMessage(message)) {
    // Not ours — leave it for the other listeners to handle.
    return undefined;
  }
  const tabId = sender.tab?.id;
  const tabUrl = sender.tab?.url;
  if (tabId === undefined || tabUrl === undefined) {
    // Only a real ADO tab can be scripted; a message with no sender tab cannot be served.
    logger.error(`Cannot load iterations for team "${message.team}": message has no sender tab.`);
    sendResponse({ raw: null } satisfies LoadTeamIterationsResponse);
    return undefined;
  }
  void loadTeamIterations(message, tabId, tabUrl).then(sendResponse);
  // Keep the message channel open for the async fetch reply above.
  return true;
});

// An assignee picker resolves people against Azure DevOps' own identity directory, which — like
// every other ADO read here — is only reachable from a credentialed MAIN-world fetch. The content
// side supplies just the typed text; the endpoint is derived from the SENDER's own trusted tab URL,
// so a content script can influence WHO is searched for but never WHERE the request goes.
const searchAdoIdentities = async (
  message: SearchAdoIdentitiesMessage,
  tabId: number,
  tabUrl: string,
): Promise<SearchAdoIdentitiesResponse> => {
  const request = buildAdoIdentitySearchRequest(tabUrl, message.query);
  if (request === null) {
    // Either the tab is not project-scoped or the query is too short to ask a directory about; the
    // picker keeps showing the suggestions it already holds. The typed text is NEVER logged — it is
    // a person's name, and the diagnostics log is exported into bug reports (AGENTS.md §9).
    logger.info(
      "Identity search skipped: tab is not a project-scoped ADO URL or query is too short.",
    );
    return { raw: null };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: fetchAdoIdentitiesInPage,
      args: [request.url, request.body],
    });
    const outcome = firstScriptResult(results) as AdoIdentitySearchOutcome | null;
    if (outcome === null || outcome.failure !== "none") {
      // A rejected request, an expired session and a dead network all used to arrive here as a bare
      // null, which the picker showed as "No people found." — indistinguishable from a real empty
      // result. The status plus the classification names which one it was; the typed text is still
      // never logged (it is a person's name, and the log is exported into bug reports).
      logger.error(
        `Identity search failed (${outcome?.failure ?? "no-result"}, HTTP ${outcome?.status ?? 0}).`,
      );
      return { raw: null };
    }
    return { raw: outcome.body };
  } catch (error) {
    // Injection fails on a closed/navigated/restricted tab; report "no data" so the picker degrades.
    logger.error("Could not search Azure DevOps identities", error);
    return { raw: null };
  }
};

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isSearchAdoIdentitiesMessage(message)) {
    // Not ours — leave it for the other listeners to handle.
    return undefined;
  }
  const { id: tabId, url: tabUrl } = sender.tab ?? {};
  if (tabId === undefined || tabUrl === undefined) {
    logger.error("Cannot search identities: message has no sender tab.");
    sendResponse({ raw: null } satisfies SearchAdoIdentitiesResponse);
    return undefined;
  }
  void searchAdoIdentities(message, tabId, tabUrl).then(sendResponse);
  // Keep the message channel open for the async fetch reply above.
  return true;
});

// The Project Tracking view keeps a per-project "Feature Crew" roster in a dedicated, permanently
// Removed work item (see common/ado/FeatureCrew). Like the tree load, the credentialed create/update
// can only run in the ADO tab's MAIN world, so the content side asks this worker to reconcile: find
// the existing item (or decide to create one), merge in any newly-assigned people while preserving
// the tags a developer set by hand, and write it back. The URLs are built here from the SENDER's own
// trusted tab URL — never a content-supplied one — so this stays a closed "reconcile this project's
// crew" operation, not a write-any-work-item proxy.
const reconcileFeatureCrew = async (
  message: ReconcileFeatureCrewMessage,
  tabId: number,
  tabUrl: string,
): Promise<ReconcileFeatureCrewResponse> => {
  const urls = buildFeatureCrewUrls(tabUrl, message.rootId, message.typeName);
  if (urls === null) {
    // A non-project ADO URL (org-level or folder tab) has no project to attach a crew item to.
    logger.info(
      `Feature Crew reconcile skipped for root ${message.rootId}: tab is not a project-scoped ADO URL.`,
    );
    return { ok: false, changed: false, error: "not a project-scoped ADO URL" };
  }
  try {
    const findResults = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: findFeatureCrewInPage,
      args: [
        urls.wiqlUrl,
        urls.itemBaseUrl,
        message.rootId,
        FEATURE_CREW_TITLE,
        message.typeName,
        FEATURE_CREW_STATE,
        FEATURE_CREW_AFFECTED_BY_REL,
      ],
    });
    const found = parseFeatureCrewLookup(firstScriptResult(findResults));

    const roster = reconcileFeatureCrewRoster(found, message);
    // When nothing new was added and no tag moved on an existing item there is nothing to write, so
    // the roster's hand-edited tags are left completely untouched.
    if (found !== null && !roster.changed) {
      return { ok: true, changed: false, id: found.id, members: roster.members };
    }

    const applyConfig = buildFeatureCrewApplyConfig(found, urls, roster.description);
    const applyResults = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: applyFeatureCrewInPage,
      args: [applyConfig],
    });
    const applied = firstScriptResult(applyResults) as FeatureCrewApplyResult | null;
    if (applied === null || applied.id === null) {
      // The MAIN-world write failed (e.g. a process rule blocking the transition into "Removed", or
      // a permission error); log the specific reason it reported and hand it back so the view degrades
      // with a real cause rather than a generic "write failed".
      const detail = applied?.error ?? "no result from the page";
      logger.error(
        `Feature Crew reconcile could not write the item for root ${message.rootId}: ${detail}.`,
      );
      return { ok: false, changed: false, error: detail };
    }
    logger.info(
      `Feature Crew reconciled for root ${message.rootId}: ${found === null ? "created" : "updated"} item ${applied.id}.`,
    );
    return { ok: true, changed: true, id: applied.id, members: roster.members };
  } catch (error) {
    // Injection fails on a closed/navigated/restricted tab; report the failure so the view degrades.
    logger.error(`Could not reconcile Feature Crew for root ${message.rootId}`, error);
    return { ok: false, changed: false, error: describeError(error) };
  }
};

// Reduce a thrown value to its human-readable message, preserving an Error's own message while still
// coping with non-Error throws, so failures surface a real cause instead of "[object Object]".
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Unwrap the single MAIN-world injection result, normalizing the "no result" cases (empty array or a
// frame that returned nothing) to null so every caller reads one shape. Deliberately returns
// `unknown`: the value was produced in the page's own realm, so the caller must shape-check it
// rather than have this helper hand back a type nobody verified.
function firstScriptResult(results: { result?: unknown }[]): unknown {
  return results[0]?.result ?? null;
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isReconcileFeatureCrewMessage(message)) {
    // Not ours — leave it for the other listeners above to handle.
    return undefined;
  }
  const tabId = sender.tab?.id;
  const tabUrl = sender.tab?.url;
  if (tabId === undefined || tabUrl === undefined) {
    // Only a real ADO tab can be scripted; a message with no sender tab cannot be served.
    logger.error(
      `Cannot reconcile Feature Crew for root ${message.rootId}: message has no sender tab.`,
    );
    sendResponse({
      ok: false,
      changed: false,
      error: "no sender tab",
    } satisfies ReconcileFeatureCrewResponse);
    return undefined;
  }
  void reconcileFeatureCrew(message, tabId, tabUrl).then(sendResponse);
  // Keep the message channel open for the async fetch reply above.
  return true;
});

// An enhanced view can persist a work item field change back to Azure DevOps (e.g. its status or
// its ETA date). Like the tree load and Feature Crew reconcile, the credentialed PATCH can only run
// in the ADO tab's MAIN world, so the content side asks this worker to update: build the URL from
// the SENDER's own trusted tab URL (never a content-supplied one), run the JSON Patch with an
// optimistic-concurrency rev test, and hand back the result (success + new rev, or a failure).
//
// The operation is closed in three independent ways: the collection comes from the sender's own tab,
// the field name must match an ADO reference-name shape (`isUpdateWorkItemFieldMessage`), and the
// patch path is rooted at `/fields/` so it cannot address `/rev` or `/relations`. The item id is
// still caller-chosen within that collection — the same items the sender's own page could already
// PATCH with its own session.
const updateWorkItemField = async (
  message: UpdateWorkItemFieldMessage,
  tabId: number,
  tabUrl: string,
): Promise<UpdateWorkItemFieldResponse> => {
  const updateUrl = buildWorkItemUpdateUrl(tabUrl, message.id);
  if (updateUrl === null) {
    // A non-ADO URL (or an unresolvable one) has no collection base to build the update URL from.
    logger.info(`Work item ${message.id} field update skipped: tab is not a supported ADO URL.`);
    return { ok: false, error: "not a supported ADO URL" };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: updateWorkItemFieldInPage,
      args: [updateUrl, message.id, message.rev, message.field, message.value],
    });
    const result = (results[0]?.result as UpdateWorkItemFieldResponse | undefined) ?? null;
    if (result === null) {
      logger.error(`Work item ${message.id} field update returned no result.`);
      return { ok: false, error: "no result" };
    }
    if (result.ok === false) {
      logger.error(`Work item ${message.id} field update failed: ${result.error ?? "unknown"}.`);
    } else {
      logger.info(
        `Work item ${message.id} field ${message.field} updated, rev=${result.rev ?? "none"}.`,
      );
    }
    return result;
  } catch (error) {
    // Injection fails on a closed/navigated/restricted tab; report the failure.
    logger.error(`Could not update work item ${message.id} field`, error);
    return { ok: false, error: "exception" };
  }
};

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isUpdateWorkItemFieldMessage(message)) {
    // Not ours — leave it for the other listeners above to handle.
    return undefined;
  }
  const tabId = sender.tab?.id;
  const tabUrl = sender.tab?.url;
  if (tabId === undefined || tabUrl === undefined) {
    // Only a real ADO tab can be scripted; a message with no sender tab cannot be served.
    logger.error(`Cannot update work item ${message.id} field: message has no sender tab.`);
    sendResponse({ ok: false, error: "no sender tab" } satisfies UpdateWorkItemFieldResponse);
    return undefined;
  }
  void updateWorkItemField(message, tabId, tabUrl).then(sendResponse);
  // Keep the message channel open for the async PATCH reply above.
  return true;
});
