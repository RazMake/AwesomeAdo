# `content/views/shared`

Building blocks every enhanced view can reuse, so a view is assembled from shared, consistent parts
rather than reinventing them. This is where cross-view behaviour that does **not** yet exist — the
right-click context menu, the sprint selector, queued writes back to Azure DevOps — will live as it
arrives, alongside the view-agnostic shell below.

## Public API

### `ViewScaffold.ts` — the placeholder shell

- `ViewScaffoldContent` — `{ title, message }`.
- `renderViewScaffold(doc, content)` — builds the standard centered `<section class="awesomeado-view">`
  with a `.awesomeado-view__title` heading and a `.awesomeado-view__message` line, styled inline so
  ADO's stylesheet can neither restyle nor hide it.

Every new view starts by rendering this shell with its own title and one line of body copy; the
view-specific UI grows in later and replaces the body. Text is set via `textContent`, so a title or
message is never interpreted as HTML.
