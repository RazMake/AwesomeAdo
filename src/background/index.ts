import {
  buildFeatureCrewUrls,
  FEATURE_CREW_AFFECTED_BY_REL,
  FEATURE_CREW_STATE,
  FEATURE_CREW_TITLE,
} from "../common/ado/FeatureCrew";
import { buildAdoQueryDefinitionUrl } from "../common/ado/QueryDefinition";
import { buildAdoIterationsUrl } from "../common/ado/TeamIteration";
import { buildAdoTeamMembersUrl } from "../common/ado/TeamMembers";
import { IMPORTANCE_FIELD } from "../common/ado/adoApi";
import { buildAdoConnectionDataUrl } from "../common/ado/currentUser";
import { buildAdoIdentitySearchRequest } from "../common/ado/fetchAdoIdentities";
import {
  buildAdoTreeUrls,
  buildWorkItemUpdateUrl,
  type AdoRawTree,
} from "../common/ado/fetchAdoTree";
import {
  buildInterruptAcceptanceUrls,
  INTERRUPT_UPDATES_PAGE_SIZE,
  MAX_INTERRUPT_UPDATE_PAGES,
} from "../common/ado/fetchInterruptAcceptance";
import { buildNewestNoteUrl, MAX_NOTE_ACTIVITY_PAGES } from "../common/ado/fetchNoteActivity";
import {
  buildAddNoteUrl,
  buildEditNoteUrl,
  buildWorkItemNotesUrls,
} from "../common/ado/fetchWorkItemNotes";
import {
  buildAdoIdentityPickerRequest,
  MAX_MENTION_IDS,
  MENTION_REQUEST_CONCURRENCY,
} from "../common/ado/mentionIdentities";
import { applyRankFallback, buildWorkItemsBatchUrl } from "../common/ado/rankFallback";
import {
  buildFeatureCrewApplyConfig,
  parseFeatureCrewLookup,
  reconcileFeatureCrewRoster,
} from "../common/ado/reconcileFeatureCrew";
import {
  buildWorkItemLinkUrl,
  buildWorkItemRelationsUrl,
  buildWorkItemsOrderUrl,
  PARENT_LINK_TYPE,
} from "../common/ado/reorderWorkItems";
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
  isResolveAdoIdentityNamesMessage,
  type ResolveAdoIdentityNamesMessage,
  type ResolveAdoIdentityNamesResponse,
} from "../common/browser/AdoIdentityNamesRequest";
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
  isLoadQueryDefinitionMessage,
  LOAD_QUERY_DEFINITION_MESSAGE,
  loadQueryDefinitionMessageProblem,
  type LoadQueryDefinitionMessage,
  type LoadQueryDefinitionResponse,
} from "../common/browser/AdoQueryDefinitionRequest";
import {
  isLoadTeamMembersMessage,
  LOAD_TEAM_MEMBERS_MESSAGE,
  loadTeamMembersMessageProblem,
  type LoadTeamMembersMessage,
  type LoadTeamMembersResponse,
} from "../common/browser/AdoTeamMembersRequest";
import {
  isLoadQueryTreeMessage,
  type LoadQueryTreeMessage,
  type LoadQueryTreeResponse,
} from "../common/browser/AdoTreeRequest";
import {
  isReadCurrentUserMessage,
  READ_CURRENT_USER_MESSAGE,
  type ReadCurrentUserMessage,
  type ReadCurrentUserResponse,
} from "../common/browser/CurrentUserRequest";
import {
  isReconcileFeatureCrewMessage,
  type ReconcileFeatureCrewMessage,
  type ReconcileFeatureCrewResponse,
} from "../common/browser/FeatureCrewRequest";
import {
  READ_INTERRUPT_ACCEPTANCE_MESSAGE,
  readInterruptAcceptanceMessageProblem,
  type ReadInterruptAcceptanceMessage,
  type ReadInterruptAcceptanceResponse,
} from "../common/browser/InterruptAcceptanceRequest";
import {
  READ_NOTE_ACTIVITY_MESSAGE,
  readNoteActivityMessageProblem,
  type RawNoteActivity,
  type ReadNoteActivityMessage,
  type ReadNoteActivityResponse,
} from "../common/browser/NoteActivityRequest";
import { prepareReorderState, withPreparedState } from "../common/browser/ReorderStateChange";
import {
  isReadTeamConfigMessage,
  isReadTeamConfigResponse,
  isWriteTeamConfigMessage,
  isWriteTeamConfigResponse,
  READ_TEAM_CONFIG_MESSAGE,
  WRITE_TEAM_CONFIG_MESSAGE,
  type ReadTeamConfigMessage,
  type ReadTeamConfigResponse,
  type WriteTeamConfigMessage,
  type WriteTeamConfigResponse,
} from "../common/browser/TeamConfigRequest";
import {
  isUpdateWorkItemFieldMessage,
  type UpdateWorkItemFieldMessage,
  type UpdateWorkItemFieldResponse,
} from "../common/browser/WorkItemFieldRequest";
import {
  claimsMessageType,
  LOAD_WORK_ITEM_NOTES_MESSAGE,
  loadNotesMessageProblem,
  WRITE_WORK_ITEM_NOTE_MESSAGE,
  writeNoteMessageProblem,
  type LoadWorkItemNotesMessage,
  type LoadWorkItemNotesResponse,
  type RawWorkItemNotes,
  type WriteWorkItemNoteMessage,
  type WriteWorkItemNoteConfig,
  type WriteWorkItemNoteResponse,
} from "../common/browser/WorkItemNoteRequest";
import {
  describeReorderFailure,
  explainReorderRefusal,
  REORDER_WORK_ITEM_MESSAGE,
  reorderMessageProblem,
  type ReorderWorkItemMessage,
  type ReorderWorkItemResponse,
} from "../common/browser/WorkItemReorderRequest";
import {
  applyFeatureCrewInPage,
  type FeatureCrewApplyResult,
} from "../common/browser/applyFeatureCrewInPage";
import {
  executeAdoRequestInPage,
  type AdoPageRequestOutcome,
} from "../common/browser/executeAdoRequestInPage";
import {
  fetchAdoIdentitiesInPage,
  type AdoIdentitySearchOutcome,
} from "../common/browser/fetchAdoIdentitiesInPage";
import {
  fetchAdoIdentityNamesInPage,
  type AdoIdentityNamesOutcome,
} from "../common/browser/fetchAdoIdentityNamesInPage";
import { fetchAdoIterationsInPage } from "../common/browser/fetchAdoIterationsInPage";
import { fetchAdoTreeInPage } from "../common/browser/fetchAdoTreeInPage";
import { fetchNoteActivityInPage } from "../common/browser/fetchNoteActivityInPage";
import { fetchTeamConfigInPage } from "../common/browser/fetchTeamConfigInPage";
import { fetchWorkItemNotesInPage } from "../common/browser/fetchWorkItemNotesInPage";
import { findFeatureCrewInPage } from "../common/browser/findFeatureCrewInPage";
import { readInterruptAcceptance as readInterruptAcceptancePages } from "../common/browser/readInterruptAcceptance";
import { readWorkItemRanksInPage } from "../common/browser/readWorkItemRanksInPage";
import { readWorkItemRevInPage } from "../common/browser/readWorkItemRevInPage";
import {
  reorderWorkItemInPage,
  type ReorderWorkItemConfig,
} from "../common/browser/reorderWorkItemInPage";
import { tabRequestListener } from "../common/browser/tabRequestListener";
import { updateWorkItemFieldInPage } from "../common/browser/updateWorkItemFieldInPage";
import { writeTeamConfigInPage } from "../common/browser/writeTeamConfigInPage";
import { writeWorkItemNoteInPage } from "../common/browser/writeWorkItemNoteInPage";
import { writeWorkItemRanksInPage } from "../common/browser/writeWorkItemRanksInPage";
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
    // Forward the requested section (e.g. "diagnostics" for "View Log") so the page deep-links there,
    // along with the "errors only" request the board's failure chip sends so the log lands on the
    // failure the user clicked rather than on the newest informational lines.
    const reveal: RevealMessage | undefined =
      message.section !== undefined
        ? {
            type: REVEAL_OPTIONS_SECTION_MESSAGE,
            section: message.section,
            errorsOnly: message.errorsOnly,
          }
        : undefined;
    openOptionsTab(optionsPath(message.section, message.errorsOnly), reveal);
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
    const wiqlInit: RequestInit | null =
      message.wiql === undefined
        ? null
        : {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ query: message.wiql }),
          };
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: fetchAdoTreeInPage,
      args: [
        message.wiql === undefined ? urls.wiqlUrl : urls.executeWiqlUrl,
        urls.batchUrl,
        message.fields,
        urls.queryUrl,
        wiqlInit,
      ],
    });
    return { raw: (results[0]?.result as AdoRawTree | undefined) ?? null };
  } catch (error) {
    // Injection fails on a closed/navigated/restricted tab; report "no data" so the view degrades.
    logger.error(`Could not load query tree for ${message.queryId}`, error);
    return { raw: null };
  }
};

