# ViewScaffold

The standard centered title + message shell every enhanced query view starts from.

## Purpose

Provides a consistent placeholder surface for new views: a title heading and one line of explanatory text. As a view grows, it replaces the message element with its delightful UI while keeping the title. Keeping this shell centralized means adding a view is just a title plus a line of text, and every view stays visually consistent.

## API

### `ViewScaffoldContent`

```typescript
interface ViewScaffoldContent {
  title: string; // The view's title, shown as the heading
  message: string; // One line describing what the view shows
  extensionVersion?: string; // Built version displayed in the bottom-right when provided
}
```

### `renderViewScaffold(doc: Document, content: ViewScaffoldContent): HTMLElement`

Creates a centered, self-contained scaffold in the given document. Returns a `<section>` element with inline styles so ADO's own stylesheet can neither restyle nor hide the surface, and nothing the extension injects leaks back into the ADO page.

**Theme awareness:** The scaffold uses `var(--text-primary-color, inherit)` to respect ADO's light/dark theme. The message line uses `opacity: 0.8` to inherit the themed color and appear muted.

When `extensionVersion` is supplied, the shared subdued
[version marker](../VersionLabel/README.md) is positioned at the bottom-right of the fallback
surface, showing the **Major.Minor** release only and linking to the store listing.

**XSS safety:** Title and message are set via `textContent` rather than `innerHTML`, preventing HTML injection.

## Example

```typescript
const scaffold = renderViewScaffold(document, {
  title: "Feature Crew",
  message: "Loading your work items...",
});
container.appendChild(scaffold);
```
