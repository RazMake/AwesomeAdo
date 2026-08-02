# Debugging Notes

Source-controlled, portable record of hard-won tactical knowledge about this codebase: root-cause
findings, non-obvious gotchas, live-debugging recipes, and workflow quirks. Unlike `systemPatterns.md`
(the curated architecture + rationale), this file is the running "lab notebook" — the specific bugs
we hit, why they happened, and the exact fix so nobody re-derives them.

**This is the single source of truth for these notes.** Do not keep durable repo knowledge in any
agent-tool-local memory (it does not clone or transfer between machines/agents). Record new findings
here so every agent, teammate, and clone sees them.

## A bulk move must not rediscover work after confirmation

- RISK: re-running the source WIQL and reapplying whatever filters happen to be current can add work
  the confirmation never counted, including another team's cards, or make a filter change halfway
  through alter the operation's meaning.
- RULE: snapshot only rendered, assigned, non-Done Primary-work card IDs when the dialog opens. Fresh
  reads may validate those IDs but never add IDs. Atomically test State, Area Path, and Assigned To
  with the iteration write; a 409/412 gets a full fresh pass, never the primary-field-only rebase.
- Unassigned, missing, Done, reassigned, or re-laned cards are skipped and reported. The dialog's
  Lane/assignee counts remain the operation contract from confirmation through completion.

## An old acceptance note must not survive an Interrupt re-tag

- SYMPTOM: an item tagged Interrupt, accepted, untagged, and later tagged again still painted as
  accepted because the reader looked for any `[ACCEPTED]` note in its history.
- FIX / RULE: acceptance is scoped to the latest tag-add revision. Page the work-item updates stream
  by the count actually returned; find the latest `System.Tags` transition from absent to present;
  then accept only a configured `System.History` token at or after that update's
  `System.ChangedDate`. Do not use the item's current `ChangedDate`, which moves for unrelated edits.
- Transport reuses `executeAdoRequestInPage`, so each idempotent page GET gets three bounded retries.
  Keep failed item IDs separate from unaccepted IDs; inability to read evidence is not evidence of
  rejection.

## Sprint Lane selections are shared records, not session filters

- `defaultAreaPaths` and dated `sprintAreaPaths` are normal settings, so both file transfer and the
  compact team work-item payload include them through the existing full-config serializer.
- A refresh or sprint change must pull before reading. A Lane change must update the selected sprint
  record and publish through `TeamSprintAreaPathStore`; keeping only `SprintSession.selectedAreaPaths`
  silently loses the team decision.
- Materialize defaults into each sprint record. Removing a default then leaves existing sprint
  selections intact. Prune only records with a known finish date, keeping the newest ten completed
  sprints plus current/future/undated records.

## Sprint must paint before Interrupt acceptance settles

- LIVE SYMPTOM: tree and roster reads completed, Diagnostics logged `Sprint View loaded`, but the
  surface stayed on `Loading spring data...` while the current-lifetime acceptance read remained
  pending.
- FIX / RULE: acceptance is post-paint enrichment in both views. Sprint starts with empty acceptance
  state, then generation-guards the asynchronous result and repaints only the still-current sprint.
  Team-config materialization is likewise fire-and-forget; a shared publish must never hold the board
  blank.

## Sprint child popup actions had three independent gaps

- SYMPTOMS: completion initially did nothing; title dragging dimmed the row but never started a
  native drop; and resolving kept the popup open while reactivating closed it.
- ROOT CAUSES: `ChildItemsBadge` received no `onToggleDone`; the owning card's bubbled `dragstart`
  handler called `preventDefault()` for every non-card target, canceling the child title's valid drag;
  and a repaint detached an open popup without releasing its document dismissal listeners, so the
  old listener handled the next pointerdown and cleared the rebuilt popup's remembered-open state.
- FIX / RULE: Sprint maps check to Done and uncheck to Active through the shared write queue. Card
  drag handlers ignore bubbled child drags rather than canceling them. Before a completion repaint,
  the badge explicitly closes the old popup to release listeners, preserves the logical open ID, and
  reopens the rebuilt popup. The owning card's Done state gates checkbox, assignee, ETA, and sibling
  drag together.

## A clipped popup host became viewport-fixed and misaligned inside a transformed ancestor

- SYMPTOM: Sprint's Assigned To picker opened far above and to the right of its card control.
- VERIFIED LIVE (2026-08-01): the Sprint-specific style put `overflow:hidden` on the relatively
  positioned Assigned To root. `popupHost` correctly treated that narrow root as a clipping ancestor
  and escaped the 200px picker to `position:fixed`, but a transformed board ancestor established a
  fixed-position containing block, so viewport coordinates resolved against the wrong origin.
- FIX / RULE: never put clipping overflow on an element that also hosts a popup. Keep the host
  overflow-visible and apply ellipsis to the trigger text itself. This preserves truncation while
  allowing the popup to remain absolutely positioned under its control.

## A 100%-opaque sticky header was transparent because its base CSS token did not exist

- SYMPTOM: Sprint column titles remained transparent while sticky even after their backing was
  increased to 100% opacity; scrolling cards were visible through the titles.
- VERIFIED LIVE (2026-08-01): `--control-background` resolved to an empty string. Applying the stored
  sticky value made computed `background-image` equal `none` and `background-color` transparent.
- ROOT CAUSE: `--control-background` is not part of `ThemeDefinition` and none of AwesomeADO's themes
  defines it. An unresolved `var()` invalidated the entire layered `background` declaration,
  including the semantic status tint before it. After that token was fixed, the title still appeared
  opaque because its sticky `board-header` ancestor painted a solid `--background-color` immediately
  behind it; changing the child's alpha could not reveal the cards beneath that ancestor. Finally,
  stuck-state detection compared the header's viewport coordinate with a scrollport-relative inset.
  Because the enhanced-view scroller begins below ADO's top chrome, `data-stuck` never activated and
  the configured sticky background was never selected.
- FIX / RULE: Sprint surfaces derive their backing from required theme token `--background-color`.
  Each title owns a separate backdrop containing the fully composed theme color; one
  `STICKY_HEADER_OPACITY` value applies directly to that backdrop while the label stays crisp. The
  sticky ancestor stays transparent, and stuck detection adds the Sprint root's direct parent
  scrollport viewport top to the CSS inset. Observer installation is deferred one microtask after
  paint so the Sprint root is mounted before binding directly to that scrollport. Before tuning alpha,
  inspect the full live paint stack: verify every custom property resolves, no ancestor supplies an
  opaque backing, and the actual scroll event activates `data-stuck`.

## A destination outline disappeared under Sprint's sticky title backdrop

- SYMPTOM: drag-target highlighting looked like a border while column titles were at rest, but the
  border disappeared when the title row became sticky.
- ROOT CAUSE: the heading's negative-offset outline occupied the same interior pixels as its
  absolutely positioned backdrop. The 90%-opaque sticky backdrop painted over that interior outline;
  the quieter resting backdrop only made the layering defect less obvious.
- FIX / RULE: paint interactive title framing on its own absolute layer after and above the backdrop,
  with a transparent border at rest. Do not put an inset outline or box shadow on the heading when a
  positioned child owns its visible surface.

## Query-definition HTTP 0 can be a stale in-memory MV3 worker

- SYMPTOM: Sprint View stops at `Could not load query definition (HTTP 0)` while the iterations read
  immediately succeeds. Reloading or rebuilding `dist/` alone does not repair it.
- VERIFIED LIVE (2026-07-31): the exact query-definition URL returned HTTP 200 with WIQL from the
  ADO tab's MAIN world, and the service worker's on-disk script contained
  `awesomeado:load-query-definition`, but sending that message from AwesomeADO's live isolated
  execution context resolved `undefined`.
- ROOT CAUSE: `fetch(location.href)` in the worker reads the current script file from disk; it does
  not prove the already-running worker evaluated that file. The in-memory worker still ran the old
  bundle, which had the iterations listener but not the newer query-definition listener.
- FIX / RULE: reload the extension first, then reload the ADO tab so both worker and content script
  come from the same build. A reply of `undefined` is now logged as an unhandled/stale worker instead
  of HTTP 0. Query-definition replies also preserve URL-build, injection, network-retry, invalid-JSON,
  and HTTP failure stages, while background logs record request arrival and outcome.

## Release validation rejected a correctly immutable tag ruleset

- SYMPTOM: `Verify owner-controlled version tag policy` exited at its final `jq -e` check even though
  `immutable-version-tags` was active and contained only update and deletion restrictions.
- ROOT CAUSE: GitHub's detailed repository-ruleset response omits the update rule's `parameters`
  object when `update_allows_fetch_and_merge` is disabled. Comparing the missing property directly
  with `false` fails because jq reads it as `null`.
- FIX / RULE: normalize the optional API property with
  `(.parameters.update_allows_fetch_and_merge // false) == false`. This still rejects an explicit
  `true` while accepting both representations of the disabled/default policy. The live payload on
  2026-07-30 returned `{ "type": "update" }` with no `parameters` object.

## Release publication required an impossible owner-enforced policy

- SYMPTOM: `Publish immutable per-build prerelease` stopped with an owner-enforcement error after
  all repository ruleset checks passed.
- ROOT CAUSE: `RazMake/AwesomeAdo` is personal-account-owned. Its repository-level **Enable release
  immutability** setting yields `{ enabled: true, enforced_by_owner: false }`; the second flag means
  an organization owner imposed the policy and cannot be true for this repository.
- FIX / RULE: require strict `enabled === true` at publisher entry and recheck it immediately before
  an official draft is published. Do not require `enforced_by_owner` unless the repository moves to
  an organization and the release trust model is deliberately revised. A 404 from the endpoint means
  the read token lacks repository Administration read access or immutability is not enabled.

## Team configuration Description was "not valid JSON" after a successful publish

- SYMPTOM: Pull logged `ConfigImportError: The selected file is not valid JSON` even though Publish
  had written a valid serialized configuration to the configured work item.
- ROOT CAUSE: Azure DevOps can return a multiline `System.Description` with HTML entities even when
  `/multilineFieldsFormat/System.Description` was set to Markdown. The live API returned
  `{&quot;awesomeAdoConfigVersion&quot;:...}` without an HTML element wrapper. A prefix check mistook its
  opening `{` for proof that it was already JSON and skipped entity decoding.
- FIX / RULE: `fetchTeamConfigInPage` first unwraps an optional Markdown code fence and accepts text
  unchanged only when `JSON.parse` actually succeeds; otherwise it parses the value as inert HTML and returns
  `body.textContent`, which removes ADO's wrapper and decodes entities before `importConfig`. Team
  Publish uses `exportCompactConfig` so Description contains one-line JSON without indentation;
  file Export remains intentionally human-readable.

## Primary Work classification and team configuration

- Live comparison on 2026-07-31 confirmed `settings.workItemTypes` in synced storage and work item
  `7679519`'s published Description both retained `isPrimaryWork: true` for User Story and Bug.
- The loss case is a legacy format-1 payload that predates `isPrimaryWork`: importing its otherwise
  complete `workItemTypes` setting would normalize every missing flag to unchecked and replace local
  classification. Format 2 makes the field authoritative. A format-1 list with no classification
  property preserves current Primary Work by type name; a legacy list carrying any such property is
  treated as aware, and format 2 can authoritatively clear every checkbox.
- Keep team-pull and file-import regression tests at their store-write boundaries; testing only the
  settings normalizer does not prove transfer migrations retain the setting.

## Expand-all and collapse-all changed arrows but not child rows

- SYMPTOM: Project Tracking's header buttons changed every twisty's glyph and `aria-expanded`, but
  the child rows stayed in their previous visible state. Individual twisties still worked.
- ROOT CAUSE: the item-hover refactor inserted an `item-surface` around each row and its details,
  leaving the children container as that surface's sibling. The header buttons re-located children
  from the row's immediate parent, which was now the surface, while individual twisties retained a
  direct reference to the correct container.
- FIX / RULE: locate a twisty's owning `awesomeado-tracking__item`, then select only its direct
  `awesomeado-tracking__children`. Bulk-control tests must assert the child container's `display`
  state as well as the glyph and ARIA metadata; metadata-only assertions accepted this broken UI.

## Follow ADO stayed dark after Azure DevOps switched to Light

- SYMPTOM: an already-mounted enhanced view stayed on AwesomeADO's Dark palette after Azure DevOps
  switched to its Light theme.
- ROOT CAUSE: `EnhancedViewSurface` resolved `auto` only when the synced AwesomeADO setting changed
  or the overlay mounted. Azure DevOps changes root/body classes and their CSS tokens, but the
  AwesomeADO setting remains `auto`, so neither path ran again.
- FIX / RULE: while `auto` is active, observe only `class`/`style` changes on ADO's root and body and
  re-resolve the concrete palette. Do not observe the whole subtree's attributes: view controls
  change their own classes/styles frequently, which would add churn and can make theme writes
  self-triggering. Disconnect the theme observer for concrete themes and when the surface restores.

## A popup reorder immediately previewed a hierarchy change

- SYMPTOM: grabbing a rolled-up child immediately showed the reparenting marker instead of keeping
  the drag in the child popup for same-parent ordering.
- ROOT CAUSE: the popup is nested inside its owning tree row. A no-op `dragover` on the grabbed popup
  row was not claimed by that row, so it bubbled into the outer tree row and the shared controller
  legally interpreted the same event as a one-level promotion.
- FIX / RULE: when a popup drag event originated inside `dragSurface`, an outer target outside that
  surface must stop the bubbled event without planning a move. A real event whose target is outside
  the popup still closes it and continues as a hierarchy drag. Regression tests must nest the popup
  surface inside the owning row; sibling-only fixtures cannot expose this propagation path.

## The release workflow originally rejected the personal-account repository

