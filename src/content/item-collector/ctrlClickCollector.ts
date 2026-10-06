import {
  markCollectProbe,
  wasCollectProbeHandled,
} from "../../common/item-collection/collectProbe";

/** Detaches the Ctrl+click listener. */
export type DisposeCtrlClickCollector = () => void;

/** Reports a Ctrl+click that added an item, so the widget can confirm it at the pointer. */
export interface CtrlClickAddedHook {
  countItems: () => number;
  celebrate: (x: number, y: number) => void;
}

// A grown count is the only proof the probe added something rather than hit a collected item.
function celebrateIfAdded(
  hook: CtrlClickAddedHook | undefined,
  before: number | undefined,
  event: MouseEvent,
): void {
  if (hook && before !== undefined && hook.countItems() > before) {
    hook.celebrate(event.clientX, event.clientY);
  }
}

/**
 * Turns a Ctrl+click (Cmd+click on macOS) on a work item into "add it to the collection".
 *
 * Every view already resolves which item lies under the pointer in its right-click wiring, so the
 * click is replayed as a marked `contextmenu` on the same element instead of teaching each view a
 * second hit test. Only when an item menu claims the probe is the original click spent; otherwise a
 * Ctrl+click keeps its ordinary meaning (such as opening a link in a new tab).
 *
 * Capture phase on the document so the probe runs before a row's own click handling can act on it.
 */
export function attachCtrlClickCollector(
  doc: Document,
  ignoreWithin: () => Element | null,
  onAdded?: CtrlClickAddedHook,
): DisposeCtrlClickCollector {
  const onClick = (event: MouseEvent): void => {
    if (event.button !== 0 || !(event.ctrlKey || event.metaKey)) return;
    const target = event.target;
    const view = doc.defaultView;
    if (view === null || !(target instanceof view.Element)) return;
    // The collector's own button and dialog are never collected.
    if (ignoreWithin()?.contains(target) === true) return;
    const before = onAdded?.countItems();
    const probe = new view.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: event.clientX,
      clientY: event.clientY,
    });
    markCollectProbe(probe);
    target.dispatchEvent(probe);
    if (wasCollectProbeHandled(probe)) {
      event.preventDefault();
      event.stopPropagation();
      celebrateIfAdded(onAdded, before, event);
    }
  };
  doc.addEventListener("click", onClick, true);
  return () => doc.removeEventListener("click", onClick, true);
}
