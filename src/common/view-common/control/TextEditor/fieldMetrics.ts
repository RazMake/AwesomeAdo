/**
 * The text metrics the field and every layer laid over it must share.
 *
 * Declared once, as literal CSS, rather than measured from the field at runtime: an editor is built
 * DETACHED and mounted by its caller, and a detached element measures 0 and computes no style at
 * all. A layer sized from those readings is clipped to nothing, which is how a field's text can end
 * up invisible while every element involved looks perfectly correct in the DOM.
 */
export const FIELD_TEXT_STYLE = [
  "font:inherit",
  "font-size:11px",
  "padding:4px 6px",
  // The WIDTH is what insets the text; the colour is the field's own business.
  "border:1px solid transparent",
  "box-sizing:border-box",
  "white-space:pre-wrap",
  "overflow-wrap:break-word",
];

/**
 * A layer laid over the field, wrapping its text exactly as the field does.
 *
 * Stretched to its container with `inset` rather than a measured width and height, so it is right
 * the moment it is built and stays right when the field is dragged taller by its own resize handle.
 * `stretch` is false for a layer that must keep its natural height because something is measured
 * from it.
 */
export function createFieldLayer(doc: Document, className: string, stretch: boolean): HTMLElement {
  const layer = doc.createElement("div");
  layer.className = className;
  // Never announced: the field beside it already carries the same text for assistive technology.
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = [
    "position:absolute",
    "top:0",
    "left:0",
    "right:0",
    ...(stretch ? ["bottom:0"] : []),
    ...FIELD_TEXT_STYLE,
  ].join(";");
  return layer;
}
