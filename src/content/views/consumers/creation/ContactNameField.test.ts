import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DirectoryUser } from "../../../../common/ado/IUserDirectory";

import { CONTACT_LOOKUP_DELAY_MS, renderContactNameField } from "./ContactNameField";

const CLASS = "test__contact-name";

const JANE: DirectoryUser = {
  displayName: "Jane Doe",
  uniqueName: "jdoe@contoso.com",
  imageUrl: null,
};
const JANE_ROE: DirectoryUser = { displayName: "Jane Roe", uniqueName: null, imageUrl: null };

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

/** A field over a directory whose answers the test scripts. */
function field(search: (query: string) => Promise<DirectoryUser[]>) {
  const directory = { search: vi.fn(search), resolve: vi.fn(async () => null) };
  const logger = { info: vi.fn(), error: vi.fn() };
  const onResolve = vi.fn();
  const onInput = vi.fn();
  const handle = renderContactNameField({
    doc: document,
    className: CLASS,
    userDirectory: directory,
    logger,
    onResolve,
    onInput,
  });
  const matches = handle.element.querySelector<HTMLElement>(`.${CLASS}-matches`);
  if (matches === null) throw new Error("The field has no match list");
  return { handle, directory, logger, onResolve, onInput, matches };
}

function type(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input"));
}

/** Let the debounce elapse and every answer it started land. */
async function lookUp(): Promise<void> {
  await vi.advanceTimersByTimeAsync(CONTACT_LOOKUP_DELAY_MS);
}

function matchButtons(matches: HTMLElement): HTMLButtonElement[] {
  return [...matches.querySelectorAll<HTMLButtonElement>(`.${CLASS}-match`)];
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("renderContactNameField — when it asks", () => {
  it("does not ask the directory about fewer than two characters", async () => {
    const { handle, directory, onInput } = field(async () => [JANE]);

    type(handle.input, " J ");
    await lookUp();

    expect(directory.search).not.toHaveBeenCalled();
    expect(onInput).toHaveBeenCalledTimes(1);
    expect(handle.value()).toBe("J");
  });

  it("waits for typing to pause before asking, and asks only about the latest text", async () => {
    const { handle, directory } = field(async () => []);

    type(handle.input, "Ja");
    await vi.advanceTimersByTimeAsync(CONTACT_LOOKUP_DELAY_MS - 1);
    type(handle.input, "Jan ");
    await vi.advanceTimersByTimeAsync(CONTACT_LOOKUP_DELAY_MS - 1);

    expect(directory.search).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(directory.search).toHaveBeenCalledTimes(1);
    expect(directory.search).toHaveBeenCalledWith("Jan");
  });
});

describe("renderContactNameField — answers", () => {
  it("resolves a single match at once without listing it", async () => {
    const { handle, onResolve, matches } = field(async () => [JANE]);

    type(handle.input, "Jane Doe");
    await lookUp();

    expect(onResolve).toHaveBeenCalledWith(JANE);
    expect(matches.style.display).toBe("none");
  });

  it("lists several matches by name and sign-in address", async () => {
    const { handle, onResolve, matches } = field(async () => [JANE, JANE_ROE]);

    type(handle.input, "Jane");
    await lookUp();

    expect(matches.style.display).toBe("flex");
    expect(matchButtons(matches).map((button) => button.textContent)).toEqual([
      "Jane Doe (jdoe@contoso.com)",
      "Jane Roe",
    ]);
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("takes the picked match as the name, hides the list and reports both", async () => {
    const { handle, onResolve, onInput, matches } = field(async () => [JANE, JANE_ROE]);
    type(handle.input, "Jane");
    await lookUp();
    onInput.mockClear();

    matchButtons(matches)[1]?.click();

    expect(handle.input.value).toBe("Jane Roe");
    expect(matches.style.display).toBe("none");
    expect(matches.childElementCount).toBe(0);
    expect(onResolve).toHaveBeenCalledWith(JANE_ROE);
    expect(onInput).toHaveBeenCalledTimes(1);
  });

  it("highlights a match while the pointer is over it", async () => {
    const { handle, matches } = field(async () => [JANE, JANE_ROE]);
    type(handle.input, "Jane");
    await lookUp();
    const [first] = matchButtons(matches);

    first?.dispatchEvent(new Event("mouseenter"));
    expect(first?.style.background).toBe("var(--control-background-hover)");

    first?.dispatchEvent(new Event("mouseleave"));
    expect(first?.style.background).toBe("none");
  });

  it("hides an earlier list when nothing matches the new text", async () => {
    const answers = [[JANE, JANE_ROE], []];
    const { handle, onResolve, matches } = field(async () => answers.shift() ?? []);
    type(handle.input, "Jane");
    await lookUp();

    type(handle.input, "Janet");
    await lookUp();

    expect(matches.style.display).toBe("none");
    expect(matches.childElementCount).toBe(0);
    expect(onResolve).not.toHaveBeenCalled();
  });
});

describe("renderContactNameField — stale answers", () => {
  it("ignores an answer to text that has since changed", async () => {
    const first = deferred<DirectoryUser[]>();
    const { handle, onResolve, matches } = field(() => first.promise);
    type(handle.input, "Jan");
    await lookUp();

    type(handle.input, "Jane");
    first.resolve([JANE, JANE_ROE]);
    await vi.advanceTimersByTimeAsync(0);

    expect(matches.style.display).toBe("none");
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("ignores a slower answer to an earlier query once a later one was asked", async () => {
    const answers = [deferred<DirectoryUser[]>(), deferred<DirectoryUser[]>()];
    const pending = [...answers];
    const { handle, onResolve } = field(() => pending.shift()?.promise ?? Promise.resolve([]));
    type(handle.input, "Jane");
    await lookUp();
    type(handle.input, "Jane D");
    await lookUp();
    type(handle.input, "Jane");

    answers[0]?.resolve([JANE_ROE]);
    await vi.advanceTimersByTimeAsync(0);
    expect(onResolve).not.toHaveBeenCalled();

    answers[1]?.resolve([JANE]);
    await vi.advanceTimersByTimeAsync(0);
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("forgets the pending question once the text drops below two characters", async () => {
    const answer = deferred<DirectoryUser[]>();
    const { handle, onResolve, matches } = field(() => answer.promise);
    type(handle.input, "Ja");
    await lookUp();

    type(handle.input, "J");
    type(handle.input, "Ja");
    answer.resolve([JANE, JANE_ROE]);
    await vi.advanceTimersByTimeAsync(0);

    expect(matches.style.display).toBe("none");
    expect(onResolve).not.toHaveBeenCalled();
  });
});

describe("renderContactNameField — failures", () => {
  it("logs a failed lookup and hides the list", async () => {
    const failure = new Error("directory down");
    const { handle, logger, matches, onResolve } = field(() => Promise.reject(failure));

    type(handle.input, "Jane");
    await lookUp();

    expect(logger.error).toHaveBeenCalledWith(
      "Could not look up a consumer contact in the directory",
      failure,
    );
    expect(matches.style.display).toBe("none");
    expect(onResolve).not.toHaveBeenCalled();
  });
});
