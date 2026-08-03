---
name: batch-work-item-writes
description: How to persist more than one change to the same Azure DevOps work item — always as ONE JSON Patch, never as several writes. Use when adding or changing anything that writes a work item field, a tag, or a discussion comment, or when a write fails with HTTP 412 / a stale-rev conflict.
---

# Batch Work Item Writes Skill

Read [AGENTS.md](../../../AGENTS.md) first. This skill adds workflow detail without copying rule
bodies. The public API lives in
[`src/common/ado/README.md`](../../../src/common/ado/README.md) and
[`src/common/browser/README.md`](../../../src/common/browser/README.md).

## The rule

> **Everything one user action changes on one work item goes in ONE JSON Patch.**

Not "preferably". Splitting an action across two writes is a correctness bug, not a style choice —
see [Why](#why-not-just-two-writes) below.

That includes:

- several fields (state **and** the date it moved, tags **and** an owner),
- a field **and** the discussion comment explaining it,
- a field **and** its `multilineFieldsFormat`.

## When to use this skill

- Adding a command that changes more than one thing about an item.
- Adding a command that records **why** it changed something.
- Diagnosing an `HTTP 412` / stale-rev failure from a work item write.

## Why not just two writes?

Every write this extension sends is guarded by an optimistic-concurrency test:

```jsonc
[{ "op": "test", "path": "/rev", "value": 12 }, ...]
```

Azure DevOps rejects the patch when the item's `System.Rev` has moved on. So a second write in the
same action is broken in **both** directions:

| Order               | What happens                                                                                                                                              |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| comment, then field | The comment created a revision. The field patch still carries the **old** rev → **`HTTP 412`, every single time.** The item is commented but not changed. |
| field, then comment | The field lands, the comment can fail → the item changed with **no record of why**, and now needs a compensating undo that can itself fail.               |
| **one patch**       | One revision. Both land or neither does. Nothing to order, nothing to compensate.                                                                         |

This is not theoretical: shipping the marker-tag command as "post the comment, then write the tag"
produced exactly the first row for every single use. See
[`debuggingNotes.md`](../../memory-bank/debuggingNotes.md).

**A comment is not a separate resource — it is part of the revision.** ADO's comments API is for
_authoring a discussion note on its own_ (the notes panel). Anything explaining a change belongs in
the same patch as the change, through `System.History`.

## Recipe — add something to an existing write

The write path is a straight line; each layer just forwards. To add a new thing a patch can carry,
touch each once, **in this order**:

| #   | File                                                 | Add                                                   |
| --- | ---------------------------------------------------- | ----------------------------------------------------- |
| 1   | `src/common/ado/IWorkItemFieldWriter.ts`             | the field on `WorkItemFieldWriteRequest` + why        |
| 2   | `src/common/ado/WorkItemWriteQueue/…Queue.ts`        | the field on `QueuedFieldWrite`, forward in `perform` |
| 3   | `src/common/browser/WorkItemFieldRequest.ts`         | the message field **and its validator**               |
| 4   | `src/common/browser/MessagingWorkItemFieldWriter.ts` | forward it into the message                           |
| 5   | `src/common/browser/updateWorkItemFieldInPage.ts`    | the patch `op` it becomes                             |
| 6   | `src/background/index.ts`                            | the property on the injected **config object**        |

Then a test at both ends: the patch body in `updateWorkItemFieldInPage.test.ts`, and the guard in
`WorkItemFieldRequest.test.ts`.

### Non-negotiables at each layer

- **Validate it in step 3.** `isUpdateWorkItemFieldMessage` is what keeps the operation _closed_ — a
  content-supplied value must not be able to widen what the credentialed patch does. Anything that is
  interpolated into a JSON Pointer needs a shape check (see `isFieldReferenceName`); anything that is
  only a value needs a type check.
- **Step 5 must stay self-contained.** `updateWorkItemFieldInPage` is serialized with
  `Function.prototype.toString` and injected into the page's MAIN world. No imports, no
  module-scoped constants, no `async`/`await` — parameters and page globals only.
- **Never add a positional argument to an injected function — add a property to its config object.**
  `chrome.scripting.executeScript` requires every entry of `args` to be JSON-serializable, and
  `undefined` is not: an omitted optional argument is an unserializable hole in the array and Chrome
  rejects the **whole injection** before it runs. Nothing reaches ADO, and it surfaces as a bare
  `"exception"` that reads exactly like a rejected write. Optional _properties_ of an object simply
  disappear on serialization — hence `UpdateWorkItemFieldConfig` and `FeatureCrewApplyConfig`.
  **`pnpm typecheck` and the unit tests cannot catch this**: the tests call the function directly,
  never through `executeScript`. Exercise it in a real browser.
- **Know the field's storage format.** `System.History` and `System.Description` are HTML fields:
  escape `& < >` and turn newlines into `<br>`, or set `/multilineFieldsFormat/<field>` to `Markdown`
  in the same patch. A multiline field left on ADO's default stores Markdown source verbatim.
- **A comment rides as Markdown.** The patch sets `/multilineFieldsFormat/System.History` to
  `Markdown` whenever it carries a `comment`, so an `@<guid>` mention in it resolves exactly as it
  does in a discussion note. Left on that field's default HTML, Azure DevOps HTML-ENCODES the value
  — quotes and all — and the reader sees markup where a name belongs. Its rich-text mention ANCHOR
  is not accepted from a patch either; the format is the lever, not the markup.
- **`add` APPENDS to `System.Tags`; use `replace` to set it.** Tags are one semicolon-separated
  string with no per-tag op, so a removal writes the whole remaining list — and under `add` ADO
  merges that list back into the existing tags, answers `HTTP 200`, and removes nothing. The injected
  patch picks `replace` whenever `baseValue` names a non-empty current value.
- **Fold the returned rev back onto the item** (`item.rev = result.rev`). The queue binds the rev at
  _execution_ time via a `currentRev` resolver; an item whose rev was not updated makes its own **next**
  edit fail as a conflict against itself.

## Recipe — call it

Use the item-command core, which takes the whole change as one object precisely so that everything
travelling in one patch reads as one thing:

```ts
import { writeField } from "./itemCommandCore";

await writeField(target, {
  field: "System.Tags",
  value: formatWorkItemTags(next),
  baseValue: formatWorkItemTags(item.tags), // what this change was derived FROM
  comment: "[BLOCKED] Waiting on the API.", // same revision, not a second write
});
```

## Still HTTP 412 with one patch? The rev drifted on its own

One patch fixes "my own comment invalidated my own write". It does **not** fix a cached rev that was
already behind. A drag-reorder, the ADR-042 rank fallback, a note posted from the notes panel, and
any edit in ADO's own tab all bump `System.Rev` **without reporting the new value**, so `item.rev`
goes stale by itself and every later write is refused until the board reloads.

When the new value is **derived** from the field's current value, pass that current value as
`baseValue`. On a 412/409 the injected patch re-reads the item and retries once against the server's
rev — but only while the field still holds `baseValue`, so a genuine concurrent change to that field
is still reported rather than overwritten.

## Still HTTP 412 with a current rev? A `test` op is being refused

`preconditions` become `test` ops too, and a refused one is the same 412 as a stale rev — with the
rev perfectly current, and with no rebase available (a preconditioned request never rebases). A
`test` is compared **literally**, so a value ADO would happily RESOLVE on a write can still fail as a
guard: `System.AssignedTo` must be tested as `identityTestValue(user)`
(`Display Name <unique.name>`), never as the sign-in address `identityFieldValue` writes.

To find which op is refused, send a patch of **only** `test` ops from the ADO tab's own MAIN world:
nothing is written, `200` means every test passed, `412` means one did not, and the fields can be
bisected one at a time against a real item.

## Red flags in review

- Two `await`ed writes to the same item id inside one handler.
- `noteWriter.addNote(...)` next to a `queue.enqueue(...)` for the same item.
- A compensating "undo the first write" branch — that is the symptom, not the fix; merge the writes.
- A new `HTTP 412` appearing only for a command that also comments.
- A `precondition` on an identity field carrying a sign-in address instead of `identityTestValue`.
- A new **positional** parameter on anything passed to `executeScript` as `func`.
- A write failing with no HTTP status in the message — that is the injection being rejected, not ADO.

## Related

- [`src/common/ado/WorkItemWriteQueue/README.md`](../../../src/common/ado/WorkItemWriteQueue/README.md)
  — why writes are serialized and why the rev binds late.
- ADR-030 in [`decisions.md`](../../memory-bank/decisions.md) — the write queue and rev binding.
- Reordering also bumps `System.Rev` but never reports the new one, so a cached post-move rev is never
  authoritative — [`debuggingNotes.md`](../../memory-bank/debuggingNotes.md).
