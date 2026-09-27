import { describe, expect, it } from "vitest";

import { contactRolesIn, parseConsumerProfile, readConsumerProfile } from "./consumerProfile";

/** The shape these descriptions are written in, as onboarded consumers actually carry it. */
const MARKDOWN_DESCRIPTION = `# Overview
- **ServiceName**: \`IPSimulationService\`
- **ClientId**: \`531aebea-d218-4cad-8eab-dcec494dbe86\`

## Scenario
The IP Simulation Service orchestrates impact assessment across Microsoft 365 workloads.

This service is currently using **REST** and it must be re-homed to **CSO**.

## Details
- \`Requirements\`: [IP_Simulation_TechSpec_2.docx](https://microsoft-my.sharepoint-df.com/spec)
- \`TeamsConversation\`: [IPSimulationService Rehoming | Group Chat](https://teams.microsoft.com/l/chat/19:abc@thread.v2)

# Contacts
- \`M1\`:  Sundar Kameswaran (_skamesw_)
- \`Owner\`: Anne-Marie Smith (amsmith)
`;

describe("parseConsumerProfile, on a Markdown description", () => {
  const profile = parseConsumerProfile(MARKDOWN_DESCRIPTION);

  it("reads the service name and client id out of the overview", () => {
    expect(profile.serviceName).toBe("IPSimulationService");
    expect(profile.clientId).toBe("531aebea-d218-4cad-8eab-dcec494dbe86");
  });

  it("keeps the scenario prose, with its paragraphs and inline markup", () => {
    expect(profile.scenario).toBe(
      "The IP Simulation Service orchestrates impact assessment across Microsoft 365 workloads.\n\n" +
        "This service is currently using **REST** and it must be re-homed to **CSO**.",
    );
  });

  it("labels each detail link by the key it was listed under", () => {
    expect(profile.details).toEqual([
      { label: "Requirements", url: "https://microsoft-my.sharepoint-df.com/spec" },
      { label: "TeamsConversation", url: "https://teams.microsoft.com/l/chat/19:abc@thread.v2" },
    ]);
  });

  it("splits each contact into name, alias, and role", () => {
    expect(profile.contacts).toEqual([
      { fullName: "Sundar Kameswaran", alias: "skamesw", role: "M1" },
      { fullName: "Anne-Marie Smith", alias: "amsmith", role: "Owner" },
    ]);
  });
});

describe("parseConsumerProfile, on a rich-text description", () => {
  const profile = parseConsumerProfile(
    "<h1>Overview</h1><ul><li><b>ServiceName</b>: <code>Contoso&amp;Co</code></li>" +
      "<li><b>Client Id</b>: 531AEBEA-D218-4CAD-8EAB-DCEC494DBE86</li></ul>" +
      "<h2>Scenario</h2><p>Reads audit events.</p>" +
      '<h2>Details</h2><ul><li>Spec: <a href="https://example.com/spec">Spec doc</a></li></ul>' +
      "<h1>Contacts</h1><ul><li>Owner: Jane Doe (jdoe)</li></ul>",
  );

  it("reads the same fields out of Azure DevOps' own HTML", () => {
    expect(profile.serviceName).toBe("Contoso&Co");
    expect(profile.clientId).toBe("531AEBEA-D218-4CAD-8EAB-DCEC494DBE86");
    expect(profile.scenario).toBe("Reads audit events.");
  });

  it("turns anchors into labelled links and list items into contacts", () => {
    expect(profile.details).toEqual([{ label: "Spec", url: "https://example.com/spec" }]);
    expect(profile.contacts).toEqual([{ fullName: "Jane Doe", alias: "jdoe", role: "Owner" }]);
  });

  it("reads a rich-text mention and a mail link as people", () => {
    const contacts = parseConsumerProfile(
      "<div><b>Contacts</b></div><ul>" +
        '<li><a href="#" data-vss-mention="version:2.0,1">@Jane Doe</a> - Owner</li>' +
        '<li><a href="mailto:bray@contoso.com">Bob Ray</a></li></ul>',
    ).contacts;

    expect(contacts).toEqual([
      { fullName: "Jane Doe", alias: null, role: "Owner" },
      { fullName: "Bob Ray", alias: "bray", role: null },
    ]);
  });
});

