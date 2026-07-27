import { describe, expect, it, vi } from "vitest";

import {
  RESOLVE_ADO_IDENTITY_NAMES_MESSAGE,
  type ResolveAdoIdentityNamesResponse,
} from "./AdoIdentityNamesRequest";
import {
  MessagingMentionDirectory,
  resolveMentionsIn,
  type SendIdentityNamesRequest,
} from "./MessagingMentionDirectory";

const ADA = "11111111-2222-3333-4444-555555555555";
const GRACE = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

/** A worker reply naming `id`, from a read that completed unless told otherwise. */
function named(id: string, name: string, complete = true): ResolveAdoIdentityNamesResponse {
  return { raw: [{ value: [{ id, providerDisplayName: name }] }], complete };
}

/** A worker reply that answered for nobody. */
function nothing(complete = true): ResolveAdoIdentityNamesResponse {
  return { raw: null, complete };
}

/** A directory over a controllable worker reply, plus the recorders a case asserts on. */
function createDirectory(send: SendIdentityNamesRequest) {
  const info = vi.fn();
  const error = vi.fn();
  return {
    directory: new MessagingMentionDirectory(send, { info, error }),
    info,
    error,
  };
}

describe("MessagingMentionDirectory", () => {
  it("asks the worker for the ids and parses the names it answers with", async () => {
    const send = vi.fn(() => Promise.resolve(named(ADA, "Ada Lovelace")));
    const { directory } = createDirectory(send);

    const names = await directory.resolveNames([ADA.toUpperCase()]);

    expect(send).toHaveBeenCalledWith({ type: RESOLVE_ADO_IDENTITY_NAMES_MESSAGE, ids: [ADA] });
    expect(names.get(ADA)).toBe("Ada Lovelace");
  });

  it("asks about each id only once, however many callers want it", async () => {
    // The same teammates are mentioned across a board's descriptions and every notes panel; without
    // the memo, opening panel after panel would re-ask ADO about the same handful of people.
    const send = vi.fn(() => Promise.resolve(named(ADA, "Ada Lovelace")));
    const { directory } = createDirectory(send);

    await directory.resolveNames([ADA]);
    await directory.resolveNames([ADA]);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("only asks about the ids it has no settled answer for", async () => {
    const send = vi.fn(() => Promise.resolve(named(GRACE, "Grace Hopper")));
    const { directory } = createDirectory(send);

    await directory.resolveNames([ADA]);
    send.mockClear();
    await directory.resolveNames([ADA, GRACE]);

    expect(send).toHaveBeenCalledWith({ type: RESOLVE_ADO_IDENTITY_NAMES_MESSAGE, ids: [GRACE] });
  });

  it("remembers every name it has learned, so a later render can paint them synchronously", async () => {
    const { directory } = createDirectory(() => Promise.resolve(named(ADA, "Ada Lovelace")));

    expect(directory.knownNames().size).toBe(0);
    await directory.resolveNames([ADA]);
    expect(directory.knownNames().get(ADA)).toBe("Ada Lovelace");
  });
});

describe("MessagingMentionDirectory — overlapping callers", () => {
  it("makes the second caller WAIT for a read the first one already started", async () => {
    // The board resolves its descriptions while a notes panel resolves its notes, and both mention
    // the same people. Returning early here is what painted a mention anonymous purely because
    // another panel had asked about that person a moment earlier.
    let release!: (value: ResolveAdoIdentityNamesResponse) => void;
    const send = vi.fn(
      () =>
        new Promise<ResolveAdoIdentityNamesResponse>((resolve) => {
          release = resolve;
        }),
    );
    const { directory } = createDirectory(send);

    const first = directory.resolveNames([ADA]);
    const second = directory.resolveNames([ADA]);
    release(named(ADA, "Ada Lovelace"));

    expect((await second).get(ADA)).toBe("Ada Lovelace");
    expect((await first).get(ADA)).toBe("Ada Lovelace");
    // Still one round-trip between them: waiting is not the same as re-asking.
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("asks only for the ids no in-flight read already covers", async () => {
    let release!: (value: ResolveAdoIdentityNamesResponse) => void;
    const send = vi
      .fn<SendIdentityNamesRequest>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      )
      .mockResolvedValueOnce(named(GRACE, "Grace Hopper"));
    const { directory } = createDirectory(send);

    const first = directory.resolveNames([ADA]);
    const second = directory.resolveNames([ADA, GRACE]);
    release(named(ADA, "Ada Lovelace"));
    await first;

    expect(send).toHaveBeenNthCalledWith(2, {
      type: RESOLVE_ADO_IDENTITY_NAMES_MESSAGE,
      ids: [GRACE],
    });
    // The second caller waited for BOTH reads, so it saw the whole answer.
    expect((await second).get(ADA)).toBe("Ada Lovelace");
  });
});

describe("MessagingMentionDirectory — what is worth asking again", () => {
  it("does not re-ask for an id a COMPLETED read did not recognize", async () => {
    // ADO answered and simply does not know that identity; asking again cannot change its mind, and
    // a board repaints often enough to turn that into a request loop.
    const send = vi.fn(() => Promise.resolve(nothing()));
    const { directory } = createDirectory(send);

    await directory.resolveNames([ADA]);
    await directory.resolveNames([ADA]);

    expect(send).toHaveBeenCalledTimes(1);
  });

  it("retries an id the read never actually put to Azure DevOps", async () => {
    // A failed batch (or a truncated id list) leaves the answer unknown, not absent — remembering it
    // as "this person has no name" would keep the mention anonymous for the rest of the session.
    const send = vi
      .fn<SendIdentityNamesRequest>()
      .mockResolvedValueOnce(nothing(false))
      .mockResolvedValueOnce(named(ADA, "Ada Lovelace"));
    const { directory } = createDirectory(send);

    await directory.resolveNames([ADA]);
    const names = await directory.resolveNames([ADA]);

    expect(send).toHaveBeenCalledTimes(2);
    expect(names.get(ADA)).toBe("Ada Lovelace");
  });

  it("keeps the names an incomplete read did return, and only retries the rest", async () => {
    const send = vi
      .fn<SendIdentityNamesRequest>()
      .mockResolvedValueOnce(named(ADA, "Ada Lovelace", false))
      .mockResolvedValueOnce(named(GRACE, "Grace Hopper"));
    const { directory } = createDirectory(send);

    await directory.resolveNames([ADA, GRACE]);
    await directory.resolveNames([ADA, GRACE]);

    expect(send).toHaveBeenNthCalledWith(2, {
      type: RESOLVE_ADO_IDENTITY_NAMES_MESSAGE,
      ids: [GRACE],
    });
  });

  it("retries after a rejected round-trip and never throws at the view", async () => {
    const send = vi
      .fn<SendIdentityNamesRequest>()
      .mockRejectedValueOnce(new Error("port closed"))
      .mockResolvedValueOnce(named(ADA, "Ada Lovelace"));
    const { directory, error } = createDirectory(send);

    expect((await directory.resolveNames([ADA])).size).toBe(0);
    expect(error).toHaveBeenCalledWith(
      "Could not resolve Azure DevOps mention identities",
      expect.any(Error),
    );
    expect((await directory.resolveNames([ADA])).get(ADA)).toBe("Ada Lovelace");
  });

  it("treats a missing worker reply as an unanswered read", async () => {
    // `chrome.runtime.sendMessage` resolves undefined when no listener claimed the message — which
    // usually means the worker is running older code than the page, i.e. exactly a retryable state.
    const send = vi
      .fn<SendIdentityNamesRequest>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(named(ADA, "Ada Lovelace"));
    const { directory } = createDirectory(send);

    await directory.resolveNames([ADA]);

    expect((await directory.resolveNames([ADA])).get(ADA)).toBe("Ada Lovelace");
  });
});

describe("MessagingMentionDirectory — what it says about a miss", () => {
  it("names the unresolved IDS, so an anonymous mention can be chased down", async () => {
    const { directory, info } = createDirectory(() => Promise.resolve(named(ADA, "Ada Lovelace")));

    await directory.resolveNames([ADA, GRACE]);

    const line = info.mock.calls.map(([message]) => String(message)).join("\n");
    expect(line).toContain("named 1 of 2");
    expect(line).toContain("did not recognize");
    expect(line).toContain(GRACE);
    // The names that DID resolve are never logged: a display name is a person's name.
    expect(line).not.toContain("Ada");
  });

  it("says a miss will be retried when the read never completed", async () => {
    const { directory, info } = createDirectory(() => Promise.resolve(nothing(false)));

    await directory.resolveNames([ADA]);

    expect(info).toHaveBeenCalledWith(expect.stringContaining("no answer arrived for"));
    expect(info).toHaveBeenCalledWith(expect.stringContaining("retried on the next render"));
  });

  it("caps the ids it lists so one bad board cannot flood the bounded log", async () => {
    const many = Array.from(
      { length: 12 },
      (_unused, index) => `00000000-0000-0000-0000-${String(index).padStart(12, "0")}`,
    );
    const { directory, info } = createDirectory(() => Promise.resolve(nothing()));

    await directory.resolveNames(many);

    const line = info.mock.calls.map(([message]) => String(message)).join("\n");
    expect(line).toContain(many[9]!);
    expect(line).not.toContain(many[10]!);
    expect(line).toContain("…");
  });

  it("says so plainly when everything resolved", async () => {
    const { directory, info } = createDirectory(() => Promise.resolve(named(ADA, "Ada Lovelace")));

    await directory.resolveNames([ADA]);

    expect(info).toHaveBeenCalledWith("Mention resolution named all 1 requested identity id(s).");
  });
});

describe("resolveMentionsIn", () => {
  it("collects the mentions out of the content and resolves them in one call", async () => {
    const send = vi.fn(() => Promise.resolve(named(ADA, "Ada Lovelace")));
    const { directory } = createDirectory(send);

    const names = await resolveMentionsIn(directory, [
      `@<${ADA}> please review`,
      `<a data-vss-mention="version:2.0,${GRACE}">@Grace</a>`,
    ]);

    expect(send).toHaveBeenCalledWith({
      type: RESOLVE_ADO_IDENTITY_NAMES_MESSAGE,
      ids: [ADA, GRACE],
    });
    expect(names.get(ADA)).toBe("Ada Lovelace");
  });

  it("asks nothing when the content mentions nobody", async () => {
    const send = vi.fn(() => Promise.resolve(nothing()));
    const { directory } = createDirectory(send);

    expect((await resolveMentionsIn(directory, ["plain text", null])).size).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});
