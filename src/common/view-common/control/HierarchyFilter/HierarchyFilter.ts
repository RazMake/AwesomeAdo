import { renderItemTypeIcon } from "../ItemTypeIcon/ItemTypeIcon";
import { createPopupHost } from "../popupHost/popupHost";

/** One selectable work item in a loaded parent chain. */
export interface HierarchyFilterOption {
  id: number;
  label: string;
  /** Raw work-item title used by quick search, without its type prefix. */
  title: string;
  /** Work-item type name announced by its icon. */
  typeName: string;
  /** ADO's work-item type icon URL, or null for the shared colored fallback. */
  iconUrl: string | null;
  /** Work-item type color. */
  color: string;
  /** Zero-based tree depth; child rows are indented under their parent. */
  depth: number;
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
    "box-sizing:border-box",
    "width:max-content",
    "min-width:min(260px,calc(100vw - 16px))",
    "max-width:calc(100vw - 16px)",
    "max-height:320px",
    "overflow:hidden",
    "padding:8px",
    "background:var(--callout-background-color)",
    "color:var(--text-primary-color)",
    "border:1px solid var(--control-border-strong)",
    "border-radius:6px",
    "box-shadow:0 2px 8px var(--shadow-subtle)",
    "font-size:12px",
    "z-index:1000",
  ].join(";");

  const search = params.doc.createElement("input");
  search.type = "search";
  search.className = "awesomeado-hierarchy-filter__search";
  search.placeholder = "Find a project";
  search.setAttribute("aria-label", "Find a project by title");
  search.style.cssText = [
    "box-sizing:border-box",
    "width:100%",
    "margin-bottom:6px",
    "padding:5px 7px",
    "color:var(--text-primary-color)",
    "background:var(--control-background-muted)",
    "border:1px solid var(--control-border-strong)",
    "border-radius:4px",
    "font:inherit",
  ].join(";");

  const list = params.doc.createElement("div");
  list.className = "awesomeado-hierarchy-filter__list";
  list.style.cssText = "max-height:260px;overflow:auto";

  const clear = renderRow(params.doc, null, "All projects", 0, params.selectedId === null, () => {
    params.select(null);
    params.close();
  });
  clear.style.fontWeight = "600";
  const renderItems = (): void => {
    const rows = matchingItems(params.items, search.value).map((item) =>
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
        item.color,
        item.typeName,
        item.iconUrl,
      ),
    );
    list.replaceChildren(clear, ...rows);
  };
  search.addEventListener("input", renderItems);
  renderItems();
  popup.append(search, list);
  return popup;
}

/** Match item titles while retaining their visible ancestor chain. */
function matchingItems(
  items: readonly HierarchyFilterOption[],
  searchText: string,
): HierarchyFilterOption[] {
  const query = searchText.trim().toLocaleLowerCase();
  if (query.length === 0) return [...items];

  const ancestors: (HierarchyFilterOption | undefined)[] = [];
  const visibleIds = new Set<number>();
  for (const item of items) {
    ancestors.length = item.depth;
    if (item.title.toLocaleLowerCase().includes(query)) {
      for (const ancestor of ancestors) {
        if (ancestor !== undefined) visibleIds.add(ancestor.id);
      }
      visibleIds.add(item.id);
    }
    ancestors[item.depth] = item;
  }
  return items.filter((item) => visibleIds.has(item.id));
}

/** Retain the work-item type hue while pulling its text toward each theme's readable foreground. */
function readableTypeColor(color: string): string {
  return `color-mix(in srgb, ${color} 60%, var(--text-primary-color))`;
}

/** Build one indented radio row. */
function renderRow(
  doc: Document,
  id: number | null,
  labelText: string,
  depth: number,
  checked: boolean,
  onSelect: () => void,
  color?: string,
  typeName?: string,
  iconUrl?: string | null,
): HTMLElement {
  const label = doc.createElement("label");
  label.className = "awesomeado-hierarchy-filter__option";
  label.dataset.itemId = id === null ? "" : String(id);
  label.style.cssText = [
    "display:flex",
    "align-items:center",
    "gap:8px",
    "box-sizing:border-box",
    "width:100%",
    "min-width:0",
    "padding:6px 8px",
    "border-radius:4px",
    "font-weight:600",
    "cursor:pointer",
  ].join(";");
  label.style.paddingLeft = `${8 + depth * 18}px`;
  if (color !== undefined) label.style.color = readableTypeColor(color);
  const radio = doc.createElement("input");
  radio.type = "radio";
  radio.name = "awesomeado-project-filter";
  radio.checked = checked;
  radio.style.cssText = "flex:0 0 auto;margin:0;accent-color:var(--communication-background)";
  radio.addEventListener("change", () => {
    if (radio.checked) onSelect();
  });
  label.addEventListener("mouseenter", () => {
    label.style.background = "var(--control-background-hover)";
  });
  label.addEventListener("mouseleave", () => {
    label.style.background = "transparent";
  });
  const text = doc.createElement("span");
  text.className = "awesomeado-hierarchy-filter__label";
  text.textContent = labelText;
  text.title = labelText;
  text.style.cssText = [
    "display:block",
    "flex:1 1 auto",
    "min-width:0",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "white-space:nowrap",
  ].join(";");
  label.append(radio);
  if (typeName !== undefined) {
    const icon = renderItemTypeIcon(doc, {
      iconUrl: iconUrl ?? null,
      color: color ?? null,
      typeName,
    });
    icon.element.style.marginRight = "0";
    label.append(icon.element);
  }
  label.append(text);
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
    interactive: false,
    buildPopup: (close) =>
      renderPopup({ doc, items: options.items, selectedId, select: changed, close }),
    onOpened: (popup) => popup.querySelector<HTMLInputElement>("input[type=search]")?.focus(),
  });
  if (options.items.length > 0) {
    trigger.addEventListener("click", () => {
      if (selectedId !== null) {
        changed(null);
        return;
      }
      popupHost.toggle();
    });
  }

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
