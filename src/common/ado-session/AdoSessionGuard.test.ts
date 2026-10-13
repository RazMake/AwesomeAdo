import { describe, expect, it, vi } from "vitest";

import {
  AdoSessionGuard,
  RENEWAL_POLL_INTERVAL_MS,
  RENEWAL_RETRY_COOLDOWN_MS,
  RENEWAL_TIMEOUT_MS,
  SESSION_CONFIRMATION_TTL_MS,
  type AdoSessionGuardDependencies,
  type IRenewalTab,
} from "./AdoSessionGuard";
import type { AdoSessionProbeOutcome } from "./AdoSessionProbe";

const ORGANIZATION = "https://dev.azure.com/contoso";
const SIGNED_IN: AdoSessionProbeOutcome = {
  status: 200,
  body: JSON.stringify({ authenticatedUser: { id: "user-1", descriptor: "ClaimsIdentity;u" } }),
};
const EXPIRED: AdoSessionProbeOutcome = { status: 401, body: "" };
const UNKNOWN: AdoSessionProbeOutcome = { status: 0, body: null, error: "network: offline" };
/** Polls a renewal that never succeeds makes before giving up. */
const POLLS_UNTIL_TIMEOUT = RENEWAL_TIMEOUT_MS / RENEWAL_POLL_INTERVAL_MS;

const EXPIRED_LOG = "Azure DevOps sign-in check was expired (HTTP 401).";
const CONFIRMED_LOG = "Azure DevOps sign-in confirmed.";
const RENEWING_LOG = "Renewing the expired Azure DevOps sign-in in a background tab.";
const TIMEOUT_LOG =
  `Could not renew the Azure DevOps sign-in within ${RENEWAL_TIMEOUT_MS / 1000}s; ` +
  "it needs an interactive sign-in, so the page shows its sign-in banner.";

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** Let pending promise continuations run, without relying on timers. */
async function flushMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    await Promise.resolve();
  }
}

/** A guard over fake browser deps whose clock only moves when the guard waits or a test advances it. */
function createHarness() {
  let time = 0;
  const renewalTab = { close: vi.fn<() => Promise<void>>(() => Promise.resolve()) };
  const deps = {
    organizationOf: vi.fn<(tabId: number) => Promise<string | null>>(() =>
      Promise.resolve(ORGANIZATION),
    ),
    probe: vi.fn<(tabId: number, organization: string) => Promise<AdoSessionProbeOutcome>>(() =>
      Promise.resolve(SIGNED_IN),
    ),
    openRenewalTab: vi.fn<(tabId: number, organization: string) => Promise<IRenewalTab>>(() =>
      Promise.resolve(renewalTab),
    ),
    notify: vi.fn<(tabId: number, signedIn: boolean) => void>(),
    now: () => time,
    wait: vi.fn((milliseconds: number) => {
      time += milliseconds;
      return Promise.resolve();
    }),
    logger: { info: vi.fn<(message: string) => void>(), error: vi.fn() },
  } satisfies AdoSessionGuardDependencies;
  const advance = (milliseconds: number): void => {
    time += milliseconds;
  };
  return { deps, renewalTab, advance, now: () => time, guard: new AdoSessionGuard(deps) };
}

type Harness = ReturnType<typeof createHarness>;

/** Answer the next probes with `outcomes` in order, then keep answering with `fallback`. */
function probeAnswers(
  harness: Harness,
  fallback: AdoSessionProbeOutcome,
  ...outcomes: AdoSessionProbeOutcome[]
): void {
  harness.deps.probe.mockImplementation(() => Promise.resolve(fallback));
  for (const outcome of outcomes) {
    harness.deps.probe.mockResolvedValueOnce(outcome);
  }
}

function infoLines(harness: Harness): string[] {
  return harness.deps.logger.info.mock.calls.map(([message]) => message);
}

/** Leave the organization expired after a renewal that timed out, starting the cooldown. */
async function failRenewal(harness: Harness, tabId: number): Promise<void> {
  probeAnswers(harness, EXPIRED);
  await harness.guard.ensureSignedIn(tabId);
}

