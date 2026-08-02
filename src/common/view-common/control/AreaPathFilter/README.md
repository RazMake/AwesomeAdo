# AreaPathFilter Control

A compact, theme-aware multi-select for Azure DevOps area paths. The trigger keeps a button-sized
footprint and opens a checkbox popup through the shared [`popupHost`](../popupHost/README.md).

The control always receives and returns **full area paths**. Display labels use the shortest unique
suffix: a unique path renders as `API`; two paths ending in `API` expand only as far as needed, such
as `Platform › API` and `Commerce › API`. Each row's tooltip retains the full path.

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

Checkbox changes keep the popup open so several paths can be selected in one visit. Clicking outside,
pressing Escape, or toggling the trigger closes it; `onPopupClosed` lets a caller defer expensive
repainting until that dismissal while `onChange` still reports each selection immediately.

An active selection uses the same filled communication background and contrasting foreground as the
Project filter, plus a visible count badge. The trigger is disabled only when the caller offers no
area paths. The popup, checkbox accent, and hover state use shared control roles, so Dark, Light,
Blue, and Follow Azure DevOps remain consistent.