- SYMPTOM: successful `main` CI runs are followed by skipped Release runs even when release variables
  or secrets are believed to be configured.
- VERIFIED LIVE STATE (2026-07-30): `RazMake/AwesomeAdo` is public but its owner type is `User`; the
  tracked `.github/release-baseline.json` on `main` is still `disabled`; no active tag rulesets or
  releases are publicly visible. The available token cannot read Actions variables or secrets, so
  their presence is not independently known.
- ROOT BLOCKER: `release.yml` accepted only tag rulesets whose `source_type` was `Organization` and
  whose organization-only repository-name condition targeted AwesomeAdo. A personal repository can
  create repository rulesets, but it cannot produce that API shape.
- FIX / RULE (ADR-057): both release policy checks require `source_type == "Repository"`,
  `source == "$GITHUB_REPOSITORY"`, and the exact tag ref conditions/rules. Repository rulesets have
  only `conditions.ref_name`; never restore `conditions.repository_name` to this workflow.
- ACTIVATION ORDER: configure both repository rulesets and the release App before establishing the
  baseline marker. Pushing only the marker still fails at the next missing trust control.

## A popup reopened during repaint snapped back to its trigger's top-left

- SYMPTOM: after dragging a rolled-up child to a new position, its popup stayed open but moved from
  its correctly adjusted location to the top-left corner of the child-count chip.
- ROOT CAUSE: the successful write repainted the board and rebuilt `ChildItemsBadge` with
  `initiallyOpen`. The control opened synchronously while its new root was still detached, so
  `popupHost` measured a zero-size box and correctly skipped viewport/clipping correction. The raw
  `position:absolute; left:0; top:100%` anchor then became visible once the tree was mounted.
- FIX / RULE: any popup automatically restored across a repaint must open only after its rebuilt
  trigger is connected. `ChildItemsBadge` queues the auto-open to a microtask, verifies
  `root.isConnected`, and lets `popupHost` run the same measured placement used by the initial click.
  Geometry-dependent integration tests must mount the rendered root before asserting that reopen.

## One unknown `workitemsbatch` field rejected the WHOLE tree and looked like an empty query

- SYMPTOM: Project Tracking said the query returned no items even though ADO's query showed items;
  Diagnostics had no error. This appeared immediately after Priority was added to the requested
  fields.
- ROOT CAUSE: the built-in Priority reference is `Microsoft.VSTS.Common.Priority`, not
  `System.Priority`. ADO rejects an entire `_apis/wit/workitemsbatch` page when any requested field
  is unknown. `fetchAdoTreeInPage` then converted that non-OK response into `null`, contributed zero
  items, and the loader logged a successful zero-root parse.
- FIX / RULE: field reference names shared by reads and writes live in `common/ado/adoApi.ts`;
  Priority uses `PRIORITY_FIELD`. WIQL/batch failures return a structured `{ stage, status }`, and
  `MessagingWorkItemTreeLoader` MUST emit an error log carrying both the message and that detail.
  A tree whose relation ids are not all present in the hydrated batch is also a load error and is
  logged as incomplete/malformed data. Empty server data and failed hydration never share a shape.
- TEST THE BOUNDARY: a non-OK batch test must assert a structured batch failure, and the loader test
  must assert `logger.error` receives the stage/status. Testing the parser with matching fixtures
  cannot prove a field reference is accepted by ADO.

## `executeScript` args must be JSON-serializable — an optional one is an `undefined` HOLE

- SYMPTOM: `Work item 7623516 field write failed: exception.` — no HTTP status anywhere, because no
  request was ever sent. Appeared the moment a 7th optional positional argument (`comment`) was added
  to `updateWorkItemFieldInPage`, while the 6th (`multilineFormat`) was `undefined` for that call.
- ROOT CAUSE: `chrome.scripting.executeScript` requires **every entry of `args` to be
  JSON-serializable, and `undefined` is not.** A trailing `undefined` had been tolerated; an
  `undefined` with a defined argument AFTER it is a hole in the middle of the array, and Chrome
  rejects the entire injection. The background's `catch` reported that as a bare `"exception"`, which
  is indistinguishable from a closed/restricted tab — and reads exactly like a rejected write.
- FIX / RULE: **an injected function takes ONE config object, never an argument each.** Optional
  _properties_ simply disappear when the object is serialized, so the config keeps growing safely.
  This is why `FeatureCrewApplyConfig` is shaped that way; `UpdateWorkItemFieldConfig` now matches.
- The background now returns `injection failed: <message>` instead of `"exception"`, so "the tab went
  away" and "we passed something unserializable" are told apart from the board's log alone.
- WATCH FOR: this is a runtime-only failure. `pnpm typecheck` is perfectly happy with an optional
  positional argument, and every unit test calls the function DIRECTLY — never through
  `executeScript` — so the suite cannot see it either. Any change to an injected function's
  parameters must be exercised in a real browser.

## Posting a comment BUMPS `System.Rev` — a field write after one always fails HTTP 412

- SYMPTOM: the marker-tag command ("Tag with Blocked") recorded its comment and then logged, for
  every single use: `Field write for item 7623516 → "System.Tags" failed (base rev 12)` / `HTTP 412`.
  The item ended up commented but never tagged.
- ROOT CAUSE: Azure DevOps creates a **new work item revision** when a comment is posted through the
  comments API. Every field patch this extension sends is guarded by `{ op: "test", path: "/rev" }`,
  so the tag write that followed carried a rev that was already one behind and ADO rejected the whole
  patch. The comments API reports **no** new rev in its response, so there is nothing to re-bind to —
  `currentRev()` cannot recover it, and neither can the queue.
- FIX / RULE: **everything one user action changes on one item goes in ONE JSON Patch.** A comment
  explaining a change is written as a `/fields/System.History` op **in the same patch** as the field
  (`WorkItemFieldWriteRequest.comment` → `updateWorkItemFieldInPage`), so both are one revision:
  they land together or neither does. See the `batch-work-item-writes` skill.
- Do NOT "fix" this by reordering the two writes. Field-then-comment merely moves the failure: the
  item changes and the comment explaining it can still fail, which then needs a compensating undo
  that can itself fail. Two writes is the bug; one patch is the fix.
- `System.History` is an **HTML** field, so the MAIN-world patch escapes `& < >` and turns newlines
  into `<br>`. A comment written there still shows up in the Comments API the notes panel reads.
- Related, already recorded below: reordering also bumps `System.Rev` but the order API never reports
  the new one — never treat a post-move cached rev as authoritative.

## A cached `System.Rev` goes stale ON ITS OWN — `baseValue` is the one licensed rebase

- SYMPTOM: the SAME `HTTP 412` as above (`Field write for item 7623516 → "System.Tags" failed (base
rev 15)`) reappearing on a marker-tag command that was ALREADY one patch. One patch was still the
  right fix; it just is not the only way a rev goes stale.
- DO NOT re-diagnose this as "two writes". Check the patch first (`comment` rides in it?). If it does,
  the rev drifted between the board's last read and the write.
- ROOT CAUSE: several things advance `System.Rev` **without reporting the new value**, so the board's
  cached `item.rev` silently falls behind and EVERY later write on that item is refused until the
  board is reloaded: a drag-reorder (`_apis/work/workitemsorder`), the ADR-042 rank fallback, a note
  posted through the comments API, and anyone editing the item in ADO's own tab.
- FIX / RULE: a change **derived** from a field's current value passes that value as `baseValue`
  (`ItemFieldChange` → `QueuedFieldWrite` → `WorkItemFieldWriteRequest` → `UpdateWorkItemFieldConfig`).
  On a 412/409 the injected patch re-reads the item and retries ONCE against the server's rev — but
  only while the field still holds `baseValue`. A field that moved is still reported as a conflict,
  so ADR-030's "no auto-rebase" still holds for the case it was written for.
- The retry passes `mayRebase: false`, so it can never loop against an item that is moving.
- Comparison is a trimmed string compare, which is exact for `System.Tags` because
  `formatWorkItemTags` joins with ADO's own `"; "`. A field whose stored form differs from what the
  extension would write simply never rebases (it fails as before) — it can never rebase wrongly.

## Clearing a tag "succeeded" and changed nothing — `add` APPENDS to `System.Tags`

- SYMPTOM: **Clear ‹marker›** reported success (pill gone, no failed-write count, Diagnostics logging
  `field System.Tags updated`) and the tag was still on the item after a reload. Applying a tag
  worked, so the write path itself was plainly reaching Azure DevOps.
- DO NOT re-diagnose this as a rev/412 problem: there is no failure to find. ADO answers `HTTP 200`.
- DO NOT chase the VALUE either. It is right: `withoutWorkItemTag` keeps every other tag and drops
  only the marker. The first guess — that an empty string does not clear the field — is wrong, and it
  cannot explain a removal failing while ONE tag is left, which is the case that proves the point.
- ROOT CAUSE: the patch op. Azure DevOps treats `{ op: "add", path: "/fields/System.Tags" }` as
  **append**, so writing the shortened list merges it back into the tags already there and removes
  nothing. Microsoft's own `terraform-provider-azuredevops` says the same: `expandTags(..., Add)` on
  create, `expandTags(..., Replace)` on update.
- FIX / RULE: `updateWorkItemFieldInPage` sends `replace` when `baseValue` names a non-empty current
  value, and `add` only when there is nothing to replace (`replace` needs an existing value).
- There is NO per-tag operation. `System.Tags` is one semicolon-separated string, so every write
  rewrites the whole field and `remove` clears ALL tags, not one. Other people's tags are preserved
  by the VALUE we compute, and protected by the `test /rev` guard plus the `baseValue` rebase check —
  a concurrent tag edit bumps the rev and is refused rather than overwritten.

## An `@`-mention in a MARKER reason never resolved (it is the comment's FORMAT)

- SYMPTOM: a `[BLOCKED]` comment written from the board showed `@<ca16a18e-…>` instead of the person,
  in the extension's notes popup AND in ADO's own discussion. `"mentions": []` — nobody notified.
  A note added under the item, with the same token, resolved perfectly.
- ROOT CAUSE: a marker reason does not go through the comments API. It rides in the tag patch as
  `System.History`, which defaults to **HTML**, and Azure DevOps HTML-ENCODES what it is given there.
- READ THE STORED COMMENT BEFORE THEORISING. `GET .../workItems/{id}/comments?$expand=renderedText`
  showed the two side by side and settled it in one request:
  | | marker reason | note under the item |
  | `format` | `html` | `markdown` |
  | `text` | `[BLOCKED] &lt;a href=&quot;#&quot; …&gt;@Name&lt;/a&gt;` | `@<guid> …` |
  | `renderedText` | the same escaped text | `<p><a data-vss-mention=…>` |
- The `&quot;` is the tell: the extension escapes `& < >` and never quotes, so a quote-escaped value
  is ADO's own encoding — proof the field rejected the markup rather than that we mangled it.
- WRONG TURN, DO NOT REPEAT: writing the mention as ADO's rich-text anchor
  (`<a href="#" data-vss-mention="version:2.0,{guid}">@Name</a>`). An HTML-format comment does not
  accept it from a patch — ADO encodes the whole anchor and stores it as visible markup.
- FIX: the patch adds `/multilineFieldsFormat/System.History` = `Markdown` alongside the comment, so
  it stores in the same format a discussion note does and takes the same `@<guid>` token. No escaping
  is needed or wanted — a Markdown field stores its source verbatim.
- Verified against the live org with `?validateOnly=true`, which checks a patch WITHOUT saving it —
  the safe way to ask ADO whether it accepts an op.

## An editor's text went INVISIBLE: a layer measured while the control was detached