describe("parseConsumerProfile, on descriptions that omit or vary the shape", () => {
  it("reports nothing for a description that states nothing", () => {
    expect(parseConsumerProfile("Just some prose about a consumer.")).toEqual({
      serviceName: null,
      clientId: null,
      scenario: null,
      details: [],
      contacts: [],
    });
  });

  it("reads a bold line as a section heading", () => {
    const profile = parseConsumerProfile("**Contacts**\n- Jane Doe (jdoe)");

    expect(profile.contacts).toEqual([{ fullName: "Jane Doe", alias: "jdoe", role: null }]);
  });

  it("accepts a role written after the person, and a person written without one", () => {
    const profile = parseConsumerProfile("## Contacts\n- John Roe (jroe) - Owner\n- Ann Poe\n");

    expect(profile.contacts).toEqual([
      { fullName: "John Roe", alias: "jroe", role: "Owner" },
      { fullName: "Ann Poe", alias: null, role: null },
    ]);
  });

  it("falls back to a link's own text when the detail has no key", () => {
    const profile = parseConsumerProfile(
      "## Details\n- [Runbook](https://example.com/run)\n- https://example.com/bare\n",
    );

    expect(profile.details).toEqual([
      { label: "Runbook", url: "https://example.com/run" },
      { label: "https://example.com/bare", url: "https://example.com/bare" },
    ]);
  });

  it("ignores a details line carrying no link at all", () => {
    expect(parseConsumerProfile("## Details\n- Nothing linked here\n").details).toEqual([]);
  });

  it("keeps the first statement of each field and lifts the client id out of its line", () => {
    const profile = parseConsumerProfile(
      "- ServiceName: FirstService\n" +
        "- ClientId: 531aebea-d218-4cad-8eab-dcec494dbe86 (production)\n" +
        "- ServiceName: SecondService\n" +
        "- ClientId: 00000000-0000-0000-0000-000000000000\n",
    );

    expect(profile.serviceName).toBe("FirstService");
    expect(profile.clientId).toBe("531aebea-d218-4cad-8eab-dcec494dbe86");
  });

  it("keeps a non-GUID identity as written", () => {
    expect(parseConsumerProfile("- Audience: api://contoso").clientId).toBe("api://contoso");
  });

  it("does not take a service name from a details or contacts entry", () => {
    const profile = parseConsumerProfile(
      "## Details\n- ServiceName: https://example.com/not-a-name",
    );

    expect(profile.serviceName).toBeNull();
  });
});

describe("readConsumerProfile, locating the contacts in the source", () => {
  it("points at the Contacts heading and the line each contact was read from", () => {
    const { layout } = readConsumerProfile(MARKDOWN_DESCRIPTION);

    expect(layout.headingLine).toBe(13);
    expect(layout.entries).toEqual([
      { line: 14, shape: "own-line" },
      { line: 15, shape: "own-line" },
    ]);
    expect(layout.sourceLines?.[14]).toBe("- `M1`:  Sundar Kameswaran (_skamesw_)");
  });

  it("reads the same lines whichever line ending the description was saved with", () => {
    const { layout } = readConsumerProfile("# Contacts\r\n- Jane Doe (jdoe)\r\n");

    expect(layout.sourceLines).toEqual(["# Contacts", "- Jane Doe (jdoe)", ""]);
    expect(layout.entries).toEqual([{ line: 1, shape: "own-line" }]);
  });

  it("offers no source lines for a rich-text description", () => {
    const { profile, layout } = readConsumerProfile(
      "<h1>Contacts</h1><ul><li>Owner: Jane Doe (jdoe)</li></ul>",
    );

    expect(profile.contacts).toHaveLength(1);
    expect(layout.sourceLines).toBeNull();
  });

  it("keeps each Markdown line where it was, even around a stray angle bracket", () => {
    const { layout } = readConsumerProfile("# Contacts\n- Jane <note\nmore> Doe (jdoe)");

    expect(layout.sourceLines).toEqual(["# Contacts", "- Jane <note", "more> Doe (jdoe)"]);
  });

  it("reports no heading and no entries for a description without contacts", () => {
    const { layout } = readConsumerProfile("Just prose.");

    expect(layout).toEqual({ sourceLines: ["Just prose."], headingLine: null, entries: [] });
  });

  it("points a setext heading at its underline, where a new first entry goes after", () => {
    const { layout } = readConsumerProfile("Contacts\n--------\n- Jane Doe (jdoe)");

    expect(layout.headingLine).toBe(1);
    expect(layout.entries).toEqual([{ line: 2, shape: "own-line" }]);
  });

  it("tells apart a person on their own line, on a shared line, in a table, and inline", () => {
    const { layout } = readConsumerProfile(
      "Owner: Ann Lee (annl)\n" +
        "## Contacts\n" +
        "- Jane Roe (jroe); Max Fox (mfox)\n" +
        "- Bob Ray (bray)\n" +
        "\n" +
        "| Role | Name |\n" +
        "|---|---|\n" +
        "| M1 | Sam Poe (spoe) |\n",
    );

    expect(layout.entries).toEqual([
      { line: 0, shape: "inline" },
      { line: 2, shape: "shared-line" },
      { line: 2, shape: "shared-line" },
      { line: 3, shape: "own-line" },
      { line: 7, shape: "table-row" },
    ]);
  });
});