chrome.runtime.onMessage.addListener(
  tabRequestListener<LoadQueryTreeMessage, LoadQueryTreeResponse>(logger, {
    claims: isLoadQueryTreeMessage,
    unscriptable: (message) => ({
      log: `Cannot load query tree for ${message.queryId}: message has no sender tab.`,
      response: { raw: null },
    }),
    serve: loadQueryTree,
  }),
);

const writeTeamConfig = async (
  message: WriteTeamConfigMessage,
  tabId: number,
  tabUrl: string,
): Promise<WriteTeamConfigResponse> => {
  const url = buildWorkItemUpdateUrl(tabUrl, message.workItemId);
  if (url === null) {
    logger.error(
      `Cannot write team configuration work item ${message.workItemId}: unsupported sender tab location.`,
    );
    return { ok: false, error: "no supported sender tab" };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: writeTeamConfigInPage,
      args: [{ url, text: message.text }],
    });
    const response = firstScriptResult(results);
    if (!isWriteTeamConfigResponse(response)) {
      logger.error(
        `Team configuration work item ${message.workItemId} returned no valid write response.`,
      );
      return { ok: false, error: "no valid response" };
    }
    if (!response.ok) {
      logger.error(
        `Could not write team configuration work item ${message.workItemId}: ${response.error}`,
      );
    }
    return response;
  } catch (error: unknown) {
    logger.error(`Could not write team configuration work item ${message.workItemId}`, error);
    return { ok: false, error: `injection failed: ${String(error)}` };
  }
};

chrome.runtime.onMessage.addListener(
  tabRequestListener<WriteTeamConfigMessage, WriteTeamConfigResponse>(logger, {
    claims: (message) => claimsMessageType(message, WRITE_TEAM_CONFIG_MESSAGE),
    malformed: (message) =>
      isWriteTeamConfigMessage(message)
        ? null
        : {
            log: "Rejected malformed team configuration write request.",
            response: { ok: false, error: "invalid team configuration write" },
          },
    unscriptable: (message) => ({
      log: `Cannot write team configuration work item ${message.workItemId}: no supported sender tab.`,
      response: { ok: false, error: "no supported sender tab" },
    }),
    serve: writeTeamConfig,
  }),
);

// One credentialed page GET in the sender's own tab. Shared by every handler whose whole job is
// "read this URL as the signed-in user", so the injection shape and the "injection produced nothing"
// outcome are written once instead of once per operation.
const readInPage = async (tabId: number, url: string): Promise<AdoPageRequestOutcome> => {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: executeAdoRequestInPage,
    args: [{ operation: "read", url }],
  });
  return (
    (firstScriptResult(results) as AdoPageRequestOutcome | undefined) ?? {
      raw: null,
      status: 0,
      error: "MAIN-world injection returned no result",
    }
  );
};

const loadQueryDefinition = async (
  message: LoadQueryDefinitionMessage,
  tabId: number,
  tabUrl: string,
): Promise<LoadQueryDefinitionResponse> => {
  const queryUrl = buildAdoQueryDefinitionUrl(tabUrl, message.queryId);
  if (queryUrl === null) {
    const error = "sender tab URL is not a supported project-scoped ADO location";
    logger.error(`Could not build query-definition URL for ${message.queryId}: ${error}.`);
    return { raw: null, status: 0, error };
  }
  try {
    const outcome = await readInPage(tabId, queryUrl);
    if (outcome.raw === null) {
      logger.error(
        `Query-definition read failed for ${message.queryId}: ${outcome.error ?? `HTTP ${outcome.status}`}.`,
      );
    } else {
      logger.info(
        `Query-definition read completed for ${message.queryId} (HTTP ${outcome.status}).`,
      );
    }
    return outcome;
  } catch (error) {
    logger.error(`Could not load query definition for ${message.queryId}`, error);
    const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return { raw: null, status: 0, error: `injection failed: ${detail}` };
  }
};

