import {
  buildFeatureCrewUrls,
  FEATURE_CREW_AFFECTED_BY_REL,
  FEATURE_CREW_STATE,
  FEATURE_CREW_TITLE,
  formatFeatureCrewDescription,
  applyTagAssignments,
  mergeFeatureCrew,
  parseFeatureCrewDescription,
  type FeatureCrewMember,
  type FeatureCrewUrls,
} from "../common/ado/FeatureCrew";
import { buildAdoIterationsUrl } from "../common/ado/TeamIteration";
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
  type FeatureCrewApplyConfig,
  type FeatureCrewApplyResult,
} from "../common/browser/applyFeatureCrewInPage";
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
    const found = firstScriptResult<{ id: number; rev: number; description: string }>(findResults);

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
    const applied = firstScriptResult<FeatureCrewApplyResult>(applyResults);
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
// frame that returned nothing) to null so every caller reads one shape.
function firstScriptResult<T>(results: { result?: unknown }[]): T | null {
  return (results[0]?.result as T | undefined) ?? null;
}

// Merge the currently-assigned people into whatever roster already exists (a brand-new item starts
// empty), then stamp any hand-picked tag choices onto it. Either a new person or a moved tag is a
// reason to write, surfaced as `changed`.
function reconcileFeatureCrewRoster(
  found: { description: string } | null,
  message: ReconcileFeatureCrewMessage,
): { members: FeatureCrewMember[]; description: string; changed: boolean } {
  const existing = found === null ? [] : parseFeatureCrewDescription(found.description);
  const merged = mergeFeatureCrew(existing, message.assignees);
  const tagged = applyTagAssignments(merged.members, message.tagAssignments ?? []);
  return {
    members: tagged.members,
    description: formatFeatureCrewDescription(tagged.members),
    changed: merged.changed || tagged.changed,
  };
}

// Build the apply config: a missing item is created (two-step, since ADO rejects a direct create
// into "Removed"), an existing one is patched by id.
function buildFeatureCrewApplyConfig(
  found: { id: number } | null,
  urls: FeatureCrewUrls,
  description: string,
): FeatureCrewApplyConfig {
  if (found === null) {
    return {
      mode: "create",
      url: urls.createUrl,
      description,
      title: FEATURE_CREW_TITLE,
      state: FEATURE_CREW_STATE,
      rootRelationUrl: urls.rootRelationUrl,
      affectedByRel: FEATURE_CREW_AFFECTED_BY_REL,
      itemBaseUrl: urls.itemBaseUrl,
    };
  }
  return {
    mode: "update",
    url: `${urls.itemBaseUrl}/${found.id}?api-version=7.1`,
    description,
  };
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
// the SENDER's own trusted tab URL (never a content-supplied one — this stays a closed "update this
// item's field" operation scoped to the sender's own tab), run the JSON Patch with an
// optimistic-concurrency rev test, and hand back the result (success + new rev, or a failure).
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
