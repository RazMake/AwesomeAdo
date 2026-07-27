import { createSvgCanvas } from "../svgIcon/svgIcon";

/** Options for rendering the write-queue status indicator. */
export interface WriteQueueStatusOptions {
  /** Initial number of pending writes. Default 0 (idle → the indicator is hidden). */
  count?: number;
  /**
   * Invoked when the user activates the failure chip (click, or Enter/Space while it is focused), so
   * the surface that owns the control can take them to the details of what was lost — in this
   * extension, the Diagnostics log filtered to errors. Injected because the control is purely
   * presentational and must not know that extension pages exist. Omit it and the chip only dismisses.
   */
  onOpenLog?: () => void;
}

/** A mounted write-queue status indicator plus the handle its owner uses to update the count. */
export interface WriteQueueStatusHandle {
  /** The root element to mount. */
  element: HTMLElement;
  /** Update the pending-write count; 0 hides the indicator, > 0 shows the animated "saving" state. */
  setCount(count: number): void;
  /**
   * Update the count of writes that failed, and optionally why the latest one did (shown as the
   * indicator's tooltip). A positive count wins over "saving", because a user who has lost an edit
   * needs to know that before they need to know a later edit is still in flight.
   */
  setFailedCount(count: number, reason?: string): void;
}

/** Grammatically-correct singular/plural for the change count in either state's label. */
function pluralizeChanges(count: number): string {
  return count === 1 ? "change" : "changes";
}

/**
 * The inline layout both visible states share, so they cannot drift apart. Each state supplies its
 * own paint on top; later declarations win, which is what lets the alert override the quiet defaults.
 */
function visibleRowStyle(...paint: string[]): string {
  return ["display:inline-flex", "align-items:center", "gap:6px", "font-size:11px", ...paint].join(
    ";",
  );
}

/**
 * The failed state's paint: a FILLED alert chip rather than the tinted label the busy state uses.
 *
 * A lost edit is the one thing on this board that the user cannot discover any other way — every
 * control is persist-then-reflect, so a rejected write leaves the screen looking exactly as it did
 * before. Coloring a small line of text was not enough to carry that: at 11px in a header corner it
 * read as decoration. A solid error fill with white text, at a larger weight and size, is the only
 * treatment that survives being glanced past.
 */
function failedRowStyle(): string {
  return visibleRowStyle(
    "font-size:12px",
    "font-weight:600",
    "padding:3px 8px",
    "border-radius:3px",
    // Themed error fill with a literal fallback, so it reads on light, dark, blue and "Follow ADO"
    // alike (ADR-034) instead of relying on a token ADO may not define.
    "background:var(--palette-error-background, #c50f1f)",
    "color:var(--text-on-communication-background, #ffffff)",
    // A dark hairline plus a shadow lifts the chip off whatever surface the header tile is painted
    // in, including a themed error background close to the tile's own color.
    "border:1px solid rgba(0,0,0,0.35)",
    "box-shadow:0 1px 4px rgba(0,0,0,0.35)",
    // The chip is dismissible, so it has to look clickable.
    "cursor:pointer",
  );
}

/**
 * What the failed chip's tooltip says: the cause when one is known, and what activating it does.
 *
 * The two endings differ because the promise has to match what the chip will actually do — telling a
 * user to "click for details" when no handler is wired would make the chip lie about itself.
 */
function failureTooltip(reason: string | undefined, opensLog: boolean): string {
  const cause =
    reason !== undefined && reason.trim().length > 0 ? `Couldn't save: ${reason}. ` : "";
  const action = opensLog
    ? "Click to see the details in the AwesomeADO Diagnostics log."
    : "See the AwesomeADO Diagnostics log for details. Click to dismiss.";
  return `${cause}${action}`;
}

/**
 * A caller-supplied count reduced to a whole number the control can act on: negatives and
 * non-finite values become 0 (idle).
 *
 * Normalized once, where a count ENTERS the control, rather than again at each read. Normalizing
 * only at render time let a bad value latch in the stored state: after a `NaN`, every later
 * comparison against it (`1 > NaN`) is false, so the control would paint the new state while
 * silently deciding nothing had changed.
 */
