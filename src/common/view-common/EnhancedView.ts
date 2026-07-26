/**
 * The contract a view implements to paint its enhanced surface.
 *
 * A `ViewType` (see `ViewType.ts`) declares a view's *configuration*; an `EnhancedView` is its
 * *runtime behaviour* — the DOM it shows once a bound query resolves to that view. The two are kept
 * separate on purpose: the options binding form and settings import/export only need the config, so
 * they never pull a renderer (and its DOM code) into their bundle.
 */

import type { IFeatureCrewWriter } from "../ado/IFeatureCrewWriter";
import type { IUserDirectory } from "../ado/IUserDirectory";
import type {
  WorkItemFieldWriteRequest,
  WorkItemFieldWriteResult,
} from "../ado/IWorkItemFieldWriter";
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
   * Writes a single work item field back to Azure DevOps (e.g. `System.State` or a type's ETA date
   * field), using the item's last-known rev as an optimistic-concurrency guard. The write is atomic
   * and fails when the item was edited concurrently by someone else (its rev advanced), so the caller
   * can retry after refetching or report the stale-rev conflict to the user.
   */
  writeField(request: WorkItemFieldWriteRequest): Promise<WorkItemFieldWriteResult>;
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
