import { ADO_NAVIGATION_MESSAGE, type AdoNavigationMessage } from "./AdoQueryRoute";

export interface NavigationDetails {
  tabId: number;
  frameId: number;
  url: string;
  documentId: string;
}

export type NavigationMessageSender = (
  tabId: number,
  message: AdoNavigationMessage,
  options: { documentId: string },
) => Promise<void>;

/**
 * Why: ADO is a SPA; the background service worker listens for history-state and fragment
 * navigation events and forwards each top-frame URL change to the content script via a typed
 * message. Subframe navigation is ignored because ADO does not render Query pages inside frames.
 *
 * Rejected sender calls (e.g. no receiver) are swallowed: the content script may not yet be
 * injected when a navigation fires on a cold tab, and that is expected.
 */
export async function notifyNavigation(
  details: NavigationDetails,
  sendMessage: NavigationMessageSender,
): Promise<void> {
  if (details.frameId !== 0) {
    return;
  }
  try {
    await sendMessage(
      details.tabId,
      { type: ADO_NAVIGATION_MESSAGE, url: details.url },
      { documentId: details.documentId },
    );
  } catch {
    // Expected: content-script receiver may not be present yet (e.g. cold tab).
  }
}
