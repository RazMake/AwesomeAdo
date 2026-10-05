/** One full area path per parameter, repeated, so no separator can split a path in half. */
const AREA_PATH_PARAM = "areaPath";

/**
 * Read the header area-path filter a Consumers View link asks the board to open on.
 *
 * Takes the search string rather than the whole URL so nothing here can throw: a filter the board
 * merely starts from must never be able to break the page it opens.
 */
export function readConsumersUrlAreaPaths(search: string): string[] {
  const paths = new URLSearchParams(search)
    .getAll(AREA_PATH_PARAM)
    .map((path) => path.trim())
    .filter((path) => path.length > 0);
  return [...new Set(paths)];
}

/**
 * Rewrite a query string so it names exactly these area paths, leaving every other parameter Azure
 * DevOps put there untouched. An empty selection drops the parameter, so an unfiltered board keeps
 * the plain query address.
 */
export function consumersSearchWithAreaPaths(search: string, areaPaths: Iterable<string>): string {
  return searchWithRepeated(search, AREA_PATH_PARAM, areaPaths);
}

/** Replace every value of one repeated parameter; an empty result drops the question mark too. */
function searchWithRepeated(search: string, name: string, values: Iterable<string>): string {
  const parameters = new URLSearchParams(search);
  parameters.delete(name);
  for (const value of values) parameters.append(name, value);
  const value = parameters.toString();
  return value.length === 0 ? "" : `?${value}`;
}

/** One consumer work-item id per parameter, repeated like the area paths. */
const CONSUMER_PARAM = "consumer";

/**
 * Read the consumers a Consumers View link narrows the board to. Anything that is not a positive
 * whole number is ignored rather than rejected, for the same never-break-the-page reason.
 */
export function readConsumersUrlConsumerIds(search: string): number[] {
  const ids = new URLSearchParams(search)
    .getAll(CONSUMER_PARAM)
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value))
    .map(Number)
    .filter((id) => id > 0);
  return [...new Set(ids)];
}

/** Rewrite a query string so it names exactly these consumers, keeping every other parameter. */
export function consumersSearchWithConsumerIds(search: string, ids: Iterable<number>): string {
  return searchWithRepeated(search, CONSUMER_PARAM, [...ids].map(String));
}
