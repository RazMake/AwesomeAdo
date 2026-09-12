import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import { buildWorkItemUrl } from "../../../common/ado/fetchAdoTree";
import { orderTrackedItems, workItemTypeTextColor } from "../../../common/ado/workItemTypes";
import type { OrderingPolicy } from "../../../common/ordering/ItemOrdering";
import type { DataDrivenViewContext } from "../../../common/view-common/EnhancedView";
import { renderChildItemsBadge } from "../../../common/view-common/control/ChildItemsBadge/ChildItemsBadge";

export function relatedCardIndex(
  entries: readonly { item: TrackedWorkItem; ancestors: readonly TrackedWorkItem[] }[],
  types: ReadonlyMap<string, TypeCatalogEntry>,
): ReadonlyMap<number, readonly TrackedWorkItem[]> {
  const index = new Map<number, TrackedWorkItem[]>();
  for (const { item, ancestors } of entries) {
    if (types.get(item.type)?.isPrimaryWork !== true) continue;
    for (const ancestor of ancestors) {
      const related = index.get(ancestor.id) ?? [];
      if (!related.some((candidate) => candidate.id === item.id)) related.push(item);
      index.set(ancestor.id, related);
    }
  }
  return index;
}

function relatedCardLink(
  context: DataDrivenViewContext,
  item: TrackedWorkItem,
  visible: boolean,
  close: () => void,
): HTMLButtonElement {
  const button = context.doc.createElement("button");
  button.type = "button";
  button.textContent = visible
    ? `#${item.id} ${item.title}`
    : `#${item.id} ${item.title} (Hidden by filters)`;
  button.disabled = !visible;
  button.style.cssText =
    "font:inherit;color:inherit;text-align:left;background:none;border:0;padding:0;overflow-wrap:anywhere;cursor:pointer";
  button.addEventListener("click", () => {
    const card = context.doc.querySelector<HTMLElement>(
      `.awesomeado-sprint-card[data-item-id="${item.id}"]`,
    );
    if (card === null) return;
    close();
    card.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    card.focus({ preventScroll: true });
    const highlightColor =
      context.doc.defaultView
        ?.getComputedStyle(card)
        .getPropertyValue("--status-blue-foreground")
        .trim() || "#0078d4";
    card.animate?.(
      [
        { outline: `3px solid ${highlightColor}`, offset: 0 },
        { outline: `3px solid ${highlightColor}`, offset: 0.8 },
        { outline: "3px solid transparent", offset: 1 },
      ],
      { duration: 3000, delay: 0 },
    );
    context.services.logger.info(`Sprint related card navigation: item=${item.id}.`);
  });
  return button;
}

export function renderSprintRelatedCards(
  context: DataDrivenViewContext,
  items: readonly TrackedWorkItem[],
  types: ReadonlyMap<string, TypeCatalogEntry>,
  visibleIds: ReadonlySet<number>,
  ordering: OrderingPolicy,
  onOpenChange: (open: boolean) => void,
): HTMLElement | null {
  if (items.length === 0) return null;
  const children = orderTrackedItems(items, (item) => item, ordering).map((item) => {
    const assignee = context.doc.createElement("span");
    assignee.textContent = item.assignedTo?.displayName ?? "Unassigned";
    const state = context.doc.createElement("span");
    state.textContent = item.state;
    return {
      title: item.title,
      titleColor: workItemTypeTextColor(types.get(item.type)?.color),
      done:
        types
          .get(item.type)
          ?.columns[3]?.states.some(
            (candidate) =>
              candidate.trim().toLocaleLowerCase() === item.state.trim().toLocaleLowerCase(),
          ) === true,
      assignee,
      eta: state,
      url: buildWorkItemUrl(context.doc.location.href, item.id),
      onRowReady: (_row: HTMLElement, title: HTMLElement, host: { close: () => void }) => {
        title
          .querySelector(".awesomeado-child-items__title-text")!
          .replaceChildren(relatedCardLink(context, item, visibleIds.has(item.id), host.close));
      },
    };
  });
  const root = renderChildItemsBadge(context.doc, {
    children,
    completedCount: children.filter(({ done }) => done).length,
    label: "Sub-items",
    onOpenChange,
  });
  root.classList.add("awesomeado-sprint-card__related");
  const badge = root.querySelector<HTMLElement>(".awesomeado-child-items__badge")!;
  badge.style.background = "var(--status-blue-background)";
  badge.style.borderColor = "var(--status-blue-border)";
  badge.style.color = "var(--status-blue-foreground)";
  return root;
}
