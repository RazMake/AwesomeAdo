/** Options for rendering the write-queue status indicator. */
export interface WriteQueueStatusOptions {
  /** Initial number of pending writes. Default 0 (idle → the indicator is hidden). */
  count?: number;
}

/** A mounted write-queue status indicator plus the handle its owner uses to update the count. */
export interface WriteQueueStatusHandle {
  /** The root element to mount. */
  element: HTMLElement;
  /** Update the pending-write count; 0 hides the indicator, > 0 shows the animated "saving" state. */
  setCount(count: number): void;
}

/**
 * A presentational write-queue status indicator: an animated spinner + "Saving N change(s)…" text
 * shown only while writes are in flight.
 *
 * It is driven purely by a numeric count and knows nothing about the queue or ADO — the caller feeds
 * it counts so the control stays decoupled and reusable. Idle (count <= 0) hides the indicator; a
 * positive count reveals an accent-colored "saving" state. Kept stylesheet-free (the spinner is a
 * self-contained SMIL SVG) so it animates deterministically without depending on injected CSS.
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

  // The spinner is a self-contained inline SVG driven by SMIL (<animateTransform>) so it spins
  // without any @keyframes/stylesheet — this keeps the control deterministic and independent of
  // ADO's or the extension's CSS. `currentColor` makes it inherit the themed accent text color.
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");
  svg.style.cssText = "display:block;flex:none";

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

  // The "Saving N change(s)…" label; text is always set via textContent (never innerHTML).
  const label = doc.createElement("span");
  label.className = "awesomeado-write-queue-status__label";

  root.append(svg, label);

  // Apply the visible/hidden state and text for a given count. Extracted so the initial render and
  // every setCount call share one code path and stay idempotent.
  const apply = (rawCount: number): void => {
    // Treat negatives and non-finite values as idle so a bad count can never show a bogus indicator.
    const count = Number.isFinite(rawCount) && rawCount > 0 ? Math.floor(rawCount) : 0;

    if (count <= 0) {
      // Idle → nothing in the queue: hide entirely and clear the announced text.
      root.style.cssText = "display:none";
      label.textContent = "";
      return;
    }

    // Busy → accent-colored inline row so "saving" reads as an active state on any theme.
    root.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "gap:6px",
      "font-size:11px",
      "color:var(--communication-foreground, var(--text-primary-color, #323130))",
    ].join(";");
    // Grammatically-correct singular/plural.
    const noun = count === 1 ? "change" : "changes";
    label.textContent = `Saving ${count} ${noun}…`;
  };

  apply(options.count ?? 0);

  return {
    element: root,
    setCount: (count: number) => apply(count),
  };
}
