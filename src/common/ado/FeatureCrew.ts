import type { TrackedUser, TrackedWorkItem } from "./TrackedWorkItem";
import { resolveAdoProjectContext } from "./fetchAdoMetadata";

/**
 * The pure, chrome-free "Feature Crew" domain: the roster of everyone assigned to a project's work,
 * stored as the markdown description of a dedicated, permanently-`Removed` work item so ordinary
 * queries ignore it. This module holds only value logic (parse/format/merge the roster, derive an
 * alias, build the REST URLs); the credentialed reads/writes run in the ADO page's MAIN world (see
 * `src/common/browser/findFeatureCrewInPage.ts` / `applyFeatureCrewInPage.ts`).
 */

/** The fixed title of the Feature Crew work item — also the key the duplicate lookup searches by. */
export const FEATURE_CREW_TITLE = "Feature Crew";

/**
 * The Feature Crew item is parked in `Removed` on purpose: it is a data store, not tracked work, so
 * leaving it Removed keeps it out of the team's ordinary (Removed-excluding) queries.
 */
export const FEATURE_CREW_STATE = "Removed";

/**
 * The ADO relation added on the Feature Crew item pointing at the project root (the first configured
 * type, e.g. the Epic). `Affects-Reverse` is ADO's reference name for the "Affected By" link, so the
 * root reads as being *affected by* the crew roster — and the lookup uses this exact relation to tell
 * a real Feature Crew item apart from an unrelated same-titled one in another project.
 */
export const FEATURE_CREW_AFFECTED_BY_REL = "Microsoft.VSTS.Common.Affects-Reverse";

/** One roster line: the person plus the free-form tag the team uses to group crews. */
export interface FeatureCrewMember {
  /** Short handle shown first on the line — the email local-part when available. */
  alias: string;
  /** The person's display name, shown in parentheses. */
  fullName: string;
  /** Team/crew tag, manually assigned later by the developer; empty for a freshly added member. */
  tag: string;
}

/** A person assigned somewhere in the project, distilled to what a roster line needs. */
export interface FeatureCrewAssignee {
  alias: string;
  fullName: string;
}

/**
 * Derive a person's alias from their identity: the local-part of their email (before `@`) when the
 * unique name is an email, else the raw unique name, else the display name. Kept deterministic so the
 * same person always maps to the same roster key across loads.
 */
export function deriveAlias(uniqueName: string | null, displayName: string): string {
  if (uniqueName !== null && uniqueName.length > 0) {
    const at = uniqueName.indexOf("@");
    return at > 0 ? uniqueName.slice(0, at) : uniqueName;
  }
  return displayName;
}

/**
 * Walk the tree and collect the distinct people currently assigned to any item, in first-seen order.
 * Duplicates are removed by alias (case-insensitively) so one person appears once no matter how many
 * items they own. Unassigned items contribute nothing.
 */
export function collectFeatureCrewAssignees(roots: TrackedWorkItem[]): FeatureCrewAssignee[] {
  const seen = new Set<string>();
  const assignees: FeatureCrewAssignee[] = [];
  const visit = (item: TrackedWorkItem): void => {
    addAssignee(item.assignedTo, seen, assignees);
    for (const child of item.children) {
      visit(child);
    }
  };
  for (const root of roots) {
    visit(root);
  }
  return assignees;
}

function addAssignee(
  user: TrackedUser | null,
  seen: Set<string>,
  assignees: FeatureCrewAssignee[],
): void {
  if (user === null) {
    return;
  }
  const alias = deriveAlias(user.uniqueName, user.displayName);
  const key = alias.toLowerCase();
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  assignees.push({ alias, fullName: user.displayName });
}

/**
 * Enrich every assigned person in the tree with their Feature Crew tag, in place. The roster is the
 * one source of a person's tag, so this projects each member's tag onto the matching `assignedTo`
 * (matched by alias, case-insensitively). A person present in the tree but not (yet) in the roster —
 * or in the roster with an empty tag — is set to `null` so the view renders the neutral "??" pill
 * rather than leaving a stale value.
 */
export function applyFeatureCrewTags(roots: TrackedWorkItem[], members: FeatureCrewMember[]): void {
  const tagByAlias = new Map<string, string>();
  for (const member of members) {
    tagByAlias.set(member.alias.toLowerCase(), member.tag);
  }
  const visit = (item: TrackedWorkItem): void => {
    if (item.assignedTo !== null) {
      const alias = deriveAlias(item.assignedTo.uniqueName, item.assignedTo.displayName);
      const tag = tagByAlias.get(alias.toLowerCase());
      item.assignedTo.tag = tag !== undefined && tag.length > 0 ? tag : null;
    }
    for (const child of item.children) {
      visit(child);
    }
  };
  for (const root of roots) {
    visit(root);
  }
}

/**
 * Collect the distinct tags worn by assigned people across the tree, in first-seen order, so the
 * filter panel can offer one pill per tag actually in use. `null` (the neutral "??" bucket for
 * assigned-but-untagged people) is appended last when any assignee lacks a tag, so it always reads as
 * the trailing catch-all. Unassigned items contribute nothing — a tag filter only ever narrows to
 * people who wear that tag.
 */
export function collectAssignedTags(roots: TrackedWorkItem[]): (string | null)[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  let hasUntagged = false;
  const visit = (item: TrackedWorkItem): void => {
    if (item.assignedTo !== null) {
      const tag = item.assignedTo.tag;
      if (tag !== undefined && tag !== null && tag.length > 0) {
        if (!seen.has(tag)) {
          seen.add(tag);
          tags.push(tag);
        }
      } else {
        hasUntagged = true;
      }
    }
    for (const child of item.children) {
      visit(child);
    }
  };
  for (const root of roots) {
    visit(root);
  }
  return hasUntagged ? [...tags, null] : tags;
}

