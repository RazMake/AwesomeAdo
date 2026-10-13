import type { ILogger } from "../logging/ILogger";

import {
  classifyAdoSessionProbe,
  type AdoSessionProbeOutcome,
  type AdoSessionState,
} from "./AdoSessionProbe";

/** A background tab opened to renew the sign-in; closed once renewal settles either way. */
export interface IRenewalTab {
  close(): Promise<void>;
}

/** Everything the guard needs from the browser, injected at the background composition root. */
export interface AdoSessionGuardDependencies {
  /** The organization base URL the tab belongs to, or null when it is not an ADO tab. */
  organizationOf(tabId: number): Promise<string | null>;
  /** Run the sign-in probe inside the tab's own page world. */
  probe(tabId: number, organizationBase: string): Promise<AdoSessionProbeOutcome>;
  /** Open the organization in an inactive tab so ADO can run its sign-in redirects. */
  openRenewalTab(sourceTabId: number, organizationBase: string): Promise<IRenewalTab>;
  /** Tell a tab whether its sign-in is (still) expired, so it can show or hide its banner. */
  notify(tabId: number, signedIn: boolean): void;
  now(): number;
  wait(milliseconds: number): Promise<void>;
  logger: ILogger;
}

/** A sign-in confirmed this recently is trusted without asking ADO again. */
export const SESSION_CONFIRMATION_TTL_MS = 30_000;
export const RENEWAL_POLL_INTERVAL_MS = 1_500;
export const RENEWAL_TIMEOUT_MS = 15_000;
/** After a failed silent renewal, requests do not open another renewal tab for this long. */
export const RENEWAL_RETRY_COOLDOWN_MS = 120_000;

interface OrganizationSession {
  confirmedAt: number | null;
  renewalFailedAt: number | null;
  /** The last logged conclusion, so only a flip is logged. */
  state: AdoSessionState | null;
  /** The check every concurrent request for this organization shares. */
  pending: Promise<void> | null;
  /** Tabs told their sign-in expired, to be told again once it is restored. */
  expiredTabs: Set<number>;
}

/**
 * Makes sure a tab's Azure DevOps sign-in is still valid before the worker runs a request in it.
 *
 * Every request rides the page's session cookie, which Azure DevOps lets expire while a tab stays
 * open; a credentialed `fetch` cannot renew it, because renewal needs a top-level visit to the sign-in
 * flow. So before a request the guard checks the session (at most once per
 * `SESSION_CONFIRMATION_TTL_MS` per organization) and, when it has expired, opens the organization in
 * an inactive tab where single sign-on usually completes silently. The request then runs on the
 * renewed session instead of failing. When renewal needs the user, the tab is told to show its
 * sign-in banner and the request proceeds to fail with its own error.
 *
 * Sessions are keyed by organization, not by tab: every tab of an organization shares one cookie.
 */
export class AdoSessionGuard {
  private readonly sessions = new Map<string, OrganizationSession>();

  constructor(private readonly deps: AdoSessionGuardDependencies) {}

  /** Resolve once the sign-in is confirmed, renewed, or known to need the user. Never rejects. */
  async ensureSignedIn(tabId: number): Promise<void> {
    try {
      const organization = await this.deps.organizationOf(tabId);
      if (organization === null) {
        return;
      }
      const session = this.sessionFor(organization);
      if (this.isFresh(session)) {
        return;
      }
      session.pending ??= this.check(tabId, organization, session).finally(() => {
        session.pending = null;
      });
      await session.pending;
      if (session.state === "expired") {
        session.expiredTabs.add(tabId);
        this.deps.notify(tabId, false);
      }
    } catch (error: unknown) {
      // A request must never be blocked by the check that was meant to help it.
      this.deps.logger.error(`Could not check the Azure DevOps sign-in for tab ${tabId}`, error);
    }
  }

  private sessionFor(organization: string): OrganizationSession {
    let session = this.sessions.get(organization);
    if (session === undefined) {
      session = {
        confirmedAt: null,
        renewalFailedAt: null,
        state: null,
        pending: null,
        expiredTabs: new Set(),
      };
      this.sessions.set(organization, session);
    }
    return session;
  }