function normalizeCount(count: number): number {
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/** A 14px inline SVG canvas both icons share, hidden until its state is the visible one. */
function createIconCanvas(doc: Document, display: string): SVGSVGElement {
  return createSvgCanvas(doc, `display:${display};flex:none`);
}

/**
 * The busy state's spinner: a self-contained inline SVG driven by SMIL (`<animateTransform>`) so it
 * spins without any @keyframes/stylesheet — which keeps the control deterministic and independent of
 * ADO's or the extension's CSS. `currentColor` makes it inherit the themed text color.
 */
function createSpinnerIcon(doc: Document): SVGSVGElement {
  const svg = createIconCanvas(doc, "block");
  // A partial-arc circle (stroke-dasharray leaves a gap) rotating about the viewBox center reads as
  // a classic spinner. Rotating the ring itself avoids needing a separate wrapper transform.
  const circle = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "8");
  circle.setAttribute("cy", "8");
  circle.setAttribute("r", "6");
  circle.setAttribute("fill", "none");
  circle.setAttribute("stroke", "currentColor");
  circle.setAttribute("stroke-width", "2");
  circle.setAttribute("stroke-linecap", "round");
  // ~3/4 arc drawn, ~1/4 gap (circumference ≈ 37.7 for r=6).
  circle.setAttribute("stroke-dasharray", "28 12");

  const animate = doc.createElementNS("http://www.w3.org/2000/svg", "animateTransform");
  animate.setAttribute("attributeName", "transform");
  animate.setAttribute("type", "rotate");
  animate.setAttribute("from", "0 8 8");
  animate.setAttribute("to", "360 8 8");
  animate.setAttribute("dur", "0.8s");
  animate.setAttribute("repeatCount", "indefinite");

  circle.append(animate);
  svg.append(circle);
  return svg;
}

/**
 * The failed state's warning triangle, plus the handle that replays its attention pulse.
 *
 * Built the same stylesheet-free way as the spinner so it stays deterministic. It pulses a FIXED
 * number of times rather than forever: the point is to catch the eye at the moment an edit is lost,
 * not to leave a badge blinking in the header for the rest of the session.
 */
function createWarningIcon(doc: Document): { element: SVGSVGElement; pulse: SVGAnimateElement } {
  const svg = createIconCanvas(doc, "none");
  const triangle = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  // Triangle with the exclamation punched out, so the glyph still reads at 14px on a filled chip.
  triangle.setAttribute(
    "d",
    "M8 1.5 15 14.5H1L8 1.5Zm0 3.6a.85.85 0 0 0-.85.95l.3 3.1a.55.55 0 0 0 1.1 0l.3-3.1A.85.85 0 0 0 8 5.1Zm0 5.6a.95.95 0 1 0 0 1.9.95.95 0 0 0 0-1.9Z",
  );
  triangle.setAttribute("fill", "currentColor");
  triangle.setAttribute("fill-rule", "evenodd");

  const pulse = doc.createElementNS("http://www.w3.org/2000/svg", "animate");
  pulse.setAttribute("attributeName", "opacity");
  pulse.setAttribute("values", "1;0.15;1");
  pulse.setAttribute("dur", "0.55s");
  pulse.setAttribute("repeatCount", "4");
  triangle.append(pulse);
  svg.append(triangle);
  return { element: svg, pulse };
}

/** A value rendered for the label plus the elements a paint routine updates. */
interface StatusParts {
  root: HTMLElement;
  spinner: SVGSVGElement;
  warning: SVGSVGElement;
  label: HTMLElement;
}

/**
 * Paint the failed chip.
 *
 * Failed wins over busy: a lost edit is the more urgent thing to report, and the spinner would
 * otherwise imply the write is still on its way.
 */
function paintFailure(
  parts: StatusParts,
  failed: number,
  reason: string | undefined,
  opensLog: boolean,
): void {
  const { root } = parts;
  parts.spinner.style.display = "none";
  parts.warning.style.display = "block";
  root.style.cssText = failedRowStyle();
  parts.label.textContent = `Couldn't save ${failed} ${pluralizeChanges(failed)}`;
  // Assertive while failed: "polite" waits for a pause in what the user is doing, which on a board
  // they are actively editing can mean the announcement never lands.
  root.setAttribute("role", "alert");
  root.setAttribute("aria-live", "assertive");
  // Focusable so the chip can be activated from the keyboard as well as the mouse.
  root.tabIndex = 0;
  root.title = failureTooltip(reason, opensLog);
}