- SYMPTOM: every note and description editor showed an empty box. The text was there — selecting it
  made it appear (Chromium's `::selection` overrides a transparent colour), which is the giveaway
  that the field's own glyphs were hidden on purpose and whatever was meant to replace them was not
  drawing.
- ROOT CAUSE: a highlight layer laid over the field to colour `@`-mentions took its size from
  `offsetWidth`/`offsetHeight` and its metrics from `getComputedStyle`. **A `TextEditor` is built
  DETACHED and mounted by its caller**, so at build time every measurement is 0 and the computed
  style is empty — the layer was sized to nothing, and `overflow:hidden` did the rest.
- RULE: a control here may not measure itself while it is being built. Stretch a layer with `inset`
  and share LITERAL metrics with the field (`FIELD_TEXT_STYLE`) instead of copying computed ones.
- Do not hide the field's own text either. Painting the glyphs on a layer makes every character
  depend on that layer landing exactly right; drawing BEHIND the field (a background wash) fails
  visibly-but-harmlessly instead of hiding everything. Bold is out for the same reason: bold glyphs
  are wider, so the field would wrap differently from the run painted over it.
- REPRODUCING THIS WITHOUT THE BROWSER: jsdom has no layout, so no unit test can catch it. A tiny
  static page that builds the same DOM **detached and appends it afterwards**, served over
  `http://127.0.0.1` (the browser tool refuses `file:`), reproduces it and proves the fix in one
  screenshot.

## "New notes" emptied the board: a STALE service worker, then a half-migrated API

Two independent faults with the identical symptom (pill lights, board goes blank). Both are worth
knowing, and the FIRST one is the trap that costs the most time.

### 1. The background worker keeps running the OLD bundle after `pnpm build`

- SYMPTOM: `Note-activity read failed … the background worker did not handle the request` in
  Diagnostics, then `New notes filter settled: known=0, failed=46`. Earlier in the same log the same
  board had logged `known=46, failed=0` — i.e. it worked, then stopped.
- ROOT CAUSE: the content script was running the NEW bundle (it sent
  `awesomeado:read-note-activity`), while the service worker was still the pre-refactor build with no
  listener for that type. `chrome.runtime.sendMessage` then resolves **`undefined`**, which is
  indistinguishable from a network fault unless you name it — hence `UNHANDLED_BY_WORKER` in
  `common/browser/workerReply.ts`.
- FIX / RULE: **`pnpm build` rewrites `dist/`, but an already-registered MV3 service worker keeps
  serving its old bundle. Reloading the ADO tab is NOT enough — press Reload on the extension card
  (`edge://extensions`) whenever a message contract changes, then hard-reload the tab.** A content
  script and a worker from different builds is the default state after a rebuild, not an edge case.
- DIAGNOSIS RECIPE: dump the log from the **service worker** console (extensions page → "service
  worker"), where `chrome.storage.local` is reachable:
  ```js
  ((await chrome.storage.local.get("diagnostics.log"))["diagnostics.log"] || [])
    .filter((e) => /new notes|note.?activity/i.test(e.message))
    .map(
      (e) =>
        `${new Date(e.timestamp).toISOString().slice(11, 19)} [${e.level}] ${e.source}: ${e.message}`,
    );
  ```
  A `New notes filter: reading N…` line with NO matching `Note-activity read requested…` from
  `background` means the message never reached the worker — i.e. this fault.

### 2. `pnpm build` does NOT typecheck, so a half-migrated API ships silently

- The same refactor rewrote `RecentNotesIndex` onto the bulk `INoteActivityReader` (ADR-048) and
  changed three signatures — `new RecentNotesIndex(reader, logger)` (was `(loader, logger, onSettled)`),
  `ensureProbed(root)` (was `(root, sinceIso)`), `hasRecentNote(item, sinceMs)` (was `(item)`) — but
  the call sites in `ProjectTrackingView.ts` were never updated. JavaScript accepts all three: extra
  arguments are dropped, and the missing `sinceMs` becomes `undefined`, so `newestNoteAt >= undefined`
  is **always false** and no item can ever match.
- `pnpm build` is esbuild: it strips types and **never type-checks**. `pnpm typecheck` reported all
  four errors instantly. **After changing any signature, run `pnpm verify` BEFORE loading `dist/` — a
  green build proves nothing about call-site agreement.**
- LESSON: when a filter shows nothing, suspect the predicate's INPUTS before its logic.
  `x >= undefined`, `x > null` and `Set.has(undefined)` all turn a narrowing predicate into "hide
  everything" without throwing.

### What was NOT wrong (do not re-investigate)

Verified live against `o365exchange.visualstudio.com`: `System.CommentCount` IS returned by
`_apis/wit/workitemsbatch` with an explicit `fields` list (so `TrackedWorkItem.noteCount` is sound);
`comments?$top=1&order=desc` DOES return the newest comment (ADO also defaults to newest-first); and
the injected `fetchNoteActivityInPage` serializes clean — the build sets neither `minify` nor
`keepNames`, so no `__name` wrapper leaks into the MAIN world.

## `ConnectionData` is PREVIEW-ONLY — a released api-version made every note read-only

- SYMPTOM: on the Project Tracking board, the author's name on your OWN note was never clickable, so
  no note could be corrected. Nothing in Diagnostics said why.
- ROOT CAUSE: `buildWorkItemNotesUrls` pinned `_apis/ConnectionData` to `ADO_API_VERSION` (`7.1`).
  ADO serves that resource under **preview versions only** and answers a released one with
  `400 VssInvalidPreviewVersionException` ("use a preview version for such requests"). Verified live
  against `o365exchange.visualstudio.com`: `5.0`, `6.0`, `7.0`, `7.1` all 400; **no** api-version,
  `1.0`, `6.0-preview`, `7.1-preview`, `7.1-preview.1` and `7.2-preview` all 200. Now pinned to
  `ADO_CONNECTION_DATA_API_VERSION` (`7.1-preview.1`).
- WHY IT WAS INVISIBLE: the 400 body is ADO's error envelope (`$id, innerException, message,
typeName, typeKey, errorCode, eventId`) — valid JSON with no `authenticatedUser`, so
  `parseCurrentUser` returned `null`, which is the SAME result as "nobody is signed in". Worse,
  `fetchWorkItemNotesInPage` kept only the connection BODY and threw the status away, so the failing
  call left no trace. `RawWorkItemNotes` now carries `connectionStatus` / `connectionFailure` and the
  loader logs an error when the identity read fails. **A read whose failure is degraded rather than
  surfaced must still report its own outcome** (AGENTS.md §9).
- The identity MATCHING was never the problem: a live probe showed `createdBy.id ===
authenticatedUser.id`, `uniqueName === properties.Account.$value`, and `authenticatedUser.id ===
authorizedUser.id`. `isOwnNote` is correct as written — do not "fix" it.
- `createdBy` on a comment carries `displayName,url,_links,id,uniqueName,imageUrl,descriptor`.
- PROBE: `ado-probe/note-identity-probe.js` — paste into the console of an ADO tab; it prints every
  identity source's status/error verbatim and a per-author table of which handles match. Two traps
  when writing such a probe: path segments arrive **already URL-encoded** (`O365%20Core`), so decode
  before re-encoding or the request 404s; and never discard a non-2xx body — ADO's `message` names
  the versions it will accept, which is the whole answer.

## A new setting needs THREE edits in `BrowserSyncSettingsStore`, or it silently never saves

- `markerTags` shipped as a real `ExtensionSettings` field with a normalizer, a UI, and a
  `store.write({ markerTags })` call — but it was never added to `SETTING_KEYS`,
  `SETTING_WRITE_MAP`, or `projectSettings`. `write` skips a name it has no key for, so the promise
  RESOLVED, the UI reported success, and the value was gone on the next read. Nothing logged,
  because `write` only logs the settings it actually wrote.
- Adding a setting therefore means all four of: the `ExtensionSettings` field + normalizer, a
  `settings.<name>` key in `SETTING_KEYS`, a `SETTING_WRITE_MAP` row, and a line in
  `projectSettings`. Miss any of the last three and the setting is write-only fiction.
- Watch for this shape generally: a table-driven writer that silently ignores unknown keys turns a
  missing registration into a success-reporting no-op.

## Never persist a whole section by re-scraping its DOM on every edit

- `MarkerTagsController` used to answer every `change` by re-reading all eight inputs and writing the
  full `markerTags` map. That makes each save only as trustworthy as the ENTIRE form's current DOM:
  one perturbed control (a value the browser restored into the wrong input on session restore, a row
  still showing pre-import values because nothing re-rendered after an import) is written under a
  NEIGHBOURING key and silently replaces a value the user never touched. The failure is invisible —
  the write succeeds and the status line says "saved".
- Fix pattern: persist a **targeted patch**. The edited control names its own record (its row's
  `data-marker`) and its own field (its `data-role`); every other record is carried over from the
  last accepted snapshot, never re-read. A stray DOM value can then only ever affect its own field.
- Reproduction technique worth reusing: copy `dist/options/*` to a scratch folder, insert a small
  `chrome.*` shim script (in-memory `storage.sync`/`local` backed by `localStorage` so a reload
  survives) before `options.js`, serve it over `http://127.0.0.1`, and drive it with the browser
  tools. `file://` is blocked by the browser tool. That runs the REAL built page end to end without
  packaging or signing anything.
- Still open (reproduced, not yet fixed): after an **import**, the options page's Azure DevOps tab is
  not re-rendered — storage holds the imported values while the fields still show the old ones, so
  the next edit in that tab writes stale values back over the import.

## A page section that "loads once" must be told when its store is replaced from outside

- Options-page controllers split into two kinds: those that SUBSCRIBE (`OptionsController`,
  `ConfigurationBannerController`, `DiagnosticsController` — they call `store.observe`) and those
  that READ ONCE at load and then treat their own DOM / in-memory map as the working copy
  (`AzureDevOpsController`, `QueryBindingsController`). Only the first kind follows a configuration
  file **import**; the second kept showing the configuration the file had just replaced until the tab
  was closed and re-opened, and its next save wrote those stale values back over the import.
- Fix: `SettingsTransferController` takes an `onImported` callback and fires it after both stores are
  written; `src/options/index.ts` collects a `reloadAfterImport` list that each read-once controller
  registers with, calling its new `reload()`. Any future read-once section must register there too.
- The reverse trap also exists: do not "fix" this by making every section subscribe. A form that
  re-renders under the user's fingers on every synced change would discard half-typed input.

## Ordering + resolved-window on the Project Tracking board

- Sort keys must be FETCHED. `orderItems` needs `importance`, so `TRACKING_FIELDS` now asks ADO for
  `Microsoft.VSTS.Common.StackRank` (hydrated to `TrackedWorkItem.importance`) and
  `Microsoft.VSTS.Common.StateChangeDate` (hydrated to `stateChangeDate`). Only request stock
  process-template fields: `workitemsbatch` fails the whole page for a field the org does not define.
- "Missing rank" sentinel is `UNRANKED_IMPORTANCE = Number.MAX_SAFE_INTEGER`, deliberately FINITE.
  The importance comparator subtracts, and `Infinity - Infinity` is `NaN` — a `NaN` comparator result
  silently scrambles the sort instead of leaving the tied pair alone.
- "Resolved" is a POSITION, not a state name: `completedColumnOrdinal(boardColumns)` =
  `length - 2`, i.e. the column before the abandoned bucket (Removed). Reject a negative ordinal —
  `boardColumnOrdinal` also answers `-1` for an unmapped status, so a short board would otherwise
  read every unmapped item as finished.
- The hide-after-N-days age is measured from `stateChangeDate`, NOT `changedDate`: a comment or a
  re-tag must not put finished work back on the board. An item with no state-change date is never
  aged out, and an ancestor survives while any descendant is still visible (`isVisibleUnderFilter`
  already recurses), which is what keeps a done parent over unfinished children.
- The filter and the ordering are applied in BOTH `renderTree` and `createMinorChildrenBadge`, so the
  rollup's `completed / total` chip can never disagree with the rows the board is showing.
- Adding a required field to `TrackedWorkItem` breaks every object-literal fixture. Run `pnpm typecheck`
  first and fix exactly the files it lists.

## TF400486 on a drag-reorder is NOT a concurrency problem (ADR-042)

- SYMPTOM: dropping a row logs `order HTTP 400: TF400486: Unable to complete the operation because you
or another user has modified, removed, or re-parented items, or you are trying to reorder an item
outside of its immediate parent.` — every single time, for the same item, with an unchanged `rev`.
- DO NOT chase a stale `rev`. The failing call is `_apis/work/workitemsorder`, and the order request
  carries **no rev at all** (only `{ ids, parentId, previousId, nextId }`). If the log says
  `stage: "order"`, revisions are irrelevant. A rev problem would fail at the `reparent` stage instead.
- ROOT CAUSE: that endpoint only ranks items that already hold a position on the **team's backlog**.
  Two things put an item outside it, both permanent: an empty `Microsoft.VSTS.Common.StackRank` (never
  ranked — common for Features here), and a parent of the item's own category (story→story,
  feature→feature), which Azure Boards
  [documents as not orderable](https://learn.microsoft.com/azure/devops/boards/backlogs/resolve-backlog-reorder-issues).
- FIX (ADR-042): `common/ado/rankFallback` writes `IMPORTANCE_FIELD` directly when the order stage is
  refused. Same approach as the team's PowerShell tracker at
  `…/ESP-MiddleTier-Team/.tools/ADO/View-ProjectTracking` (`Set-ProjectTrackingOrderByRank`), which hit
  and solved this first — check it when an ADO write behaves oddly, it is a working reference.
- Reading the log: the content side logs the raw ADO sentence and then `explainReorderRefusal`'s
  plain-English line; the background logs which items were re-ranked and whether the level was
  renumbered. If a drop "worked" but the row jumped somewhere odd, look for `renumbered` there.
- Reordering DOES bump `System.Rev` (the rank is a field on the item) but the order API never reports
  the new rev — so never treat a post-move cached rev as authoritative.

## Terminology (per developer, use consistently)

- "Status" / "State" (of an item) = the APPLICATION board-column label (In Queue/In Progress/Waiting/
  Done/Removed) that the item is mapped onto. This is what the UI DISPLAYS.
- BOARD COLUMNS ARE A FIXED SET of `BOARD_COLUMN_COUNT` (5): `DEFAULT_BOARD_COLUMNS` = In Queue/In
  Progress/Waiting/Done/Removed. Titles are RENAME-ONLY (no add/remove). `normalizeBoardColumns`
  positionally coerces stored value to exactly 5 (keeps stored title per index, else default; a
  case-insensitive collision with an earlier index falls back to that index's default).
  `MAX_BOARD_COLUMNS` + add/delete-column UI were REMOVED. `isAdoConfigured` no longer checks
  `boardColumns` (always present). `StatusBadge` returns a `StatusBadgeHandle` with
  `setStatus(state, ordinal)` so a committed move re-tints in place (`applyColors` extracted).
- "ADO State" / "ADO Status" = the raw `System.State` value from Azure DevOps. Mapped onto a board
  column via `TrackedTypeColumn.states[]`; `states[0]` is the PRIMARY ADO state written back for a
  column.
- `StatusBadge` control DISPLAYS the mapped column (Status), NOT the raw ADO State. `onChange` writes
  the chosen column's primary ADO State.

## RULE: every enhanced-view control follows the resolved AwesomeADO theme (ADR-034 / systemPatterns #13)

- NON-NEGOTIABLE. Every fixed presentation or semantic color belongs to the complete contract in
  `common/view-common/themes`; consumers use `var(--role)` without literal color fallbacks. Runtime
  ADO metadata colors and generated tag hues remain data, while their fixed blend endpoints and
  framing are theme roles. Status colors are muted ordinal roles. Decorative guides use theme roles.
  Reusable theme-aware controls live in `src/common/view-common/control/<Control>/` (sole DOM allowed
  under `common/`, AGENTS.md §11).

## Extension themes are standalone; Follow ADO resolves only to Dark or Light

- `src/common/view-common/themes` owns a complete CSS-variable contract plus one independent file for
  Dark, Light, and Blue. `themes.ts` is the only registry; `Theme`/`THEMES`, the options selector, and
  both rendering surfaces derive from it. Adding a theme means one definition plus one registry entry.
- `resolveTheme("auto", adoTheme)` maps only to Dark or Light (Dark if detection is unavailable).
  Blue is always manual. Both Options and `EnhancedViewSurface` pin every color from the resolved
  definition; Follow ADO never clears tokens or inherits ADO's arbitrary palette.
- `EnhancedViewSurface.applyTheme(theme)` pins the variables on the HOST overlay element so they win
  for the view subtree only; ADO's surviving chrome keeps ADO's own theme. `applyThemeToHost()` is
  re-called from `ensureHost()`
  every mount because cssText (`HOST_OVERLAY_CSS`) is only assigned on host CREATE, so a re-attach
  after ADO redraws would otherwise lose the custom props. host bg = `var(--background-color)`
  resolves to the pinned value on the same element. `QueryPageController.applySettings` forwards
  `settings.theme` via `surface.applyTheme(theme)` EVERY settings change (a theme flip re-themes the
  open view WITHOUT rebuild; `applyTheme` does not touch signature/DOM). Test surface spies MUST add
  `applyTheme: vi.fn()`.
- CSS custom properties DO NOT reach browser-drawn widgets (native `<input type=date>` calendar popup
  - its indicator glyph, scrollbars): those read `color-scheme`. `applyThemeToHost()` therefore ALSO
    sets the resolved definition's `colorScheme` on the host (inherited by the whole subtree).
    Without it a dark view opened a stark WHITE calendar. Corollary: never style a
    control from a token the view does NOT pin (`--input-background` painted the ETA date field white
    under a pinned dark theme over a light ADO page) — use `transparent` over the popup's themed surface.
- Scope decision: `BindingMenu`/`BindingButton` (ADO top bar) intentionally still follow ADO (they
  live in ADO's header context). Only the enhanced-view overlay + its controls take the extension theme.

## Layer convention (views feature)

- ADO field definitions + the normalized work-item data model (decoupled from raw ADO JSON) live in
  `src/common/ado`. `src/common/view-common` = common view UX (menus, reusable components) + the
  `ViewType`/`EnhancedView` contracts — NEVER ADO data shapes/fields. Common core fields: id, rev,
  type, title, state, assignedTo, iteration, rank/importance, eta, parent/child ids; per-view extra
  fields grow as views are implemented. Recorded in `.agents/memory-bank/systemPatterns.md`.

## Pasted images missing from notes / descriptions

- SYMPTOM: an expanded note showed an empty box where a screenshot should be; the rendered DOM was
  `<img alt="Image" style="max-width:100%;height:auto">` — the element survived, the `src` did not.
- CAUSE: Azure DevOps' rendered rich text (`renderedText`, and HTML descriptions) refers to an
  embedded attachment by its **bare GUID** — `src="4f76001f-…-b3a3f54e9a73?fileName=image.png"`, with
  no host, no collection and no `_apis` path. `sanitizeRichText` accepted a source only if it already
  matched `^(https?:|data:image/)`, so every pasted image failed and the attribute was dropped
  silently (the sanitizer has no logger).
- TRAP: resolving that reference as an ordinary relative URL is NOT enough. ADO's SPA pins
  `<base href="/">`, so `doc.baseURI` is the bare origin — you get `{origin}/{guid}` (404), and on
  `dev.azure.com` you also lose the organization path segment. Resolve against
  `doc.defaultView.location.href`, and turn a bare GUID into the REST request ADO itself makes:
  `{collectionBase}/_apis/wit/attachments/{guid}?fileName=…&api-version=7.1` (`buildAdoAttachmentUrl`,
  `src/common/ado/adoAttachment.ts`). Org-scoped, because attachment ids are org-unique and an
  org-level page has no project. KEEP `fileName` — it is what makes ADO answer with an image
  content type instead of an opaque download.
- The scheme check must run on the RESULT of resolution, otherwise `javascript:` sneaks back in.
- FOLLOW-UP (notes only): descriptions were fixed by the above but **notes still showed an empty
  box**. A comment is rendered from ADO's own `renderedText`, and ADO there hands back the bare
  reference ALREADY JOINED TO THE ORIGIN —
  `<img src="https://{org}.visualstudio.com/{guid}?fileName=image.png">`. That is the same dead
  `{origin}/{guid}` URL wearing a host name, so `buildAdoAttachmentUrl` (which only matched a BARE
  id) declined it and the sanitizer passed it through untouched. A description carries the bare id
  because it arrives unrendered — which is exactly why the two behaved differently.
- `buildAdoAttachmentUrl` now also accepts a resolved URL whose LAST PATH SEGMENT is an attachment
  GUID, rebuilding it as the REST request. Guarded two ways so a correct URL is never rewritten: a
  path containing an ADO area token (`/_apis`, `/_queries/query/{guid}`, …) is refused, and so is a
  host that is not a supported ADO host.
- DIAGNOSING THIS: read the rendered `<img src>` off the page. `{origin}/{guid}` (no `_apis`) means
  the reference was never recognized; `{origin}/{path}/{guid}` means it was resolved relatively
  against the page; `_apis/wit/attachments/…` means the URL is right and the problem is the response
  (a missing `fileName` returns an opaque download rather than an image).
- The old PowerShell tool needed an `/api/attachment` bearer-token proxy for the same images ONLY
  because it rendered on `http://localhost` — cross-origin, no ADO session. This extension renders
  inside the ADO page, so once the URL is right the browser sends the session itself.

## Extension icon / injected button image

- Canonical icon source: `src/icons/icon.svg` (blue circle + work-item card + green check + gold sparkle).
- Manifest `icons` and `action.default_icon` MUST be raster PNG — Chrome/Edge do NOT accept SVG there.
  PNGs (16/32/48/128) live in `src/icons/` and are regenerated FROM icon.svg with `@resvg/resvg-js`
  (fitTo width). Generate in a throwaway temp project so the repo `package.json`/lockfile stay clean.
- `build.mjs` `copyStatic` already copies `src/icons/* -> dist/icons/` when the folder exists.
- The content-script `BindingButton` renders an `<img>` whose src is
  `chrome.runtime.getURL("icons/icon.svg")`. icon.svg is listed in manifest `web_accessible_resources`
  (matched to the ADO hosts). Content-script loads of web-accessible resources bypass the ADO page CSP,
  so no data-URI/inline-SVG needed.
- `BindingButton` stays chrome-free: the icon URL + label are injected by the composition root
  (`src/content/index.ts`). label is used as title/aria-label/alt, not visible text.
- `BindingButton` PLACEMENT (current): prepend into ADO's top-bar command menubar so it groups with
  ADO's native command icons AND shares the container that paints the header's bottom hairline.
  `findMenubar` = `headerRow.querySelector('.region-header-menubar,[role="menubar"]')` scoped to
  `findSearchBox().closest('[role="navigation"]').parentElement`, else global. Fallbacks: after the
  nav region ending with the search box, then fixed top-right overlay.
- CRITICAL "interrupted line" bug: each header section (region-header nav AND region-header-menubar)
  paints its OWN 1px bottom divider via `box-shadow: rgba(255,255,255,0.08) 0 1px 0 0` (dark theme).
  A button inserted as a BARE header-row child BETWEEN nav and menubar is shorter (32px vs 48px row,
  centered) and carries no line, leaving a horizontal GAP in that continuous underline. FIX = put
  the button INSIDE the menubar (the container draws the line across the full width incl. our button)
  — do NOT try to replicate the hairline (its color is theme-specific). Verified live: parent becomes
  `role="menubar"` region-header-menubar, button is firstElementChild, x~~774 y~~8 32x32, line unbroken.
- `findSearchBox` tries `[role="search"]` (div.flex-cell.search "Project-wide search"), then
  `input[aria-label^="Search" i]` / `input[placeholder^="Search" i]` (#l1-search-input). Do NOT insert
  next to the search box itself — ADO wraps it in `.expandable-search-header` sized to the input, so a
  sibling gets squeezed ON TOP of the input.
- STYLE like ADO's native command buttons (bolt-button bolt-icon-button subtle): 32px square,
  padding ~6-8px, border-radius:2px (NOT 50%/circle), transparent bg, NO drop-shadow, subtle hover.
  Native icons are MONOCHROME (currentColor, white on dark theme); our brand icon stays COLORED so
  it visibly stands out among them — flattening it to monochrome would need a new line-glyph asset.
- `styleAsInline`: flex:0 0 auto; align-self:center; margin:0 (flush with native buttons). Overlay
  fallback (`styleAsOverlay`) floats top-right and OVERLAPS the profile avatar when the search box
  is not ready at `show()` time. The observer must therefore promote a still-connected overlay into
  the navigation/menubar when those anchors appear; watching only for a disconnected button leaves
  the fallback over the avatar indefinitely. Both placements stay outside `[role="main"]` so they
  survive Enhanced View blanking.
- CRITICAL: ADO re-renders its header (framework/Bolt tree) DURING and shortly after load and
  silently DROPS foreign injected nodes. A one-time insertion INTERMITTENTLY disappears ("button
  does not show up"). Fix = MutationObserver (`keepPlaced`) on `doc.documentElement`
  `{childList,subtree}` that re-runs `place(button)` when the button is disconnected OR when a better
  late-rendered anchor is available. `hide()` must `observer.disconnect()` FIRST. Tests:
  `afterEach(button.hide())` to stop observers leaking across tests + `flushMutations = setTimeout(0)`
  to let MO callbacks run.
- BUTTON OPENS A POPUP MENU (not a direct options jump). Button shows on ANY single-query route
  (bound OR unbound), hidden elsewhere. Click toggles `src/content/BindingMenu.ts` (transient popup,
  position:fixed, z-index 2147483647, right-edge aligned to button, top=rect.bottom+4). Menu dismiss:
  outside pointerdown (capture; IGNORES clicks on anchor so the button's own handler toggles without a
  close/reopen race), Escape, resize/scroll reposition. No persistence observer (unlike the button).
- `BindingButton.show(onClick)` passes the button element as the anchor: `show((anchor)=>...)`.
- `QueryBindingController`: ctor (button, menu, actions: `QueryMenuActions`, url, overrides:
  `IActiveViewOverrides`, logger). Actions injected at composition root (Dependency Inversion):
  `openOptions` (sends `OPEN_OPTIONS_MESSAGE`), `enableEnhancedView(queryId)` (sends
  `OPEN_BINDING_SETTINGS_MESSAGE`), `disableEnhancedView` (`store.unbind`), `setActiveView(queryId, active)`
  = SESSION-ONLY now (writes the in-memory override + nudges the page controller, NO store write).
  Controller closes menu on navigate & `applyBindings` (stale-close). Menu model: UNBOUND=[Options,
  Enable Enhanced View]; BOUND=[<bound view label> (check if active enhanced), Standard View (check
  if active standard), separator, Options, Disable Enhanced View]. Check mark = `resolveActiveView(
overrides.get(queryId), defaultEnhanced)`. View label via `getViewType(view)?.label ?? raw id`.
- VIEW SWITCH IS EPHEMERAL (session-only) — the fix for "switch is wrongly remembered across browser
  reopen". `QueryBinding` has NO `active` field (REMOVED); nothing per-query is persisted about which
  view shows. Which view a bound query shows on load is driven SOLELY by the global
  `settings.defaultView` ("enhanced"|"original"). The top-bar menu's Standard/Enhanced switch updates
  an IN-MEMORY, device-local override in `src/content/active-view/` (`SessionActiveViewOverrides`
  implements `IActiveViewOverrides { get(queryId):ActiveView|undefined }`; `SessionActiveViewOverrides`
  also has `set(queryId,active)`). Content script is re-injected on every full page load so the Map
  resets → reopening the browser returns every query to the configured default. Constructed ONCE at the
  content composition root (`content/index.ts`) and passed (as read-only `IActiveViewOverrides`) into
  BOTH `QueryPageController` and `QueryBindingController`. Menu action:
  `sessionActiveViews.set(queryId, active)` then `controller.applyActiveViewOverride()` (public method →
  `this.refresh()`) to re-render the page in place; the menu re-reads the override live on next open
  (`BindingMenu` auto-closes on selection).
- `resolveActiveView(override, defaultEnhanced)` = `override ?? (defaultEnhanced ? "enhanced":"standard")`.
  `ActiveView`="enhanced"|"standard" (in-session presentation); `DefaultView`="original"|"enhanced" (the
  synced global setting). `normalizeBindings` DROPS a legacy `active` left by an older build (silently,
  forward/back compatible). `IQueryBindingStore` has NO `setActiveView` anymore (REMOVED from interface +
  `BrowserSyncQueryBindingStore`); it has `unbind(queryId)` (read-modify-write, no-op if absent).
  `QueryPageController.decide()` on a bound query: `resolveActiveView(overrides.get(queryId),
settings.defaultView==="enhanced")`; unbound → not enhanced. `content/index.ts` feeds the binding
  snapshot to BOTH `bindingController.applyBindings` AND `queryPageController.applyBindings`.
- Live-debugging an authed ADO extension: the MCP Playwright browser has NO extension loaded. Launch
  Edge with `--remote-debugging-port=9222 --user-data-dir=<fresh> --load-extension=<ABS path to dist>`
  (relative path is resolved vs Edge CWD, not repo!). If Edge already runs, a plain msedge launch
  joins the existing process and the port never binds — use a distinct user-data-dir. Corp device SSO
  auto-authenticates a fresh Edge profile. Then a zero-dep Node script (global fetch + WebSocket)
  hits `http://127.0.0.1:9222/json/list`, opens the tab's webSocketDebuggerUrl, and drives CDP
  (Runtime.enable/evaluate, Page.captureScreenshot). Retry the initial fetch ~30s for cold start.

## Options page hangs in debug mode (spinner forever, dark bg, no controls, no console error)

- NOT a page-JS bug. `options.html` is static; only sub-resource is a classic body-end
  `options.js` (IIFE, synchronous bootstrap, init voided) — so the `load` event can only hang
  if the resource never fetches/runs, not from any hanging promise.
- Cause: VS Code browser debugger launch configs (`type: msedge`/`chrome` in `.vscode/launch.json`)
  set `waitForDebuggerOnStart` on every new target. The options tab is opened PROGRAMMATICALLY by
  the service worker (`chrome.tabs.create` in `src/background/index.ts`, triggered by the content
  script binding button). js-debug intermittently fails to release that child target, so the tab
  sits paused: throbber spins, Chrome paints only the default dark bg, script never runs, no error.
- Fingerprint match: only in debug mode, refresh re-enters the pause, self-heals after js-debug
  attaches/times out ("goes away after a while"), recurs "every time a thing is added to the store"
  because that flow is what opens the tab via the SW.
- Proof it's the debugger, not code: the identical SW `chrome.tabs.create` flow loads in ~250ms
  when the browser is launched WITHOUT the debugger (verified via Playwright, real unpacked ext).
- Fix/workflow: for manual/visual testing launch the browser WITHOUT js-debug. Added tasks
  "Run: Extension (Edge, no debugger)" / "(Chrome for Testing, no debugger)" that `Start-Process` the
  browser with `--load-extension=dist` + `--remote-debugging-port=9222/9223`.
- CRITICAL race (caused a recurring "Unable to attach to browser"): `Start-Process` returns
  IMMEDIATELY, so a preLaunchTask that only launches the browser lets js-debug fire the attach
  BEFORE Edge/Chrome cold-starts and binds the CDP port (~6s). Browser `attach` configs do NOT
  meaningfully poll, so they fail instantly. FIX: the no-debugger tasks first probe
  `http://127.0.0.1:9222(9223)/json/version` (reuse an already-listening browser, exit 0), else
  `Start-Process` THEN poll the same URL (Invoke-WebRequest, 300ms loop, 30s deadline) and only exit
  once the endpoint answers ("CDP ready on 9222", exit 0; else print an ERROR hint + exit 1). VS
  Code waits for the non-background preLaunchTask to finish, so the port is guaranteed live before
  the attach connects.
- Breakpoints without the pause: the ONLY launch.json configs are now the two `attach` configs
  "Run/Debug Extension (Edge)" (port 9222) / "Run/Debug Extension (Chrome for Testing)" (port 9223),
  each with `preLaunchTask` = the matching "Run: Extension (…, no debugger)" task + `timeout:30000`.
  A single F5/Ctrl-F5 builds, `Start-Process` launches the browser (port bound, no SW pause), then
  attaches. webRoot=dist; esbuild dev builds emit linked source maps so `.ts` breakpoints bind.
- The old `request:launch` configs ("Debug Extension (Edge)"/"(Chrome for Testing)") were DELETED:
  they were FIRST in the list (Ctrl+F5 default when nothing is explicitly selected), and js-debug's
  own browser launch hands off to any existing Edge process -> fails to bind its port -> "Unable to
  launch browser: Unable to attach to browser". They also gated/paused SW-opened tabs. Do NOT
  reintroduce a browser `request:launch` config.
- "Unable to launch browser: Unable to attach to browser" on Ctrl-F5 = either (a, historic) a
  `request:launch` browser config was the selected/default config (now removed), or (b) an `attach`
  config with NOTHING listening on its port (task not run first). Root fix: attach-only configs that
  are self-sufficient via preLaunchTask. If a stale prior Edge still holds port 9222, close it or
  delete `.debug-profiles/edge-nodebug` and retry. Verified: the task's launch+poll binds 9222 from a
  clean state AND reuses it when Edge is already running.
- This fix REGRESSED once because `.vscode/launch.json` + `.vscode/tasks.json` were only ever edited
  in the working tree and never committed (`git log` showed just the scaffold commit), so the files
  reverted to the broken `request:launch` + poll-less-`Start-Process` shape. COMMIT both files after
  touching them — the debug workflow is repo knowledge, not local scratch.

## Single-source-of-truth abstractions (post deep-review refactor)

- `observeStorageKeys` (`src/common/browser/observeStorageKeys.ts`) = THE storage observe race
  protocol (subscribe-before-read, revision-guarded initial read). BOTH `BrowserSyncSettingsStore` and
  `BrowserSyncQueryBindingStore` delegate `observe()` to it. Do NOT reinline the loop in a store.
- `AdoHost` (`src/common/navigation/AdoHost.ts`) = THE ADO host decision: `isSupportedAdoHost`
  (anchored `.visualstudio.com` suffix — rejects fake.visualstudio.com.evil.com; keep anchored),
  `VISUAL_STUDIO_SUFFIX`, `ADO_HOST_MATCH_PATTERNS` (mirrored by manifest
  content_scripts/host_permissions/web_accessible; pinned by `AdoHost.test.ts`), and
  `parseSupportedAdoUrl(raw)` (valid-URL + host guard preamble). `AdoQueryRoute` and `AdoContext` both
  call `parseSupportedAdoUrl` — do NOT re-write `new URL(...)+isSupportedAdoHost` inline.
- `requestFromTab` (`src/common/browser/requestFromTab.ts`) = THE best-effort tab sendMessage
  round-trip used by `ChromeAdoTabReader` (theme). NOTE:
  `ChromeAdoQueryTabsReader`/`IAdoQueryTabsReader` + the `ADO_QUERY_NAME_REQUEST` message plumbing +
  `AdoQueryTab` were REMOVED when the Query Bindings options mode stopped scanning open tabs (see next
  bullet). `detectAdoQueryName` (content probe) survives — it now feeds enableEnhancedView's
  `OPEN_BINDING_SETTINGS_MESSAGE` only.
- `BrowserSyncQueryBindingStore` owns ALL bindings-map read-modify-write (bind/unbind/replaceAll);
  callers forward intent, never RMW the map themselves. (`setActiveView` was REMOVED — view switching
  is now session-only in `content/active-view`, never persisted.) `replaceAll` = wholesale replace
  (`normalizeBindings` first, single set) used by config import — does NOT merge.
- `defaultEnhanced` in `QueryBindingController` derives from `DEFAULT_SETTINGS.defaultView` (not hardcoded).

## options.html `hidden` attribute gotcha

- Toggling `element.hidden` in the options controllers is INERT for any element that also has an
  author `display` rule (e.g. `.field { display: flex }`), because author styles beat the UA
  `[hidden]{display:none}`. Symptom: "Bound query" dropdown (#binding-query-picker-field, class
  `field`) stayed visible even though `QueryBindingsController` set `pickerField.hidden = true`. Same
  latent bug on #binding-query-name-field. This is ALSO why `.tabpanel[hidden]` exists.
- FIX: a global `[hidden] { display: none !important; }` reset near the top of options.html `<style>`
  (after `*{}`). Do NOT rely on plain `element.hidden` for `.field`/flex/grid elements without it.
- jsdom tests don't do layout/cascade, so `.hidden` property tests pass regardless — this bug is
  only visible in a real browser. Verify hide/show behavior in the loaded extension, not just Vitest.

## ADO project metadata came back EMPTY — MV3 content-script CORS (root cause + fix)

- SYMPTOM: options Azure DevOps tab showed org+project (parsed from tab URL, no fetch) but the
  Current team and work-item-type pickers were always empty. Old design proxied the fetch through
  the content script (`ADO_METADATA_REQUEST` round-trip).
- ROOT CAUSE (proven via CDP): in MV3 the content-script isolated world's origin is
  `chrome-extension://<id>`, so its cross-origin fetch to ADO is CORS-blocked -> "Failed to fetch"
  (ADO sends no Access-Control-Allow-Origin for the extension). The content script DID reply, but
  with empty metadata lists. Extension-PAGE fetch bypasses CORS via host_permissions BUT loses
  ADO's SameSite session cookies -> HTTP 500 "looping logins" (redirected:true). Neither works.
- FIX: fetch in the ADO tab's MAIN (page) world = first-party origin => same-origin AND carries the
  signed-in SameSite session. `ChromeAdoMetadataReader` now calls
  `chrome.scripting.executeScript({ target:{tabId}, world:"MAIN", func: fetchAdoRawInPage, args:[teamsUrl,workItemTypesUrl,fieldsUrl] })`.
  Requires "scripting" in manifest permissions (world:"MAIN" is Chrome 95+, min is 106 so fine).
  Verified live: MAIN-world fetch returns 200 + 100 teams; options picker renders all 100.
- `fetchAdoRawInPage` (`src/common/browser/fetchAdoRawInPage.ts`) is INJECTED via `Function.toString()`,
  so it MUST be self-contained: only its params + page globals (fetch/Promise), NO imports/module
  vars, and use Promise `.then()` (NOT async/await) so no esbuild transpile helper is hoisted out of
  the body. Build target chrome106 keeps it native, but keep `.then()` to be safe. Confirmed the
  bundled dist function is a standalone `function fetchAdoRawInPage(...)` with an inline `get` arrow.
- SPLIT to satisfy jscpd + keep the injected fn pure: `fetchAdoMetadata.ts` is now URL-build + parse
  only (`buildAdoMetadataUrls` -> metadata URLs or null when no project; `parseTeams`;
  `parseWorkItemTypes`; `adoCollectionBaseUrl`). Removed
  AdoFetch/AdoFetchResponse/fetchTeams/fetchAreaPaths/resolveAdoMetadata. `AdoMetadata.ts` lost the
  message contract (ADO_METADATA_REQUEST/AdoMetadataRequest/AdoMetadataResponse/isAdoMetadataRequest);
  kept AdoTeam/AdoMetadata/EMPTY_ADO_METADATA. `content/index.ts` metadata handler removed.
  `pickAdoQueryTab` `AdoQueryTabContext` gained `url` (reader needs href to build URLs).
- `requestFromTab` STAYS — still used by `ChromeAdoTabReader` (theme round-trip). Only the metadata
  reader stopped using it.
- COMBOBOX render gotcha when live-verifying: `AutocompleteInput` renders its `<li>` options ONLY on
  focus/input (setOptions alone doesn't render unless the list is already open). To count options via
  CDP you must `input.focus()` first, else `.combobox__list li` is 0 even when teams ARE loaded.

## jscpd gotcha

- `.jscpd` threshold is 0 and IGNORES `**/*.test.ts`, so PROD dedup is strict. A shared ~12-line
  "new URL(raw)+host-guard+split path" preamble across two files trips it — extract a helper
  (that's why `parseSupportedAdoUrl` exists). Test-file fakes may duplicate freely.
- Two IDENTICAL interface bodies (get/set/subscribe, ~52 tokens) ALSO trip it (minTokens 50).
  `IBrowserSyncStorage` + `IBrowserLocalStorage` now BOTH alias a shared base
  `IBrowserKeyValueStorage.ts` (`export type IBrowserSyncStorage = IBrowserKeyValueStorage`), so the
  body exists once. A class can still `implements` a type-alias-of-interface. Do NOT re-inline the
  method signatures into either alias.
- TWO MAIN-world injected fetchers CANNOT share a helper (each is serialized standalone via
  `Function.toString` → no imports/module-scope). `fetchAdoTreeInPage`'s paged `.value`-accumulate
  block tripped jscpd against `fetchAdoRawInPage`'s readPage. FIX = restructure one copy so tokens
  differ (if/for + renamed vars instead of ternary+`value`), NOT extract a shared function. But the
  pure URL-build boilerplate (parseAdoContext+new URL+adoCollectionBaseUrl+encode project) IS a normal
  module → extract it: `resolveAdoProjectContext(href)`→`{base,project}`|null in `fetchAdoMetadata.ts`,
  reused by `buildAdoMetadataUrls` AND `fetchAdoTree.buildAdoTreeUrls`.

## Project Tracking LIVE tree fetch (ADR-033) — content→background→MAIN-world bridge

- `loadTree` is NO LONGER a placeholder. Chain: `ProjectTrackingView` → `services.loadTree` →
  `MessagingWorkItemTreeLoader` (common/browser, browser-agnostic, injected SendTreeRequest) → sends
  `LOAD_QUERY_TREE_MESSAGE` {queryId, fields} (`AdoTreeRequest.ts` contract) → background onMessage
  handler builds URLs from `sender.tab.url` (TRUSTED, never content-supplied — closed op, not a
  fetch-any-URL proxy) via `buildAdoTreeUrls` → `chrome.scripting.executeScript` world:"MAIN"
  func:`fetchAdoTreeInPage` → returns raw {wiql,items} → loader `parseTrackedTree(raw, etaFieldByType)`.
- `fetchAdoTreeInPage` (common/browser): WIQL by id (`_apis/wit/wiql/{id}`) → collect ids from
  workItemRelations (target.id + non-null source.id) or flat workItems → page `_apis/wit/workitemsbatch`
  POST {ids,fields} 200/page (cap 10000 ids, 100 pages). Self-contained, `.then()` chaining, type-only
  `AdoRawTree` import (erased). Same rules as `fetchAdoRawInPage`.
- background onMessage for the tree msg MUST be a SEPARATE addListener returning `true` (async
  sendResponse); the existing open-options/binding listener returns undefined. `sender.tab?.id/url`
  undefined → sendResponse {raw:null}.
- `content/index.ts`: `sendTreeRequest` uses generic
  `chrome.runtime.sendMessage<LoadQueryTreeMessage, LoadQueryTreeResponse|undefined>(m)` to avoid
  no-unsafe-return; `etaFieldByType()` rebuilt per load from `latestSettings.workItemTypes`
  (name→etaField). empty userDirectory is still a follow-up.

## Project Tracking LIVE sprint window (team iterations) — same content→background→MAIN bridge

- `EnhancedViewServices.getSprints` (returned SprintRef[]) was REPLACED by
  `loadSprintWindow(): Promise<SprintWindow>`. SprintRef (common/ado/TrackedWorkItem) DELETED.
- Chain mirrors the tree loader: `ProjectTrackingView` → `services.loadSprintWindow` →
  `MessagingTeamIterationsLoader` (common/browser, injected send) → `LOAD_TEAM_ITERATIONS_MESSAGE`
  {team} (`AdoIterationsRequest.ts`) → SEPARATE background onMessage addListener →
  `buildAdoIterationsUrl` (common/ado/TeamIteration, from TRUSTED sender.tab.url + team) →
  executeScript world:MAIN `fetchAdoIterationsInPage` (single credentialed GET, unpaged — the endpoint
  returns the full bounded list; self-contained `.then()`) → `parseTeamIterations` → `buildSprintWindow`.
- `buildSprintWindow(iterations, {pastCount,futureCount})` (common/ado/sprintWindow, PURE/DOM-free,
  REUSABLE by any sprint-filtering view): anchors on `timeFrame==="current"` (else first "future", else
  last), slices [anchor-pastCount .. anchor+futureCount], labels by offset (0 Current, 1 Next,
  -1 Previous, >1 "{n} sprints ahead", <-1 "{n} sprints ago"). Returns
  {entries:SprintWindowEntry[] {path,name,label,relation}, currentName}, where relation is
  past/current/future (offset sign) purely so the picker can style the option.
- `SprintPicker` keeps option.value=name (raw) and callbacks return raw name — only added optional
  `SprintOption.label` for DISPLAY text (and `SprintOption.relation` for option COLOR/WEIGHT: past
  amber #c26c1d, future `var(--communication-foreground)`, current bold and neutral; also mirrored
  to the option's `data-relation`). The collapsed select mirrors the selected relation; current has
  an explicit neutral color so a selected past/future color cannot leak into it when the native list
  opens. Filtering by sprintName remains independent of presentation. Option styles are written via
  `style.cssText` because jsdom's CSSOM drops `var(...)` assigned through typed style properties.
- `content/index.ts` `loadSprintWindow` reads `latestSettings.currentTeam` (a TeamRef {id,name}, NOT a
  string) → uses `team.id` (GUID-safe) for the URL; blank/no team → {entries:[],currentName:null}.
  bounds from past/futureSprintsCount ?? DEFAULT_SETTINGS.
- `ProjectTrackingView.render` now `Promise.all([loadTree, loadSprintWindow])` — existing 2-await test
  flush pattern still works. `collectSprintsFromTree` REMOVED.
- SPRINT PILL (per-row, shown when filter OFF) = LEAF sprints ONLY. An item on the iteration ROOT
  (single top-level node, e.g. just the project/team name — iterationPath has NO backslash) is NOT a
  real sprint, so it shows NO pill. `isLeafSprint(item)` = `sprintName!=null && iterationPath!=null &&
iterationPath.includes("\\")`. sprintName = leaf of iterationPath (`sprintLeaf` in fetchAdoTree.ts).
  NOTE for tests: the epic ROOT is rendered in the HEADER, not as a row — rows are its DESCENDANTS —
  so to test root-iteration pill suppression, park a CHILD (e.g. `epic.children[1]`) on "Project", not
  the epic. Filtering (matchesSprintFilter) still uses raw sprintName; only the badge got the leaf gate.
- Two latent bugs in the pre-existing `fetchAdoTree.ts` (its own tests caught them): (1)
  `parseTrackedTree` checked queryType!=="tree" BEFORE the null check, so wiql:null returned
  error:null — must null-check FIRST (null/non-object → load error) then queryType (flat → error:null).
  (2) `htmlToText` stripped tags THEN decoded, so entity-encoded markup (&lt;p&gt;) survived — must
  DECODE entities first, THEN strip. **`htmlToText` is GONE (ADR-044):** `description` is now handed
  on exactly as ADO stored it, because stripping the tags destroyed embedded screenshots and
  `@`-mentions before `MarkdownText` could render them. Rendering + sanitizing is the control's job.
- `expect.arrayContaining(TRACKING_FIELDS)` fails TS (readonly[] not assignable) → spread
  `[...TRACKING_FIELDS]`.

## `@`-mentions rendered as an anonymous "@mention" (ADR-046)

- ROOT CAUSE (first pass): `MarkdownText` had accepted `mentionNames` since ADR-044, but **no
  production caller ever passed it**. Grep for a rendering option before assuming it is wired — an
  optional option with zero callers is a feature that does not exist.
- ROOT CAUSE (second pass — _some_ mentions anonymous while others resolved): the directory's dedupe
  set claimed ids BEFORE the round-trip and returned early for a caller whose ids were all claimed.
  So the board's description read and a notes panel's read overlapping meant the **second** caller
  got `knownNames()` before the answer landed, rendered the placeholder, and the id was then marked
  asked forever. **An in-flight read must be SHARED (awaited), never skipped.** Symptom is
  order-dependent and looks random — the same person resolves in one place and not another.
- A failed read used to settle every id in it as "has no name" permanently. An id ADO cannot resolve
  comes back as an EMPTY match, not an error, so it is indistinguishable from a failed request
  without an explicit `complete` flag on the response. Only settle a miss when the read completed.
- Notes LOOKED fine because ADO's `renderedText` carries names; descriptions never do, and a note ADO
  returned no `renderedText` for falls back to the raw source. A note the extension **just wrote** is
  handed back with NO rendering at all, so `submitNote` has to re-resolve before repainting.
- Mentions arrive in TWO encodings and a board carries both: Markdown `@<guid>` tokens and ADO
  rich-text `<a data-vss-mention="version:2.0,<guid>">` anchors. Collecting only one leaves half the
  board anonymous. Accept EITHER quote style on the attribute — it is re-serialized by whichever
  editor last touched the item.
- Bulk endpoint = `{identityBase}/_apis/identities?identityIds=<comma-separated>&queryMembership=None&api-version=7.1`.
  It is NOT paged — it returns exactly the identities it resolved and silently omits the rest, so
  "are we paging?" is the wrong question; "did we notice the shortfall?" is the right one.
  `queryMembership=None` matters: the default expands every group each person belongs to.
  `identityBase` is **`https://vssps.dev.azure.com/{org}`** (or `{org}.vssps.visualstudio.com`) — NOT
  the collection base every other read here uses. Sending it to `dev.azure.com/{org}/_apis/identities`
  answers 404.
- `MAX_MENTION_IDS` silently DROPPED ids above the ceiling; the worker now logs that truncation and
  reports the read as incomplete so the remainder are retried rather than blacklisted.
- This is the extension's ONLY cross-origin ADO read, so `failure: "network"` here can mean CORS, not
  just a dead network. If mentions are anonymous, look for that line in Diagnostics first.
- DIAGNOSING ONE ANONYMOUS MENTION: Diagnostics now logs `Mention resolution named N of M identity
id(s); … (guid, guid)` with the unresolved ids. If the id IS listed as "did not recognize", ADO's
  IMS genuinely has no identity for that storage key — a different problem from ours.
- Name preference is `customDisplayName` → `providerDisplayName` → `properties.Account.$value`; the
  custom name is what ADO's own mention chips show.
- `MENTION_TOKEN_PATTERN` is exported as a pattern **source**, not a `RegExp`: a shared global regex
  carries a mutable `lastIndex`, so two callers using one instance interfere. (`String.replace` resets
  it, `matchAll`/`exec` do not.)
- TEST TIMING: the notes panel gained one more `await` in its load chain (the mention resolve), so
  the long-standing "2 × `await Promise.resolve()`" flush for a panel open is now THREE. The board
  did NOT gain one — the resolve deliberately runs after the first paint — which is why only one
  existing test needed a new tick.

## "no response from background" is THREE different faults (ADR-045)

- `chrome.runtime.sendMessage` resolves **`undefined`** when NO listener returned `true`. That single
  symptom covers: (a) the message was malformed, so every listener's `if (!isXMessage(m)) return`
  skipped it; (b) the worker is running OLDER code than the page (extension reloaded/updated while
  the ADO tab stayed open); (c) the worker failed to start. A rejected `sendMessage` (port closed,
  context invalidated) is a DIFFERENT path — it throws, so it lands in the caller's `catch`.
- Do NOT filter a listener on the strict type guard. Claim on `type` first (`claimsMessageType`),
  validate second, and `sendResponse` the offending field. Guard-filtering makes case (a) silent and
  indistinguishable from (b)/(c).
- A worker handler that logs nothing on success makes "never arrived" and "arrived and worked" the
  same silence. Log on ARRIVAL and again with the OUTCOME for anything a user waits on.
- To tell whether the worker even has the code: `pnpm build`, then grep the bundle for the message
  constant and count `onMessage.addListener` occurrences —
  `Select-String dist/background/service-worker.js -Pattern 'awesomeado:load-work-item-notes'`.
  Present in the bundle but silent at runtime ⇒ the browser is running a stale worker; reload the
  extension AND the ADO tab.

## AssignedTo picker — empty dropdown, popup that would not close, missing write (ADR-038)

- THREE independent bugs looked like one: (1) the control hand-rolled its own open/close instead of
  `createPopupHost`, so ONLY a second trigger click dismissed it (no outside-click, no Escape unless
  focus was in the input, no viewport clamp); (2) the results list was populated ONLY from the
  `input` handler, and `content/index.ts` wired a stub `userDirectory` returning `[]` — so it was
  always empty; (3) `onChange` went to `crewSync.onAssigneeChange` ONLY, which appends to the Feature
  Crew roster — the work item's `System.AssignedTo` was NEVER written.
- FIX = `createPopupHost` + `suggestions: () => DirectoryUser[]` rendered on OPEN (Project Tracking
  passes `collectAssignedDirectoryUsers([root])`, walking the LIVE tree so no cache can drift) +
  `MessagingUserDirectory` for real search + an ordinary `FieldWriteQueue` write of
  `ASSIGNED_TO_FIELD` with `identityFieldValue(picked)` (unique name; ADO resolves identities from
  it, display name only as fallback).
- `renderAssignedTo` now returns `AssignedToHandle extends HTMLElement { setUser }` and NO LONGER
  repaints its own label on pick (persist-then-reflect, matching StatusBadge/EtaBadge). Tests that
  asserted "label updates after selecting" had to flip.
- Identity search endpoint = `{collectionBase}/_apis/IdentityPicker/Identities` POST, pinned to
  `5.0-preview.1` (NOT `ADO_API_VERSION` — the endpoint never left preview; asking for 7.1 errors).
  Body `{query, identityTypes:["user"], operationScopes:["ims","source"], properties, options}`;
  response `results[].identities[]` → `signInAddress ?? mail` for uniqueName, dedupe across scopes
  (the same person comes back once per scope), drop `active:false`. Header
  `X-TFS-FedAuthRedirect: Suppress` is REQUIRED or an expired session answers 200 + an HTML login
  page, which parses as "no people found".
- `MIN_IDENTITY_SEARCH_LENGTH` (2) is enforced in THREE places on purpose: the control (filters
  suggestions only), `MessagingUserDirectory` (no round-trip), and
  `buildAdoIdentitySearchRequest` (returns null). Tests typing a single character will see NO search.
- jsdom gotcha: `popupHost` dismisses from DOCUMENT-level capture listeners, so a dismissal test must
  `document.body.append(control)` first — an event dispatched on a DETACHED node never reaches them.
- The post-pick Feature Crew reconcile now runs even when the person was ALREADY on the roster: the
  reconcile is what returns their tag, so skipping it left the chip on the neutral "??" pill. It
  writes nothing when nothing changed.
- `ChildItemsBadge` lost `userDirectory` / `ChildItemDescriptor.assignedTo` / `onAssigneeChange`;
  the row now takes a prebuilt `assignee: HTMLElement`, exactly like the existing `eta` slot.

## AssignedTo picker — dropdown ergonomics (focus, tags, keyboard)

- `searchInput.focus()` inside `buildPopup` was a NO-OP: `popupHost` appends the popup only AFTER
  `buildPopup` returns, and a DETACHED element cannot take focus. Fix = `PopupHostOptions.onOpened`
  (fires after mount AND after `keepPopupInView`, so focus never fights the repositioning). Any
  future control that wants focus in its popup must use `onOpened`, never `buildPopup`.
- The picker rows tag off the OFFERED PEOPLE (`suggestions()[].tag !== undefined`), NOT the chip's
  `showTag`: two chips deliberately pass `showTag: false` (Tech Lead, rolled-up children list) but
  still want a tag-bearing picker. `collectAssignedDirectoryUsers` therefore returns `TrackedUser[]`
  (tag included, `null` when untagged) instead of `DirectoryUser[]`.
- Keyboard nav keeps the highlight as an INDEX and leaves DOM focus in the search box — focusing a
  row would swallow the next keystroke and stop the query from being refined. Arrow keys wrap; the
  list re-highlights row 0 on every repaint (so Enter takes the top match and a stale index from the
  previous query can never commit the wrong person); `mouseenter` moves the same index so the mouse
  and keyboard cannot disagree. `preventDefault` on the arrows (caret jump) and on Enter (ADO's own
  surrounding form).
- jsdom does NOT implement `Element.scrollIntoView`; call it as `row?.scrollIntoView?.(…)` or the
  keyboard tests throw.
- The row highlight must use the dedicated `--control-background-hover` role rather than a generic
  surface neutral. Every concrete theme owns that contrast; the control owns no fallback color.

## Identity search found nobody outside the Feature Crew

- ROOT CAUSE: `parseAdoIdentities` dropped every identity the endpoint flagged `active:false`.
  `active` means "already a member of THIS organization", so every hit that came from the backing
  directory (`source` scope) — precisely the people the search exists to find, and the ones ADO's own
  picker offers — was thrown away. The filter is gone and `Active` is no longer even requested; an
  identity ADO will not accept is rejected at WRITE time, where the board's save indicator reports it.
- The request body is now kept to the shape of a known-good client (`.tools/ADO/Common/AdoClient.psm1`,
  `Search-AdoIdentities`): `query`, `identityTypes:["user"]`, `operationScopes:["ims","source"]`,
  `properties`, `options:{MinResults:1,MaxResults:n}`. Do NOT re-add speculative fields
  (`queryTypeHint`, `filterBy*`, a larger `MinResults`) — that client proves they are unnecessary,
  and this preview endpoint rejects what it does not expect.
- `fetchAdoIdentitiesInPage` used to collapse EVERY failure to `null`, so a rejected request, an
  expired session and a real "nobody matched" were the same thing to the picker ("No people found.")
  and to the log. It now returns `AdoIdentitySearchOutcome { status, body, failure }` and the worker
  logs `Identity search failed (<failure>, HTTP <status>)`. NEVER log ADO's error text here — it
  quotes the query, which is a person's name (AGENTS.md §9). Diagnostics is the FIRST place to look
  when the picker finds nobody.
- `parseAdoIdentities` reads the identity groups from `results`, `value`, or a bare array, so an
  envelope difference degrades to the same parse instead of to an empty directory.
- A network round-trip needs a MOVING signal: one line of small text is missed, so the picker's
  status row carries a CSS-animated spinner (keyframes in a `<style>` inside the popup, so it lives
  and dies with the popup and would still work inside a shadow root). The status row is muted with
  `color:inherit` + `opacity`, never a secondary-color token.

## Options Work item types table — UI refinements (AutocompleteInput + WorkItemTypesController)

- `AutocompleteInput.enableFloating()`: switches the suggestion list to position:fixed computed from
  `input.getBoundingClientRect()` so it ESCAPES the `.wit-table-wrap` overflow clip (overflow-x:auto
  computes overflow-y to auto → clipped otherwise). Flips ABOVE the input when
  spaceBelow<listHeight && top>spaceBelow. Tracks input via capturing document 'scroll' (non-bubbling,
  capture catches descendant scroll boxes) + window 'resize'; listeners attach in openList()/detach in
  close()+dispose(). Fixed escapes overflow only because no ancestor has transform/filter/will-change
  (verify before reusing). WIT type + state comboboxes call enableFloating(); area-path/team ones stay
  absolute.
- `AutocompleteInput.reopen()`: re-opens the list for the current value ONLY if input is still the
  activeElement. `commitState()` calls it after placing a chip because a pick keeps focus, so no fresh
  'focus' event fires to reveal the remaining pool ("dropdown doesn't reappear after adding a state").
- Type picker = new-row only: `applyType()` shows a read-only colored `.wit-type__label` and hides
  `combobox.root` (`typeComboboxRoot(row)`); `clearRowType()` reverses it. The type `<input>` STAYS in
  the DOM (hidden), so `typeInput()`/`setAvailableTypes()`/`commitType()` still work by querySelector.
  A chosen type is not re-editable — remove the row to change it.
- Row delete is now the compact "×" (`.wit-row__delete` restyled like `.wit-col__delete`), not a big
  "Remove" danger button.
- `.app` is fluid now: `padding: 24px 5vw 40px` (no max-width) so side margins scale with window width.
- WIT ROW ORDER IS MEANINGFUL = parent→child, top-most parent first (Epic→Feature→Story→Task).
  `workItemTypes` ARRAY ORDER is the hierarchy; `normalizeWorkItemTypes`/`collect()`/`render()` all
  preserve it, so save+export+import keep order (arrays iterate in order). Each type row has a grip drag
  handle (data-role="type-drag", span.wit-row__drag, draggable=true, first child of
  .wit-row__type-inner). `handleDragStart` branches: `closest(ROW_DRAG_SELECTOR)`→startRowDrag (tracks
  this.draggingRow, sets setDragImage(row)); else chip drag (this.draggingChip).
  `handleDragOver`/`Drop` check draggingRow FIRST (dropRow: before/after target by index, then
  renderEtaSection()+persistTypes()), else chip logic. `endDrag` clears BOTH. `dropRow` MUST call
  `renderEtaSection()` so the read-only ETA list re-renders in the new table order (ETA list mirrors
  committedRows() = DOM order). Tests dispatch plain Event (no dataTransfer) so the
  transfer/setDragImage branch is skipped — guard setDragImage with typeof check.
- DROP INDICATOR: `handleDragOver` (row branch) calls `showDropIndicator(target)` which adds
  wit-row--drop-before (dragging up) or wit-row--drop-after (dragging down) to the hovered row, tracked
  in this.dropIndicatorRow; `clearDropIndicator()` removes both classes; `endDrag()` clears it too. Same
  before/after index logic as dropRow so preview matches landing. CSS draws the line on `> td`
  (box-shadow inset ±2px var(--accent)) — a border on `<tr>` is unreliable. Hovering the dragged row
  itself shows no line.

## popupHost — a popup opened inside a SHORT scroll box was clipped away (ETA picker in the rollup)

- SYMPTOM: clicking the ETA in the ChildItemsBadge ("done / total") popup showed no date picker at
  all — just stray scrollbar arrows at the popup's right edge. ROOT CAUSE: that popup is
  `max-height:320px; overflow-y:auto`, and with one child it is ONE ROW TALL. The ETA picker anchors
  at `top:100%` (below the row) = outside the scroll box's content box → clipped to nothing.
  `keepPopupInView`'s shift/flip could not help: no amount of nudging fits a 34px popup into a 34px
  box, and `bottom:100%` would still be inside the same clip.
- FIX (shared, in `popupHost.keepPopupInView`): if the popup does NOT fit inside `visibleBounds`
  (window narrowed by clipping ancestors) but DOES fit inside `windowBounds`, `anchorToViewport()`
  switches it to `position:fixed` at the trigger's `getBoundingClientRect()` (left, bottom+4) and the
  shift/flip then runs against the window. Every popupHost control gets this for free.
- The escaped box is DERIVED from the trigger rect, never re-measured — the browser has not re-laid
  out yet, and jsdom performs no layout at all (tests stub `getBoundingClientRect` on trigger+popup).
- FLIP differs per mode: absolute → `top:auto; bottom:100%`; fixed → `top = triggerTop - height - 4`
  in px (`bottom:100%` on a fixed popup resolves against the VIEWPORT, not the trigger).
- Guards that must stay: escape only when the WINDOW has room (else a too-big popup just moves
  somewhere equally unusable — protects the existing "never shifts past the left edge" behaviour);
  and a fixed popup no longer travels with its trigger, so `open()` arms a capture-phase document
  `scroll` listener (scroll does NOT bubble) that closes it, ignoring scrolls inside the popup itself.
- Fixed escapes overflow ONLY because no ancestor has transform/filter/will-change/contain (same
  caveat as `AutocompleteInput.enableFloating`). Verify before adding any such style to the overlay.

## A WRAPPING popup must set `width:max-content` — shrink-to-fit resolves against its ~30px anchor

- SYMPTOM: the ChildItemsBadge rollup popup rendered ~240px wide with every title broken ONE
  CHARACTER PER LINE, no matter how large `max-width` was set.
- ROOT CAUSE: every popupHost control anchors its popup `position:absolute; top:100%; left:0` inside
  a `position:relative` root that is only as wide as its trigger (here the "2 / 3" chip, ~30px). For
  an absolutely positioned box with `width:auto`, shrink-to-fit is
  `min(max(min-content, available), max-content)` where **available = containing block width − left**
  — i.e. ~30px. So the popup collapsed onto its `min-width` floor, the title column got the few
  pixels left after the checkbox/assignee/ETA, and `overflow-wrap:anywhere` made min-content a single
  character. `max-width` is a CAP and can never restore width shrink-to-fit already gave away.
- FIX: `width:max-content` on the popup, with `min-width` as the floor and `max-width` (viewport
  based) as the cap. Width then comes from the rows, and only the viewport forces a wrap.
- WHY ONLY THIS CONTROL: StatusBadge / OrderingPicker / AssignedTo / SprintPicker / EtaBadge popups
  use `white-space:nowrap` rows, so their min-content IS the full row width and shrink-to-fit lands
  on it by accident. Any NEW popup whose content wraps hits this — set `width:max-content`.
- It also masked itself: when the popup does not fit its clipping ancestor, `keepPopupInView`
  switches it to `position:fixed`, whose containing block is the viewport — so the same markup could
  look correct in one place and collapse in another purely from where it opened.

## Follow-ADO erased the rollup checkbox's BOX (third instance of the same token trap)

- SYMPTOM: in the ChildItemsBadge popup the completion checkbox showed only a floating tick under
  "Follow ADO" — no frame, no inset around the check — while Light/Dark/Blue drew the box correctly.
- ROOT CAUSE: the box used `var(--palette-neutral-20, …)` / `var(--palette-neutral-8, …)`. A PINNED
  theme sets those to its own translucent neutrals, but under Follow ADO they fall through to ADO's
  values, which are the surface colors this popup is already painted with — frame and fill vanish
  into the background.
- FIX: dedicated `--control-border-emphasis` and `--control-background-muted` roles preserve the
  tuned contrast while moving the values into each concrete theme.
- RULE OF THUMB: a neutral token is fine for a wash ON a surface, but NEVER for something that must
  be DISTINGUISHABLE FROM that surface (borders of a chip on a popup, a row highlight, a checkbox
  frame). Prior instances: the AssignedTo row highlight, and the EtaBadge popup borders.
- FOURTH instance (`ItemContextMenu`, the item right-click menu): its hover wash was copied from a
  generic surface neutral. It now uses `--control-background-hover` plus
  `--control-border-strong`; new controls should reuse those roles for the same contrast need.
- Geometry note for that checkbox: the tick is two borders of a rotated box, so rotation costs a
  factor of √2 — its bounding box is `(arm + stroke + stem + stroke) / √2`. Keep that under the box's
  INNER size (edge − 2 × border) or the check touches the frame. It self-centers with
  `left:50%; top:46%; transform:translate(-50%,-50%) rotate(45deg)`, so box and tick can be resized
  independently; the 46% is optical centering (a check reads low when geometrically centered).

## Memory bank / changelog state (deep-review)

- Memory bank was FLATTENED (no wave/history narrative) — treat current state as the repo baseline.
  `decisions.md` ADR-017..020 cover observeStorageKeys, AdoHost single-source, store-owns-RMW, and the
  host-wide-injection+route-gated performance posture. `systemPatterns.md` references ADR-020.
  ADR-021..023 now cover source-aware logging, decisions-log-their-signals, and the Diagnostics
  source filter + View Log deep link. ADR-025 records the component→source rename + dropdown filter.
- ChangeLog: shipped work consolidated under `## 0.1` (unpublished); `## Next Version` accumulates
  the current unreleased bullets.

## Environment quirk — spurious terminal exit code (DO NOT chase it)

- `pnpm`/`cmd` invocations in this developer's PowerShell print a spurious "The system cannot find the
  path specified." line and the run tool reports a trailing "Command exited with code 1" EVEN WHEN the
  command fully succeeded. Root cause is a cmd AutoRun pointing at a missing path (fires for every
  cmd/.CMD shim like `pnpm.cmd`); it does NOT reflect the tool's real result. This is a machine-local
  quirk, recorded here so agents on this developer's machines don't waste time chasing it.
- JUDGE SUCCESS BY THE STAGE OUTPUT, not the trailing exit code. `pnpm verify` chains stages with
  `&&` (format:check → lint → typecheck → duplication → test:scripts → test:coverage →
  validate:workflows), so if the LAST stage printed "validate-workflows: all workflow checks passed"
  then every prior stage passed. Do not re-run verify to hunt a phantom failure.
- Invoke as `pnpm.cmd` (bare `pnpm` may fail to resolve in that shell). lint has pre-existing WARNINGS
  (complexity/max-lines-per-function on big test describe arrows + scripts) — 0 errors = pass; do
  NOT "fix" those warnings.

## Source-aware logging (src/common/logging)

- `LogEntry.source` is an OPTIONAL `string` = the emitting CLASS NAME by convention (free-form, NOT a
  closed union). `formatLogEntry` emits `[ISO] LEVEL [source] message` (source omitted when absent).
  `normalizeLogEntry` reads the LEGACY `component` key into `source` (`pickSource` helper) so
  pre-rename buffered entries keep their origin after upgrade.
- NO LogComponent union anymore (`LogComponent.ts` DELETED). `ILoggerFactory.forSource(source: string)`
  → Logger that stamps source on each entry and prefixes console.error `AwesomeADO [source]:`.
  Composition roots build via `createLoggerFactory()` / `createLogging()` (createLogging also returns
  logStore for the options Diagnostics view) and pass a class-name LITERAL per collaborator (never
  `this.constructor.name` — minification-safe). Source names decided: background/content/options for
  wiring contexts; QueryPageController, QueryBindingController, BrowserSyncSettingsStore,
  BrowserSyncQueryBindingStore, StatusReporter for classes. LoggerFactory is NOT a composition root →
  needs coverage.
- Shared stores take logger as an OPTIONAL ctor arg (absent = no-op, no behavior change):
  BrowserSyncSettingsStore, BrowserSyncQueryBindingStore. They log SAVES BY NAME ONLY, never values
  (keeps org/team identity out of an exportable log).
- Decision sites log only on a FLIP (dedup by remembering last conclusion) with signals + reason:
  QueryPageController (enhance vs leave-on-ADO, reason=not-a-query-route|ado-not-configured|
  query-not-bound|bound-view-active|bound-standard-active), QueryBindingController (config
  completeness, button/menu show/hide/open).
- Diagnostics source filter = a SEARCHABLE MULTI-SELECT DROPDOWN (`src/options/MultiSelectFilter.ts`, a
  GENERIC options-page widget with no logging knowledge — reusable). Hidden until ≥1 source exists.
  `DiagnosticsController` derives distinct source keys DYNAMICALLY from entries (unlabeled →
  `(unlabeled)`), feeds them to `sourceFilter.setItems` (rebuilds list only when the set changes),
  tracks hidden sources in a Set keyed by source (survives re-render), AND-combines with errors-only.
  Dropdown: type-to-filter search + Select all/Clear all; closes on outside pointerdown or Escape;
  `dispose()` removes listeners. Row source cell uses `.log-row__source`.
- "View Log" menu footer (separator + item) appended to EVERY BindingMenu variant → sends
  {type:OPEN_OPTIONS_MESSAGE, section:"diagnostics"}. `optionsPath(section)` appends
  `?section=diagnostics`; options/index reads `readOptionsSectionFromSearch` → `tabs.activate(
sectionTabId(section))`. Section contract is a typed OptionsSection (isOptionsSection) in
  `BindingRequest.ts` shared by sender + reader.

## Views architecture (src/content/views + src/common/view-common) + enhanced surface

- LAYOUT (moved from src/common/views, ADR-027): concrete views live under `src/content/views/<view>/`
  (they ARE content — they replace the ADO page). PURE CONTRACTS live in `src/common/view-common/`.
  One folder per view holds BOTH halves (config + renderer) together for readability.
- CONTRACTS in `src/common/view-common/` (Dependency Inversion, NOT a §6 break):
  - `ViewType.ts` = config contract (ViewType/ViewTypeProperty/ViewTypeOption/ViewTypePropertyKind +
    viewTypePropertyKind() + resolveViewTypePropertyValue()).
  - `EnhancedView.ts` = renderer contract { id, render(context) }; EnhancedViewContext = { doc,
    queryId, properties }. Renderer returns a FRESH element each call (caller owns lifecycle).
- CONCRETE views in `src/content/views/`:
  - `viewCatalog.ts` (VIEW_TYPES=[sprintViewType, projectTrackingViewType] + getViewType(id)) = the
    CONFIG catalog. `enhancedViewRegistry.ts` (ENHANCED_VIEWS + getEnhancedView(id)) = the RENDERER
    registry. Each view folder `<view>/` has `<view>ViewType.ts` (config) + `<view>View.ts` (renderer).
    Current views: sprint, project-tracking. Keep VIEW_TYPES and ENHANCED_VIEWS in the SAME order.
- THE §6 EXCEPTION (scoped, lint-enforced): options builds the binding form from view CONFIG, so
  `src/options/query-bindings/QueryBindingsController.ts` imports VIEW_TYPES from
  `content/views/viewCatalog`. This is the ONLY allowed options→content import. Enforced by
  `import-x/no-restricted-paths` in eslint.config.js: zone target ./src/options, from ./src/content,
  except ["./views/viewCatalog.ts"]. Recorded as ADR-027.
- GUARDRAIL (why the exception is safe): a `<view>ViewType.ts` must NEVER import its `<view>View.ts`, so
  viewCatalog pulls ZERO renderer DOM into the options bundle (tree-shaking keeps options clean).
  The renderer (enhancedViewRegistry + *View.ts) is imported ONLY by content.
- Shared per-view building blocks live in `src/common/view-common/control/**` (ViewScaffold = placeholder
  title+message shell, self-contained inline styles, textContent so XSS-safe). Future cross-view
  components (context menu, sprint selector, queued writes back to ADO) go here too.
- FULL-WINDOW COVERAGE is solved ONCE in `EnhancedViewSurface` (NOT per view): the host div is a FIXED
  overlay (position:fixed;top/left/right/bottom:0;z-index:2147483646;overflow:auto;background:
  var(--background-color,#fff)) kept ALIGNED to ADO's own content region so the breadcrumb bar AND the
  left navigation rail both stay visible. top/left are re-synced LIVE from
  `[role=main].getBoundingClientRect()` (syncOverlayToContent, change-detected via
  overlayTop/overlayLeft so it only writes on a real move). The left rail is COLLAPSIBLE so its width
  changes at runtime — the overlay MUST follow it (that was the bug: measure-once left the widened rail
  peeking under the view). Hide rule is visibility:hidden (NOT display:none) so [role=main] keeps its
  box and stays measurable. Live tracking = ResizeObserver on [role=main] (guarded: typeof
  ResizeObserver!=="undefined" — jsdom lacks it) set up in trackContentRegion (re-observes only when
  ADO swaps the main instance); the keep-alive MutationObserver ALSO calls trackContentRegion each
  mutation (drives the sync in jsdom + catches moves w/o size change). Fallback top/left 0 (full
  window) until measurable; reset on restore(). Shared ViewScaffold root uses
  min-height:100%+box-sizing:border-box so placeholder text centers in the WHOLE window (was 60vh,
  which under-filled). Do NOT re-solve page coverage inside individual views — the overlay gives every
  view the full window below the bar.
- `PageBlanker` was REPLACED by `src/content/query-page/EnhancedViewSurface` (PageBlanker.ts +
  .test.ts DELETED). `apply(request|null)`: request={viewId,queryId,properties}; resolves via
  `getEnhancedView`; null OR unknown viewId → restore ADO; else mount hidden [role=main] + fixed host
  overlay (id awesomeado-enhanced-view) + render the view. Skips re-render on unchanged signature
  (viewId\0queryId\0JSON.stringify(props)). MutationObserver keep-alive re-attaches if ADO drops the
  host (mirrors BindingButton.keepPlaced). `QueryPageController` now takes EnhancedViewSurface (not
  PageBlanker), decide() returns {request,reason}; flip-dedup logs enhanced:<viewId> vs left-on-ado.
- GOTCHA (log-count tests): on a query route the FIRST refresh after settings arrive ALWAYS logs a
  conclusion (enhanced or left-on-ado). If a test applies settings before bindings it logs
  left-on-ado FIRST then enhanced:<view> = 2 calls. Order applyBindings BEFORE applySettings so the
  first refresh concludes enhanced:<view> directly (1 call).
- Adding a view: folder + `<view>ViewType.ts` + `<view>View.ts` (renderViewScaffold hello-world) + one
  line in viewCatalog.ts + one in enhancedViewRegistry.ts + README. Documented in the
  add-enhanced-view skill (`.agents/skills/add-enhanced-view/SKILL.md`, listed in AGENTS.md §13).

## Settings import/export (AwesomeADO.config)

- `src/common/settings-transfer/AwesomeAdoConfig.ts` (PURE, no DOM/chrome): `exportConfig(settings,
bindings)`→indented JSON {awesomeAdoConfigVersion,settings,enhancedQueries}; `importConfig(text)`→
  {settings,enhancedQueries} (JSON.parse then require a marker: numeric awesomeAdoConfigVersion OR
  a settings/enhancedQueries key, else throw — stops an unrelated JSON from wiping config to
  defaults; then normalizeSettings/normalizeBindings). CONFIG_FILE_NAME="AwesomeADO.config".
- `src/options/settings-transfer/SettingsTransferController`: Export/Import buttons + hidden file
  input + status line on the APPEARANCE tab (options.html card after Default view). Reads BOTH
  settingsStore + bindingStore; import writes settings via store.write(full) + bindings via
  bindingStore.replaceAll (wholesale). Download/read use AMBIENT browser APIs (Blob/URL/anchor,
  file.text()) inline like DiagnosticsController — NOT injected; test via mocking URL.createObjectURL
  - spyOn(HTMLAnchorElement.prototype,'click') + a real File. Only chrome.* is injected (via stores).
    Wired in options/index.ts (composition root). Reviewer expectation: ambient DOM/URL/Blob inside a
    controller is fine; only chrome.* must be injected.

## Options tab REUSE + in-place section reveal (View Log always lands on Diagnostics)

- PROBLEM: chrome.tabs.create NEVER dedupes, so Options-then-View-Log stacked duplicate options
  tabs, and a duplicate could open on the default Appearance tab — making "View Log shows
  Diagnostics" unreliable when options was already open. (The URL deep-link itself was proven
  correct end-to-end via CDP; the failure mode is the SECOND tab, not the wiring.)
- FIX (background/index.ts, composition root, excluded from coverage): track the last options tab id
  in an in-memory `lastOpenedOptionsTabId`. reuseOrOpenOptionsTab: if set, focusExistingOptionsTab
  (chrome.tabs.update{active:true} + chrome.windows.update{focused:true}) and, when a section is
  requested, chrome.tabs.sendMessage(tabId, {type:REVEAL_OPTIONS_SECTION_MESSAGE, section}); on any
  throw (tab closed) clear the id and fall back to chrome.tabs.create (store tab.id).
- options/index.ts registers chrome.runtime.onMessage → isRevealOptionsSectionMessage →
  tabs.activate(sectionTabId(section)) so the OPEN tab switches section IN PLACE (no reload, keeps
  in-progress edits). Load-time (?section=) and live-reveal BOTH resolve the tab element id through
  ONE shared sectionTabId(section) map in BindingRequest.ts (SECTION_TAB_IDS) — keep them in sync.
- NO "tabs" permission needed: we track the id in memory rather than chrome.tabs.query({url}).
  chrome.tabs.get/update/create + chrome.windows.update work without "tabs". The id is forgotten on
  SW recycle (harmless: one-time fallback to a fresh tab). Contract added to BindingRequest.ts:
  REVEAL_OPTIONS_SECTION_MESSAGE, RevealOptionsSectionMessage, isRevealOptionsSectionMessage,
  sectionTabId — covered by BindingRequest.test.ts.
- VERIFIED live (CDP probe5): send OPEN_OPTIONS (no section) → 1 options tab (Appearance); then send
  OPEN_OPTIONS section=diagnostics → STILL 1 tab (reused, url unchanged options.html) now on
  aria-selected tab-diagnostics. No duplicate.
- If the USER still sees View Log on Appearance after a build: they are running a STALE unpacked
  extension — reload it in edge://extensions / chrome://extensions after `pnpm build`.
- SAME reuse-tab gap existed for "Enable Enhanced View" (OPEN_BINDING_SETTINGS_MESSAGE): reusing the
  open options tab only focused it (URL unchanged, no re-read) so the bind form never populated. FIX
  mirrors the section-reveal: BindingRequest.ts adds REVEAL_BINDING_SETTINGS_MESSAGE {queryId,
  queryName?} + isRevealBindingSettingsMessage (shares hasBindingQueryFields with the open guard to
  dodge jscpd). background/index.ts now passes a RevealMessage (RevealOptionsSectionMessage |
  RevealBindingSettingsMessage) to focusExistingOptionsTab and sends it on reuse; the section reveal
  object MUST be typed `const reveal: RevealMessage | undefined` or its `type` widens to string (TS2345).
  options/index.ts registers a listener (inside the binding block, where `tabs` + `bindings` are in
  scope) → tabs.activate("tab-bindings") + bindings.revealFixedQuery(queryId, queryName ?? null).
  QueryBindingsController.revealFixedQuery re-reads the store (picks up a binding added since load)
  then re-runs initFixedQuery. Test tip: seed a post-load binding via store.read.mockResolvedValueOnce
  (NOT store.bind(...) directly — vi.fn ReturnType isn't callable under TS, TS2348).

## Feature Crew reconciles MUST be serialized (lost-update / reverted-tag bug)

- SYMPTOM: adding a new assignee tag on the Project Tracking board set the pill for ~1s then reverted,
  and the tag was not persisted anywhere (no error logged).
- ROOT CAUSE: `createFeatureCrewSync.reconcile` (content/views/project-tracking/ProjectTrackingView.ts)
  was fire-and-forget. Every reconcile is a READ-MODIFY-WRITE against the ONE shared Feature Crew work
  item (`background/index.ts reconcileFeatureCrew` → MAIN-world find + apply). The load-time `seed()`
  reconcile and a `setTag()` reconcile ran CONCURRENTLY. The seed reconcile (which knows nothing about
  the just-picked tag) resolves last, so its `onReconciled(members-without-tag)` → `applyCrewMembers`
  → `applyFeatureCrewTags` repaints the pill tag-less (the "revert"). On a first-ever load the two
  concurrent creates also clobber each other so the tag lands nowhere. The tree renders "??" pills
  SYNCHRONOUSLY before the seed resolves, so the user can retag inside the race window.
- FIX: chain every reconcile onto a single `reconcileChain: Promise<void>` in `createFeatureCrewSync`
  so they run strictly one-at-a-time (snapshot `assignees` at execution time; swallow errors to keep
  the chain alive — the writer logs its own failures). seed then always completes (creating the item)
  before setTag reads it, so the tag write is last and is never lost/reverted. General rule: any
  read-modify-write against a shared ADO item from the view MUST be serialized, never fired in parallel.
- TEST TIMING: serialization adds ONE microtask hop before `services.featureCrew.reconcile` is called,
  so tests that assert reconcile-request counts right after `render()` must drain with
  `await new Promise((r) => setTimeout(r, 0))` (full macrotask flush), NOT one or two
  `await Promise.resolve()`. The regression test drives a DEFERRED fake reconcile (pending[] of
  settle() closures that apply the request like the real background) and asserts the setTag reconcile
  does NOT fire until the seed is settled.