chrome.runtime.onMessage.addListener(
  tabRequestListener<LoadQueryDefinitionMessage, LoadQueryDefinitionResponse>(logger, {
    claims: (message) => claimsMessageType(message, LOAD_QUERY_DEFINITION_MESSAGE),
    malformed: (message) => {
      const problem = loadQueryDefinitionMessageProblem(message);
      if (problem === null && isLoadQueryDefinitionMessage(message)) return null;
      const detail = problem ?? "invalid message";
      return {
        log: `Query-definition request rejected: ${detail}.`,
        response: { raw: null, status: 0, error: detail },
      };
    },
    announce: (message) => `Query-definition read requested for ${message.queryId}.`,
    unscriptable: (message) => ({
      log: `Cannot load query definition for ${message.queryId}: message has no sender tab.`,
      response: { raw: null, status: 0 },
    }),
    serve: loadQueryDefinition,
  }),
);

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

chrome.runtime.onMessage.addListener(
  tabRequestListener<LoadTeamIterationsMessage, LoadTeamIterationsResponse>(logger, {
    claims: isLoadTeamIterationsMessage,
    unscriptable: (message) => ({
      log: `Cannot load iterations for team "${message.team}": message has no sender tab.`,
      response: { raw: null },
    }),
    serve: loadTeamIterations,
  }),
);

// Team membership is project/team-scoped. The content side supplies only the team identifier while
// this worker derives the endpoint from the trusted sender tab.
const loadTeamMembers = async (
  message: LoadTeamMembersMessage,
  tabId: number,
  tabUrl: string,
): Promise<LoadTeamMembersResponse> => {
  const teamMembersUrl = buildAdoTeamMembersUrl(tabUrl, message.team);
  if (teamMembersUrl === null) {
    logger.error(
      `Team-members read cannot start for team ${message.team}: unsupported sender tab location.`,
    );
    return { raw: null, status: 0, error: "unsupported sender tab location" };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: executeAdoRequestInPage,
      args: [{ operation: "readTeamMembers", url: teamMembersUrl }],
    });
    const outcome = firstScriptResult(results) as AdoPageRequestOutcome | undefined;
    if (outcome === undefined) {
      const error = "MAIN-world injection returned no result";
      logger.error(`Team-members read failed for team ${message.team}: ${error}.`);
      return { raw: null, status: 0, error };
    }
    const value = (outcome.raw as { value?: unknown } | null)?.value;
    if (outcome.raw === null || !Array.isArray(value)) {
      const error = outcome.error ?? `HTTP ${outcome.status}`;
      logger.error(`Team-members read failed for team ${message.team}: ${error}.`);
      return { ...outcome, raw: null, error };
    }
    logger.info(
      `Team-members read completed for team ${message.team}: members=${value.length}, HTTP ${outcome.status}.`,
    );
    return outcome;
  } catch (caught) {
    const detail = caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught);
    logger.error(`Team-members injection failed for team ${message.team}: ${detail}.`, caught);
    return { raw: null, status: 0, error: `injection failed: ${detail}` };
  }
};

chrome.runtime.onMessage.addListener(
  tabRequestListener<LoadTeamMembersMessage, LoadTeamMembersResponse>(logger, {
    claims: (message) => claimsMessageType(message, LOAD_TEAM_MEMBERS_MESSAGE),
    malformed: (message) => {
      if (isLoadTeamMembersMessage(message)) return null;
      const detail = loadTeamMembersMessageProblem(message) ?? "invalid message";
      return {
        log: `Team-members request rejected: ${detail}.`,
        response: { raw: null, status: 0, error: detail },
      };
    },
    announce: (message) => `Team-members read requested for team ${message.team}.`,
    unscriptable: (message) => ({
      log: `Cannot load team members for team ${message.team}: message has no sender tab.`,
      response: { raw: null, status: 0, error: "message has no sender tab" },
    }),
    serve: loadTeamMembers,
  }),
);

// Membership in a team can only be judged against the identity Azure DevOps itself considers
// signed in, and that is served from the org's ConnectionData endpoint — reachable only from the
// tab's credentialed MAIN world. The message carries nothing: the org comes from the SENDER's own
// trusted tab URL, so a content script can never redirect this read at another collection.
const readCurrentUser = async (
  _message: ReadCurrentUserMessage,
  tabId: number,
  tabUrl: string,
): Promise<ReadCurrentUserResponse> => {
  const connectionUrl = buildAdoConnectionDataUrl(tabUrl);
  if (connectionUrl === null) {
    const error = "sender tab URL is not a supported project-scoped ADO location";
    logger.error(`Signed-in identity read cannot start: ${error}.`);
    return { raw: null, status: 0, error };
  }
  try {
    const outcome = await readInPage(tabId, connectionUrl);
    if (outcome.raw === null) {
      logger.error(`Signed-in identity read failed: ${outcome.error ?? `HTTP ${outcome.status}`}.`);
    }
    return outcome;
  } catch (caught) {
    const detail = caught instanceof Error ? `${caught.name}: ${caught.message}` : String(caught);
    logger.error(`Signed-in identity injection failed: ${detail}.`, caught);
    return { raw: null, status: 0, error: `injection failed: ${detail}` };
  }
};

chrome.runtime.onMessage.addListener(
  tabRequestListener<ReadCurrentUserMessage, ReadCurrentUserResponse>(logger, {
    claims: (message) => claimsMessageType(message, READ_CURRENT_USER_MESSAGE),
    malformed: (message) =>
      isReadCurrentUserMessage(message)
        ? null
        : {
            log: "Signed-in identity request rejected: invalid message.",
            response: { raw: null, status: 0, error: "invalid message" },
          },
    unscriptable: () => ({
      log: "Cannot read the signed-in identity: message has no sender tab.",
      response: { raw: null, status: 0, error: "message has no sender tab" },
    }),
    serve: readCurrentUser,
  }),
);

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

chrome.runtime.onMessage.addListener(
  tabRequestListener<SearchAdoIdentitiesMessage, SearchAdoIdentitiesResponse>(logger, {
    claims: isSearchAdoIdentitiesMessage,
    unscriptable: () => ({
      log: "Cannot search identities: message has no sender tab.",
      response: { raw: null },
    }),
    serve: searchAdoIdentities,
  }),
);

