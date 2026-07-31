/** The serializable result of reading a sprint's capacity roster in the ADO page world. */
export interface CapacityFetchOutcome {
  raw: unknown;
  status: number;
}

/**
 * Fetch a sprint capacity roster from inside the ADO page, retrying transient GET failures at most
 * three times. This function is injected verbatim into MAIN world and must remain self-contained.
 */
export function fetchAdoCapacityInPage(capacityUrl: string): Promise<CapacityFetchOutcome> {
  const MAX_ATTEMPTS = 3;

  const read = (attempt: number): Promise<CapacityFetchOutcome> =>
    fetch(capacityUrl, {
      credentials: "include",
      headers: { Accept: "application/json" },
    }).then(
      (response) => {
        const transient =
          response.status === 408 || response.status === 429 || response.status >= 500;
        if (!response.ok && transient && attempt < MAX_ATTEMPTS) {
          return new Promise<void>((resolve) => setTimeout(resolve, attempt * 100)).then(() =>
            read(attempt + 1),
          );
        }
        if (!response.ok) {
          return { raw: null, status: response.status };
        }
        return response.json().then(
          (raw: unknown) => ({ raw, status: response.status }),
          () => ({ raw: null, status: response.status }),
        );
      },
      () =>
        attempt < MAX_ATTEMPTS
          ? new Promise<void>((resolve) => setTimeout(resolve, attempt * 100)).then(() =>
              read(attempt + 1),
            )
          : { raw: null, status: 0 },
    );

  return read(1);
}
