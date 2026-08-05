/**
 * Encode a page-world config for `chrome.scripting.executeScript`.
 *
 * WHY the config does not travel as a plain object: `executeScript` silently DROPS every
 * null-valued property from `args`, at any depth — `{ value: null }` arrives in the page as `{}`,
 * with the key itself gone. The injected function then reads `undefined` where the worker sent
 * `null` and takes the "nothing was supplied" branch. That is how clearing an ETA became a JSON
 * Patch `add` carrying no value at all, which Azure DevOps rejects with "Value cannot be null"
 * (HTTP 400), and how a move to top level (`parentLinkUrl: null`) would have re-linked the item to
 * nowhere. A JSON string crosses the boundary byte for byte, so any config whose `null` MEANS
 * something travels encoded and the injected function parses it back.
 *
 * Only `args` are affected; values RETURNED from the page keep their nulls.
 */
export function encodeInjectedConfig(config: unknown): string {
  return JSON.stringify(config);
}