// A work item's description and its discussion store an `@`-mention as a bare identity GUID, so a
// view that renders them has to ask who those people are. The whole board's mentions are collected
// and resolved TOGETHER — one pooled pass over the board's distinct ids, rather than a fresh read per
// mentioned person per item. The ids come from the content side, but the URL is built here from the
// SENDER's own trusted tab URL and each id is re-validated as a GUID before it is sent, so a content
// script can influence WHO is looked up but never WHERE the request goes.
const resolveAdoIdentityNames = async (
  message: ResolveAdoIdentityNamesMessage,
  tabId: number,
  tabUrl: string,
): Promise<ResolveAdoIdentityNamesResponse> => {
  const request = buildAdoIdentityPickerRequest(tabUrl, message.ids);
  if (request === null) {
    logger.info(
      "Mention resolution skipped: tab is not a recognized ADO URL, or no valid identity ids " +
        `were supplied (${message.ids.length} received).`,
    );
    return { raw: null, complete: false };
  }
  // The ceiling is a safety limit on how many credentialed reads one message may become, so hitting
  // it silently DROPS people. Say so: the alternative is a handful of mentions that are anonymous
  // for no visible reason.
  const truncated = message.ids.length > MAX_MENTION_IDS;
  if (truncated) {
    logger.error(
      `Mention resolution truncated: ${message.ids.length} identity id(s) requested but ` +
        `${MAX_MENTION_IDS} is the ceiling; the remainder render unresolved.`,
    );
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: fetchAdoIdentityNamesInPage,
      args: [request.url, request.ids, MENTION_REQUEST_CONCURRENCY],
    });
    const outcome = firstScriptResult(results) as AdoIdentityNamesOutcome | null;
    if (outcome === null) {
      logger.error("Mention resolution failed: the in-page read returned no result.");
      return { raw: null, complete: false };
    }
    if (outcome.failure !== "none") {
      // Counts and classification only, never ADO's error text: that payload echoes the request,
      // and the diagnostics log is exported into bug reports (AGENTS.md §9). A partial answer is
      // still returned below — the names that DID resolve are worth rendering.
      logger.error(
        `Mention resolution failed (${outcome.failure}, HTTP ${outcome.status}): ` +
          `${outcome.bodies.length} of ${request.ids.length} identity id(s) read.`,
      );
    }
    return {
      raw: outcome.bodies.length > 0 ? outcome.bodies : null,
      // Only a clean, untruncated read lets the caller treat a missing name as ADO's final answer.
      complete: outcome.failure === "none" && !truncated,
    };
  } catch (error) {
    // Injection fails on a closed/navigated/restricted tab; report "no data" so mentions degrade.
    logger.error("Could not resolve Azure DevOps mention identities", error);
    return { raw: null, complete: false };
  }
};

chrome.runtime.onMessage.addListener(
  tabRequestListener<ResolveAdoIdentityNamesMessage, ResolveAdoIdentityNamesResponse>(logger, {
    claims: isResolveAdoIdentityNamesMessage,
    unscriptable: () => ({
      log: "Cannot resolve mention identities: message has no sender tab.",
      response: { raw: null, complete: false },
    }),
    serve: resolveAdoIdentityNames,
  }),
);

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

const readTeamConfig = async (
  workItemId: number,
  tabId: number,
  tabUrl: string,
): Promise<ReadTeamConfigResponse> => {
  const url = buildWorkItemUpdateUrl(tabUrl, workItemId);
  if (url === null) {
    return { ok: false, error: "not a supported ADO URL" };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: fetchTeamConfigInPage,
      args: [url],
    });
    const response = firstScriptResult(results);
    if (!isReadTeamConfigResponse(response)) {
      logger.error(`Team configuration work item ${workItemId} returned no valid response.`);
      return { ok: false, error: "no valid response" };
    }
    if (!response.ok) {
      logger.error(`Could not read team configuration work item ${workItemId}: ${response.error}`);
    }
    return response;
  } catch (error) {
    logger.error(`Could not read team configuration work item ${workItemId}`, error);
    return { ok: false, error: `injection failed: ${String(error)}` };
  }
};

chrome.runtime.onMessage.addListener(
  tabRequestListener<ReadTeamConfigMessage, ReadTeamConfigResponse>(logger, {
    claims: (message) => claimsMessageType(message, READ_TEAM_CONFIG_MESSAGE),
    malformed: (message) =>
      isReadTeamConfigMessage(message)
        ? null
        : {
            log: "Rejected malformed team configuration read request.",
            response: { ok: false, error: "invalid work item id" },
          },
    unscriptable: (message) => ({
      log: `Cannot read team configuration work item ${message.workItemId}: no sender tab.`,
      response: { ok: false, error: "no sender tab" },
    }),
    serve: (message, tabId, tabUrl) => readTeamConfig(message.workItemId, tabId, tabUrl),
  }),
);

chrome.runtime.onMessage.addListener(
  tabRequestListener<ReconcileFeatureCrewMessage, ReconcileFeatureCrewResponse>(logger, {
    claims: isReconcileFeatureCrewMessage,
    unscriptable: (message) => ({
      log: `Cannot reconcile Feature Crew for root ${message.rootId}: message has no sender tab.`,
      response: { ok: false, changed: false, error: "no sender tab" },
    }),
    serve: reconcileFeatureCrew,
  }),
);

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
      // One config object, never an argument each: an absent optional argument would be `undefined`,
      // which is not JSON-serializable, and Chrome rejects the entire injection over it.
      args: [
        {
          updateUrl,
          rev: message.rev,
          field: message.field,
          value: message.value,
          additionalFields: message.additionalFields,
          preconditions: message.preconditions,
          multilineFormat: message.multilineFormat,
          comment: message.comment,
          baseValue: message.baseValue,
        },
      ],
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
    // Injection fails on a closed/navigated/restricted tab — and ALSO when an argument is not
    // JSON-serializable, in which case NOTHING ever reached Azure DevOps. The thrown message rides
    // back to the caller because a bare "exception" makes those indistinguishable, and the second
    // one is an extension bug that reads exactly like a rejected write.
    logger.error(`Could not update work item ${message.id} field`, error);
    return { ok: false, error: `injection failed: ${String(error)}` };
  }
};

