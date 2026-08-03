# EmptyState

The shared panel a view shows in place of its item list when every item is filtered out.

## Purpose

A board whose filters match nothing would otherwise render a blank rectangle, which readers
interpret as a failed load. This control states that the filters — not an error — are why the list
is empty, and tells the reader how to bring items back, so an intentionally narrow board never looks
broken. Both Sprint View and Project Tracking use it, so the two boards report the same situation the
same way.

## API

### `EmptyStateContent`

```typescript
interface EmptyStateContent {
  message: string; // Headline sentence stating that nothing matched
  hint: string; // Follow-up telling the reader how to bring items back
}
```

### `renderEmptyState(doc: Document, content: EmptyStateContent): HTMLElement`

Returns a `<div class="awesomeado-empty-state">` carrying `role="status"` so assistive technology
announces the change when a filter empties the board. It is styled inline (muted text inside a dashed
themed outline) so ADO's stylesheet can neither restyle nor hide it, and both lines are set through
`textContent`, never `innerHTML`.

## Example

```typescript
container.append(
  renderEmptyState(doc, {
    message: "No items match the current filters.",
    hint: "Clear or widen a filter to bring items back.",
  }),
);
```
