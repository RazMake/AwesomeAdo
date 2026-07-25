# StateWriteQueue

A strictly-sequential queue for work-item state (`System.State`) writes back to Azure DevOps.

## Why

ADO writes are latency-bound and rule-driven. Firing them concurrently would race on `System.Rev`
and let a stale rev clobber a fresh one. `StateWriteQueue` serializes every write so each observes
the previous one's committed rev, keeping ordering deterministic (see ADR-030). A rejected write
never stalls the chain — the next queued write still runs.

## Usage

```typescript
import { StateWriteQueue } from "path/to/StateWriteQueue";

// writeState is the injected IWorkItemStateWriter-style function; logger is source-scoped.
const queue = new StateWriteQueue(services.writeState, services.logger);

// Choosing a state enqueues one write; the returned promise always resolves (never rejects).
queue.enqueue({ id: item.id, rev: item.rev, state: primaryAdoState }).then((result) => {
  if (result.ok && result.rev !== undefined) {
    item.rev = result.rev; // Reconcile the optimistic model with the committed rev.
  }
});
```

## Public API

### `WriteState`

`(request: WorkItemStateWriteRequest) => Promise<WorkItemStateWriteResult>` — persists a single
state change. The queue depends on this function type rather than a concrete writer (Dependency
Inversion), so a real writer or a test fake is interchangeable.

### `StateWriteQueue`

- **`new StateWriteQueue(writeState, logger)`** — construct one queue per view instance (per tab).
- **`enqueue(request): Promise<WorkItemStateWriteResult>`** — append a state write to the serial
  queue and resolve with its result. The promise **always resolves** (never rejects): failures come
  back as `{ ok: false, error }` so an optimistic caller can reconcile on both paths without a
  `catch`. Each enqueue is logged; failures are logged as errors.
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