chrome.runtime.onMessage.addListener(
  tabRequestListener<UpdateWorkItemFieldMessage, UpdateWorkItemFieldResponse>(logger, {
    claims: isUpdateWorkItemFieldMessage,
    unscriptable: (message) => ({
      log: `Cannot update work item ${message.id} field: message has no sender tab.`,
      response: { ok: false, error: "no sender tab" },
    }),
    serve: updateWorkItemField,
  }),
);

// An enhanced view can also MOVE an item: drag-reordering the tree changes the item's backlog rank
// and, when it lands under a different parent, its hierarchy link. Both are credentialed calls that
// can only run in the ADO tab's MAIN world, so the content side asks this worker to perform them.
//
// The operation is closed the same way the field update is: every URL is built from the SENDER's own
// trusted tab URL (never a content-supplied one), the ids are validated as real work item ids or
// ADO's `0` sentinel (`isReorderWorkItemMessage`), and the only patch this can express is "replace
// the hierarchy-parent link and re-rank" — it can neither address arbitrary fields nor reach a
// collection the sender's own page could not already reach with its own session.
const reorderWorkItem = async (
  message: ReorderWorkItemMessage,
  tabId: number,
  tabUrl: string,
): Promise<ReorderWorkItemResponse> => {
  const config = buildReorderConfig(message, tabUrl);
  if (typeof config === "string") {
    // A non-project ADO URL (org-level or folder tab) has no team-scoped backlog to re-rank in.
    // Which URL could not be built is reported, because "not a project-scoped ADO URL" alone leaves
    // the reader guessing between the tab, the team setting, and the parent id.
    logger.error(`Work item ${message.id} reorder skipped: ${config} (tab ${tabUrl}).`);
    return { ok: false, error: config };
  }
  let preparedState: Awaited<ReturnType<typeof prepareReorderState>> | null = null;
  try {
    const preparation = await prepareReorderState(message, (stateMessage) =>
      updateWorkItemField(stateMessage, tabId, tabUrl),
    );
    if (!preparation.ok) {
      logger.error(
        `Work item ${message.id} reorder stopped before ranking: ` +
          `${preparation.response.error ?? "state update failed"}.`,
      );
      return preparation.response;
    }
    preparedState = preparation;
    const preparedMessage = preparation.message;
    const preparedConfig = { ...config, rev: preparedMessage.rev };
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: reorderWorkItemInPage,
      args: [preparedConfig],
    });
    const rawResult = (results[0]?.result as ReorderWorkItemResponse | undefined) ?? null;
    const result = withPreparedState(rawResult ?? { ok: false, error: "no result" }, preparation);
    const outcome = await finishReorder(message, preparedMessage, tabId, tabUrl, result);
    return withCurrentRev(tabId, config.itemUrl, outcome);
  } catch (error) {
    // Injection fails on a closed/navigated/restricted tab; report the failure so the view degrades.
    logger.error(`Could not reorder work item ${message.id}`, error);
    const failure: ReorderWorkItemResponse = { ok: false, error: "exception" };
    return preparedState?.ok === true ? withPreparedState(failure, preparedState) : failure;
  }
};

async function finishReorder(
  original: ReorderWorkItemMessage,
  prepared: ReorderWorkItemMessage,
  tabId: number,
  tabUrl: string,
  result: ReorderWorkItemResponse | null,
): Promise<ReorderWorkItemResponse> {
  if (result === null) {
    logger.error(`Work item ${original.id} reorder returned no result.`);
    return { ok: false, error: "no result" };
  }
  if (!result.ok) {
    // The page world hands back the raw body; naming what ADO actually objected to is what makes
    // this diagnosable from the log instead of only from a live repro.
    const reason = describeReorderFailure(result);
    logger.error(
      `Work item ${original.id} reorder failed (parent ${original.currentParentId}\u2192${original.parentId}, ` +
        `between ${original.previousId} and ${original.nextId}, base rev ${original.rev}): ${reason}`,
    );
    return rankByHand(prepared, tabId, tabUrl, result, reason);
  }
  logger.info(
    `Work item ${original.id} reordered under parent ${original.parentId} ` +
      `(was ${original.currentParentId}), order=${orderDescription(result.order)}.`,
  );
  return result;
}

function orderDescription(order: number | undefined): number | string {
  return order === undefined ? "unchanged" : order;
}

/**
 * Re-read the moved item's revision once the move has settled.
 *
 * Ranking and re-parenting both bump `System.Rev`, but `_apis/work/workitemsorder` reports positions
 * only — so whatever rev the response carries is already behind. Left uncorrected, the board keeps
 * it and the item's NEXT field write is refused with HTTP 412 until the page is reloaded. Done here,
 * once, rather than inside the injected move: that function is serialized into the page and every
 * line in it is a line no unit test can reach.
 *
 * Skipped when nothing landed, since the rev cannot have moved. A read that fails leaves the outcome
 * as it was — the move itself already succeeded, and reporting it as failed would be a lie.
 */
async function withCurrentRev(
  tabId: number,
  itemUrl: string,
  outcome: ReorderWorkItemResponse,
): Promise<ReorderWorkItemResponse> {
  if (!outcome.ok && outcome.reparented !== true && outcome.stateChanged !== true) {
    return outcome;
  }
  const rev = await runInTab(tabId, readWorkItemRevInPage, { itemUrl });
  return typeof rev === "number" ? { ...outcome, rev } : outcome;
}