describe("parseConsumerProfile, on human-edited section headings", () => {
  it.each([
    ["an ATX heading without a space", "#Contacts\n- Jane Doe (jdoe)"],
    ["a setext heading", "Contacts\n========\n- Jane Doe (jdoe)"],
    ["a bold label with a colon", "**Contacts:**\n- Jane Doe (jdoe)"],
    ["a plain label with a colon", "Contacts:\n- Jane Doe (jdoe)"],
    ["a plain title-like line", "Points of Contact\n- Jane Doe (jdoe)"],
    ["an alternative name", "## Stakeholders\n- Jane Doe (jdoe)"],
    ["a heading with trailing hashes", "## Key contacts ##\n- Jane Doe (jdoe)"],
  ])("recognizes %s", (_label, description) => {
    expect(parseConsumerProfile(description).contacts).toEqual([
      { fullName: "Jane Doe", alias: "jdoe", role: null },
    ]);
  });

  it("does not read a work item reference as a heading", () => {
    const profile = parseConsumerProfile("## Contacts\n#1234\n- Jane Doe (jdoe)");

    expect(profile.contacts).toEqual([{ fullName: "Jane Doe", alias: "jdoe", role: null }]);
  });

  it("does not read a sentence that mentions contacts as a heading", () => {
    const profile = parseConsumerProfile(
      "## Scenario\nContact us first if needed.\nSome more prose.",
    );

    expect(profile.scenario).toBe("Contact us first if needed.\nSome more prose.");
    expect(profile.contacts).toEqual([]);
  });

  it("closes the contacts at the next section, whatever it is called", () => {
    const profile = parseConsumerProfile("# Contacts\n- Jane Doe\n# Notes\n- Sam Smith");

    expect(profile.contacts).toEqual([{ fullName: "Jane Doe", alias: null, role: null }]);
  });

  it("reads a sub-heading or label under Contacts as the role of the people below it", () => {
    const profile = parseConsumerProfile(
      "# Contacts\n## Engineering\n- Jane Doe\nOwners:\n- Bob Ray (bray)\n- **Backup**\n- Sam Poe (spoe)",
    );

    expect(profile.contacts).toEqual([
      { fullName: "Jane Doe", alias: null, role: "Engineering" },
      { fullName: "Bob Ray", alias: "bray", role: "Owners" },
      { fullName: "Sam Poe", alias: "spoe", role: "Backup" },
    ]);
  });

  it("lets a person's own role win over the group they are listed under", () => {
    const profile = parseConsumerProfile("# Contacts\nOwners:\n- `PM`: Jane Doe (jdoe)");

    expect(profile.contacts).toEqual([{ fullName: "Jane Doe", alias: "jdoe", role: "PM" }]);
  });
});

