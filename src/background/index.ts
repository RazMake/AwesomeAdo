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
