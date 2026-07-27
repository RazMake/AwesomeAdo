/**
 * Resolves the identity GUIDs an `@`-mention is stored as into the names a reader recognizes.
 *
 * Azure DevOps stores a mention as a bare GUID in both a work item's description and a discussion
 * note. ADO resolves it for its own rendering, but the stored source a view has to render does not
 * carry the name — so without a directory every mention shows as an anonymous placeholder.
 *
 * Deliberately separate from `IUserDirectory` (Interface Segregation): that one SEARCHES for people
 * a user is choosing between, which is an interactive, per-keystroke concern. This one answers
 * "who are these specific ids?" in bulk for content that is already written.
 */
export interface IMentionDirectory {
  /**
   * Resolve `ids` to display names, keyed by LOWERCASE GUID.
   *
   * Bulk by contract: a board's descriptions and notes are collected first and asked about together,
   * because resolving one name per mention would cost a request per mentioned person, per item.
   * Ids that cannot be resolved are simply absent from the result — a caller renders those as a
   * neutral placeholder rather than exposing a raw identity id. Never rejects: a directory failure
   * degrades to unresolved names, never to a view that fails to paint.
   */
  resolveNames(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;

  /**
   * The names resolved so far, without asking anything.
   *
   * Rendering is synchronous, so a view needs to hand `MarkdownText` a map at the moment it paints.
   * This is that map: whatever a preceding `resolveNames` established. Kept separate from the async
   * call so a repaint (a re-sort, a filter change, a drag) costs nothing.
   */
  knownNames(): ReadonlyMap<string, string>;
}
