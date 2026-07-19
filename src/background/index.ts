import {
  bindingSettingsPath,
  isOpenBindingSettingsMessage,
  isOpenOptionsMessage,
  optionsPath,
} from "../common/bindings/BindingRequest";
import { notifyNavigation } from "../common/navigation/NavigationNotifier";

const handleNavigation = (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
  void notifyNavigation(details, (tabId, message, options) =>
    chrome.tabs.sendMessage(tabId, message, options),
  );
};

chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation);
chrome.webNavigation.onReferenceFragmentUpdated.addListener(handleNavigation);

// Content scripts can't open an extension page, so the top-bar menu asks the service worker to open
// the options page — either focused on one query (to bind it) or the general page. Failures are
// logged rather than swallowed so a broken open is diagnosable instead of appearing to do nothing.
const openOptionsTab = (path: string): void => {
  void chrome.tabs.create({ url: chrome.runtime.getURL(path) }).catch((error: unknown) => {
    console.error("AwesomeADO could not open the options page", error);
  });
};

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isOpenBindingSettingsMessage(message)) {
    openOptionsTab(bindingSettingsPath(message.queryId, message.queryName));
    return;
  }
  if (isOpenOptionsMessage(message)) {
    openOptionsTab(optionsPath());
  }
});
