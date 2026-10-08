# `content/views/consumers/profile`

The facts a consumer's Azure DevOps **description** states about the service behind it, the lines
the Consumers View card draws them on, and the contact edits it writes back into that description.

## Public API

- `consumerProfile.ts`
  - `parseConsumerProfile(description, options?)` returns a `ConsumerProfile`:
    - `serviceName` — the consumer service's own name.
    - `clientId` — the identity (or audience) it reaches us as, normally a GUID.
    - `scenario` — the Scenario section's prose, with its Markdown inline markup intact.
    - `details` — `ConsumerDetailLink[]` (`label`, `url`) from the Details section.
    - `contacts` — `ConsumerContact[]` (`fullName`, `alias`, `role`, and `mentionId` for a person
      written as an `@<guid>` mention).

    Every field is optional: a description that states none of them yields nulls and empty lists.
    The description may be Markdown, plain text, or the rich-text HTML Azure DevOps' classic editor
    writes; all are read the same way. `options.mentionNames` (a `MentionNames` map of mention GUID →
    display name) names mentioned people; without it they read as `@mention`.

  - `readConsumerProfile(description, options?)` returns `{ profile, layout }`: the same profile
    plus a `ContactsLayout` saying where the contacts are written — `sourceLines` (null for rich
    text), `headingLine` (the Contacts heading's last line, i.e. a setext heading's underline), and
    one `ContactPlacement` (`line`, `shape`) per contact. `shape` is a `ContactShape`:
    `"own-line"` (the only shape that can be rewritten or removed), `"shared-line"` (several people
    on one line), `"table-row"`, or `"inline"` (an `Owner: …` line outside the Contacts section).
  - `contactRolesIn(descriptions)` returns the role choices for a board: `DEFAULT_CONTACT_ROLES`
    (`M1`, `M2`, `M3`, `DEV`, `PM`) first, then every other role those descriptions give a contact,
    in the order first written — each once, compared case-insensitively.

- `ConsumerProfileLines.ts` → `renderConsumerProfileLines(doc, reading, editing)` returns the
  service-identity line (when the description names either half) and the Contacts section for a
  consumer's card. Each contact is a shared assignee pill led by a red **×**, with the role as its tag
  pill (`??` when it has none); the alias is only in the pill's tooltip. `editing` (`ContactEditing`)
  supplies the people directory, the board's roles, and the `onAdd` / `onReplace` / `onRoleChange` /
  `onRemove` requests the pills and the Contacts `+` make. The role editor's add field reads
  "Add new role". The Contacts heading is always shown. A
  rich-text description shows its contacts read-only, with no ×, and the whole section's tooltip is
  `RICH_TEXT_CONTACTS_REASON` ("The description has to be Markdown to be editable."). A contact in
  any shape but `own-line` is read-only too, with its `SHARED_CONTACT_REASONS` entry in its tooltip.
  Only the service name, client id, and contacts are drawn; `scenario` and `details` are parsed for
  callers that want them.

- `consumerContactsSource.ts` → `withContactAdded(description, contact)`,
  `withContactReplaced(description, index, contact)`, `withContactRemoved(description, index)`, and
  `formatContactEntry(contact)` — the description with one contact line added, rewritten, or
  deleted, or `null` when that cannot be done line by line (rich text, or a contact not on a line of
  its own). Nothing else in the description changes: a new entry reuses the list's own marker (or
  starts a list after a contacts table, or under the Contacts heading, or opens a `# Contacts`
  section), a rewritten one keeps its marker and indentation, and line endings are kept. Entries
  are written as `` `Role`: Full Name (_alias_) `` (or `` `Role`: @<guid> `` for a mention), which
  reads back as the same contact.

- `ConsumerContactEditor.ts` → `createConsumerContactEditor({ queue, userDirectory, logger,
onSettled, mentionNames? })` returns a `ConsumerContactEditor` with `add(consumer, person)`,
  `replace(consumer, index, person)` (keeps the role), `setRole(consumer, index, role)`, and
  `remove(consumer, index)`. Each edit is one guarded `System.Description` Markdown write through
  the board's queue, computed from the description the previous edit to that consumer left;
  `onSettled` runs after every edit — written or skipped — so the board redraws what Azure DevOps
  accepted. `aliasOfUniqueName(uniqueName)` reads the alias out of an address (`jdoe@contoso.com`,
  `CONTOSO\jdoe`); a picked person without one is resolved through the directory first. Adding
  someone already listed (by alias, name, or mention) writes nothing.

- `descriptionText.ts`, `descriptionSections.ts`, and `contactEntries.ts` are the reader's
  building blocks — text cleanup and line shapes, heading and section detection, and person
  entries. Use them through `consumerProfile.ts`.

## The shape it reads

The onboarding template:

```markdown
# Overview

- **ServiceName**: `IPSimulationService`
- **ClientId**: `531aebea-d218-4cad-8eab-dcec494dbe86`

## Scenario

Prose describing what the consumer does.

## Details

- `Requirements`: [TechSpec.docx](https://example.com/spec)

# Contacts

- `M1`: Sundar Kameswaran (_skamesw_)
```

This is also exactly the shape [`../creation`](../creation/README.md) writes for a consumer created
from the board, so a new consumer's card reads its identity at once and its contacts are editable.

Descriptions are edited by people, so the reader is deliberately loose. Text around the template,
reordered sections, and small variations in how an entry is written are all expected:

- **Headings** may be any ATX level (`#Contacts` without a space too), a setext heading, a whole
  line in bold or italics, a bare `Contacts:` label, or a short title-like line such as
  `Points of Contact`. Section names are matched loosely: anything mentioning "contact", or
  `POC`, `People`, `Stakeholders`; "scenario" or `Use case`; "detail", "link", `Resources`,
  `References`, `Docs`. A label or bold line only opens a section when it names one, so prose such
  as "Contact us first" stays prose. `#1234` is a work item reference, not a heading.
- **`ServiceName` / `ClientId`** are read from a `Key: value`, `Key = value`, or `Key - value` line
  in any section, including table rows. Keys are compared without case, spacing, or punctuation:
  anything containing `ServiceName`, or `Service`, `ConsumerService`, `Consumer`, `AppName`; anything
  containing `ClientId`, `AppId`, `ApplicationId`, `Audience`, or `Client`, `Identity`,
  `ManagedIdentity` (`Client Id (Prod)` included). The first statement of each wins, and a GUID is
  lifted out of whatever else the line says.
- **Details** entries are labelled by the key they are listed under; without one, the link's own
  text is the label. Markdown links and bare URLs are both read.
- **Contacts** accept list items of any marker, plain lines, and table rows (read by their `Role` /
  `Name` / `Alias` / `Email` header when there is one). A person may carry a role before them
  (`` `M1`: ``, `**PM**:`, `[Owner]`, `Owner =`, `PM – `), after them (`: Owner`, ` - Owner`,
  `, Dev Lead`, `(Owner)`), or from the sub-heading or `Owners:` label they are listed under. The
  alias comes from a parenthesized word, an email address (bare, `<…>`, or a mail link), and an
  `@<guid>` mention is kept as a mention. Other parenthesized text is a note and is dropped. Several
  people on one line are split on `;`, and on `,` / `and` / `&` only when every part names someone.
  Placeholders (`TBD`, `N/A`, `?`), sentences, links, and lowercase phrases are not people.
- **Inline contacts** — `Owner: …`, `PM: …`, `Contacts: …` lines outside the Contacts section —
  are shown as well.
