import {
  buildFeatureCrewUrls,
  FEATURE_CREW_AFFECTED_BY_REL,
  FEATURE_CREW_STATE,
  FEATURE_CREW_TITLE,
  formatFeatureCrewDescription,
  mergeFeatureCrew,
  parseFeatureCrewDescription,
} from "../common/ado/FeatureCrew";
import {
  buildAdoTreeUrls,
  buildWorkItemUpdateUrl,
  type AdoRawTree,
} from "../common/ado/fetchAdoTree";
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
  isUpdateWorkItemStateMessage,
  type UpdateWorkItemStateMessage,
  type UpdateWorkItemStateResponse,
} from "../common/browser/WorkItemStateRequest";
import {
  applyFeatureCrewInPage,
  type FeatureCrewApplyConfig,
} from "../common/browser/applyFeatureCrewInPage";
import { fetchAdoTreeInPage } from "../common/browser/fetchAdoTreeInPage";
import { findFeatureCrewInPage } from "../common/browser/findFeatureCrewInPage";
import { updateWorkItemStateInPage } from "../common/browser/updateWorkItemStateInPage";
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
      logger.info(`Revealed options page in existing tab: ${path}`);
      return;
    }
    // The tab was closed since we opened it; drop the stale id and fall through to a fresh open.
    lastOpenedOptionsTabId = undefined;
  }
  logger.info(`Opening options page: ${path}`);
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  lastOpenedOptionsTabId = tab.id;
};

// Returns true when the remembered tab still exists and was focused (and, for a reveal, nudged to
// the requested section or query); false when the tab is gone so the caller opens a new one.
const focusExistingOptionsTab = async (tabId: number, reveal?: RevealMessage): Promise<boolean> => {
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (tab?.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    if (reveal !== undefined) {
      await chrome.tabs.sendMessage(tabId, reveal);
    }
    return true;
  } catch {
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
      args: [urls.wiqlUrl, urls.batchUrl, message.fields],
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
    const found =
      (findResults[0]?.result as { id: number; rev: number; description: string } | undefined) ??
      null;

    // Merge the currently-assigned people into whatever roster already exists; a brand-new item
    // starts from an empty roster. When nothing new is added to an existing item there is nothing to
    // write, so the roster's hand-edited tags are left completely untouched.
    const existing = found === null ? [] : parseFeatureCrewDescription(found.description);
    const merged = mergeFeatureCrew(existing, message.assignees);
    if (found !== null && !merged.changed) {
      return { ok: true, changed: false, id: found.id };
    }
    const description = formatFeatureCrewDescription(merged.members);

    const applyConfig: FeatureCrewApplyConfig =
      found === null
        ? {
            mode: "create",
            url: urls.createUrl,
            description,
            title: FEATURE_CREW_TITLE,
            state: FEATURE_CREW_STATE,
            rootRelationUrl: urls.rootRelationUrl,
            affectedByRel: FEATURE_CREW_AFFECTED_BY_REL,
          }
        : {
            mode: "update",
            url: `${urls.itemBaseUrl}/${found.id}?api-version=7.1`,
            description,
          };
    const applyResults = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: applyFeatureCrewInPage,
      args: [applyConfig],
    });
    const applied = (applyResults[0]?.result as { id: number } | undefined) ?? null;
    if (applied === null) {
      // The MAIN-world write returns null on any non-ok response (e.g. a process rule blocking a
      // direct create in "Removed", or a permission error); report the failure so the view degrades.
      logger.error(`Feature Crew reconcile could not write the item for root ${message.rootId}.`);
      return { ok: false, changed: false, error: "write failed" };
    }
    logger.info(
      `Feature Crew reconciled for root ${message.rootId}: ${found === null ? "created" : "updated"} item ${applied.id}.`,
    );
    return { ok: true, changed: true, id: applied.id };
  } catch (error) {
    // Injection fails on a closed/navigated/restricted tab; report the failure so the view degrades.
    logger.error(`Could not reconcile Feature Crew for root ${message.rootId}`, error);
    return { ok: false, changed: false, error: "exception" };
  }
};

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

// An enhanced view can persist a work item's state change back to Azure DevOps. Like the tree load
// and Feature Crew reconcile, the credentialed PATCH can only run in the ADO tab's MAIN world, so
// the content side asks this worker to update: build the URL from the SENDER's own trusted tab URL
// (never a content-supplied one — this stays a closed "update this item's state" operation, not a
// write-any-field proxy), run the JSON Patch with an optimistic-concurrency rev test, and hand back
// the result (success + new rev, or a failure).
const updateWorkItemState = async (
  message: UpdateWorkItemStateMessage,
  tabId: number,
  tabUrl: string,
): Promise<UpdateWorkItemStateResponse> => {
  const updateUrl = buildWorkItemUpdateUrl(tabUrl, message.id);
  if (updateUrl === null) {
    // A non-ADO URL (or an unresolvable one) has no collection base to build the update URL from.
    logger.info(`Work item ${message.id} state update skipped: tab is not a supported ADO URL.`);
    return { ok: false, error: "not a supported ADO URL" };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: updateWorkItemStateInPage,
      args: [updateUrl, message.id, message.rev, message.state],
    });
    const result = (results[0]?.result as UpdateWorkItemStateResponse | undefined) ?? null;
    if (result === null) {
      logger.error(`Work item ${message.id} state update returned no result.`);
      return { ok: false, error: "no result" };
    }
    if (result.ok === false) {
      logger.error(`Work item ${message.id} state update failed: ${result.error ?? "unknown"}.`);
    } else {
      logger.info(
        `Work item ${message.id} state updated to ${message.state}, rev=${result.rev ?? "none"}.`,
      );
    }
    return result;
  } catch (error) {
    // Injection fails on a closed/navigated/restricted tab; report the failure.
    logger.error(`Could not update work item ${message.id} state`, error);
    return { ok: false, error: "exception" };
  }
};

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!isUpdateWorkItemStateMessage(message)) {
    // Not ours — leave it for the other listeners above to handle.
    return undefined;
  }
  const tabId = sender.tab?.id;
  const tabUrl = sender.tab?.url;
  if (tabId === undefined || tabUrl === undefined) {
    // Only a real ADO tab can be scripted; a message with no sender tab cannot be served.
    logger.error(`Cannot update work item ${message.id} state: message has no sender tab.`);
    sendResponse({ ok: false, error: "no sender tab" } satisfies UpdateWorkItemStateResponse);
    return undefined;
  }
  void updateWorkItemState(message, tabId, tabUrl).then(sendResponse);
  // Keep the message channel open for the async PATCH reply above.
  return true;
});
