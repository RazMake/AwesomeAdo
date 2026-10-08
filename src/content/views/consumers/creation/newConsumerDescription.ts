import { formatContactEntry } from "../profile/consumerContactsSource";
import type { ConsumerContact } from "../profile/consumerProfile";

/** One key/value line of the Details section, e.g. `Requirements` → a spec link. */
export interface ConsumerDetailEntry {
  name: string;
  value: string;
}

/** Everything the Add new consumer form asked for. */
export interface NewConsumerValues {
  serviceName: string;
  clientId: string;
  scenario: string;
  details: ConsumerDetailEntry[];
  contacts: ConsumerContact[];
}

/** Backticks would close the inline code a value is written in; colons would split a detail key. */
const CODE_BREAKERS = /`/g;
const KEY_BREAKERS = /[`:*]/g;

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The new consumer's description, in the onboarding template's own Markdown shape.
 *
 * Written in exactly the shape the board's reader understands best (see `consumerProfile`) so the
 * card a reader just created shows its identity, details and contacts at once, and its contacts are
 * editable in place: every contact goes on a line of its own under a Contacts heading. The Contacts
 * heading is written even with nobody under it, so the card offers the first contact to be added.
 */
export function formatNewConsumerDescription(values: NewConsumerValues): string {
  const lines = [
    "# Overview",
    "",
    `- **ServiceName**: \`${oneLine(values.serviceName).replace(CODE_BREAKERS, "")}\``,
    `- **ClientId**: \`${oneLine(values.clientId).replace(CODE_BREAKERS, "")}\``,
  ];
  const scenario = values.scenario.trim();
  if (scenario.length > 0) lines.push("", "## Scenario", "", scenario);
  if (values.details.length > 0) {
    lines.push("", "## Details", "");
    for (const detail of values.details) {
      const name = oneLine(detail.name).replace(KEY_BREAKERS, "");
      lines.push(`- \`${name}\`: ${oneLine(detail.value)}`);
    }
  }
  lines.push("", "# Contacts", "");
  for (const contact of values.contacts) lines.push(`- ${formatContactEntry(contact)}`);
  return `${lines.join("\n").trimEnd()}\n`;
}
