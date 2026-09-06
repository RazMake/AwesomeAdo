/**
 * Rewrite the page's query string in place, leaving the path, the fragment, and the history state
 * exactly as they were.
 *
 * The entry is REPLACED rather than pushed: a view writing what it is showing back into the address
 * bar changes the view, not the place, and a Back button that walked backwards through filter
 * clicks would be worse than no history at all.
 *
 * `rewrite` is handed the current search string (leading `?` included) and must return the whole
 * replacement, so a view can only ever add its own parameters to the ones Azure DevOps put there.
 * An unchanged answer writes nothing, so a repaint that re-asserts the same state is free.
 */
export function replacePageSearch(doc: Document, rewrite: (search: string) => string): void {
  const view = doc.defaultView;
  if (view === null) return;
  const { pathname, search, hash } = view.location;
  const next = rewrite(search);
  if (next === search) return;
  view.history.replaceState(view.history.state, "", `${pathname}${next}${hash}`);
}