// Rank the level by writing the rank field directly, for the moves ADO's backlog-order endpoint
// refuses outright (see `explainReorderRefusal`). Only a refusal to RANK is worth retrying this way:
// when the re-parent itself failed the item is not among the siblings it would be ranked against, so
// there is nothing to write. Everything decided here beyond the two page-world calls lives in
// `common/ado/rankFallback`, which is ordinary unit-tested module code.
const rankByHand = async (
  message: ReorderWorkItemMessage,
  tabId: number,
  tabUrl: string,
  refusal: ReorderWorkItemResponse,
  reason: string,
): Promise<ReorderWorkItemResponse> => {
  // Carried onto every outcome below: a re-parent ADO already applied, and the rev it produced, are
  // true whether or not the ranking that followed worked.
  const refused: ReorderWorkItemResponse = {
    ok: false,
    error: reason,
    reparented: refusal.reparented,
    ...(refusal.stateChanged === true ? { stateChanged: true } : {}),
    rev: refusal.rev,
  };
  const batchUrl = buildWorkItemsBatchUrl(tabUrl);
  if (refusal.stage !== "order" || batchUrl === null) {
    return refused;
  }
  const explanation = explainReorderRefusal(reason);
  if (explanation !== null) {
    // Logged beside ADO's own words, not instead of them: TF400486 reads as a concurrency complaint
    // and sends the next reader hunting for a race that is not there.
    logger.error(`Work item ${message.id} reorder refusal explained: ${explanation}`);
  }

  try {
    const fallback = await applyRankFallback({
      siblingIds: message.siblingIds,
      movedId: message.id,
      readRanks: (ids) => readRanksInTab(tabId, batchUrl, ids),
      writeRanks: (writes) => writeRanksInTab(tabId, tabUrl, writes),
    });
    if (!fallback.ok) {
      logger.error(
        `Work item ${message.id} rank write failed after ADO refused to order it: ` +
          `${fallback.error ?? "unknown error"}.`,
      );
      return refused;
    }
    logger.info(rankedByHandLine(message, fallback));
    return { ...refused, ok: true, error: undefined, order: fallback.order, ranks: fallback.ranks };
  } catch (error) {
    logger.error(`Could not write ranks for work item ${message.id}`, error);
    return refused;
  }
};

// The signals behind a hand-written ranking plus its outcome: which items were touched and whether
// the level had to be renumbered, so "why did that row land there?" is answerable from the log.
function rankedByHandLine(
  message: ReorderWorkItemMessage,
  fallback: { order?: number; ranks?: readonly unknown[]; reseeded?: boolean },
): string {
  const placement = fallback.reseeded === true ? "renumbered" : "placed between neighbours";
  return (
    `Work item ${message.id} ranked directly under parent ${message.parentId} ` +
    `(ADO refused to order it): order=${fallback.order ?? "unchanged"}, ${placement}, ` +
    `${fallback.ranks?.length ?? 0} item(s) written.`
  );
}

/** Injects a page-world function into `tabId` and hands back its result, or undefined. */
function runInTab<TConfig, TResult>(
  tabId: number,
  func: (config: TConfig) => Promise<TResult>,
  config: TConfig,
): Promise<TResult | undefined> {
  return chrome.scripting
    .executeScript({ target: { tabId }, world: "MAIN", func, args: [config] })
    .then((results) => results[0]?.result as TResult | undefined);
}

/** One page of the level's current ranks, or null when the read did not come back. */
async function readRanksInTab(
  tabId: number,
  batchUrl: string,
  ids: readonly number[],
): Promise<unknown> {
  const read = await runInTab(tabId, readWorkItemRanksInPage, {
    batchUrl,
    ids: [...ids],
    field: IMPORTANCE_FIELD,
  });
  return read?.ok === true ? read.body : null;
}

/** Applies the planned ranks in the tab, addressing each item from the worker's own trusted URL. */
async function writeRanksInTab(
  tabId: number,
  tabUrl: string,
  writes: readonly { id: number; rank: number }[],
): Promise<{ ok: boolean; error?: string; revs?: readonly { id: number; rev: number }[] }> {
  const targets = buildRankTargets(writes, tabUrl);
  if (targets === null) {
    return { ok: false, error: "could not build the work item URL for a rank write" };
  }
  const written = await runInTab(tabId, writeWorkItemRanksInPage, {
    field: IMPORTANCE_FIELD,
    writes: targets,
  });
  return written ?? { ok: false, error: "no result" };
}

// Address each rank write from the SENDER's own trusted tab URL, never a content-supplied one, so a
// rank write can only ever reach a work item the sender's page could already reach itself.
function buildRankTargets(
  writes: readonly { id: number; rank: number }[],
  tabUrl: string,
): { id: number; url: string; rank: number }[] | null {
  const targets: { id: number; url: string; rank: number }[] = [];
  for (const write of writes) {
    const url = buildWorkItemUpdateUrl(tabUrl, write.id);
    if (url === null) {
      return null;
    }
    targets.push({ id: write.id, url, rank: write.rank });
  }
  return targets;
}

// Resolve every URL the in-page move needs from the sender's own tab. Returns a REASON string when
// any of them is unresolvable, so a partially-addressable move is never attempted — a re-parent that
// succeeded against a fabricated order URL would leave the tree changed and the rank stale — and so
// the caller can say which piece was missing rather than reporting a blanket failure.
function buildReorderConfig(
  message: ReorderWorkItemMessage,
  tabUrl: string,
): ReorderWorkItemConfig | string {
  const orderUrl = buildWorkItemsOrderUrl(tabUrl, message.team);
  if (orderUrl === null) {
    return `could not build the backlog-order URL for team "${message.team}" (tab is not a project-scoped ADO URL, or the team is blank)`;
  }
  const relationsUrl = buildWorkItemRelationsUrl(tabUrl, message.id);
  const itemUrl = buildWorkItemUpdateUrl(tabUrl, message.id);
  if (relationsUrl === null || itemUrl === null) {
    return "could not build the work item URL (tab is not a supported ADO URL)";
  }
  // `0` means "top level", which is the absence of a parent link rather than a link to item 0.
  const parentLinkUrl =
    message.parentId === 0 ? null : buildWorkItemLinkUrl(tabUrl, message.parentId);
  if (message.parentId !== 0 && parentLinkUrl === null) {
    return `could not build the link URL for new parent ${message.parentId}`;
  }
  return {
    orderUrl,
    relationsUrl,
    itemUrl,
    parentLinkUrl,
    parentLinkType: PARENT_LINK_TYPE,
    id: message.id,
    rev: message.rev,
    parentId: message.parentId,
    previousId: message.previousId,
    nextId: message.nextId,
    reparent: message.parentId !== message.currentParentId,
    typeName: message.typeName,
  };
}

chrome.runtime.onMessage.addListener(
  tabRequestListener<ReorderWorkItemMessage, ReorderWorkItemResponse>(logger, {
    claims: (message) => claimsMessageType(message, REORDER_WORK_ITEM_MESSAGE),
    malformed: (message) => {
      const problem = reorderMessageProblem(message);
      return problem === null
        ? null
        : {
            log: `Rejected a malformed reorder request: ${problem}.`,
            response: { ok: false, error: `malformed request: ${problem}` },
          };
    },
    unscriptable: (message) => ({
      log: `Cannot reorder work item ${message.id}: message has no sender tab.`,
      response: { ok: false, error: "no sender tab" },
    }),
    serve: reorderWorkItem,
  }),
);

