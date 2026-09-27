import { describe, expect, it } from "vitest";

import {
  formatContactEntry,
  withContactAdded,
  withContactRemoved,
  withContactReplaced,
} from "./consumerContactsSource";
import { parseConsumerProfile, type ConsumerContact } from "./consumerProfile";

const JANE: ConsumerContact = { fullName: "Jane Doe", alias: "jdoe", role: null };

describe("formatContactEntry", () => {
  it("writes the template's own shape, leaving out what the contact does not have", () => {
    expect(formatContactEntry({ ...JANE, role: "M1" })).toBe("`M1`: Jane Doe (_jdoe_)");
    expect(formatContactEntry(JANE)).toBe("Jane Doe (_jdoe_)");
    expect(formatContactEntry({ ...JANE, alias: null, role: "Owner" })).toBe("`Owner`: Jane Doe");
  });

  it("leaves an alias with emphasis characters in it un-italicized", () => {
    expect(formatContactEntry({ ...JANE, alias: "first_last" })).toBe("Jane Doe (first_last)");
  });

  it("writes a contact read from a mention back as that mention", () => {
    const guid = "11111111-2222-3333-4444-555555555555";

    expect(formatContactEntry({ ...JANE, role: "PM", mentionId: guid })).toBe(`\`PM\`: @<${guid}>`);
  });

  it("drops what would make the name read back as a role or an alias", () => {
    expect(formatContactEntry({ ...JANE, fullName: "Doe: Jane (Contractor)" })).toBe(
      "Doe Jane (_jdoe_)",
    );
    expect(formatContactEntry({ ...JANE, fullName: "Jane - Doe", alias: null })).toBe("Jane Doe");
    expect(formatContactEntry({ ...JANE, fullName: "(Build Bot)", alias: null })).toBe("Build Bot");
  });

  it("is read back as exactly the contact it wrote", () => {
    const contacts: ConsumerContact[] = [
      { fullName: "Sundar Kameswaran", alias: "skamesw", role: "M1" },
      { fullName: "Anne-Marie Smith", alias: "first_last", role: null },
      { fullName: "Jane Doe", alias: null, role: "Eng Manager" },
    ];
    const description = `# Contacts\n${contacts.map((c) => `- ${formatContactEntry(c)}`).join("\n")}`;

    expect(parseConsumerProfile(description).contacts).toEqual(contacts);
  });
});