// One roster line: `- {alias} ({fullName}). `{tag}``. The tag always keeps its backticks even when
// empty so a later manual edit has an obvious slot to fill, and so the parser round-trips it.
const MEMBER_LINE = /^-\s+(.+?)\s+\((.*?)\)\.\s*`(.*?)`\s*$/;

/**
 * Parse a Feature Crew markdown description back into its roster. Lines that do not match the roster
 * shape (the `# Feature Crew` header, blank lines, anything hand-added) are ignored, so the parser is
 * tolerant of light manual editing. Entry order is preserved.
 */
export function parseFeatureCrewDescription(markdown: string): FeatureCrewMember[] {
  const members: FeatureCrewMember[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const match = MEMBER_LINE.exec(rawLine.trim());
    if (match) {
      members.push({ alias: match[1] ?? "", fullName: match[2] ?? "", tag: match[3] ?? "" });
    }
  }
  return members;
}

/**
 * Render the roster to the markdown stored in the work item's description. Always begins with the
 * `# Feature Crew` heading so the item is self-describing when opened in ADO.
 */
export function formatFeatureCrewDescription(members: FeatureCrewMember[]): string {
  const lines = ["# Feature Crew"];
  for (const member of members) {
    lines.push(`- ${member.alias} (${member.fullName}). \`${member.tag}\``);
  }
  return lines.join("\n");
}

/**
 * Merge the currently-assigned people into an existing roster: append anyone not already present
 * (matched by alias, case-insensitively) with an empty tag, and leave existing entries — and the
 * tags a developer set on them — untouched. `changed` is true only when at least one person was
 * added, so the caller can skip a pointless write when the roster already covers everyone.
 */
export function mergeFeatureCrew(
  existing: FeatureCrewMember[],
  assignees: FeatureCrewAssignee[],
): { members: FeatureCrewMember[]; changed: boolean } {
  const members = [...existing];
  const known = new Set(existing.map((member) => member.alias.toLowerCase()));
  let changed = false;
  for (const assignee of assignees) {
    const key = assignee.alias.toLowerCase();
    if (known.has(key)) {
      continue;
    }
    known.add(key);
    members.push({ alias: assignee.alias, fullName: assignee.fullName, tag: "" });
    changed = true;
  }
  return { members, changed };
}

/** A request to set one roster member's Feature Crew tag, matched to a person by alias. */
export interface FeatureCrewTagAssignment {
  /** The roster member's alias (matched case-insensitively). */
  alias: string;
  /** The tag to record; an empty string clears the member's tag back to untagged. */
  tag: string;
}

/**
 * Apply hand-picked tag choices onto an existing roster: for each assignment, set the matching
 * member's tag (matched by alias, case-insensitively). Only members already on the roster are
 * touched — an assignment for an unknown alias is ignored, so a tag can never conjure a floating
 * roster line for someone assigned to nothing. `changed` is true only when at least one tag actually
 * differs from what was stored, so the caller can skip a pointless write when nothing moved.
 */
export function applyTagAssignments(
  members: FeatureCrewMember[],
  assignments: FeatureCrewTagAssignment[],
): { members: FeatureCrewMember[]; changed: boolean } {
  const tagByAlias = new Map(assignments.map((a) => [a.alias.toLowerCase(), a.tag]));
  let changed = false;
  const next = members.map((member) => {
    const newTag = tagByAlias.get(member.alias.toLowerCase());
    if (newTag !== undefined && newTag !== member.tag) {
      changed = true;
      return { ...member, tag: newTag };
    }
    return member;
  });
  return { members: next, changed };
}

const API_VERSION = "7.1";

/** The REST URLs the Feature Crew reconcile needs, resolved from the ADO tab's project context. */
export interface FeatureCrewUrls {
  /** WIQL endpoint (POST) used to find an existing Feature Crew item by title/type/state. */
  wiqlUrl: string;
  /** Work-items create endpoint (POST) for the last configured type (`$`-prefixed in the path). */
  createUrl: string;
  /** Org-level work-items base (`.../workitems`) for reading a candidate and patching by id. */
  itemBaseUrl: string;
  /** The root work item's URL, used as the `Affected By` relation target. */
  rootRelationUrl: string;
}

/**
 * Build the Feature Crew REST URLs for the ADO tab named by `href`, targeting the given root id and
 * (last-configured) work item type, or null when `href` is not a project-scoped ADO location. Pure
 * so it is unit-testable; the credentialed fetches themselves run in the page's MAIN world.
 */
export function buildFeatureCrewUrls(
  href: string,
  rootId: number,
  typeName: string,
): FeatureCrewUrls | null {
  const resolved = resolveAdoProjectContext(href);
  if (resolved === null) {
    return null;
  }
  const { base, project } = resolved;
  const encodedType = encodeURIComponent(typeName);
  return {
    wiqlUrl: `${base}/${project}/_apis/wit/wiql?api-version=${API_VERSION}`,
    createUrl: `${base}/${project}/_apis/wit/workitems/$${encodedType}?api-version=${API_VERSION}`,
    itemBaseUrl: `${base}/_apis/wit/workitems`,
    rootRelationUrl: `${base}/_apis/wit/workItems/${rootId}`,
  };
}