// The Project Tracking board shows each item's Discussion as its "notes". Like every other ADO read
// here, the comments collection is only reachable from a credentialed MAIN-world fetch, so the
// content side asks this worker for the raw pages. The URLs are built from the SENDER's own trusted
// tab URL — never a content-supplied one — so this stays a closed "read this item's discussion"
// operation. The signed-in identity rides along because the board can only offer "edit" on the notes
// the reader wrote, and it is served from the same page context.
const loadWorkItemNotes = async (
  message: LoadWorkItemNotesMessage,
  tabId: number,
  tabUrl: string,
): Promise<LoadWorkItemNotesResponse> => {
  // Logged on ARRIVAL, before anything can go wrong. Without it a request that never reached this
  // worker and one that reached it and then hung in the page world are the same silence — and the
  // content side reports both as the uninformative "no response from background".
  logger.info(
    `Notes load requested for work item ${message.workItemId} since ${message.sinceIso}.`,
  );
  const urls = buildWorkItemNotesUrls(tabUrl, message.workItemId);
  if (urls === null) {
    logger.info(
      `Notes load skipped for work item ${message.workItemId}: tab is not a project-scoped ADO URL.`,
    );
    return { raw: null, error: "not a project-scoped ADO URL" };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: fetchWorkItemNotesInPage,
      args: [urls.commentsUrl, urls.connectionUrl, message.sinceIso, MAX_NOTE_PAGES],
    });
    const raw = firstScriptResult(results) as RawWorkItemNotes | null;
    if (raw === null) {
      logger.error(`Notes load for work item ${message.workItemId} returned no result.`);
      return { raw: null, error: "no result" };
    }
    // The outcome in the worker's own words: counts and classification only, never a note's text or
    // an author's name (AGENTS.md §9).
    logger.info(
      `Notes load for work item ${message.workItemId} finished: pages=${raw.pages.length}, ` +
        `status=${raw.status}, failure=${raw.failure}, identity=${raw.connection !== null}.`,
    );
    return { raw };
  } catch (error) {
    // Injection fails on a closed/navigated/restricted tab; report "no data" so the panel degrades.
    logger.error(`Could not load notes for work item ${message.workItemId}`, error);
    return { raw: null, error: "exception" };
  }
};

/**
 * How many comment pages one notes read will walk before giving up.
 *
 * The fetcher already stops as soon as a page reaches past the Updates window, so this only guards
 * against a server that keeps handing back a continuation token — ten pages is far more discussion
 * than any window this board offers can contain.
 */
const MAX_NOTE_PAGES = 10;

/**
 * How many of the board's discussions are read at once INSIDE the page.
 *
 * Browsers cap concurrent same-origin requests at around this anyway, and the board's own writes and
 * note panels share that budget — releasing a whole board at once would simply queue them behind
 * this read.
 */
const NOTE_ACTIVITY_CONCURRENCY = 6;
const INTERRUPT_ACCEPTANCE_CONCURRENCY = 6;

const readInterruptAcceptance = async (
  message: ReadInterruptAcceptanceMessage,
  tabId: number,
  tabUrl: string,
): Promise<ReadInterruptAcceptanceResponse> => {
  logger.info(
    `Interrupt acceptance read requested for ${message.workItemIds.length} work item(s).`,
  );
  const requests = message.workItemIds.flatMap((workItemId) => {
    const urls = buildInterruptAcceptanceUrls(tabUrl, workItemId);
    return urls === null ? [] : [{ workItemId, ...urls }];
  });
  if (requests.length === 0) {
    logger.info("Interrupt acceptance read skipped: tab is not a project-scoped ADO URL.");
    return { raw: null, error: "not a project-scoped ADO URL" };
  }
  try {
    const raw = await readInterruptAcceptancePages(
      {
        requests,
        interruptTag: message.interruptTag,
        acceptanceTag: message.acceptanceTag,
        concurrency: INTERRUPT_ACCEPTANCE_CONCURRENCY,
        updatePageSize: INTERRUPT_UPDATES_PAGE_SIZE,
        maxUpdatePages: MAX_INTERRUPT_UPDATE_PAGES,
      },
      (url) => readInPage(tabId, url),
    );
    logger.info(
      `Interrupt acceptance read finished: evidence=${raw.evidence.length}, ` +
        `failed=${raw.failedIds.length}, failure=${raw.failure}, status=${raw.status}.`,
    );
    return { raw };
  } catch (error) {
    logger.error("Could not read interrupt acceptance", error);
    return { raw: null, error: "exception" };
  }
};

chrome.runtime.onMessage.addListener(
  tabRequestListener<ReadInterruptAcceptanceMessage, ReadInterruptAcceptanceResponse>(logger, {
    claims: (message) => claimsMessageType(message, READ_INTERRUPT_ACCEPTANCE_MESSAGE),
    malformed: (message) => {
      const problem = readInterruptAcceptanceMessageProblem(message);
      return problem === null
        ? null
        : {
            log: `Rejected a malformed interrupt acceptance request: ${problem}.`,
            response: { raw: null, error: `malformed request: ${problem}` },
          };
    },
    unscriptable: () => ({
      log: "Cannot read interrupt acceptance: message has no sender tab.",
      response: { raw: null, error: "no sender tab" },
    }),
    serve: readInterruptAcceptance,
  }),
);

/**
 * Answers "when was each of these items last commented on?" for the board's **New notes** filter.
 *
 * ONE injection for the whole board, deliberately: the filter used to ask through the per-item notes
 * loader, which meant one `executeScript` and one worker round-trip PER ITEM — overhead that dwarfed
 * the fetches themselves and made the first use of that filter a visible wait. Every URL is still
 * built here from the SENDER's own trusted tab URL, so the content side names WHICH items it means
 * and never WHERE the request goes.
 */
