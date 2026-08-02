import type { ILogger } from "../logging/ILogger";

/**
 * Answering one content-side request from the sender's OWN tab.
 *
 * Every credentialed Azure DevOps operation this extension performs follows the same three rules,
 * and all three are easy to get subtly wrong once per message type:
 *
 * 1. **The sender's tab is the trust boundary.** A request URL is derived from the tab the message
 *    arrived from, never from a URL the content side supplied — that is what keeps each operation a
 *    closed "do this one thing here" instead of a fetch-anywhere proxy carrying the user's session.
 *    A message with no scriptable sender tab therefore cannot be served at all.
 * 2. **A claimed message is always answered.** Ignoring a malformed request reaches the caller as
 *    the uninformative "no response from background", which looks identical to a worker that has no
 *    handler at all. Replying with the offending field turns a dead end into a diagnosis.
 * 3. **The message channel is held open** (`return true`) for the async reply, and only then.
 *
 * Writing those rules once, here, is the point: a new operation supplies only what is specific to
 * it, and cannot forget the parts that are not.
 */

/** A refusal: what the log records, and what the caller is told so it never waits on silence. */
export interface TabRequestRefusal<TResponse> {
  /** The diagnostics line explaining why the request could not be served. */
  log: string;
  /** The reply handed back to the caller. */
  response: TResponse;
}

/** What one operation supplies beyond the shared rules above. */
export interface TabRequestHandler<TMessage, TResponse> {
  /**
   * Whether this message is the one this handler answers. Anything else is left untouched for the
   * next listener — several handlers share the one `onMessage` bus.
   */
  claims(message: unknown): boolean;
  /**
   * Why a claimed message cannot be served as sent, or `null` when it is well-formed. Omitted means
   * `claims` already validated the shape, so a claimed message is by definition serviceable.
   */
  malformed?(message: unknown): TabRequestRefusal<TResponse> | null;
  /** The refusal for a message that did not arrive from a scriptable ADO tab. */
  unscriptable(message: TMessage): TabRequestRefusal<TResponse>;
  /** Serves the request against the sender's own trusted tab. */
  serve(message: TMessage, tabId: number, tabUrl: string): Promise<TResponse>;
  /** An optional line recorded when the request is accepted, before it is served. */
  announce?(message: TMessage): string;
}

/**
 * The only part of a message sender this reads: the tab it arrived from.
 *
 * Narrower than `chrome.runtime.MessageSender` on purpose (Interface Segregation) — the trust
 * decision here turns on exactly two fields, and saying so keeps the rules testable without minting
 * a whole fake `chrome.tabs.Tab`.
 */
export interface TabRequestSender {
  tab?: { id?: number; url?: string };
}

/** The `chrome.runtime.onMessage` listener shape, narrowed to the two replies this ever gives. */
export type TabRequestListener = (
  message: unknown,
  sender: TabRequestSender,
  sendResponse: (response: unknown) => void,
) => true | undefined;

/**
 * Builds the `chrome.runtime.onMessage` listener that serves one operation.
 *
 * Returns the listener rather than registering it, so the rules above are testable without a
 * `chrome` runtime and the composition root keeps its single `addListener` call per operation.
 */
export function tabRequestListener<TMessage, TResponse>(
  logger: ILogger,
  handler: TabRequestHandler<TMessage, TResponse>,
): TabRequestListener {
  return (message, sender, sendResponse) => {
    if (!handler.claims(message)) {
      return undefined;
    }
    const refusal = handler.malformed?.(message) ?? null;
    if (refusal !== null) {
      return refuse(logger, refusal, sendResponse);
    }
    const claimed = message as TMessage;
    const announcement = handler.announce?.(claimed);
    if (announcement !== undefined) {
      logger.info(announcement);
    }
    const { id: tabId, url: tabUrl } = sender.tab ?? {};
    if (tabId === undefined || tabUrl === undefined) {
      return refuse(logger, handler.unscriptable(claimed), sendResponse);
    }
    void handler.serve(claimed, tabId, tabUrl).then(sendResponse);
    // Keep the message channel open for the async reply above.
    return true;
  };
}

function refuse<TResponse>(
  logger: ILogger,
  refusal: TabRequestRefusal<TResponse>,
  sendResponse: (response: unknown) => void,
): undefined {
  logger.error(refusal.log);
  sendResponse(refusal.response);
  return undefined;
}