describe("AdoSessionGuard without a session to check", () => {
  it("proceeds without probing when the tab is not an Azure DevOps tab", async () => {
    const harness = createHarness();
    harness.deps.organizationOf.mockResolvedValue(null);

    await harness.guard.ensureSignedIn(1);

    expect(harness.deps.probe).not.toHaveBeenCalled();
    expect(harness.deps.notify).not.toHaveBeenCalled();
    expect(harness.deps.logger.info).not.toHaveBeenCalled();
  });

  it("logs and resolves when the tab's organization cannot be read", async () => {
    const harness = createHarness();
    const failure = new Error("No tab with id: 4");
    harness.deps.organizationOf.mockRejectedValue(failure);

    await expect(harness.guard.ensureSignedIn(4)).resolves.toBeUndefined();

    expect(harness.deps.logger.error).toHaveBeenCalledWith(
      "Could not check the Azure DevOps sign-in for tab 4",
      failure,
    );
    expect(harness.deps.probe).not.toHaveBeenCalled();
  });
});

describe("AdoSessionGuard confirming a signed-in session", () => {
  it("probes the tab once and confirms silently", async () => {
    const harness = createHarness();

    await harness.guard.ensureSignedIn(3);

    expect(harness.deps.probe).toHaveBeenCalledExactlyOnceWith(3, ORGANIZATION);
    expect(harness.deps.logger.info).not.toHaveBeenCalled();
    expect(harness.deps.openRenewalTab).not.toHaveBeenCalled();
    expect(harness.deps.notify).not.toHaveBeenCalled();
  });

  it("trusts a confirmation for the TTL across tabs, then probes again", async () => {
    const harness = createHarness();
    await harness.guard.ensureSignedIn(1);

    harness.advance(SESSION_CONFIRMATION_TTL_MS - 1);
    await harness.guard.ensureSignedIn(2);
    expect(harness.deps.probe).toHaveBeenCalledTimes(1);

    harness.advance(1);
    await harness.guard.ensureSignedIn(2);
    expect(harness.deps.probe).toHaveBeenCalledTimes(2);
    expect(harness.deps.logger.info).not.toHaveBeenCalled();
  });

  it("keeps a separate confirmation per organization", async () => {
    const harness = createHarness();
    harness.deps.organizationOf.mockImplementation((tabId) =>
      Promise.resolve(tabId === 1 ? ORGANIZATION : "https://dev.azure.com/fabrikam"),
    );

    await harness.guard.ensureSignedIn(1);
    await harness.guard.ensureSignedIn(2);

    expect(harness.deps.probe.mock.calls).toEqual([
      [1, ORGANIZATION],
      [2, "https://dev.azure.com/fabrikam"],
    ]);
  });
});

describe("AdoSessionGuard on an inconclusive check", () => {
  it("neither renews nor notifies, and logs the flip once", async () => {
    const harness = createHarness();
    probeAnswers(harness, UNKNOWN);

    await harness.guard.ensureSignedIn(1);
    await harness.guard.ensureSignedIn(1);

    expect(harness.deps.probe).toHaveBeenCalledTimes(2);
    expect(harness.deps.openRenewalTab).not.toHaveBeenCalled();
    expect(harness.deps.notify).not.toHaveBeenCalled();
    expect(infoLines(harness)).toEqual([
      "Azure DevOps sign-in check was unknown (HTTP 0, network: offline).",
    ]);
  });

  it("logs a probe that cannot run and treats it as unknown", async () => {
    const harness = createHarness();
    const failure = new Error("Frame was removed");
    harness.deps.probe.mockRejectedValue(failure);

    await harness.guard.ensureSignedIn(7);

    expect(harness.deps.logger.error).toHaveBeenCalledWith(
      "Could not run the Azure DevOps sign-in check in tab 7",
      failure,
    );
    expect(harness.deps.openRenewalTab).not.toHaveBeenCalled();
    expect(harness.deps.notify).not.toHaveBeenCalled();
    expect(infoLines(harness)).toEqual(["Azure DevOps sign-in check was unknown (probe failed)."]);
  });

  it("logs the flip back to signed in once a later check succeeds", async () => {
    const harness = createHarness();
    probeAnswers(harness, SIGNED_IN, UNKNOWN);

    await harness.guard.ensureSignedIn(1);
    await harness.guard.ensureSignedIn(1);

    expect(infoLines(harness)).toEqual([
      "Azure DevOps sign-in check was unknown (HTTP 0, network: offline).",
      CONFIRMED_LOG,
    ]);
  });
});

