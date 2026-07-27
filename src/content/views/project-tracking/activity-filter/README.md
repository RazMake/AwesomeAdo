# Activity Filter

The Project Tracking view's **recent-activity pills**. They narrow the tree to work that moved
inside the binding's **Recent changes window (hours)**.

## Behavior

- Three pills: **Newly created**, **Newly updated**, **New notes**. They close the board's single
  filter row, after the tag pills, and read a step larger than them because they are the board's
  coarse "what changed?" switch rather than a per-row label.
- Lit pills form an **OR** (an item shows if it matches any of them), exactly like the tag filter.
  An empty selection leaves the board unnarrowed.
- The window is named in each pill's tooltip ("Items created in the last 24 hours."), so "newly" is
  never a guess. It is the binding's `hours` property, resolved through `recentChangesWindowHours`.
- The window is **rolling**: it is re-measured on every repaint, so a board left open ages items out
  of "newly" instead of answering against the hour it loaded on.
- Selection lives in the board session, so it survives a repaint and a refresh; it is never written
  back to the binding (the same rule the sprint, tag and ordering picks follow).

### How "New notes" is answered

Azure DevOps reports only `System.CommentCount` — a running total with no dates on it — so the tree
alone cannot tell an item discussed an hour ago from one discussed a year ago. `RecentNotesIndex`
answers it by reading the discussions themselves:

- **On demand only.** Nothing is read until the pill is lit, so a reader who never asks about
  discussions never pays for them.
- **Only where ADO says a discussion exists** (`noteCount > 0`), at most **6 reads in flight**, and
  at most **once per item per board**.
- While the reads are in flight the pill shows `New notes…` (`aria-busy`) and the criterion is
  **not** applied — the board narrows once, when the answer is complete, instead of emptying and
  repopulating.
- A failed read is logged and the item is simply never claimed to be newly commented. Pressing the
  board's **⟳ Refresh** builds a new board, and therefore a new index, which is how the question is
  re-asked.

## Public API

### `renderActivityFilterPills(doc, options): HTMLElement[]`

- **`selected: Set<RecentActivityKind>`** — the active selection; the pills render it and toggle
  entries in it in place (the caller owns this single source of truth).
- **`windowHours: number`** — the binding's recent-changes window, named in each pill's tooltip.
- **`notesPending: boolean`** — true while discussions are still being read; shown on the notes pill.
- **`onChange: (selected) => void`** — called after a toggle so the caller re-filters the tree.

The pills are returned **loose**, not wrapped in a panel: they share the board's single wrapping
filter row (`Filters:` label → tag pills → these), and a wrapper around this group would make it
wrap independently of the rest of the row instead of flowing as one line.

### `recentActivity.ts`

- **`RecentActivityKind`** — `"created" | "updated" | "notes"`.
- **`RECENT_ACTIVITY_FILTERS`** — the offered pills (kind, label, color, tooltip text), declared once.
- **`recentWindowStart(now, hours): number`** — epoch milliseconds the window opens at.
- **`isWithinRecentWindow(iso, sinceMs): boolean`** — an unparseable timestamp is never "new".
- **`matchesRecentActivity(item, criteria): boolean`** — the OR across the lit pills.
- **`activityFilterInForce(selected, notesPending)`** — the pills that may actually narrow right now.

### `new RecentNotesIndex(loader, logger, onSettled)`

- **`ensureProbed(root, sinceIso)`** — idempotent; reads any not-yet-read discussion under `root`.
  The window is pinned to the first call, so a repaint a few seconds later re-reads nothing.
- **`hasRecentNote(item): boolean`** — `false` for anything unread or failed; the board never claims
  activity it did not confirm.
- **`isPending(): boolean`** — true while reads are outstanding.
- **`onSettled`** — called once each time the index goes from reading to idle, so the board repaints
  with the completed answer instead of flickering per item.
