import {
  bindingSettingsPath,
  isOpenBindingSettingsMessage,
  isOpenOptionsMessage,
  optionsPath,
  REVEAL_OPTIONS_SECTION_MESSAGE,
  type OptionsSection,
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

// Content scripts can't open an extension page, so the top-bar menu asks the service worker to open
// the options page. When an options tab this worker opened is still around we focus it and — for a
// section deep-link like "View Log" — tell it to switch tabs in place, because an already-loaded
// page won't re-read the section from a URL. Failures are logged rather than swallowed so a broken
// open is diagnosable instead of appearing to do nothing.
const openOptionsTab = (path: string, section?: OptionsSection): void => {
  void reuseOrOpenOptionsTab(path, section).catch((error: unknown) => {
    logger.error("Could not open the options page", error);
  });
};

const reuseOrOpenOptionsTab = async (path: string, section?: OptionsSection): Promise<void> => {
  if (lastOpenedOptionsTabId !== undefined) {
    const focused = await focusExistingOptionsTab(lastOpenedOptionsTabId, section);
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

// Returns true when the remembered tab still exists and was focused (and, for a section link,
// nudged to that tab); false when the tab is gone so the caller opens a new one.
const focusExistingOptionsTab = async (
  tabId: number,
  section?: OptionsSection,
): Promise<boolean> => {
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (tab?.windowId !== undefined) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    if (section !== undefined) {
      await chrome.tabs.sendMessage(tabId, { type: REVEAL_OPTIONS_SECTION_MESSAGE, section });
    }
    return true;
  } catch {
    return false;
  }
};

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isOpenBindingSettingsMessage(message)) {
    openOptionsTab(bindingSettingsPath(message.queryId, message.queryName));
    return;
  }
  if (isOpenOptionsMessage(message)) {
    // Forward the requested section (e.g. "diagnostics" for "View Log") so the page deep-links there.
    openOptionsTab(optionsPath(message.section), message.section);
  }
});
