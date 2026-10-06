const BURST_CLASS = "awesomeado-item-collector__added-burst";
const BURST_DURATION_MS = 700;
/** A little larger than the 13px page text, so it reads as a badge rather than a glyph. */
const BURST_FONT_SIZE_PX = 18;
/** Clears the arrow cursor, which extends down and to the right of its hotspot. */
const CURSOR_CLEARANCE_X_PX = 20;
const CURSOR_CLEARANCE_Y_PX = 26;
/** How far the burst drifts away from the pointer while it dissolves. */
const DRIFT_PX = 18;
/** Room the burst needs before an edge forces it to the pointer's other side. */
const EDGE_ROOM_PX = 48;

/** What the burst shows: the added item's type icon and the type's display color for its glow. */
export interface AddedBurstOptions {
  icon: HTMLElement;
  color: string | null;
}

/**
 * The added item's type icon popping out beside the pointer and dissolving, confirming a Ctrl+click
 * collected it without the reader having to look at the counter.
 *
 * It sits below-right of the pointer, clear of the cursor arrow, and flips to the other side near the
 * right or bottom edge so nothing ever covers it; it drifts further away in that same direction.
 * Purely decorative: hidden from assistive technology and ignores the pointer. Under reduced motion it
 * only fades in place — Windows reports reduced motion whenever animation effects are off (common on
 * remote desktops), and skipping it outright left those readers with no confirmation at all.
 */
export function showAddedBurst(
  doc: Document,
  x: number,
  y: number,
  options: AddedBurstOptions,
): void {
  const view = doc.defaultView;
  if (!view) return;
  const reduceMotion = view.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  const directionX = x + CURSOR_CLEARANCE_X_PX + EDGE_ROOM_PX > view.innerWidth ? -1 : 1;
  const directionY = y + CURSOR_CLEARANCE_Y_PX + EDGE_ROOM_PX > view.innerHeight ? -1 : 1;
  const burst = renderBurst(doc, options);
  burst.style.left = `${Math.round(x + directionX * CURSOR_CLEARANCE_X_PX)}px`;
  burst.style.top = `${Math.round(y + directionY * CURSOR_CLEARANCE_Y_PX)}px`;
  (doc.body ?? doc.documentElement).append(burst);
  if (typeof burst.animate !== "function") {
    burst.remove();
    return;
  }
  const frames = reduceMotion ? FADE_FRAMES : burstFrames(directionX, directionY);
  const animation = burst.animate(frames, { duration: BURST_DURATION_MS, easing: "ease-out" });
  animation.onfinish = () => burst.remove();
  animation.oncancel = () => burst.remove();
}

function renderBurst(doc: Document, options: AddedBurstOptions): HTMLElement {
  const burst = doc.createElement("span");
  burst.className = BURST_CLASS;
  burst.setAttribute("aria-hidden", "true");
  const glow = options.color ?? "rgba(255,255,255,0.6)";
  burst.style.cssText = [
    "position:fixed",
    "z-index:2147483647",
    "pointer-events:none",
    "display:inline-flex",
    "line-height:1",
    `font-size:${BURST_FONT_SIZE_PX}px`,
    `filter:drop-shadow(0 0 4px ${glow})`,
    "transform:translate(-50%,-50%)",
  ].join(";");
  burst.append(options.icon);
  return burst;
}

function burstFrames(directionX: number, directionY: number): Keyframe[] {
  const at = (scale: number, drift: number, rotate: number): string =>
    `translate(calc(-50% + ${directionX * drift}px), calc(-50% + ${directionY * drift}px)) ` +
    `scale(${scale}) rotate(${directionX * rotate}deg)`;
  return [
    { opacity: 0, transform: at(0.5, 0, -20) },
    { opacity: 1, transform: at(1.25, DRIFT_PX * 0.3, 8), offset: 0.3 },
    { opacity: 1, transform: at(1.1, DRIFT_PX * 0.6, 0), offset: 0.55 },
    { opacity: 0, transform: at(1.3, DRIFT_PX, 0) },
  ];
}

const FADE_FRAMES: Keyframe[] = [
  { opacity: 1, transform: "translate(-50%,-50%) scale(1.1)" },
  { opacity: 1, transform: "translate(-50%,-50%) scale(1.1)", offset: 0.4 },
  { opacity: 0, transform: "translate(-50%,-50%) scale(1.1)" },
];
