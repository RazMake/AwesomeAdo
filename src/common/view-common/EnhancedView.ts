/**
 * The contract a view implements to paint its enhanced surface.
 *
 * A `ViewType` (see `ViewType.ts`) declares a view's *configuration*; an `EnhancedView` is its
 * *runtime behaviour* — the DOM it shows once a bound query resolves to that view. The two are kept
 * separate on purpose: the options binding form and settings import/export only need the config, so
 * they never pull a renderer (and its DOM code) into their bundle.
 */

import type { IFeatureCrewWriter } from "../ado/IFeatureCrewWriter";
import type { IMentionDirectory } from "../ado/IMentionDirectory";
import type { INoteActivityReader } from "../ado/INoteActivityReader";
import type { IUserDirectory } from "../ado/IUserDirectory";
import type {
  WorkItemFieldWriteRequest,
  WorkItemFieldWriteResult,
} from "../ado/IWorkItemFieldWriter";
import type { IWorkItemNoteLoader } from "../ado/IWorkItemNoteLoader";
import type { IWorkItemNoteWriter } from "../ado/IWorkItemNoteWriter";
import type { WorkItemReorderRequest, WorkItemReorderResult } from "../ado/IWorkItemReorderWriter";
import type { WorkItemTreeResult } from "../ado/IWorkItemTreeLoader";
import type { TypeCatalogEntry } from "../ado/TrackedWorkItem";
import type { SprintWindow } from "../ado/sprintWindow";
import type { ILogger } from "../logging/ILogger";

/**
 * Data-loading and cross-view services injected into data-driven views.
 *
 * Singletons wired once at the composition root, not per-request: a tree loader, user directory,
 * type catalog, sprint roster, logger, and clock. Placeholder views (and tests) receive undefined;
 * production views that need data receive a live implementation.
 */
