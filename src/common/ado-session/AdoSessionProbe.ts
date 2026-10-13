import { ADO_CONNECTION_DATA_API_VERSION } from "../ado/adoApi";
import { asRecord, nonEmptyString } from "../ado/rawJson";

/** What one sign-in check concluded about the Azure DevOps session a tab is using. */
export type AdoSessionState = "signed-in" | "expired" | "unknown";

/** The raw answer of the page-world probe (`common/browser/probeAdoSessionInPage`). */
export interface AdoSessionProbeOutcome {
  /** HTTP status; 0 when no response arrived, 302 when ADO redirected toward sign-in. */
  status: number;
  /** The response text, or null when there was none to read. */
  body: string | null;
  /** Why no usable body arrived; absent when the body was read. */
  error?: string;
}

/**
 * The URL a sign-in check reads: the organization's `ConnectionData`, the cheapest call that names
 * the signed-in identity. Pinned to the same preview api-version as the current-user read, because a
 * released version answers with an error envelope that parses as JSON but names nobody.
 */
export function buildAdoSessionProbeUrl(organizationBase: string): string {
  return `${organizationBase}/_apis/ConnectionData?api-version=${ADO_CONNECTION_DATA_API_VERSION}`;
}

/**
 * Classify one probe answer.
 *
 * Only answers that prove the session is gone count as `expired`: a 401, a redirect toward sign-in,
 * a success status carrying something other than JSON (ADO's sign-in page), or JSON naming no — or
 * the anonymous — identity. Network faults, throttling, server errors and refusals say nothing about
 * the session, so they are `unknown` and must never trigger a renewal.
 */
export function classifyAdoSessionProbe(outcome: AdoSessionProbeOutcome): AdoSessionState {
  const byStatus = classifyByStatus(outcome.status);
  if (byStatus !== null) {
    return byStatus;
  }
  return outcome.body === null ? "unknown" : classifyBody(outcome.body);
}

function classifyByStatus(status: number): AdoSessionState | null {
  if (status === 401 || (status >= 300 && status < 400)) {
    return "expired";
  }
  return status < 200 || status >= 300 ? "unknown" : null;
}

function classifyBody(body: string): AdoSessionState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Not a failure to log: a success status with a non-JSON body is ADO's HTML sign-in page, which
    // is exactly the conclusion this check exists to reach. The guard logs the resulting flip.
    return "expired";
  }
  const user = asRecord(asRecord(parsed)?.authenticatedUser);
  const id = nonEmptyString(user?.id);
  const descriptor = nonEmptyString(user?.descriptor) ?? "";
  return id === null || descriptor.includes("UnauthenticatedIdentity") ? "expired" : "signed-in";
}