describe("withContactAdded", () => {
  it("appends after the last contact with that entry's own bullet", () => {
    expect(withContactAdded("# Contacts\n  * Ann Lee (alee)\n\n# Notes\nx", JANE)).toBe(
      "# Contacts\n  * Ann Lee (alee)\n  * Jane Doe (_jdoe_)\n\n# Notes\nx",
    );
  });

  it("continues a numbered list", () => {
    expect(withContactAdded("# Contacts\n1. Ann Lee\n2) Bob Ray", JANE)).toBe(
      "# Contacts\n1. Ann Lee\n2) Bob Ray\n3) Jane Doe (_jdoe_)",
    );
  });

  it("starts the list under a Contacts heading that names nobody yet", () => {
    expect(withContactAdded("# Contacts\n# Notes\nx", JANE)).toBe(
      "# Contacts\n\n- Jane Doe (_jdoe_)\n\n# Notes\nx",
    );
    expect(withContactAdded("# Contacts\n", JANE)).toBe("# Contacts\n\n- Jane Doe (_jdoe_)\n");
  });

  it("opens a Contacts section at the end of a description that has none", () => {
    expect(withContactAdded("Some prose.\n\n", JANE)).toBe(
      "Some prose.\n\n# Contacts\n\n- Jane Doe (_jdoe_)",
    );
    expect(withContactAdded("", JANE)).toBe("# Contacts\n\n- Jane Doe (_jdoe_)");
  });

  it("keeps the description's CRLF line endings", () => {
    expect(withContactAdded("# Contacts\r\n- Ann Lee", JANE)).toBe(
      "# Contacts\r\n- Ann Lee\r\n- Jane Doe (_jdoe_)",
    );
  });

  it("refuses a rich-text description", () => {
    expect(withContactAdded("<h1>Contacts</h1><ul><li>Ann Lee</li></ul>", JANE)).toBeNull();
  });

  it("starts a list after a table of contacts, set apart from the prose that follows", () => {
    const table = "## Contacts\n| Role | Name |\n|---|---|\n| M1 | Ann Lee (alee) |";

    expect(withContactAdded(`${table}\nAfter.`, JANE)).toBe(
      `${table}\n\n- Jane Doe (_jdoe_)\n\nAfter.`,
    );
  });

  it("joins the Contacts list rather than an owner named inline elsewhere", () => {
    expect(withContactAdded("Owner: Ann Lee (alee)\n## Contacts\n- Bob Ray\n\nEnd.", JANE)).toBe(
      "Owner: Ann Lee (alee)\n## Contacts\n- Bob Ray\n- Jane Doe (_jdoe_)\n\nEnd.",
    );
    expect(withContactAdded("Owner: Ann Lee (alee)", JANE)).toBe(
      "Owner: Ann Lee (alee)\n\n# Contacts\n\n- Jane Doe (_jdoe_)",
    );
  });

  it("puts a first entry under a setext heading after its underline", () => {
    expect(withContactAdded("Contacts\n--------\nAfter.", JANE)).toBe(
      "Contacts\n--------\n\n- Jane Doe (_jdoe_)\n\nAfter.",
    );
  });
});

describe("withContactRemoved", () => {
  const description = "# Contacts\r\n- `M1`: Ann Lee (alee)\r\n- Bob Ray\r\n\r\n# Notes\r\nAfter.";

  it("deletes only that contact's line", () => {
    expect(withContactRemoved(description, 0)).toBe(
      "# Contacts\r\n- Bob Ray\r\n\r\n# Notes\r\nAfter.",
    );
    expect(withContactRemoved(description, 1)).toBe(
      "# Contacts\r\n- `M1`: Ann Lee (alee)\r\n\r\n# Notes\r\nAfter.",
    );
  });

  it("refuses a contact that is not listed, or a rich-text description", () => {
    expect(withContactRemoved(description, 2)).toBeNull();
    expect(withContactRemoved("<ul><li>Ann</li></ul>", 0)).toBeNull();
  });

  it.each([
    ["shares its line", "## Contacts\n- Ann Lee (alee); Bob Ray (bray)"],
    ["sits in a table", "## Contacts\n| Role | Name |\n|---|---|\n| M1 | Ann Lee (alee) |"],
    ["is named inline", "Owner: Ann Lee (alee)"],
  ])("refuses a contact that %s", (_label, text) => {
    expect(withContactRemoved(text, 0)).toBeNull();
  });
});

describe("withContactReplaced", () => {
  const description = "# Contacts\n- `M1`: Ann Lee (alee)\n  3. Bob Ray\n\n# Notes\nAfter.";

  it("rewrites only that contact's line, keeping its list marker", () => {
    expect(withContactReplaced(description, 1, { ...JANE, role: "PM" })).toBe(
      "# Contacts\n- `M1`: Ann Lee (alee)\n  3. `PM`: Jane Doe (_jdoe_)\n\n# Notes\nAfter.",
    );
  });

  it("refuses a contact that is not listed, or a rich-text description", () => {
    expect(withContactReplaced(description, 2, JANE)).toBeNull();
    expect(withContactReplaced("<ul><li>Ann</li></ul>", 0, JANE)).toBeNull();
  });

  it("refuses a contact sharing its line, since rewriting it would rewrite the other", () => {
    expect(
      withContactReplaced("## Contacts\n- Ann Lee (alee); Bob Ray (bray)", 1, JANE),
    ).toBeNull();
  });
});
