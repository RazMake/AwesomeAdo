# `content/views/board-lifecycle`

The load/refresh lifecycle and write plumbing tree boards share, so the All Projects Catalog and the
Consumers View load, refresh, save, and fail identically (Project Tracking shares the write queue).

## Public API

`boardLoader.ts` → `createBoardLoader<T>(options): BoardLoader<T>`

| Option                 | Meaning                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| `fetch()`              | Reads one answer from Azure DevOps; a rejection is a failed load.    |
| `paint()`              | Paints the board from `data()`.                                      |
| `showMessage(text)`    | Replaces the surface with a placeholder line.                        |
| `loadingMessage`       | Shown while the first load is in flight.                             |
| `failureLogMessage`    | Logged, with the thrown value, whenever a load fails.                |
| `logger`               | The board's source-scoped logger.                                    |
| `openDiagnosticsLog()` | Opens the Diagnostics log.                                           |
| `queue`                | The board's write queue; every fresh read clears its failure report. |
| `refreshButton()`      | The refresh button on screen, or null before the first paint.        |
| `discardCaches()`      | Optional; runs before a Ctrl+click refresh re-reads (see below).     |

The returned loader offers:

- **`load(isRefresh)`** — read the query. The first load shows `loadingMessage`; a refresh keeps the
  board on screen and marks the button busy. Only the newest load may paint.
- **`refresh(request?)`** — what the Refresh button does. After a failed refresh the next press opens
  the Diagnostics log instead of retrying. A `RefreshRequest` with `discardCaches` (Ctrl+click) runs
  the `discardCaches` option and always re-reads, even after a failed refresh.
- **`data()`** — the answer on screen, or null before the first load lands.
- **`refreshFailed()`** — true while the board on screen is older data a failed refresh left behind;
  `paint()` uses it to mark the refresh button failed.

A first load that fails shows **Could not load this query.**; a failed refresh keeps the older board.

`boardWriteStatus.ts` → `createBoardWriteStatus(doc, queue, openDiagnosticsLog): BoardWriteStatus`

Subscribes once to the board's write queue and keeps its pending and failed counts, so a board that
rebuilds its header on every paint never loses the **Saving…** chip or a rejected-edit report.
Call `render()` on each paint for a fresh indicator element seeded with the current state; the
newest one keeps tracking the queue.

`boardWriteQueue.ts` → `createBoardWriteQueue(services): WorkItemWriteQueue`

The one serialized queue a board sends every field edit and every drag move through, wired to the
board's `writeField`, `reorderItem`, and `logger` services. Build exactly one per board: a move and
an edit to the same item must never race on its revision.

`discardBoardCaches.ts` → `discardBoardCaches(services, board, caches)`

What every view runs for a Ctrl+click Refresh: logs the forced fresh start under the board's name,
calls `clear()` on each board-owned cache (opened discussions, recent-note dates), then asks the
page-wide `services.discardCachedData()` (when the composition root provides it) to forget people,
@-mention, and shared team-configuration lookups.