const readNoteActivity = async (
  message: ReadNoteActivityMessage,
  tabId: number,
  tabUrl: string,
): Promise<ReadNoteActivityResponse> => {
  // Logged on ARRIVAL, before anything can go wrong — same reason as the notes read above.
  logger.info(`Note-activity read requested for ${message.workItemIds.length} work item(s).`);
  const requests = message.workItemIds
    .map((workItemId) => ({ workItemId, url: buildNewestNoteUrl(tabUrl, workItemId) }))
    .filter((entry): entry is { workItemId: number; url: string } => entry.url !== null);
  if (requests.length === 0) {
    logger.info("Note-activity read skipped: tab is not a project-scoped ADO URL.");
    return { raw: null, error: "not a project-scoped ADO URL" };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: fetchNoteActivityInPage,
      args: [
        {
          requests,
          concurrency: NOTE_ACTIVITY_CONCURRENCY,
          excludedPrefixes: message.excludedPrefixes,
          maxPages: MAX_NOTE_ACTIVITY_PAGES,
        },
      ],
    });
    const raw = firstScriptResult(results) as RawNoteActivity | null;
    if (raw === null) {
      logger.error("Note-activity read returned no result.");
      return { raw: null, error: "no result" };
    }
    // Counts and classification only, never a comment's text or an author's name (AGENTS.md §9).
    logger.info(
      `Note-activity read finished: dated=${raw.newest.length}, failed=${raw.failedIds.length}, ` +
        `failure=${raw.failure}, status=${raw.status}.`,
    );
    return { raw };
  } catch (error) {
    // Injection fails on a closed/navigated/restricted tab; report "no data" so the filter degrades.
    logger.error("Could not read note activity", error);
    return { raw: null, error: "exception" };
  }
};

chrome.runtime.onMessage.addListener(
  tabRequestListener<ReadNoteActivityMessage, ReadNoteActivityResponse>(logger, {
    claims: (message) => claimsMessageType(message, READ_NOTE_ACTIVITY_MESSAGE),
    malformed: (message) => {
      const problem = readNoteActivityMessageProblem(message);
      return problem === null
        ? null
        : {
            log: `Rejected a malformed note-activity request: ${problem}.`,
            response: { raw: null, error: `malformed request: ${problem}` },
          };
    },
    unscriptable: () => ({
      log: "Cannot read note activity: message has no sender tab.",
      response: { raw: null, error: "no sender tab" },
    }),
    serve: readNoteActivity,
  }),
);

chrome.runtime.onMessage.addListener(
  tabRequestListener<LoadWorkItemNotesMessage, LoadWorkItemNotesResponse>(logger, {
    claims: (message) => claimsMessageType(message, LOAD_WORK_ITEM_NOTES_MESSAGE),
    malformed: (message) => {
      const problem = loadNotesMessageProblem(message);
      return problem === null
        ? null
        : {
            log: `Rejected a malformed notes read request: ${problem}.`,
            response: { raw: null, error: `malformed request: ${problem}` },
          };
    },
    unscriptable: (message) => ({
      log: `Cannot load notes for work item ${message.workItemId}: message has no sender tab.`,
      response: { raw: null, error: "no sender tab" },
    }),
    serve: loadWorkItemNotes,
  }),
);

// Adding or correcting a note is the write half of the same conversation, and is closed the same
// way: the collection comes from the SENDER's own tab, the shape is validated before anything is
// built (`isWriteWorkItemNoteMessage`), and the only thing this can express is "post/rewrite one
// comment on one item". Azure DevOps itself rejects an edit from anyone but the note's author, so
// authorization stays on the server rather than being asserted here.
const noteWriteConfig = (
  message: WriteWorkItemNoteMessage,
  tabUrl: string,
): WriteWorkItemNoteConfig | null => {
  const isEdit = message.noteId !== null;
  const url = isEdit
    ? buildEditNoteUrl(tabUrl, message.workItemId, message.noteId as number)
    : buildAddNoteUrl(tabUrl, message.workItemId);
  return url === null
    ? null
    : {
        url,
        method: isEdit ? "PATCH" : "POST",
        text: message.text,
        // A comment creates a new work item revision that the comments API says nothing about, so
        // the item is re-read and the fresh rev handed back — otherwise the board's cached rev falls
        // one behind here and its next field write on this item is refused with HTTP 412.
        workItemUrl: buildWorkItemUpdateUrl(tabUrl, message.workItemId) ?? undefined,
      };
};

const writeWorkItemNote = async (
  message: WriteWorkItemNoteMessage,
  tabId: number,
  tabUrl: string,
): Promise<WriteWorkItemNoteResponse> => {
  // Logged on ARRIVAL, before anything can go wrong — same reason as the read above. The note's TEXT
  // is never logged, only its length (AGENTS.md §9).
  logger.info(
    `Note ${message.noteId === null ? "add" : `edit ${String(message.noteId)}`} requested on work ` +
      `item ${message.workItemId} (${message.text.length} characters).`,
  );
  const config = noteWriteConfig(message, tabUrl);
  if (config === null) {
    logger.info(
      `Note write skipped for work item ${message.workItemId}: tab is not a project-scoped ADO URL.`,
    );
    return { ok: false, error: "not a project-scoped ADO URL" };
  }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      func: writeWorkItemNoteInPage,
      args: [config],
    });
    const result = firstScriptResult(results) as WriteWorkItemNoteResponse | null;
    if (result === null) {
      logger.error(`Note write on work item ${message.workItemId} returned no result.`);
      return { ok: false, error: "no result" };
    }
    if (!result.ok) {
      logger.error(
        `Note write on work item ${message.workItemId} failed: ${result.error ?? "unknown"}.`,
      );
    } else {
      logger.info(
        `Note write on work item ${message.workItemId} accepted by Azure DevOps, ` +
          `rev=${result.rev ?? "none"}.`,
      );
    }
    return result;
  } catch (error) {
    // Injection fails on a closed/navigated/restricted tab; report the failure.
    logger.error(`Could not write a note on work item ${message.workItemId}`, error);
    return { ok: false, error: "exception" };
  }
};

chrome.runtime.onMessage.addListener(
  tabRequestListener<WriteWorkItemNoteMessage, WriteWorkItemNoteResponse>(logger, {
    claims: (message) => claimsMessageType(message, WRITE_WORK_ITEM_NOTE_MESSAGE),
    malformed: (message) => {
      const problem = writeNoteMessageProblem(message);
      return problem === null
        ? null
        : {
            log: `Rejected a malformed note write request: ${problem}.`,
            response: { ok: false, error: `malformed request: ${problem}` },
          };
    },
    unscriptable: (message) => ({
      log: `Cannot write a note on work item ${message.workItemId}: message has no sender tab.`,
      response: { ok: false, error: "no sender tab" },
    }),
    serve: writeWorkItemNote,
  }),
);
