import type { TeamMember } from "../../../common/ado/TeamMembers";
import type { SprintWindow } from "../../../common/ado/sprintWindow";

/** The sprint and person selection a Sprint View link carries, read and written in both directions. */
export interface SprintUrlPreferences {
  /** The sprint to open, named either by its sprint name or by its full iteration path. */
  sprint: string | null;
  /** The people to select in the Assigned To filter; empty when the link names nobody. */
  assignedTo: string[];
}

const SPRINT_PARAM = "sprint";
const ASSIGNED_TO_PARAM = "assignedTo";
const ALIAS_SEPARATOR = ",";

/** The Unassigned bucket's name in a link: a real filter choice, but not a person. */
const UNASSIGNED_ALIAS = "unassigned";

function readSprint(parameters: URLSearchParams): string | null {
  const value = parameters.get(SPRINT_PARAM)?.trim() ?? "";
  return value.length === 0 ? null : value;
}

function readAliases(parameters: URLSearchParams): string[] {
  return parameters
    .getAll(ASSIGNED_TO_PARAM)
    .flatMap((value) => value.split(ALIAS_SEPARATOR))
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);
}

/**
 * Read the board's opening preferences from the ADO page's query string.
 *
 * Takes the search string rather than the whole URL so nothing here can throw: a preference the
 * board merely starts from must never be able to break the page it opens.
 */
export function readSprintUrlPreferences(search: string): SprintUrlPreferences {
  const parameters = new URLSearchParams(search);
  return { sprint: readSprint(parameters), assignedTo: readAliases(parameters) };
}

function applyParameter(parameters: URLSearchParams, name: string, value: string): void {
  if (value.length === 0) parameters.delete(name);
  else parameters.set(name, value);
}

/**
 * Rewrite a query string so it carries exactly these preferences, leaving every other parameter ADO
 * put there untouched.
 */
export function sprintSearchWith(search: string, preferences: SprintUrlPreferences): string {
  const parameters = new URLSearchParams(search);
  applyParameter(parameters, SPRINT_PARAM, preferences.sprint ?? "");
  applyParameter(parameters, ASSIGNED_TO_PARAM, preferences.assignedTo.join(ALIAS_SEPARATOR));
  const value = parameters.toString();
  return value.length === 0 ? "" : `?${value}`;
}

/**
 * Resolve a requested sprint to the window entry's raw name — the value every sprint filter matches
 * on — or null when the team's window holds no such sprint.
 *
 * A link is typed by a person, so the request is accepted as either the sprint name or its full
 * iteration path in any casing. An exact name still wins outright, so a picker selection flowing
 * back through here can never be re-resolved to a different sprint.
 */
export function resolveSprintName(window: SprintWindow, requested: string | null): string | null {
  if (requested === null) return null;
  if (window.entries.some((entry) => entry.name === requested)) return requested;
  const wanted = requested.trim().toLocaleLowerCase();
  const matched = window.entries.find(
    (entry) =>
      entry.name.toLocaleLowerCase() === wanted || entry.path.toLocaleLowerCase() === wanted,
  );
  return matched?.name ?? null;
}

/** The shortest stable name a link should carry for one roster member. */
function memberUrlAlias(member: TeamMember): string {
  const uniqueName = member.uniqueName?.trim() ?? "";
  const separator = uniqueName.indexOf("@");
  if (separator > 0) return uniqueName.slice(0, separator);
  return uniqueName.length > 0 ? uniqueName : member.displayName.trim();
}

/** Every name one roster member answers to: display name, sign-in address, and its alias. */
function memberAliases(member: TeamMember): string[] {
  return [
    member.displayName.trim().toLocaleLowerCase(),
    member.uniqueName?.trim().toLocaleLowerCase() ?? "",
    memberUrlAlias(member).toLocaleLowerCase(),
  ].filter((alias) => alias.length > 0);
}

/** The aliases a link carries for a board's person selection. */
export function urlAliasesFor(
  members: readonly TeamMember[],
  includesUnassigned: boolean,
): string[] {
  const aliases = members.map(memberUrlAlias);
  if (includesUnassigned) aliases.push(UNASSIGNED_ALIAS);
  return aliases;
}

/** A link's requested people, resolved against the roster that can identify them. */
export interface RequestedPeople {
  /** The roster members the link names, in roster order. */
  members: TeamMember[];
  /** Whether the link also asks for the Unassigned bucket. */
  includesUnassigned: boolean;
}

/** Resolve requested aliases, sign-in addresses, and display names against the team's roster. */
export function matchRequestedPeople(
  members: readonly TeamMember[],
  aliases: readonly string[],
): RequestedPeople {
  const wanted = aliases.map((alias) => alias.trim().toLocaleLowerCase());
  return {
    members: members.filter((member) =>
      memberAliases(member).some((alias) => wanted.includes(alias)),
    ),
    includesUnassigned: wanted.includes(UNASSIGNED_ALIAS),
  };
}
