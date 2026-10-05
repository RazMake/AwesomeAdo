/**
 * Marks a synthetic `contextmenu` event as a Ctrl+click collection probe.
 *
 * Every view already resolves "which item is under the pointer?" in its right-click wiring, so a
 * Ctrl+click is replayed as a marked `contextmenu` on the same target: the innermost item menu claims
 * it and toggles that item in the collection instead of opening.
 *
 * The mark lives ON the event under a `Symbol.for` key, not in module state: the deferred views are
 * separate bundles with their own copy of this module, and only the realm-wide symbol registry is
 * shared between the collector that marks a probe and the view menu that reads it.
 */
const PROBE_STATE = Symbol.for("awesomeado.itemCollection.probe");

type ProbeState = "pending" | "handled";

interface ProbeCarrier {
  [PROBE_STATE]?: ProbeState;
}

function probeState(event: Event): ProbeState | undefined {
  return (event as ProbeCarrier)[PROBE_STATE];
}

export function markCollectProbe(event: Event): void {
  (event as ProbeCarrier)[PROBE_STATE] = "pending";
}

export function isCollectProbe(event: Event): boolean {
  return probeState(event) !== undefined;
}

/** Records that an item menu resolved the probe to a work item, so the originating click is spent. */
export function markCollectProbeHandled(event: Event): void {
  if (isCollectProbe(event)) (event as ProbeCarrier)[PROBE_STATE] = "handled";
}

export function wasCollectProbeHandled(event: Event): boolean {
  return probeState(event) === "handled";
}
