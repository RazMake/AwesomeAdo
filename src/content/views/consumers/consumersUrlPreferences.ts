import { CONSUMER_CONDITIONS, type ConsumerCondition } from "./ConsumerConditionFilter";
import { REQUEST_STATUSES, type RequestStateCondition, type RequestStateId } from "./requestStates";

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

const MODE_PARAM = "mode";
const CONSUMERS_MODE = "consumers";
const REQUESTS_MODE = "requests";

/**
 * Read which mode a link opens in: true for the consumer cards, false for the requests list, null
 * when the link does not say (the reader's saved choice then applies).
 */
export function readConsumersUrlMode(search: string): boolean | null {
  const mode = new URLSearchParams(search).get(MODE_PARAM)?.trim();
  if (mode === CONSUMERS_MODE) return true;
  if (mode === REQUESTS_MODE) return false;
  return null;
}

/** Rewrite a query string so it names the mode on screen, keeping every other parameter. */
export function consumersSearchWithMode(search: string, showConsumers: boolean): string {
  const parameters = new URLSearchParams(search);
  parameters.set(MODE_PARAM, showConsumers ? CONSUMERS_MODE : REQUESTS_MODE);
  return `?${parameters.toString()}`;
}

const CONSUMER_CONDITION_PARAM = "consumerState";

/** Read the consumers' By state condition; an unknown value is ignored, meaning "all". */
export function readConsumersUrlCondition(search: string): ConsumerCondition {
  const value = new URLSearchParams(search).get(CONSUMER_CONDITION_PARAM)?.trim();
  return CONSUMER_CONDITIONS.find((condition) => condition === value) ?? "all";
}

/** Rewrite a query string so it names this By state condition; "all" drops the parameter. */
export function consumersSearchWithCondition(search: string, condition: ConsumerCondition): string {
  return searchWithRepeated(
    search,
    CONSUMER_CONDITION_PARAM,
    condition === "all" ? [] : [condition],
  );
}

const REQUEST_STATE_PARAM = "requestState";
const REQUEST_STATE_EXCLUDED_PARAM = "requestStateNot";

function readRequestStates(search: string, name: string): Set<RequestStateId> {
  const known = new Set<string>(REQUEST_STATUSES.map(({ id }) => id));
  const values = new URLSearchParams(search)
    .getAll(name)
    .map((value) => value.trim())
    .filter((value) => known.has(value));
  return new Set(values as RequestStateId[]);
}

/** Read the requests list's By state condition; unknown states are ignored. */
export function readConsumersUrlRequestStates(search: string): RequestStateCondition {
  return {
    required: readRequestStates(search, REQUEST_STATE_PARAM),
    excluded: readRequestStates(search, REQUEST_STATE_EXCLUDED_PARAM),
  };
}

/** Rewrite a query string so it names this request By state condition. */
export function consumersSearchWithRequestStates(
  search: string,
  condition: RequestStateCondition,
): string {
  return searchWithRepeated(
    searchWithRepeated(search, REQUEST_STATE_PARAM, condition.required),
    REQUEST_STATE_EXCLUDED_PARAM,
    condition.excluded,
  );
}
