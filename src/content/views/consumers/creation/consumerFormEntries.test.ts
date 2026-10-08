import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DirectoryUser } from "../../../../common/ado/IUserDirectory";

import { CONTACT_LOOKUP_DELAY_MS } from "./ContactNameField";
import {
  CONTACT_ROLES,
  createContactEntry,
  createDetailEntry,
  DETAIL_NAME_HELP,
  DETAIL_VALUE_HELP,
} from "./consumerFormEntries";

const PREFIX = "test__entry";

const JANE: DirectoryUser = {
  displayName: "Jane Doe",
  uniqueName: "jdoe@contoso.com",
  imageUrl: null,
};
const BOB: DirectoryUser = { displayName: "Bob Ray", uniqueName: "CONTOSO\\bray", imageUrl: null };
const NOBODY: DirectoryUser = { displayName: "No Alias", uniqueName: null, imageUrl: null };

function type(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event("input"));
}

function inputIn(root: ParentNode, className: string): HTMLInputElement {
  const input = root.querySelector<HTMLInputElement>(`input.${className}`);
  if (input === null) throw new Error(`No input .${className}`);
  return input;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("createDetailEntry", () => {
  function detail() {
    const changed = vi.fn();
    const entry = createDetailEntry(document, PREFIX, changed);
    const [name, value] = entry.controls as HTMLInputElement[];
    if (name === undefined || value === undefined) throw new Error("A detail needs two fields");
    return { entry, changed, name, value };
  }

  it("is blank, and has no value, until something is typed", () => {
    const { entry, name, value } = detail();

    expect(entry.isBlank()).toBe(true);
    expect(entry.value()).toBeNull();
    expect(name.className).toBe(`${PREFIX}-name`);
    expect(name.title).toBe(DETAIL_NAME_HELP);
    expect(name.placeholder).toBe(DETAIL_NAME_HELP);
    expect(name.getAttribute("aria-label")).toBe("Field name");
    expect(value.className).toBe(`${PREFIX}-value`);
    expect(value.title).toBe(DETAIL_VALUE_HELP);
    expect(value.placeholder).toBe(DETAIL_VALUE_HELP);
  });

  it("has a value only once both its name and its value are given, trimmed", () => {
    const { entry, changed, name, value } = detail();

    type(name, "  Requirements ");
    expect(entry.value()).toBeNull();
    expect(entry.isBlank()).toBe(false);

    type(value, " https://spec.example ");
    expect(entry.value()).toEqual({ name: "Requirements", value: "https://spec.example" });
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("is not blank when only its value is typed", () => {
    const { entry, value } = detail();

    type(value, "x");

    expect(entry.isBlank()).toBe(false);
    expect(entry.value()).toBeNull();
  });

  it("focuses its name field", () => {
    const { entry, name } = detail();
    document.body.append(...entry.controls);

    entry.focus();

    expect(document.activeElement).toBe(name);
  });
});

/** A contact line over a directory whose answer the test sets per lookup. */
function contact(answers: DirectoryUser[][]) {
  const changed = vi.fn();
  const search = vi.fn(async () => answers.shift() ?? []);
  const entry = createContactEntry(
    {
      doc: document,
      classPrefix: PREFIX,
      userDirectory: { search, resolve: async () => null },
      logger: { info: vi.fn(), error: vi.fn() },
    },
    changed,
  );
  const host = document.createElement("div");
  host.append(...entry.controls);
  document.body.append(host);
  return {
    entry,
    changed,
    search,
    name: inputIn(host, `${PREFIX}-name`),
    alias: inputIn(host, `${PREFIX}-alias`),
  };
}

async function typeName(name: HTMLInputElement, text: string): Promise<void> {
  type(name, text);
  await vi.advanceTimersByTimeAsync(CONTACT_LOOKUP_DELAY_MS);
}

describe("createContactEntry — value", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("has no value without a name, even with an alias", () => {
    const { entry, alias } = contact([]);
    expect(entry.isBlank()).toBe(true);

    type(alias, "jdoe");

    expect(entry.value()).toBeNull();
    expect(entry.isBlank()).toBe(false);
  });

  it("defaults the role to the first one the template lists", async () => {
    const { entry, name } = contact([[]]);

    await typeName(name, " Jane Doe ");

    expect(CONTACT_ROLES[0]).toBe("M1");
    expect(entry.value()).toEqual({ fullName: "Jane Doe", alias: null, role: "M1" });
  });

  it("names its fields for assistive technology and focuses the name", () => {
    const { entry, name, alias } = contact([]);

    entry.focus();

    expect(name.getAttribute("aria-label")).toBe("Name");
    expect(alias.getAttribute("aria-label")).toBe("Alias");
    expect(document.activeElement).toBe(name);
  });
});

describe("createContactEntry — alias from the directory", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fills the alias in from a unique directory match", async () => {
    const { entry, changed, name, alias } = contact([[JANE]]);

    await typeName(name, "Jane Doe");

    expect(alias.value).toBe("jdoe");
    expect(entry.value()).toEqual({ fullName: "Jane Doe", alias: "jdoe", role: "M1" });
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it("never overwrites an alias the reader typed", async () => {
    const { name, alias } = contact([[JANE]]);
    type(alias, "janed");

    await typeName(name, "Jane Doe");

    expect(alias.value).toBe("janed");
  });

  it("replaces an alias it filled in itself with a newer match's", async () => {
    const { name, alias } = contact([[JANE], [BOB]]);
    await typeName(name, "Jane Doe");

    await typeName(name, "Bob Ray");

    expect(alias.value).toBe("bray");
  });

  it("keeps an auto-filled alias the reader then edited", async () => {
    const { name, alias } = contact([[JANE], [BOB]]);
    await typeName(name, "Jane Doe");
    type(alias, "jd2");

    await typeName(name, "Bob Ray");

    expect(alias.value).toBe("jd2");
  });

  it("leaves the alias alone when the match has no sign-in address", async () => {
    const { changed, name, alias } = contact([[NOBODY]]);

    await typeName(name, "No Alias");

    expect(alias.value).toBe("");
    expect(changed).toHaveBeenCalledTimes(1);
  });
});