describe("AdoSessionGuard renewing an expired session", () => {
  it("renews in a background tab, polls until signed in, and closes the tab", async () => {
    const harness = createHarness();
    probeAnswers(harness, SIGNED_IN, EXPIRED, EXPIRED);

    await harness.guard.ensureSignedIn(5);

    expect(harness.deps.openRenewalTab).toHaveBeenCalledExactlyOnceWith(5, ORGANIZATION);
    expect(harness.deps.wait.mock.calls).toEqual([
      [RENEWAL_POLL_INTERVAL_MS],
      [RENEWAL_POLL_INTERVAL_MS],
    ]);
    expect(harness.deps.probe).toHaveBeenCalledTimes(3);
    expect(harness.renewalTab.close).toHaveBeenCalledTimes(1);
    expect(harness.deps.notify).not.toHaveBeenCalled();
    expect(infoLines(harness)).toEqual([
      EXPIRED_LOG,
      RENEWING_LOG,
      "Renewed the Azure DevOps sign-in silently after 3s.",
      CONFIRMED_LOG,
    ]);
  });

  it("trusts a renewed session for the TTL", async () => {
    const harness = createHarness();
    probeAnswers(harness, SIGNED_IN, EXPIRED);
    await harness.guard.ensureSignedIn(5);

    await harness.guard.ensureSignedIn(6);

    expect(harness.deps.probe).toHaveBeenCalledTimes(2);
  });

  it("keeps polling past a poll that cannot run", async () => {
    const harness = createHarness();
    probeAnswers(harness, SIGNED_IN, EXPIRED);
    harness.deps.probe.mockRejectedValueOnce(new Error("navigating"));

    await harness.guard.ensureSignedIn(5);

    expect(harness.deps.probe).toHaveBeenCalledTimes(3);
    expect(harness.deps.logger.error).toHaveBeenCalledTimes(1);
    expect(harness.deps.notify).not.toHaveBeenCalled();
  });
});

describe("AdoSessionGuard when renewal fails", () => {
  it("gives up at the timeout, closes the tab, and tells the tab it is signed out", async () => {
    const harness = createHarness();

    await failRenewal(harness, 2);

    expect(harness.deps.probe).toHaveBeenCalledTimes(1 + POLLS_UNTIL_TIMEOUT);
    expect(harness.now()).toBe(RENEWAL_TIMEOUT_MS);
    expect(harness.renewalTab.close).toHaveBeenCalledTimes(1);
    expect(harness.deps.logger.error).toHaveBeenCalledExactlyOnceWith(TIMEOUT_LOG);
    expect(harness.deps.notify).toHaveBeenCalledExactlyOnceWith(2, false);
    expect(infoLines(harness)).toEqual([EXPIRED_LOG, RENEWING_LOG]);
  });

  it("logs a renewal tab that cannot be opened and tells the tab it is signed out", async () => {
    const harness = createHarness();
    const failure = new Error("Tabs cannot be edited right now");
    harness.deps.openRenewalTab.mockRejectedValue(failure);
    probeAnswers(harness, EXPIRED);

    await harness.guard.ensureSignedIn(2);

    expect(harness.deps.logger.error).toHaveBeenCalledExactlyOnceWith(
      "Could not open a background tab to renew the sign-in",
      failure,
    );
    expect(harness.deps.wait).not.toHaveBeenCalled();
    expect(harness.deps.notify).toHaveBeenCalledExactlyOnceWith(2, false);
  });

  it("logs a renewal tab that cannot be closed without failing the renewal", async () => {
    const harness = createHarness();
    const failure = new Error("No tab with id: 99");
    harness.renewalTab.close.mockRejectedValue(failure);
    probeAnswers(harness, SIGNED_IN, EXPIRED);

    await harness.guard.ensureSignedIn(2);

    expect(harness.deps.logger.error).toHaveBeenCalledExactlyOnceWith(
      "Could not close the sign-in renewal tab",
      failure,
    );
    expect(harness.deps.notify).not.toHaveBeenCalled();
    expect(infoLines(harness)).toContain(CONFIRMED_LOG);
  });
});

