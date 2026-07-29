import { MENTION_COLOR, MENTION_COLOR_FALLBACK } from "../MarkdownText/MarkdownText";

import { createFieldLayer } from "./fieldMetrics";

/** The layer that paints the field's mentions; the editor repaints it as the text changes. */
export interface MentionHighlight {
  refresh(): void;
}

/** What the layer needs: where to mount, the field to shadow, and which runs are mentions. */
export interface MentionHighlightOptions {
  doc: Document;
  shell: HTMLElement;
  input: HTMLTextAreaElement;
  /** The mention labels currently standing in for an identity. */
  labels: () => readonly string[];
}

/**
 * Paint each `@Name` in the field the way a mention reads everywhere else in the extension.
 *
 * A `<textarea>` cannot style part of its own text, so the colour is drawn on a layer BEHIND it: the
 * field keeps its own glyphs, its caret, its selection and every editing behaviour, and the layer
 * only supplies what shows through the transparent parts of the text above it.
 *
 * Behind rather than in front, and coloured rather than bold, because both alternatives break the
 * field: hiding the field's own text makes every character depend on this layer landing in exactly
 * the right place, and a BOLD run is wider than the field believes it is, so the text would wrap
 * differently from the caret that moves through it.
 */
export function createMentionHighlight(options: MentionHighlightOptions): MentionHighlight {
  const { doc, shell, input } = options;
  const layer = createFieldLayer(doc, "awesomeado-text-editor__highlight", true);
  // Never a click target, and never over the text: every pointer event belongs to the field.
  layer.style.pointerEvents = "none";
  layer.style.overflow = "hidden";
  layer.style.color = "transparent";
  // Behind the field, whose own background must not hide it.
  input.style.background = "transparent";
  shell.insertBefore(layer, input);

  const refresh = (): void => {
    layer.replaceChildren(...paintRuns(doc, input.value, options.labels()));
    layer.scrollTop = input.scrollTop;
  };

  // A field that scrolls must take the layer with it, or the colour drifts off its own words.
  input.addEventListener("scroll", () => {
    layer.scrollTop = input.scrollTop;
  });

  refresh();
  return { refresh };
}

/** The field's text as plain runs and mention runs, in order. */
function paintRuns(doc: Document, text: string, labels: readonly string[]): Node[] {
  const nodes: Node[] = [];
  let index = 0;
  while (index < text.length) {
    const found = nextLabelAt(text, index, labels);
    if (found === null) {
      break;
    }
    if (found.at > index) {
      nodes.push(doc.createTextNode(text.slice(index, found.at)));
    }
    nodes.push(mentionRun(doc, found.label));
    index = found.at + found.label.length;
  }
  nodes.push(doc.createTextNode(text.slice(index)));
  return nodes;
}

/** The first mention at or after `from`, preferring the longest match so one name cannot mask another. */
function nextLabelAt(
  text: string,
  from: number,
  labels: readonly string[],
): { at: number; label: string } | null {
  let best: { at: number; label: string } | null = null;
  for (const label of labels) {
    const at = text.indexOf(label, from);
    if (at === -1) {
      continue;
    }
    if (best === null || at < best.at || (at === best.at && label.length > best.label.length)) {
      best = { at, label };
    }
  }
  return best;
}

/** One mention, in the colour it wears wherever else the extension shows author-written text. */
function mentionRun(doc: Document, label: string): HTMLElement {
  const run = doc.createElement("span");
  run.className = "awesomeado-text-editor__mention";
  run.textContent = label;
  // A rounded wash behind the name, not coloured glyphs: the field's own text is drawn on top of
  // this and keeps its colour, so the mention has to stand out from BEHIND the letters.
  run.style.cssText = [
    `background:color-mix(in srgb, ${MENTION_COLOR_FALLBACK} 45%, transparent)`,
    `outline:1px solid ${MENTION_COLOR}`,
    "border-radius:3px",
  ].join(";");
  return run;
}
