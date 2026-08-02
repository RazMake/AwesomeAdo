# ActivityFilter

The shared **recent-activity pills**: they narrow a view to work that moved inside a caller-supplied
rolling window (Project Tracking's _Recent changes window (hours)_ binding property, Sprint's
equivalent).

## Behavior

- Three pills: **Newly created**, **Newly updated**, **New notes**. They use the same compact
  geometry and full opacity as the other filter pills, but sit in a separate family after a larger
  gap.
- Lit pills form an **OR** (an item shows if it matches any of them), exactly like the tag filter.
  An empty selection leaves the view unnarrowed.
- The window is named in each pill's tooltip ("Items created in the last 24 hours."), so "newly" is
  never a guess.
- The window is **rolling**: it is re-measured on every repaint, so a view left open ages items out
  of "newly" instead of answering against the hour it loaded on.
- Selection lives in the view's session, so it survives a repaint and a refresh; it is never written
  back to the binding (the same rule the sprint, tag and ordering picks follow).

### How "New notes" is answered

Azure DevOps reports only `System.CommentCount` — a running total with no dates on it — so the tree
alone cannot tell an item discussed an hour ago from one discussed a year ago. `RecentNotesIndex`
answers it by reading the discussions themselves. Each read is expensive (a message to the service
worker, an injected MAIN-world script, two credentialed fetches), which drives every rule below:

- **On demand only.** Nothing is read until the pill is lit, so a reader who never asks about
  discussions never pays for them.
- **Only where ADO says a discussion exists** (`noteCount > 0`), at most **6 reads in flight**.
- **Remembered for the life of the view, not one repaint.** The index lives in the view's session, so
  a refresh does not throw away discussions the reader already paid to read.
- **Re-read only when the comment count moves.** That count is the one per-item signal the tree
  carries about the discussion, and it arrives free with the refresh's tree read — so a refresh
  re-reads just the handful of items that actually changed. (A note added _and_ deleted between two
  reads leaves the count equal and goes unseen; it self-corrects on the next change.)
- **Recorded as the newest note's timestamp, not a yes/no.** A boolean would rot as the rolling
  window slides forward; a timestamp is re-tested against the current window on every repaint, so an
  item ages out of "newly commented" without being re-read.
- **Marker-generated notes do not count.** The index passes every non-empty Marker Tags `commentTag`
  as an excluded prefix. The page read requests comments newest-first and follows continuation pages
  until it finds the newest ordinary note. Reaching the page guard is an incomplete read, never a
  false claim that the discussion has no relevant activity.
- While reads are in flight the pill shows `New notes…` (`aria-busy`) and the criterion is **not**
  applied — the view narrows once, when the answer is complete, instead of emptying and repopulating.
  A refresh keeps its spinner up until these reads land too, so the cost is paid inside the wait the
  reader already expects.
- A failed read is logged and the item is simply never claimed to be newly commented. It is not
  retried on every repaint; a later count change earns it another try.

## Public API

### `renderActivityFilterPills(doc, options): HTMLElement[]`

- **`selected: Set<RecentActivityKind>`** — the active selection; the pills render it and toggle
  entries in it in place (the caller owns this single source of truth).
- **`windowHours: number`** — the view's recent-changes window, named in each pill's tooltip.
- **`notesPending: boolean`** — true while discussions are still being read; shown on the notes pill.
- **`onChange: (selected) => void`** — called after a toggle so the caller re-filters its items.

The pills are returned **loose** so each view can place them in its shared activity family.

### `recentActivity.ts`

- **`RecentActivityKind`** — `"created" | "updated" | "notes"`.
- **`RECENT_ACTIVITY_FILTERS`** — the offered pills (kind, label, color, tooltip text), declared once.
- **`recentWindowStart(now, hours): number`** — epoch milliseconds the window opens at.
- **`isWithinRecentWindow(iso, sinceMs): boolean`** — an unparseable timestamp is never "new".
- **`matchesRecentActivity(item, criteria): boolean`** — the OR across the lit pills.
- **`activityFilterInForce(selected, notesPending)`** — the pills that may actually narrow right now.

### `new RecentNotesIndex(reader, logger, excludedPrefixes?)`

- **`ensureProbed(root)`** — idempotent; reads the newest-comment date of any item under `root`
  whose answer is missing or whose comment count has moved since it was read. A no-op while a read
  is already in flight.
- **`hasRecentNote(item, sinceMs): boolean`** — whether the item's newest known comment falls at or
  after `sinceMs`. `false` for anything unread or failed; a view never claims activity it did not
  confirm.
- **`isPending(): boolean`** — true while the read is outstanding.
- **`whenSettled(): Promise<void>`** — resolves once the outstanding read has landed (immediately
  when idle), so the filter row can repaint and a refresh can hold its spinner until then. Never
  rejects.

It is created once per view render and kept on that view's session.