describe("AdoSessionGuard renewal cooldown", () => {
  it("does not open another renewal tab during the cooldown, but still notifies", async () => {
    const harness = createHarness();
    await failRenewal(harness, 1);

    harness.advance(RENEWAL_RETRY_COOLDOWN_MS - 1);
    await harness.guard.ensureSignedIn(2);

    expect(harness.deps.openRenewalTab).toHaveBeenCalledTimes(1);
    expect(harness.deps.probe).toHaveBeenCalledTimes(2 + POLLS_UNTIL_TIMEOUT);
    expect(harness.deps.notify.mock.calls).toEqual([
      [1, false],
      [2, false],
    ]);
    expect(infoLines(harness)).toEqual([EXPIRED_LOG, RENEWING_LOG]);
  });

  it("tries to renew again once the cooldown has passed", async () => {
    const harness = createHarness();
    await failRenewal(harness, 1);

    harness.advance(RENEWAL_RETRY_COOLDOWN_MS);
    await harness.guard.ensureSignedIn(1);

    expect(harness.deps.openRenewalTab).toHaveBeenCalledTimes(2);
    expect(harness.renewalTab.close).toHaveBeenCalledTimes(2);
  });
});

describe("AdoSessionGuard restoring tabs told they were signed out", () => {
  it("tells every expired tab once that its sign-in is restored", async () => {
    const harness = createHarness();
    await failRenewal(harness, 1);
    await harness.guard.ensureSignedIn(2);
    harness.deps.notify.mockClear();
    probeAnswers(harness, SIGNED_IN);

    await harness.guard.ensureSignedIn(3);
    harness.advance(SESSION_CONFIRMATION_TTL_MS);
    await harness.guard.ensureSignedIn(3);

    expect(harness.deps.notify.mock.calls).toEqual([
      [1, true],
      [2, true],
    ]);
    expect(infoLines(harness)).toEqual([EXPIRED_LOG, RENEWING_LOG, CONFIRMED_LOG]);
  });

  it("tells a tab only once while it stays signed out repeatedly", async () => {
    const harness = createHarness();
    await failRenewal(harness, 1);
    await harness.guard.ensureSignedIn(1);
    harness.deps.notify.mockClear();
    probeAnswers(harness, SIGNED_IN);

    await harness.guard.ensureSignedIn(1);

    expect(harness.deps.notify).toHaveBeenCalledExactlyOnceWith(1, true);
  });
});

describe("AdoSessionGuard with concurrent requests", () => {
  it("shares one probe between concurrent requests for the same organization", async () => {
    const harness = createHarness();
    const answer = deferred<AdoSessionProbeOutcome>();
    harness.deps.probe.mockReturnValueOnce(answer.promise);

    const first = harness.guard.ensureSignedIn(1);
    const second = harness.guard.ensureSignedIn(2);
    await flushMicrotasks();
    expect(harness.deps.probe).toHaveBeenCalledTimes(1);
    answer.resolve(SIGNED_IN);
    await Promise.all([first, second]);

    expect(harness.deps.probe).toHaveBeenCalledTimes(1);
  });

  it("shares one renewal and notifies every waiting tab when it fails", async () => {
    const harness = createHarness();
    const answer = deferred<AdoSessionProbeOutcome>();
    probeAnswers(harness, EXPIRED);
    harness.deps.probe.mockReturnValueOnce(answer.promise);

    const first = harness.guard.ensureSignedIn(1);
    const second = harness.guard.ensureSignedIn(2);
    await flushMicrotasks();
    expect(harness.deps.probe).toHaveBeenCalledTimes(1);
    answer.resolve(EXPIRED);
    await Promise.all([first, second]);

    expect(harness.deps.openRenewalTab).toHaveBeenCalledTimes(1);
    expect(harness.deps.probe).toHaveBeenCalledTimes(1 + POLLS_UNTIL_TIMEOUT);
    expect(harness.deps.notify.mock.calls).toEqual([
      [1, false],
      [2, false],
    ]);
  });

  it("starts a fresh check once the shared one has settled", async () => {
    const harness = createHarness();
    probeAnswers(harness, UNKNOWN);

    await Promise.all([harness.guard.ensureSignedIn(1), harness.guard.ensureSignedIn(2)]);
    await harness.guard.ensureSignedIn(1);

    expect(harness.deps.probe).toHaveBeenCalledTimes(2);
  });
});
