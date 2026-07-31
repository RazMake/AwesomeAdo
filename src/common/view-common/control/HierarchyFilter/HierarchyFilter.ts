import { createPopupHost } from "../popupHost/popupHost";

/** One selectable work item in a loaded parent chain. */
export interface HierarchyFilterOption {
  id: number;
  label: string;
  /** Zero-based tree depth; child rows are indented under their parent. */
  depth: number;
  /** Optional full-chain tooltip. */
  title?: string;
}

export interface HierarchyFilterOptions {
  items: readonly HierarchyFilterOption[];
  selectedId?: number | null;
  onChange?(selectedId: number | null): void;
}

export interface HierarchyFilterHandle {
  element: HTMLElement;
  selectedId(): number | null;
  setSelectedId(id: number | null): void;
}

/** Paint the fixed Project trigger without changing its footprint when a selection flips. */
function paintTrigger(
  trigger: HTMLButtonElement,
  selected: HierarchyFilterOption | undefined,
): void {
  const active = selected !== undefined;
  trigger.setAttribute("aria-pressed", String(active));
  trigger.title = active ? `Project filter: ${selected.label}` : "Filter by project parent";
  trigger.style.background = active ? "var(--communication-background)" : "transparent";
  trigger.style.color = active
    ? "var(--text-on-communication-background)"
    : "var(--text-primary-color)";
  trigger.style.borderColor = active
    ? "var(--communication-background)"
    : "var(--control-border-strong)";
}

/** Build the hierarchical radio list each time the popup opens. */
function renderPopup(params: {
  doc: Document;
  items: readonly HierarchyFilterOption[];
  selectedId: number | null;
  select(id: number | null): void;
  close(): void;
}): HTMLElement {
  const popup = params.doc.createElement("div");
  popup.className = "awesomeado-hierarchy-filter__popup";
  popup.setAttribute("role", "dialog");
  popup.setAttribute("aria-label", "Filter by project parent");
  popup.style.cssText = [
    "position:absolute",
    "top:100%",
    "left:0",
    "margin-top:4px",
    "min-width:260px",
    "max-width:min(440px,calc(100vw - 16px))",
    "max-height:320px",
    "overflow:auto",
    "padding:8px",
    "background:var(--callout-background-color)",
    "color:var(--text-primary-color)",
    "border:1px solid var(--control-border-strong)",
    "border-radius:6px",
    "box-shadow:0 2px 8px var(--shadow-subtle)",
    "font-size:12px",
    "z-index:1000",
  ].join(";");

  const clear = renderRow(params.doc, null, "All projects", 0, params.selectedId === null, () => {
    params.select(null);
    params.close();
  });
  clear.style.fontWeight = "600";
  popup.append(clear);
  for (const item of params.items) {
    popup.append(
      renderRow(
        params.doc,
        item.id,
        item.label,
        item.depth,
        params.selectedId === item.id,
        () => {
          params.select(item.id);
          params.close();
        },
        item.title,
      ),
    );
  }
  return popup;
}

/** Build one indented radio row. */
function renderRow(
  doc: Document,
  id: number | null,
  labelText: string,
  depth: number,
  checked: boolean,
  onSelect: () => void,
  title?: string,
): HTMLElement {
  const label = doc.createElement("label");
  label.className = "awesomeado-hierarchy-filter__option";
  label.dataset.itemId = id === null ? "" : String(id);
  label.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "padding:6px 8px",
    "border-radius:4px",
    "cursor:pointer",
    "white-space:nowrap",
  ].join(";");
  label.style.paddingLeft = `${8 + depth * 18}px`;
  if (title !== undefined) label.title = title;
  const radio = doc.createElement("input");
  radio.type = "radio";
  radio.name = "awesomeado-project-filter";
  radio.checked = checked;
  radio.style.cssText = "margin:0;accent-color:var(--communication-background)";
  radio.addEventListener("change", () => {
    if (radio.checked) onSelect();
  });
  label.addEventListener("mouseenter", () => {
    label.style.background = "var(--control-background-hover)";
  });
  label.addEventListener("mouseleave", () => {
    label.style.background = "transparent";
  });
  label.append(radio, doc.createTextNode(labelText));
  return label;
}

/** Render the Project button and its parent-chain popup. */
export function renderHierarchyFilter(
  doc: Document,
  options: HierarchyFilterOptions,
): HierarchyFilterHandle {
  const root = doc.createElement("span");
  root.className = "awesomeado-hierarchy-filter";
  root.style.cssText = "position:relative;display:inline-flex;align-items:center";

  const trigger = doc.createElement("button");
  trigger.type = "button";
  trigger.className = "awesomeado-hierarchy-filter__trigger";
  trigger.textContent = "Project";
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.disabled = options.items.length === 0;
  trigger.style.cssText = [
    "box-sizing:border-box",
    "height:27.2px",
    "display:inline-flex",
    "align-items:center",
    "border:1px solid var(--control-border-strong)",
    "border-radius:6px",
    "padding:0 9px",
    "font:inherit",
    "font-size:12px",
    "font-weight:600",
    "cursor:pointer",
  ].join(";");
  if (trigger.disabled) trigger.style.opacity = "0.55";
  root.append(trigger);

  let selectedId = options.items.some((item) => item.id === options.selectedId)
    ? (options.selectedId ?? null)
    : null;
  const selectedItem = (): HierarchyFilterOption | undefined =>
    options.items.find((item) => item.id === selectedId);
  const changed = (id: number | null): void => {
    selectedId = id;
    paintTrigger(trigger, selectedItem());
    options.onChange?.(selectedId);
  };
  paintTrigger(trigger, selectedItem());

  const popupHost = createPopupHost({
    doc,
    trigger,
    mountInto: root,
    interactive: options.items.length > 0,
    buildPopup: (close) =>
      renderPopup({ doc, items: options.items, selectedId, select: changed, close }),
  });

  return {
    element: root,
    selectedId: () => selectedId,
    setSelectedId: (id) => {
      selectedId = options.items.some((item) => item.id === id) ? id : null;
      popupHost.close();
      paintTrigger(trigger, selectedItem());
    },
  };
}