export interface EnhancedViewServices {
  /** Load a tree query's work items into the normalized model. */
  loadTree(queryId: string): Promise<WorkItemTreeResult>;
  /** Search and resolve ADO identities (for assignee-pickers and user resolution). */
  userDirectory: IUserDirectory;
  /**
   * Resolves the identity GUIDs an `@`-mention is stored as into display names, in bulk.
   *
   * Separate from `userDirectory` (Interface Segregation): that one searches for a person a user is
   * choosing between, this one answers "who are these ids?" for content that is already written.
   * Without it every mention in a description or a note renders as an anonymous placeholder.
   */
  mentionDirectory: IMentionDirectory;
  /**
   * The ordered type catalog (Epic, Feature, Story, Bug, …); index 0 is the root (epic) type.
   * Matches the configured work item types in settings.
   */
  getTypes(): TypeCatalogEntry[];
  /**
   * The team's global board columns in order (e.g. In Queue → In Progress → Waiting → Done →
   * Removed). A status's color is keyed off its position in this list so the same board column reads
   * identically for every work-item type.
   */
  getBoardColumns(): string[];
  /**
   * Load the current team's sprint window: the iterations around the current one (bounded by the
   * configured past/future sprint counts), each labelled by its offset ("Current", "Next",
   * "2 sprints ago", …), plus the name to select by default. This is the single shared entry point
   * every sprint-filtering view uses to populate its sprint picker; the composition root owns the
   * fetch + windowing so views only render the result. Resolves to an empty window when no team is
   * configured or the fetch fails.
   */
  loadSprintWindow(): Promise<SprintWindow>;
  /** The reference clock (injected so views can compute "now" deterministically). */
  now(): Date;
  /** The logger for view-level diagnostics. */
  logger: ILogger;
  /**
   * Creates or updates the project's "Feature Crew" work item — the permanently-`Removed`,
   * roster-holding item linked to the root — so a data-driven view can keep it in sync with everyone
   * currently assigned across the project's work.
   */
  featureCrew: IFeatureCrewWriter;
  /**
   * Reads a work item's discussion notes (and tells the view who is reading them, so it can offer
   * editing only on the notes that person wrote).
   */
  noteLoader: IWorkItemNoteLoader;
  /**
   * Reads only the DATE of each item's newest comment, for many items at once.
   *
   * Separate from `noteLoader` (Interface Segregation): showing one item's discussion and asking
   * "which of these were talked about lately?" are different capabilities with wildly different
   * costs. Answering the second through the first meant two credentialed fetches and up to 200
   * rendered comments per item, one round-trip at a time.
   */
  noteActivity: INoteActivityReader;
  /**
   * Posts new discussion notes and rewrites existing ones. Separate from `noteLoader` (Interface
   * Segregation): showing notes and authoring them are different capabilities, and only some views
   * offer the second.
   */
  noteWriter: IWorkItemNoteWriter;
  /**
   * Writes a single work item field back to Azure DevOps (e.g. `System.State` or a type's ETA date
   * field), using the item's last-known rev as an optimistic-concurrency guard. The write is atomic
   * and fails when the item was edited concurrently by someone else (its rev advanced), so the caller
   * can retry after refetching or report the stale-rev conflict to the user.
   */
  writeField(request: WorkItemFieldWriteRequest): Promise<WorkItemFieldWriteResult>;
  /**
   * Moves a work item to a new position among its siblings and, when it changed, under a new parent
   * — the persistence behind drag-reordering a tree view. Azure DevOps owns the rank arithmetic, so
   * the caller names the neighbours the item lands between rather than computing a rank itself.
   *
   * Kept separate from `writeField` because it is not a field patch: it moves the item's hierarchy
   * LINK and re-ranks it through a team-scoped backlog endpoint.
   */
  reorderItem(request: WorkItemReorderRequest): Promise<WorkItemReorderResult>;
  /**
   * The team whose backlog order applies, or `null` when no team is configured. Backlog rank is
   * per-team in Azure DevOps, so a view must refuse to reorder rather than guess a team — a move
   * ranked against the wrong team's backlog silently reorders someone else's board.
   */
  currentTeam(): string | null;
  /**
   * Opens the extension's Diagnostics log filtered to errors.
   *
   * A view can only summarize a failure in the space it has (the board's "Couldn't save…" chip shows
   * a count, not a cause), so it needs a way to hand the user the recorded detail. A view cannot open
   * an extension page itself — the content world has to ask the service worker — so the round-trip is
   * injected here rather than reached for.
   */
  openDiagnosticsLog(): void;
}

/** Everything a view needs to render, injected so a view never reaches for a global (Dependency Inversion). */
export interface EnhancedViewContext {
  /** The document the view builds its DOM in. */
  doc: Document;
  /** The bound query's id, so a view can scope what it fetches and shows. */
  queryId: string;
  /**
   * The binding's resolved per-query property values, keyed by `ViewTypeProperty.key`. The same
   * view bound to two queries can therefore render differently.
   */
  properties: Record<string, string>;
  /**
   * Injected data/services for data-driven views (tree loader, user directory, type catalog, sprints,
   * clock, logger). Absent for placeholder views — views that need data must check this before using
   * it and fall back to a "not configured" message when missing.
   */
  services?: EnhancedViewServices;
}

/**
 * An `EnhancedViewContext` whose services are known to be present.
 *
 * A data-driven view checks `services` once at its entry point and degrades there; every helper
 * below that point takes this type instead of re-checking. Without it the checks multiply into
 * branches that cannot be reached in production (the content composition root always supplies
 * services), and the first inconvenient one gets bypassed with a non-null assertion — a
 * contradiction the type system can otherwise neither see nor prevent.
 */
export type DataDrivenViewContext = EnhancedViewContext & { services: EnhancedViewServices };

/** A renderable enhanced view: the surface AwesomeADO paints in place of ADO's own query page. */
export interface EnhancedView {
  /** Matches the owning `ViewType.id`, so the registry resolves a binding's view to its renderer. */
  readonly id: string;
  /**
   * Build the DOM for this view. The caller (the content surface) mounts the returned node and owns
   * its lifecycle, so a view returns a fresh element each call and never caches document-scoped state.
   */
  render(context: EnhancedViewContext): HTMLElement;
}