  private isFresh(session: OrganizationSession): boolean {
    return (
      session.confirmedAt !== null &&
      this.deps.now() - session.confirmedAt < SESSION_CONFIRMATION_TTL_MS
    );
  }

  private async check(
    tabId: number,
    organization: string,
    session: OrganizationSession,
  ): Promise<void> {
    const { state, detail } = await this.probe(tabId, organization);
    if (state === "signed-in") {
      this.confirm(session);
      return;
    }
    this.record(session, state, `sign-in check was ${state} (${detail})`);
    if (state === "unknown" || this.inRenewalCooldown(session)) {
      return;
    }
    if (await this.renew(tabId, organization)) {
      this.confirm(session);
      return;
    }
    session.renewalFailedAt = this.deps.now();
  }

  private inRenewalCooldown(session: OrganizationSession): boolean {
    return (
      session.renewalFailedAt !== null &&
      this.deps.now() - session.renewalFailedAt < RENEWAL_RETRY_COOLDOWN_MS
    );
  }

  private async probe(
    tabId: number,
    organization: string,
  ): Promise<{ state: AdoSessionState; detail: string }> {
    try {
      const outcome = await this.deps.probe(tabId, organization);
      const detail = `HTTP ${outcome.status}${outcome.error === undefined ? "" : `, ${outcome.error}`}`;
      return { state: classifyAdoSessionProbe(outcome), detail };
    } catch (error: unknown) {
      // Injection fails on a closed or navigating tab; that says nothing about the session.
      this.deps.logger.error(`Could not run the Azure DevOps sign-in check in tab ${tabId}`, error);
      return { state: "unknown", detail: "probe failed" };
    }
  }

  private async renew(tabId: number, organization: string): Promise<boolean> {
    this.deps.logger.info("Renewing the expired Azure DevOps sign-in in a background tab.");
    const startedAt = this.deps.now();
    let renewalTab: IRenewalTab;
    try {
      renewalTab = await this.deps.openRenewalTab(tabId, organization);
    } catch (error: unknown) {
      this.deps.logger.error("Could not open a background tab to renew the sign-in", error);
      return false;
    }
    try {
      return await this.pollUntilSignedIn(tabId, organization, startedAt);
    } finally {
      await renewalTab.close().catch((error: unknown) => {
        this.deps.logger.error("Could not close the sign-in renewal tab", error);
      });
    }
  }

  private async pollUntilSignedIn(
    tabId: number,
    organization: string,
    startedAt: number,
  ): Promise<boolean> {
    while (this.deps.now() - startedAt < RENEWAL_TIMEOUT_MS) {
      await this.deps.wait(RENEWAL_POLL_INTERVAL_MS);
      if ((await this.probe(tabId, organization)).state === "signed-in") {
        const seconds = Math.round((this.deps.now() - startedAt) / 1000);
        this.deps.logger.info(`Renewed the Azure DevOps sign-in silently after ${seconds}s.`);
        return true;
      }
    }
    this.deps.logger.error(
      `Could not renew the Azure DevOps sign-in within ${RENEWAL_TIMEOUT_MS / 1000}s; ` +
        "it needs an interactive sign-in, so the page shows its sign-in banner.",
    );
    return false;
  }

  private confirm(session: OrganizationSession): void {
    session.confirmedAt = this.deps.now();
    session.renewalFailedAt = null;
    this.record(session, "signed-in", "sign-in confirmed");
    for (const tabId of session.expiredTabs) {
      this.deps.notify(tabId, true);
    }
    session.expiredTabs.clear();
  }

  private record(session: OrganizationSession, state: AdoSessionState, message: string): void {
    // The first confirmation is the normal case and not worth a line; every later flip is.
    if (session.state !== state && !(session.state === null && state === "signed-in")) {
      this.deps.logger.info(`Azure DevOps ${message}.`);
    }
    session.state = state;
  }
}
