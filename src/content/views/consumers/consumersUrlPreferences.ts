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
  const parameters = new URLSearchParams(search);
  parameters.delete(AREA_PATH_PARAM);
  for (const path of areaPaths) parameters.append(AREA_PATH_PARAM, path);
  const value = parameters.toString();
  return value.length === 0 ? "" : `?${value}`;
}