describe("parseConsumerProfile, on human-edited contact entries", () => {
  const contactsOf = (entries: string): unknown =>
    parseConsumerProfile(`## Contacts\n${entries}`).contacts;

  it.each([
    ["a backticked role", "- `M1`: Jane Doe (_jdoe_)", "M1"],
    ["a bold role", "- **PM**: Jane Doe (jdoe)", "PM"],
    ["a bracketed role", "- [Owner] Jane Doe (jdoe)", "Owner"],
    ["a role after the person", "- Jane Doe (jdoe): Owner", "Owner"],
    ["a dashed role after the person", "- Jane Doe (jdoe) - Dev Lead", "Dev Lead"],
    ["a dashed role before the person", "- PM – Jane Doe (jdoe)", "PM"],
    ["a comma role after the person", "- Jane Doe (jdoe), Dev Lead", "Dev Lead"],
    ["a role aside", "- Jane Doe (jdoe) (Owner)", "Owner"],
    ["an equals sign", "- Owner = Jane Doe (jdoe)", "Owner"],
    ["a numbered list", "1. Owner: Jane Doe (jdoe)", "Owner"],
    ["a star bullet", "* Owner: Jane Doe (jdoe)", "Owner"],
    ["a full-width colon", "- Owner\uff1a Jane\u00a0Doe (jdoe)", "Owner"],
  ])("reads %s", (_label, entry, role) => {
    expect(contactsOf(entry)).toEqual([{ fullName: "Jane Doe", alias: "jdoe", role }]);
  });

  it("reads a key that names the person rather than a role as no role", () => {
    expect(contactsOf("- Name: Jane Doe (jdoe)\n- Contact: Bob Ray (bray)")).toEqual([
      { fullName: "Jane Doe", alias: "jdoe", role: null },
      { fullName: "Bob Ray", alias: "bray", role: null },
    ]);
  });
});

describe("parseConsumerProfile, on how people are identified", () => {
  const contactsOf = (entries: string): unknown =>
    parseConsumerProfile(`## Contacts\n${entries}`).contacts;

  it("takes the alias from an email address, written bare, in brackets, or as a mail link", () => {
    expect(
      contactsOf(
        "- Jane Doe <jdoe@contoso.com>\n- [Bob Ray](mailto:bray@contoso.com)\n- sam.poe@contoso.com",
      ),
    ).toEqual([
      { fullName: "Jane Doe", alias: "jdoe", role: null },
      { fullName: "Bob Ray", alias: "bray", role: null },
      { fullName: "sam.poe", alias: "sam.poe", role: null },
    ]);
  });

  it("drops notes in parentheses and keeps the one that looks like an alias", () => {
    expect(contactsOf("- Jane Doe (Contractor, EU hours) (jdoe)")).toEqual([
      { fullName: "Jane Doe", alias: "jdoe", role: null },
    ]);
  });

  it("reduces a profile link to the person's name", () => {
    expect(contactsOf("- [Jane Doe](https://people/jdoe) (jdoe)")).toEqual([
      { fullName: "Jane Doe", alias: "jdoe", role: null },
    ]);
  });

  it("names a mention from the known directory, and keeps its id for writing back", () => {
    const guid = "11111111-2222-3333-4444-555555555555";
    const profile = parseConsumerProfile(
      `## Contacts\n- \`PM\`: @<${guid}>\n- @<${guid.replace("1", "9")}>`,
      {
        mentionNames: new Map([[guid, "Jane Doe"]]),
      },
    );

    expect(profile.contacts).toEqual([
      { fullName: "Jane Doe", alias: null, role: "PM", mentionId: guid },
      { fullName: "@mention", alias: null, role: null, mentionId: guid.replace("1", "9") },
    ]);
  });
});

describe("parseConsumerProfile, on several people, or nobody, on a line", () => {
  const contactsOf = (entries: string): unknown =>
    parseConsumerProfile(`## Contacts\n${entries}`).contacts;

  it("splits several people on one line only where each part names someone", () => {
    expect(
      contactsOf(
        "- Jane Roe (jroe); Max Fox (mfox)\n" +
          "- Ann Lee (annl), Bob Ray (bray)\n" +
          "- Sam Poe and Kim Day\n" +
          "- Doe, Jane",
      ),
    ).toEqual([
      { fullName: "Jane Roe", alias: "jroe", role: null },
      { fullName: "Max Fox", alias: "mfox", role: null },
      { fullName: "Ann Lee", alias: "annl", role: null },
      { fullName: "Bob Ray", alias: "bray", role: null },
      { fullName: "Sam Poe", alias: null, role: null },
      { fullName: "Kim Day", alias: null, role: null },
      { fullName: "Doe, Jane", alias: null, role: null },
    ]);
  });

  it("gives every person on a shared line the role the line states", () => {
    expect(contactsOf("- Owners: Jane Roe (jroe), Max Fox (mfox)")).toEqual([
      { fullName: "Jane Roe", alias: "jroe", role: "Owners" },
      { fullName: "Max Fox", alias: "mfox", role: "Owners" },
    ]);
  });

  it.each([
    ["a placeholder", "- TBD\n- `PM`: N/A\n- ?"],
    ["a sentence", "- Please reach out on Teams for escalations."],
    ["a question", "- Who owns this?"],
    ["a lowercase phrase", "- see the wiki"],
    ["a bare link", "- https://example.com/people"],
    ["a one-word sentence", "End."],
    ["a decorative rule", "---\n***"],
  ])("does not read %s as a person", (_label, entries) => {
    expect(contactsOf(entries)).toEqual([]);
  });
});

