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

// Breathing room kept between a repositioned popup and the edge of the visible area.
const VIEWPORT_MARGIN = 8;

/** The edges of the area a popup must stay inside, in viewport coordinates. */
interface VisibleBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The visible box a popup must fit in.
 *
 * Not the window: enhanced views live in a scrolling overlay, and a scroll container's SCROLLBARS
 * eat into the area that is actually visible. Measuring against `innerWidth` left the ETA picker
 * tucked underneath the overlay's vertical scrollbar even though it was inside the window. So the
 * bounds are the window's client box (which already excludes the window's own scrollbars) narrowed
 * by the client box of every ancestor that clips or scrolls its content.
 */
function visibleBounds(popup: HTMLElement, view: Window): VisibleBounds {
  const root = popup.ownerDocument.documentElement;
  // `clientWidth`/`clientHeight` are 0 in environments without layout (jsdom); the window's inner
  // size is the only meaningful answer there.
  const bounds: VisibleBounds = {
    left: 0,
    top: 0,
    right: root.clientWidth || view.innerWidth,
    bottom: root.clientHeight || view.innerHeight,
  };

  for (let ancestor = popup.parentElement; ancestor; ancestor = ancestor.parentElement) {
    const style = view.getComputedStyle(ancestor);
    if (style.overflowX === "visible" && style.overflowY === "visible") {
      continue;
    }
    // clientLeft/clientTop skip the border, and clientWidth/clientHeight exclude the scrollbars —
    // together they describe exactly the part of this ancestor a child can be seen through.
    const rect = ancestor.getBoundingClientRect();
    const left = rect.left + ancestor.clientLeft;
    const top = rect.top + ancestor.clientTop;
    bounds.left = Math.max(bounds.left, left);
    bounds.top = Math.max(bounds.top, top);
    bounds.right = Math.min(bounds.right, left + ancestor.clientWidth);
    bounds.bottom = Math.min(bounds.bottom, top + ancestor.clientHeight);
  }
  return bounds;
}

/**
 * Nudge a just-opened popup back inside the visible area.
 *
 * Every popup control anchors its popup under the trigger with `left:0`, which runs out of sight as
 * soon as the trigger sits near the right edge (an ETA badge in the last column opened half-hidden,
 * putting its date input and Clear button out of reach). The correction can only be computed once the
 * popup is in the DOM and measurable, so it lives here rather than in the popup's own CSS. It shifts
 * horizontally by exactly the amount that spills over — never past the opposite edge — and flips the
 * popup above the trigger when it spills below and actually fits above.
 */
function keepPopupInView(popup: HTMLElement, view: Window): void {
  const rect = popup.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    // Unmeasurable (hidden or detached host): leave the control's own anchoring untouched.
    return;
  }
  const bounds = visibleBounds(popup, view);

  const spillRight = rect.right - (bounds.right - VIEWPORT_MARGIN);
  // Never shift further than the room on the left, so fixing one edge cannot break the other.
  const shift = Math.min(
    Math.max(spillRight, 0),
    Math.max(rect.left - (bounds.left + VIEWPORT_MARGIN), 0),
  );
  if (shift > 0) {
    const anchoredLeft = Number.parseFloat(view.getComputedStyle(popup).left);
    popup.style.left = `${(Number.isFinite(anchoredLeft) ? anchoredLeft : 0) - shift}px`;
  }

  const spillBottom = rect.bottom - (bounds.bottom - VIEWPORT_MARGIN);
  if (spillBottom > 0 && rect.top - rect.height >= bounds.top + VIEWPORT_MARGIN) {
    // Re-anchor to the trigger's top edge, keeping the same 4px gap the controls use below it.
    popup.style.top = "auto";
    popup.style.bottom = "100%";
    popup.style.marginTop = "0";
    popup.style.marginBottom = "4px";
  }
}

/**
 * Wires a trigger element to a lazily-built popup with the dismissal behaviour every popup control
 * needs: clicking the trigger toggles it, and an outside pointerdown or an Escape keypress closes it.
 *
 * The whole lazy-popup lifecycle (create-on-open, remove-on-close, capture-phase dismissal listeners
 * armed only while open) lives here so no control has to reimplement it — the repo's DRY duplication
 * gate forbids copying this skeleton into each control. Listeners are attached in the capture phase
 * so the dismiss fires before a click can be swallowed deeper in the tree, and events on the popup or
 * its trigger are ignored so the trigger's own toggle wins without a close/reopen race. Each open
 * also repositions the popup so it stays fully on screen wherever its trigger happens to sit.
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
    if (doc.defaultView) {
      keepPopupInView(popup, doc.defaultView);
    }
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
