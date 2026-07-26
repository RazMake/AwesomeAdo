/** A lazily-built popup wired to a trigger element. */
export interface PopupHost {
  /** Toggle the popup open/closed. */
  toggle(): void;
  /** Close the popup if open (idempotent). */
  close(): void;
  /** Whether the popup is currently open. */
  readonly isOpen: boolean;
}

/** Configuration for wiring a popup host. */
export interface PopupHostOptions {
  /** The document whose capture-phase pointerdown/keydown events drive dismissal. */
  doc: Document;
  /** The element that toggles the popup; events on it count as "inside" (it toggles itself). */
  trigger: HTMLElement;
  /** Where the popup element is appended when it opens. */
  mountInto: HTMLElement;
  /**
   * Builds the popup element each time it opens. Receives the host's `close` so an in-popup action
   * (e.g. picking a value) can dismiss it.
   */
  buildPopup: (close: () => void) => HTMLElement;
  /** When false the trigger click is not wired (a read-only control). Defaults to true. */
  interactive?: boolean;
}

/**
 * Nudge a just-opened popup back inside the window.
 *
 * Every control anchors its popup at the trigger's bottom-left, which pushes a popup on a control
 * near the right (or bottom) window edge partly out of sight — the ETA badge sits at the far right
 * of every board row, so this is the common case, not the exception. Shifting with a transform
 * leaves each control's own anchoring styles untouched, and the shift is capped by the distance to
 * the opposite edge so correcting one overflow can never create another.
 */
function keepInsideWindow(doc: Document, popup: HTMLElement): void {
  const view = doc.defaultView;
  const rect = popup.getBoundingClientRect();
  // A zero-sized rect means the popup is not laid out (a headless DOM), where there is no viewport
  // to fit it into and every measurement would be 0 — leave it exactly where the control put it.
  if (!view || rect.width === 0) {
    return;
  }
  const margin = 8;
  const overflowRight = rect.right - (view.innerWidth - margin);
  const overflowBottom = rect.bottom - (view.innerHeight - margin);
  const shiftX = overflowRight > 0 ? Math.min(overflowRight, Math.max(0, rect.left - margin)) : 0;
  const shiftY = overflowBottom > 0 ? Math.min(overflowBottom, Math.max(0, rect.top - margin)) : 0;
  if (shiftX > 0 || shiftY > 0) {
    popup.style.transform = `translate(${String(-shiftX)}px, ${String(-shiftY)}px)`;
  }
}

/**
 * Wires a trigger element to a lazily-built popup with the dismissal behaviour every popup control
 * needs: clicking the trigger toggles it, and an outside pointerdown or an Escape keypress closes it.
 *
 * The whole lazy-popup lifecycle (create-on-open, remove-on-close, capture-phase dismissal listeners
 * armed only while open, and keeping the opened popup inside the window) lives here so no control
 * has to reimplement it — the repo's DRY duplication gate forbids copying this skeleton into each
 * control. Listeners are attached in the capture phase so the dismiss fires before a click can be
 * swallowed deeper in the tree, and events on the popup or its trigger are ignored so the trigger's
 * own toggle wins without a close/reopen race.
 */
export function createPopupHost(options: PopupHostOptions): PopupHost {
  const { doc, trigger, mountInto, buildPopup, interactive = true } = options;

  let popup: HTMLElement | null = null;

  const handleOutsidePointer = (event: Event): void => {
    const target = event.target as Node | null;
    if (target && (popup?.contains(target) || trigger.contains(target))) {
      return;
    }
    close();
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      close();
    }
  };

  const open = (): void => {
    if (popup) return;
    popup = buildPopup(close);
    mountInto.append(popup);
    // Measured only after mounting, because an unattached element has no box to fit to the window.
    keepInsideWindow(doc, popup);
    doc.addEventListener("pointerdown", handleOutsidePointer, true);
    doc.addEventListener("keydown", handleKeydown, true);
  };

  const close = (): void => {
    if (!popup) return;
    popup.remove();
    popup = null;
    doc.removeEventListener("pointerdown", handleOutsidePointer, true);
    doc.removeEventListener("keydown", handleKeydown, true);
  };

  const toggle = (): void => {
    if (popup) {
      close();
    } else {
      open();
    }
  };

  if (interactive) {
    trigger.addEventListener("click", toggle);
  }

  return {
    toggle,
    close,
    get isOpen() {
      return popup !== null;
    },
  };
}