describe("parseConsumerProfile, on contacts written as a table", () => {
  it("reads each row by the columns its header names", () => {
    const profile = parseConsumerProfile(
      "## Contacts\n| Role | Name | Alias |\n|---|---|---|\n" +
        "| M1 | Jane Doe | jdoe |\n| Owner | Bob Ray | bray@contoso.com |\n",
    );

    expect(profile.contacts).toEqual([
      { fullName: "Jane Doe", alias: "jdoe", role: "M1" },
      { fullName: "Bob Ray", alias: "bray", role: "Owner" },
    ]);
  });

  it("reads a two-column table without a recognizable header as role and person", () => {
    const profile = parseConsumerProfile(
      "## Contacts\n| | |\n|---|---|\n| M1 | Jane Doe (jdoe) |\n",
    );

    expect(profile.contacts).toEqual([{ fullName: "Jane Doe", alias: "jdoe", role: "M1" }]);
  });

  it("reads a table of fields in the overview", () => {
    const profile = parseConsumerProfile(
      "| Field | Value |\n|---|---|\n| Service Name | FooService |\n" +
        "| Client Id | 531aebea-d218-4cad-8eab-dcec494dbe86 |\n",
    );

    expect(profile.serviceName).toBe("FooService");
    expect(profile.clientId).toBe("531aebea-d218-4cad-8eab-dcec494dbe86");
  });
});

describe("parseConsumerProfile, on human-edited fields", () => {
  it.each([
    ["a spaced key", "Service Name: FooService"],
    ["an equals sign", "Service Name = FooService"],
    ["a dash", "ServiceName - FooService"],
    ["an alternative key", "- **App Name**: FooService"],
    ["a backticked value", "- ServiceName: `FooService`"],
  ])("reads a service name written with %s", (_label, line) => {
    expect(parseConsumerProfile(line).serviceName).toBe("FooService");
  });

  it.each([
    ["a qualified key", "Client Id (Prod): 531aebea-d218-4cad-8eab-dcec494dbe86"],
    ["an app id", "App Id: 531aebea-d218-4cad-8eab-dcec494dbe86 (prod)"],
    ["a managed identity", "- Managed Identity: 531aebea-d218-4cad-8eab-dcec494dbe86"],
  ])("reads a client id written with %s", (_label, line) => {
    expect(parseConsumerProfile(line).clientId).toBe("531aebea-d218-4cad-8eab-dcec494dbe86");
  });

  it("reads fields amid free prose and under any heading", () => {
    const profile = parseConsumerProfile(
      "Some intro text written by a human.\n\n## Scenario\nIt reads audit events.\nServiceName: FooService\n",
    );

    expect(profile.serviceName).toBe("FooService");
    expect(profile.scenario).toBe("It reads audit events.");
  });

  it("reads contacts stated inline, outside any Contacts section", () => {
    const profile = parseConsumerProfile(
      "Owner: Jane Doe (jdoe)\nContacts: Ann Lee (annl), Bob Ray (bray)\nTeam: SFDA\n",
    );

    expect(profile.contacts).toEqual([
      { fullName: "Jane Doe", alias: "jdoe", role: "Owner" },
      { fullName: "Ann Lee", alias: "annl", role: null },
      { fullName: "Bob Ray", alias: "bray", role: null },
    ]);
  });
});

describe("contactRolesIn", () => {
  it("offers the default roles first, then each other role once, in the order first written", () => {
    expect(
      contactRolesIn([
        MARKDOWN_DESCRIPTION,
        "# Contacts\n- `owner`: Jane Doe\n- `pm`: Ann Lee\n- `Architect`: Bob Ray",
        "No contacts here.",
      ]),
    ).toEqual(["M1", "M2", "M3", "DEV", "PM", "Owner", "Architect"]);
  });

  it("offers the default roles on a board where nobody has a role yet", () => {
    expect(contactRolesIn(["No contacts here."])).toEqual(["M1", "M2", "M3", "DEV", "PM"]);
  });
});
