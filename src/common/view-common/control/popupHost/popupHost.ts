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
  /**
   * Called with the popup once it is mounted and repositioned — the earliest moment focus can be
   * moved into it, since focusing an element that is still detached silently does nothing.
   */
  onOpened?: (popup: HTMLElement) => void;
  /** When false the trigger click is not wired (a read-only control). Defaults to true. */
  interactive?: boolean;
  /**
   * Whether an Escape pressed inside a TEXT FIELD in the popup dismisses the popup. Defaults to
   * true, which is right for a popup that only offers values to pick.
   *
   * Set false for a popup that can hold an editor: there, Escape is how the author abandons what
   * they are typing, and dismissing the whole surface on the same keystroke takes the editor away
   * WITH everything around it — they wanted out of the field, not out of the discussion they opened
   * it from. The second Escape, with nothing left editing, still closes the popup.
   */
  dismissOnFieldEscape?: boolean;
}

/**
 * Whether `target` is a text field inside `popup` — the case where Escape belongs to the field.
 *
 * Tag names rather than `instanceof`: the popup may be built in another document (a test harness, a
 * frame), where the constructors are different objects and every `instanceof` silently answers false.
 */
function isFieldInside(popup: HTMLElement | null, target: EventTarget | null): boolean {
  const node = target as Node | null;
  if (!popup || !node || !popup.contains(node)) {
    return false;
  }
  const element = target as Partial<HTMLElement> & { tagName?: string };
  return (
    element.tagName === "INPUT" ||
    element.tagName === "TEXTAREA" ||
    element.isContentEditable === true
  );
}

// Breathing room kept between a repositioned popup and the edge of the visible area.
const VIEWPORT_MARGIN = 8;

// The gap every popup control leaves between its trigger and the popup (their `margin-top:4px`).
// Re-applied in pixels once a popup is anchored to the viewport and can no longer express it as a
// margin against the trigger.
const TRIGGER_GAP = 4;

/** The edges of the area a popup must stay inside, in viewport coordinates. */
interface VisibleBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Where a popup currently sits, in viewport coordinates. */
interface PopupBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The window's client box — the only bounds that still apply once a popup is anchored to the
 * viewport, because `position:fixed` is laid out against the viewport rather than an ancestor.
 */
