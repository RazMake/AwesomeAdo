# WorkItemWriteQueue

A strictly-sequential queue for writes back to a work item in Azure DevOps: single field writes
(`System.State`, a type's ETA date field, or any other field reference name) and drag-reorder moves.

## Why

ADO writes are latency-bound and rule-driven. Firing them concurrently would race on `System.Rev`
and let a stale rev clobber a fresh one. `WorkItemWriteQueue` serializes every write so each observes
the previous one's committed rev, keeping ordering deterministic (see ADR-030). A rejected write
never stalls the chain — the next queued write still runs.

Field edits and moves share **one** queue rather than getting one each: a re-parent patches the same
item under the same `/rev` test a field write does, so two queues would race precisely where
serialization matters most.

## Usage

```typescript
import { WorkItemWriteQueue } from "path/to/WorkItemWriteQueue";

// writeField is the injected IWorkItemFieldWriter-style function; logger is source-scoped.
const queue = new WorkItemWriteQueue(services.writeField, services.logger);

// Changing a field enqueues one write; the returned promise always resolves (never rejects).
queue
  .enqueue({ id: item.id, rev: item.rev, field: "System.State", value: primaryAdoState })
  .then((result) => {
    if (result.ok && result.rev !== undefined) {
      item.rev = result.rev; // Reconcile the optimistic model with the committed rev.
    }
  });

// A null value clears the field (e.g. resetting an item's ETA to "No ETA").
queue.enqueue({ id: item.id, rev: item.rev, field: etaField, value: null });
```

## Public API

### `WriteField`

`(request: WorkItemFieldWriteRequest) => Promise<WorkItemFieldWriteResult>` — persists a single
field change. The queue depends on this function type rather than a concrete writer (Dependency
Inversion), so a real writer or a test fake is interchangeable.

### `ReorderItem`

`(request: WorkItemReorderRequest) => Promise<WorkItemReorderResult>` — persists a move. Optional:
a queue constructed without one resolves every `enqueueReorder` with
`{ ok: false, error: "reordering is not available" }`, so a board that never reorders is not forced
to supply a writer it would never call.

### `WorkItemWriteQueue`

- **`new WorkItemWriteQueue(writeField, logger, reorderItem?)`** — construct one queue per view
  instance (per tab).
- **`enqueue(request): Promise<WorkItemFieldWriteResult>`** — append a field write to the serial
  queue and resolve with its result. The promise **always resolves** (never rejects): failures come
  back as `{ ok: false, error }` so an optimistic caller can reconcile on both paths without a
  `catch`. Each enqueue is logged; failures are logged as errors.
- **`enqueueReorder(request): Promise<WorkItemReorderResult>`** — append a move to the **same** serial
  queue. `request` names the parent the item ends up under, the parent it came from, and the two
  siblings it lands between (`0` = no parent / start / end); ADO owns the rank arithmetic and reports
  the new `order` back. Like `enqueue`, the promise always resolves, and `currentRev` is a resolver
  read at run time so a move queued behind a field write carries the rev that write committed.
- **`onWriteFailed(listener): () => void`** — subscribe to the failed-write count so a UI can tell a
  rejected save apart from a slow one. The listener receives `(count, lastError)`: the reason the
  **latest** write was rejected travels with the count, because on a persist-then-reflect board
  nothing on screen changes when a write is lost — a bare count would tell the user only that
  something went wrong and leave the log as the sole place to find out what. Fires immediately on
  subscribe (`lastError` is undefined until something fails), then again after every failure.
- **`pendingCount: number`** (getter) — the number of writes queued but not yet settled (the one
  running plus those still waiting). Use it to drive a "saving…" indicator.
- **`onPendingChange(listener): () => void`** — subscribe to pending-count changes so a UI control
  can graphically show in-flight writes. The listener fires immediately with the current count on
  subscribe, then again whenever the count changes (each enqueue increments; each write settling —
  success or failure — decrements). Returns an unsubscribe function; call it to stop receiving
  updates. A listener that throws is isolated (its error is logged) so a UI bug can never wedge the
  queue.

```typescript
// Reflect in-flight writes in a UI control, then stop listening on teardown.
const stop = queue.onPendingChange((count) => {
  saveIndicator.busy = count > 0;
});
// ...later
stop();
```