/** Paint the saving row, or hide the control entirely when the queue is empty. */
function paintQuiet(parts: StatusParts, pending: number): void {
  const { root } = parts;
  parts.spinner.style.display = "block";
  parts.warning.style.display = "none";
  root.removeAttribute("title");
  root.removeAttribute("tabindex");
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");

  if (pending <= 0) {
    // Idle → nothing in the queue: hide entirely and clear the announced text.
    root.style.cssText = "display:none";
    parts.label.textContent = "";
    return;
  }

  // Busy → accent-colored inline row so "saving" reads as an active state on any theme.
  root.style.cssText = visibleRowStyle(
    "color:var(--communication-foreground, var(--text-primary-color, #323130))",
  );
  parts.label.textContent = `Saving ${pending} ${pluralizeChanges(pending)}\u2026`;
}

/**
 * A presentational write-queue status indicator: an animated spinner + "Saving N change(s)…" text
 * while writes are in flight, and a static "Couldn't save N change(s)" warning once any write has
 * failed.
 *
 * It is driven purely by numeric counts and knows nothing about the queue or ADO — the caller feeds
 * it counts so the control stays decoupled and reusable. The failed state exists because every
 * editable control on the board is persist-then-reflect: when a write is rejected nothing on screen
 * changes, so without this the user cannot tell a lost edit from a slow one. Idle (both counts 0)
 * hides the indicator. Kept stylesheet-free (the spinner is a self-contained SMIL SVG) so it
 * animates deterministically without depending on injected CSS.
 */
export function renderWriteQueueStatus(
  doc: Document,
  options: WriteQueueStatusOptions = {},
): WriteQueueStatusHandle {
  const root = doc.createElement("span");
  root.className = "awesomeado-write-queue-status";
  // role/aria-live so assistive tech announces when saves start and finish.
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "polite");

  let pendingCount = 0;
  let failedCount = 0;
  let failureReason: string | undefined;
  // Whether the user has activated the current failure away. Reset the moment a NEW write fails, so
  // acknowledging one lost edit can never hide the next one — the chip is the only on-screen evidence
  // that anything was lost, and a dismissal that outlived its own failure would suppress the truth.
  let dismissed = false;
  const openLog = options.onOpenLog;

  const svg = createSpinnerIcon(doc);
  const { element: warning, pulse } = createWarningIcon(doc);

  // The "Saving N change(s)…" label; text is always set via textContent (never innerHTML).
  const label = doc.createElement("span");
  label.className = "awesomeado-write-queue-status__label";

  root.append(svg, warning, label);

  const parts: StatusParts = { root, spinner: svg, warning, label };

  // Apply the visible/hidden state and text for the current counts. Extracted so the initial render
  // and every setter share one code path and stay idempotent. Both counts are already normalized by
  // their setters, so this only decides which state to paint.
  const apply = (): void => {
    if (failedCount > 0 && !dismissed) {
      paintFailure(parts, failedCount, failureReason, openLog !== undefined);
      return;
    }
    paintQuiet(parts, pendingCount);
  };

  // Activating the chip takes the user to the details of what was lost (when the owner wired that
  // up) and acknowledges the report. It does NOT clear the queue's failure count, which the owner
  // still holds, so a later failure brings the chip straight back with the new total.
  const activate = (): void => {
    if (failedCount === 0 || dismissed) {
      return;
    }
    openLog?.();
    dismissed = true;
    apply();
  };

  root.addEventListener("click", activate);
  root.addEventListener("keydown", (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      // Space would otherwise scroll the page out from under the board.
      event.preventDefault();
      activate();
    }
  });

  pendingCount = normalizeCount(options.count ?? 0);
  apply();

  return {
    element: root,
    setCount: (count: number) => {
      pendingCount = normalizeCount(count);
      apply();
    },
    setFailedCount: (count: number, reason?: string) => {
      // Replay the pulse whenever the failure count GROWS, so a second lost edit is as noticeable as
      // the first — an already-visible chip would otherwise change only its number. Guarded because
      // `beginElement` is a SMIL API that non-browser DOMs (jsdom, tests) do not implement.
      const normalized = normalizeCount(count);
      const isNewFailure = normalized > failedCount;
      // A fresh failure un-dismisses the chip: the user acknowledged the failures they had SEEN, not
      // a later one they have not. Clearing the count also resets it, so the next one starts clean.
      if (isNewFailure || normalized === 0) {
        dismissed = false;
      }
      failedCount = normalized;
      failureReason = reason;
      apply();
      const restart = (pulse as SVGAnimateElement).beginElement?.bind(pulse);
      if (isNewFailure && typeof restart === "function") {
        restart();
      }
    },
  };
}
