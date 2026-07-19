/**
 * Sends one request to an ADO tab's already-injected content script and interprets the reply.
 *
 * Both tab readers need the identical best-effort round-trip: `chrome.tabs.sendMessage` can reject
 * when the tab has no receiver yet (e.g. it loaded before the extension, or is a non-ADO page that
 * matched the glob), and that must resolve to a "nothing to report" value rather than throw. This
 * centralizes the try/catch-to-fallback contract so the readers only supply how to read the reply.
 *
 * `interpret` maps the raw response into the caller's value; `fallback` is returned when there is no
 * receiver. Requiring the reader to pass `fallback` keeps this helper unaware of any domain type.
 */
export async function requestFromTab<TResponse, TResult>(
  tabId: number,
  message: unknown,
  interpret: (response: TResponse | undefined) => TResult,
  fallback: TResult,
): Promise<TResult> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, message)) as TResponse | undefined;
    return interpret(response);
  } catch {
    return fallback;
  }
}
