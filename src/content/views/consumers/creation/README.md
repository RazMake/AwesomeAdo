# `content/views/consumers/creation`

The Consumers View's **Add new consumer** and **Add new request** commands: the right-click menu
entries, the forms they open, and how the answers become one new Azure DevOps work item each.

## Public API

- `creationCommands.ts`
  - `ConsumerCreationContext` — what the commands need from the board: `doc`, `services`, the
    query's hidden `grouping` item, the type catalog (`types`), the binding's
    `configuredAreaPaths`, and `onCreated()` (the board re-reads its query).
  - `buildAddConsumerCommand(context)` — **Add new consumer**: a consumer under the grouping item.
    Used on the header title's menu.
  - `buildAddRequestCommand(context, consumer)` — **Add new request**: a request under `consumer`.
  - `consumerCreationCommands(context, consumer)` — **Add new request** for a consumer card's
    menu, opening a new menu group. New consumers are added from the title menu or the header's
    **Add Consumer** button, never from a consumer.

  Each opens a centered panel naming the parent it creates under. A successful creation closes the
  menu and calls `onCreated`; a refused one keeps the form, with everything typed, and says so. A
  command is disabled with a reason when no work item type can be chosen.

- `AddConsumerButton.ts` → `renderAddConsumerButton({ doc, className, showConsumers, command,
openPanel })`: the header's **Add Consumer** button, opening the **Add new consumer** form beneath
  itself. Disabled with a tooltip reason while the board shows only requests
  (`REQUESTS_MODE_REASON`), when the query has no grouping item (`NO_GROUPING_REASON`), or for the
  command's own `disabledReason`.
- `NewConsumerForm.ts` → `renderNewConsumerForm(options)`: Service Name, ClientId, Scenario
  (Markdown with `@` mentions), Details (name/value pairs), and Contacts (name, alias, role — `M1`,
  `M2`, `M3`, `Dev`, `PM`, `CVP`), then **Add** / **Cancel**. Add is disabled, its tooltip saying
  why, until there is a service name and a ClientId that is a GUID no existing consumer already
  states, and while a detail or contact is only half filled. `clientIdProblem(clientId, known)`
  states why a ClientId cannot be used.
- `NewRequestForm.ts` → `renderNewRequestForm(options)`: Title, Description (the shared Markdown
  field, with mentions and pasted images), and Target date. The date is disabled, saying why, when
  the request type has no configured ETA field.
- `ContactNameField.ts` → `renderContactNameField(options)`: a contact's name, looked up in the
  Azure DevOps directory once typing pauses (`CONTACT_LOOKUP_DELAY_MS`). One match resolves at once;
  several are listed beneath the box to pick from.
- `consumerFormEntries.ts` → `createDetailEntry` / `createContactEntry`: one Details or Contacts line.
  A contact's alias is filled from the matched directory identity unless the reader typed their own.
- `RepeatableRows.ts` → `renderRepeatableRows(options)`: a group of entries added one at a time and
  removed with a red ×, reporting entries that were started but not finished.
- `newConsumerDescription.ts` → `formatNewConsumerDescription(values)`: the new consumer's
  description in the onboarding template's Markdown shape, so its card reads it back exactly and its
  contacts are editable in place.
- `creationDefaults.ts` → where a new item goes and what it is:
  - `newConsumerType` / `newRequestType` — the type the existing siblings mostly are, else the
    parent type's configured child type.
  - `newRequestAreaPath` — the area the board's kept requests are mostly filed in, so the new request
    is shown on the board it was created from.
  - `calledServiceName` — the last segment of the grouping item's area path, named in the Scenario
    guidance.
  - `knownClientIds` — the ClientIds existing consumers' descriptions state.

## What is created

- **Consumer** — under the grouping item, in its area and iteration, titled with the service name,
  with the formatted description.
- **Request** — under the consumer, in its iteration and `newRequestAreaPath`, with the typed
  description and, when picked, the target date stored in the request type's ETA field — all in the
  one creation patch.

Only types, ids and area paths are logged; titles and descriptions are not.

## Guidance

Every field's guidance is its placeholder (ghost text that typing replaces) and also its tooltip, so
a guidance line longer than its box can still be read in full. The Target date picker cannot show
ghost text, so its guidance is the tooltip alone.
