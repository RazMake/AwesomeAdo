import { describe, expect, it } from "vitest";

import { parseConsumerProfile } from "../profile/consumerProfile";

import { formatNewConsumerDescription, type NewConsumerValues } from "./newConsumerDescription";

const CLIENT_ID = "11111111-2222-3333-4444-555555555555";

const FULL: NewConsumerValues = {
  serviceName: "  Contoso   Billing ",
  clientId: ` ${CLIENT_ID} `,
  scenario: "  Calls us\nfor invoices.  ",
  details: [
    { name: "Requirements", value: "https://spec.example/req" },
    { name: "Team  `Size`: *big*", value: " many\n people " },
  ],
  contacts: [
    { fullName: "Jane Doe", alias: "jdoe", role: "M1" },
    { fullName: "Bob Ray", alias: null, role: null },
  ],
};

const MINIMAL: NewConsumerValues = {
  serviceName: "Svc",
  clientId: CLIENT_ID,
  scenario: "   ",
  details: [],
  contacts: [],
};

describe("formatNewConsumerDescription", () => {
  it("writes every section in the onboarding template's shape", () => {
    expect(formatNewConsumerDescription(FULL)).toBe(
      [
        "# Overview",
        "",
        "- **ServiceName**: `Contoso Billing`",
        `- **ClientId**: \`${CLIENT_ID}\``,
        "",
        "## Scenario",
        "",
        "Calls us\nfor invoices.",
        "",
        "## Details",
        "",
        "- `Requirements`: https://spec.example/req",
        "- `Team Size big`: many people",
        "",
        "# Contacts",
        "",
        "- `M1`: Jane Doe (_jdoe_)",
        "- Bob Ray",
        "",
      ].join("\n"),
    );
  });

  it("leaves out an empty scenario and details but still writes the Contacts heading", () => {
    expect(formatNewConsumerDescription(MINIMAL)).toBe(
      [
        "# Overview",
        "",
        "- **ServiceName**: `Svc`",
        `- **ClientId**: \`${CLIENT_ID}\``,
        "",
        "# Contacts",
        "",
      ].join("\n"),
    );
  });

  it("strips backticks that would close the inline code a value is written in", () => {
    const text = formatNewConsumerDescription({
      ...MINIMAL,
      serviceName: "My `Svc`",
      clientId: "`abc`",
    });

    expect(text).toContain("- **ServiceName**: `My Svc`\n");
    expect(text).toContain("- **ClientId**: `abc`\n");
  });

  it("strips backticks, colons and asterisks from a detail's key", () => {
    const text = formatNewConsumerDescription({
      ...MINIMAL,
      details: [{ name: "**Load**: `peak`", value: "100 rpm" }],
    });

    expect(text).toContain("- `Load peak`: 100 rpm\n");
  });
});

describe("formatNewConsumerDescription — read back", () => {
  it("is read back by the board as the same service, client id and contacts", () => {
    const profile = parseConsumerProfile(formatNewConsumerDescription(FULL));

    expect(profile.serviceName).toBe("Contoso Billing");
    expect(profile.clientId).toBe(CLIENT_ID);
    expect(profile.contacts).toEqual([
      { fullName: "Jane Doe", alias: "jdoe", role: "M1" },
      { fullName: "Bob Ray", alias: null, role: null },
    ]);
  });

  it("reads back a minimal description with no contacts", () => {
    const profile = parseConsumerProfile(formatNewConsumerDescription(MINIMAL));

    expect(profile.serviceName).toBe("Svc");
    expect(profile.clientId).toBe(CLIENT_ID);
    expect(profile.contacts).toEqual([]);
  });
});
