/** The serializable result of an ADO request made in the signed-in page world. */
export interface AdoPageRequestOutcome {
  raw: unknown;
  status: number;
  /** Failure stage and browser-provided reason; absent when a JSON body was read. */
  error?: string;
}

export type AdoPageRequestConfig =
  { operation: "read"; url: string } | { operation: "readTeamMembers"; url: string };

/** Execute a credentialed ADO read in MAIN world. */
export function executeAdoRequestInPage(
  config: AdoPageRequestConfig,
): Promise<AdoPageRequestOutcome> {
  const [MAX_ATTEMPTS, MAX_PAGES] = [3, 100];
  // prettier-ignore
  const request = (url: string, init: RequestInit, attempt = 1): Promise<AdoPageRequestOutcome> =>
    fetch(url, init).then(
      (response) => {
        const transient = response.status === 408 || response.status === 429 || response.status >= 500;
        if (!response.ok && transient && attempt < MAX_ATTEMPTS) {
          return new Promise<void>((resolve) => setTimeout(resolve, attempt * 100))
            .then(() => request(url, init, attempt + 1));
        }
        if (!response.ok) return { raw: null, status: response.status, error: `HTTP ${response.status}` };
        return response.json().then(
          (raw: unknown) => ({ raw, status: response.status }),
          (error: unknown) => ({ raw: null, status: response.status, error: `invalid JSON: ${String(error)}` }),
        );
      },
      (error: unknown) => attempt < MAX_ATTEMPTS
        ? new Promise<void>((resolve) => setTimeout(resolve, attempt * 100))
            .then(() => request(url, init, attempt + 1))
        : { raw: null, status: 0, error: `network after ${MAX_ATTEMPTS} attempts: ${String(error)}` },
    );
  const read = (url: string): Promise<AdoPageRequestOutcome> =>
    request(url, { credentials: "include", headers: { Accept: "application/json" } });
  if (config.operation === "read") return read(config.url);

  const readMembers = (
    skip: number,
    page: number,
    entries: unknown[],
  ): Promise<AdoPageRequestOutcome> => {
    if (page >= MAX_PAGES) {
      return Promise.resolve({
        raw: null,
        status: 0,
        error: `team-member pagination exceeded ${MAX_PAGES} pages`,
      });
    }
    const url = new URL(config.url);
    url.searchParams.set("$skip", String(skip));
    return read(url.toString()).then((outcome) => {
      const value = (outcome.raw as { value?: unknown } | null)?.value;
      if (!Array.isArray(value)) return outcome;
      const allEntries = entries.concat(value);
      const requested = Number(url.searchParams.get("$top")) || value.length;
      return value.length === 0 || value.length < requested
        ? { raw: { value: allEntries }, status: outcome.status }
        : readMembers(skip + value.length, page + 1, allEntries);
    });
  };
  return readMembers(0, 0, []);
}