function windowBounds(popup: HTMLElement, view: Window): VisibleBounds {
  const root = popup.ownerDocument.documentElement;
  // `clientWidth`/`clientHeight` are 0 in environments without layout (jsdom); the window's inner
  // size is the only meaningful answer there.
  return {
    left: 0,
    top: 0,
    right: root.clientWidth || view.innerWidth,
    bottom: root.clientHeight || view.innerHeight,
  };
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
  const bounds = windowBounds(popup, view);

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

/** Whether `box` could sit entirely inside `bounds`, the edge margins included. */
function fitsInside(box: PopupBox, bounds: VisibleBounds): boolean {
  return (
    box.width + 2 * VIEWPORT_MARGIN <= bounds.right - bounds.left &&
    box.height + 2 * VIEWPORT_MARGIN <= bounds.bottom - bounds.top
  );
}

/**
 * Re-anchor the popup to the viewport so no ancestor's `overflow` can cut it off, and report the box
 * it now occupies.
 *
 * Some scroll boxes are simply too small to ever show a popup opened from inside them: the rolled-up
 * children popup is only as tall as its rows, so the ETA picker opening under a row was clipped away
 * to nothing and left the popup showing scrollbars instead. Nudging cannot fix that — the popup has
 * to leave the clip entirely, and `position:fixed` is the only way to do that without reparenting it
 * away from the host that owns its lifecycle. The trigger's viewport rect supplies the anchor the
 * control's `top:100%; left:0` CSS can no longer express. The new box is derived from that rect
 * rather than re-measured, because the browser has not laid the popup out again yet.
 */
function anchorToViewport(popup: HTMLElement, triggerRect: DOMRect, box: PopupBox): PopupBox {
  popup.style.position = "fixed";
  popup.style.left = `${triggerRect.left}px`;
  popup.style.top = `${triggerRect.bottom + TRIGGER_GAP}px`;
  popup.style.marginTop = "0";
  return {
    left: triggerRect.left,
    top: triggerRect.bottom + TRIGGER_GAP,
    width: box.width,
    height: box.height,
  };
}

/**
 * Shift the popup left by exactly what spills past the right edge — never past the opposite edge, so
 * fixing one side cannot break the other.
 */
function shiftInsideBounds(
  popup: HTMLElement,
  box: PopupBox,
  bounds: VisibleBounds,
  view: Window,
): void {
  const spillRight = box.left + box.width - (bounds.right - VIEWPORT_MARGIN);
  const shift = Math.min(
    Math.max(spillRight, 0),
    Math.max(box.left - (bounds.left + VIEWPORT_MARGIN), 0),
  );
  if (shift <= 0) {
    return;
  }
  const anchoredLeft = Number.parseFloat(view.getComputedStyle(popup).left);
  popup.style.left = `${(Number.isFinite(anchoredLeft) ? anchoredLeft : 0) - shift}px`;
}

/**
 * Flip the popup above its trigger when it spills below the visible area and actually fits above.
 * `triggerRect` is non-null only for a viewport-anchored popup, which has to be told where "above
 * the trigger" is in pixels — `bottom:100%` would resolve against the viewport, not the trigger.
 */
function flipAboveTrigger(
  popup: HTMLElement,
  box: PopupBox,
  bounds: VisibleBounds,
  triggerRect: DOMRect | null,
): void {
  const spillBottom = box.top + box.height - (bounds.bottom - VIEWPORT_MARGIN);
  if (spillBottom <= 0 || box.top - box.height < bounds.top + VIEWPORT_MARGIN) {
    return;
  }
  if (triggerRect) {
    popup.style.top = `${triggerRect.top - box.height - TRIGGER_GAP}px`;
    return;
  }
  // Re-anchor to the trigger's top edge, keeping the same 4px gap the controls use below it.
  popup.style.top = "auto";
  popup.style.bottom = "100%";
  popup.style.marginTop = "0";
  popup.style.marginBottom = `${TRIGGER_GAP}px`;
}

/**
 * Nudge a just-opened popup back inside the visible area, and report whether it had to be anchored
 * to the viewport to get there.
 *
 * Every popup control anchors its popup under the trigger with `left:0`, which runs out of sight as
 * soon as the trigger sits near the right edge (an ETA badge in the last column opened half-hidden,
 * putting its date input and Clear button out of reach). The correction can only be computed once the
 * popup is in the DOM and measurable, so it lives here rather than in the popup's own CSS.
 */
function keepPopupInView(popup: HTMLElement, trigger: HTMLElement, view: Window): boolean {
  const rect = popup.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) {
    // Unmeasurable (hidden or detached host): leave the control's own anchoring untouched.
    return false;
  }
  let box: PopupBox = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  let bounds = visibleBounds(popup, view);
  let triggerRect: DOMRect | null = null;

  // Escaping only helps when the viewport itself has the room; a popup too big for the window is
  // left where the control put it rather than moved somewhere equally unusable.
  if (!fitsInside(box, bounds) && fitsInside(box, windowBounds(popup, view))) {
    triggerRect = trigger.getBoundingClientRect();
    box = anchorToViewport(popup, triggerRect, box);
    bounds = windowBounds(popup, view);
  }

  shiftInsideBounds(popup, box, bounds, view);
  flipAboveTrigger(popup, box, bounds, triggerRect);
  return triggerRect !== null;
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
 * also repositions the popup so it stays fully on screen wherever its trigger happens to sit — up to
 * anchoring it to the viewport when the scroll box it opened inside is too small to show it.
 */
export function createPopupHost(options: PopupHostOptions): PopupHost {
  const {
    doc,
    trigger,
    mountInto,
    buildPopup,
    onOpened,
    interactive = true,
    dismissOnFieldEscape = true,
  } = options;

  let popup: HTMLElement | null = null;

  const handleOutsidePointer = (event: Event): void => {
    const target = event.target as Node | null;
    if (target && (popup?.contains(target) || trigger.contains(target))) {
      return;
    }
    close();
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") {
      return;
    }
    // Listened for in the CAPTURE phase, so this runs before the field's own handler and a
    // `stopPropagation` down there could never reach it — the field has to be recognized here.
    if (!dismissOnFieldEscape && isFieldInside(popup, event.target)) {
      return;
    }
    close();
  };

  // A viewport-anchored popup no longer travels with its trigger, so any scroll around it would
  // strand it beside the row it belongs to. Closing is the honest response; scrolls raised inside the
  // popup (its own scrolling list) are its own business and must not dismiss it.
  const handleOutsideScroll = (event: Event): void => {
    const target = event.target as Node | null;
    if (target && popup?.contains(target)) {
      return;
    }
    close();
  };

  const open = (): void => {
    if (popup) return;
    popup = buildPopup(close);
    mountInto.append(popup);
    const anchoredToViewport = doc.defaultView
      ? keepPopupInView(popup, trigger, doc.defaultView)
      : false;
    doc.addEventListener("pointerdown", handleOutsidePointer, true);
    doc.addEventListener("keydown", handleKeydown, true);
    if (anchoredToViewport) {
      // Capture phase: scroll does not bubble, so a descendant scroll box would otherwise go unseen.
      doc.addEventListener("scroll", handleOutsideScroll, true);
    }
    // Last, so a control focusing an input inside the popup does not fight the repositioning above.
    onOpened?.(popup);
  };

  const close = (): void => {
    if (!popup) return;
    popup.remove();
    popup = null;
    doc.removeEventListener("pointerdown", handleOutsidePointer, true);
    doc.removeEventListener("keydown", handleKeydown, true);
    doc.removeEventListener("scroll", handleOutsideScroll, true);
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
