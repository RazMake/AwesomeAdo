import type { ReconcileFeatureCrewMessage } from "../browser/FeatureCrewRequest";
import type { FeatureCrewApplyConfig } from "../browser/applyFeatureCrewInPage";

import {
  applyTagAssignments,
  FEATURE_CREW_AFFECTED_BY_REL,
  FEATURE_CREW_STATE,
  FEATURE_CREW_TITLE,
  type FeatureCrewMember,
  type FeatureCrewUrls,
  formatFeatureCrewDescription,
  mergeFeatureCrew,
  parseFeatureCrewDescription,
} from "./FeatureCrew";
import { ADO_API_VERSION } from "./adoApi";

/**
 * The decision layer of a Feature Crew reconcile: what the roster should become, and what the page
 * world should be asked to write.
 *
 * Kept here rather than in the background worker because both functions branch on data, and a wrong
 * branch is a user-visible bug (a hand-edited roster overwritten, or a create issued where an update
 * was needed). The worker is a composition root — it may wire these together and run the injections,
 * but the decisions themselves belong somewhere the test suite can reach.
 */

/**
 * The existing Feature Crew work item, as looked up in the ADO page's MAIN world.
 *
 * Named on purpose: this value crosses a trust boundary, because the injected lookup runs with the
 * page's own `fetch`/`JSON` (see `parseFeatureCrewLookup`).
 */
export interface FeatureCrewLookup {
  id: number;
  rev: number;
  description: string;
}

/**
 * Shape-check the value the MAIN-world lookup returned, or null when it is unusable.
 *
 * WHY this is not a cast: the injected function executes in the ADO page's realm, so the page — not
 * the extension — controls the globals that produce this value, and `id` is subsequently
 * concatenated into a credentialed request URL. A blanket `as` would let a garbled or hostile body
 * flow into privileged code as though the extension had produced it. A missing `description` is
 * tolerated (a roster item edited by hand may have none) and degrades to an empty roster.
 */
export function parseFeatureCrewLookup(value: unknown): FeatureCrewLookup | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as { id?: unknown; rev?: unknown; description?: unknown };
  if (!Number.isInteger(candidate.id) || (candidate.id as number) <= 0) {
    return null;
  }
  if (typeof candidate.rev !== "number" || !Number.isFinite(candidate.rev)) {
    return null;
  }
  return {
    id: candidate.id as number,
    rev: candidate.rev,
    description: typeof candidate.description === "string" ? candidate.description : "",
  };
}

/** The reconciled roster plus whether anything about it actually needs writing back. */
export interface ReconciledRoster {
  members: FeatureCrewMember[];
  description: string;
  changed: boolean;
}

/**
 * Merge the currently-assigned people into whatever roster already exists (a brand-new item starts
 * empty), then stamp any hand-picked tag choices onto it.
 *
 * `changed` is what protects a developer's hand-edited tags: when nobody new was added and no tag
 * moved there is nothing to write, so the stored description is left completely untouched rather
 * than rewritten into an equivalent-but-reformatted version.
 */
export function reconcileFeatureCrewRoster(
  found: Pick<FeatureCrewLookup, "description"> | null,
  message: Pick<ReconcileFeatureCrewMessage, "assignees" | "tagAssignments">,
): ReconciledRoster {
  const existing = found === null ? [] : parseFeatureCrewDescription(found.description);
  const merged = mergeFeatureCrew(existing, message.assignees);
  const tagged = applyTagAssignments(merged.members, message.tagAssignments ?? []);
  return {
    members: tagged.members,
    description: formatFeatureCrewDescription(tagged.members),
    changed: merged.changed || tagged.changed,
  };
}

/**
 * Build the config the MAIN-world writer runs: a missing item is created (two-step, since ADO
 * rejects a direct create into "Removed"), an existing one is patched by id.
 */
export function buildFeatureCrewApplyConfig(
  found: Pick<FeatureCrewLookup, "id"> | null,
  urls: FeatureCrewUrls,
  description: string,
): FeatureCrewApplyConfig {
  if (found === null) {
    return {
      mode: "create",
      url: urls.createUrl,
      description,
      title: FEATURE_CREW_TITLE,
      state: FEATURE_CREW_STATE,
      rootRelationUrl: urls.rootRelationUrl,
      affectedByRel: FEATURE_CREW_AFFECTED_BY_REL,
      itemBaseUrl: urls.itemBaseUrl,
    };
  }
  return {
    mode: "update",
    // Uses the shared API version rather than a second literal: this update URL and the create URL
    // built by `buildFeatureCrewUrls` must always target the same API.
    url: `${urls.itemBaseUrl}/${found.id}?api-version=${ADO_API_VERSION}`,
    description,
  };
}
