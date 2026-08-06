# AreaPathFilter Control

A compact, theme-aware multi-select for Azure DevOps area paths. It is the shared
[`CheckboxFilter`](../CheckboxFilter/README.md) given the area-path vocabulary, so its trigger,
popup, and dismissal behave identically to every other filter in a view header.

The control always receives and returns **full area paths**. Display labels use the shortest unique
suffix: a unique path renders as `API`; two paths ending in `API` expand only as far as needed, such
as `Platform › API` and `Commerce › API`. Each row's tooltip retains the full path. No quick-search
is offered: the labels are already collapsed to the text a reader would have typed.

## Usage

```typescript
const filter = renderAreaPathFilter(document, {
  areaPaths: ["Project\\Platform\\API", "Project\\Commerce\\API"],
  selectedAreaPaths: session.selectedAreaPaths,
  onChange: (selected) => filterItems(selected),
});

header.append(filter.element);
```

`selectedAreaPaths()` reads the current full-path selection. `setSelectedAreaPaths(paths)` replaces
it without firing `onChange`. Blank, duplicate, and unavailable paths are ignored.

`label` renames the trigger (Sprint View calls it `Lanes`); `fixedTitle` pins the tooltip so a
renamed button always names the field it narrows, whatever is selected. The accessible name still
follows the current condition.

Checkbox changes keep the popup open so several paths can be selected in one visit. Clicking outside,
pressing Escape, or toggling the trigger closes it; `onPopupClosed` lets a caller defer expensive
repainting until that dismissal while `onChange` still reports each selection immediately.

`clearOnTriggerWhenActive` makes the trigger empty the selection instead of reopening the popup while
anything is chosen — the one-press way out of a filter the reader mostly wants to be rid of. Project
Tracking sets it, because its selection is a transient reading position; leave it off where the
selection is team configuration the reader narrows down step by step (Sprint's Lanes), since it costs
them the ability to adjust a live selection without rebuilding it. With it on, the popup drops its own
Clear so one gesture is not offered twice.

An active selection uses the same filled communication background and contrasting foreground as the
Project filter, plus a visible count badge. The trigger is disabled only when the caller offers no
area paths. The popup, checkbox accent, and hover state use shared control roles, so Dark, Light,
Blue, and Follow Azure DevOps remain consistent.
