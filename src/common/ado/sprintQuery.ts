import type { TeamMember } from "./TeamMembers";
import type { TrackedUser, TrackedWorkItem } from "./TrackedWorkItem";

const CURRENT_SPRINT_MACRO = /(@Current(?:Iteration|Sprint)(?:\s*\([^)]*\))?)(?:\s*[+-]\s*\d+)?/gi;

/** Rewrite every current-sprint macro against the original saved query for one selected sprint. */
export function wiqlForSprint(wiql: string, offset: number): string {
  const suffix = offset === 0 ? "" : offset > 0 ? ` + ${offset}` : ` - ${Math.abs(offset)}`;
  return wiql.replace(CURRENT_SPRINT_MACRO, (_match, macro: string) => `${macro}${suffix}`);
}

function identityKey(identity: TrackedUser | TeamMember): string {
  return (identity.uniqueName ?? identity.displayName).trim().toLocaleLowerCase();
}

/** Keep roster-assigned or unassigned query items, retaining only the ancestors needed to reach them. */
export function filterTreeForSprintRoster(
  roots: readonly TrackedWorkItem[],
  members: readonly TeamMember[],
): TrackedWorkItem[] {
  const memberKeys = new Set(members.map(identityKey));

  const filterItem = (item: TrackedWorkItem): TrackedWorkItem | null => {
    const children = item.children
      .map(filterItem)
      .filter((child): child is TrackedWorkItem => child !== null);
    const belongsToRoster =
      item.assignedTo === null || memberKeys.has(identityKey(item.assignedTo));
    return belongsToRoster || children.length > 0 ? { ...item, children } : null;
  };

  return roots.map(filterItem).filter((item): item is TrackedWorkItem => item !== null);
}
