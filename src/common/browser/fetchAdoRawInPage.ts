/** The raw JSON bodies from the ADO REST calls, before parsing into the picker's shapes. */
export interface AdoRawMetadata {
  teams: unknown;
  workItemTypes: unknown;
  /** The project field list, read only to learn which of a type's fields are date-typed. */
  fields: unknown;
  areaPaths: unknown;
  iterationPaths: unknown;
  queryFolders: unknown;
}

/**
 * The endpoints one metadata read fetches, handed over as ONE object.
 *
 * `chrome.scripting.executeScript` requires every entry of `args` to be JSON-serializable, and an
 * omitted positional argument is an unserializable hole that rejects the whole injection before it
 * runs; an absent object property simply disappears. Declared here rather than imported so the
 * injected function keeps no module references.
 */
export interface AdoMetadataFetchUrls {
  teamsUrl: string;
  workItemTypesUrl: string;
  fieldsUrl: string;
  areaPathsUrl: string;
  iterationPathsUrl: string;
  queryFoldersUrl: string;
}

/**
 * Fetch the raw ADO teams, work-item-types, field-list, classification, and saved-query-folder JSON
 * from inside the ADO page.
 *
 * WHY this exists / why it must stay self-contained: In Manifest V3 the extension's content script
 * runs in an isolated world whose origin is `chrome-extension://…`, so its cross-origin fetch to ADO
 * is CORS-blocked; a same-origin fetch from the extension page instead drops ADO's SameSite session
 * cookies and hits a login loop. The only path that is BOTH same-origin AND carries the signed-in
 * session is a fetch running in the ADO tab's MAIN (page) world. This function is therefore injected
 * verbatim via `chrome.scripting.executeScript({ world: "MAIN", func })`, which serializes it with
 * `Function.prototype.toString`. It must not reference any import, module-scoped variable, or build
 * helper — only its parameters and page globals (`fetch`, `Promise`). Promise chaining (not
 * async/await) avoids any transpiler helper being hoisted out of the function body.
 */
export function fetchAdoRawInPage(urls: AdoMetadataFetchUrls): Promise<AdoRawMetadata> {
  const get = (url: string): Promise<unknown> =>
    fetch(url, { credentials: "include", headers: { Accept: "application/json" } })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);

  // The hierarchy reads are the broad ones ADO throttles first, so each gets bounded retries.
  const getWithRetry = (url: string, attempt = 1): Promise<unknown> => {
    // One shared back-off so a refused response and a network error cannot drift apart.
    const retry = (): Promise<unknown> =>
      new Promise<void>((resolve) => setTimeout(resolve, 100 * 2 ** (attempt - 1))).then(() =>
        getWithRetry(url, attempt + 1),
      );
    return fetch(url, { credentials: "include", headers: { Accept: "application/json" } })
      .then((response) => {
        if (response.ok) return response.json();
        const transient =
          response.status === 408 || response.status === 429 || response.status >= 500;
        return !transient || attempt >= 3 ? null : retry();
      })
      .catch(() => (attempt >= 3 ? null : retry()));
  };

  // The teams endpoint pages its results, so walk $skip until a page comes back empty; reading only
  // the first page hides most teams in a large org (thousands are common). Advance $skip by the count
  // actually returned so this stays correct even if the server caps the page below the requested $top.
  // The page cap guards against a server that ignores $skip, which would otherwise loop forever.
  const MAX_TEAM_PAGES = 200;
  const getAllTeams = (baseUrl: string): Promise<unknown> => {
    const teams: unknown[] = [];
    const readPage = (skip: number, pagesLeft: number): Promise<unknown> =>
      get(`${baseUrl}&$skip=${skip}`).then((body) => {
        const page = (body as { value?: unknown } | null)?.value;
        const value = Array.isArray(page) ? (page as unknown[]) : [];
        teams.push(...value);
        if (value.length === 0 || pagesLeft <= 1) {
          // Preserve a "could not read" signal only when the very first request itself failed.
          return skip === 0 && body === null ? null : { value: teams };
        }
        return readPage(skip + value.length, pagesLeft - 1);
      });
    return readPage(0, MAX_TEAM_PAGES);
  };

  return Promise.all([
    getAllTeams(urls.teamsUrl),
    get(urls.workItemTypesUrl),
    get(urls.fieldsUrl),
    getWithRetry(urls.areaPathsUrl),
    getWithRetry(urls.iterationPathsUrl),
    // Deliberately ONE request: ADO answers two levels at a time, and following every truncated
    // folder is hundreds of dependent requests that made the binding form take minutes to fill.
    // The folders below this first body are read one at a time, when the user reaches into one.
    getWithRetry(urls.queryFoldersUrl),
  ]).then((bodies) => ({
    teams: bodies[0],
    workItemTypes: bodies[1],
    fields: bodies[2],
    areaPaths: bodies[3],
    iterationPaths: bodies[4],
    queryFolders: bodies[5],
  }));
}
