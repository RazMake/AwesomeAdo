import type { TrackedWorkItem, TypeCatalogEntry } from "../../../../common/ado/TrackedWorkItem";
import { hydrateTrackedWorkItem } from "../../../../common/ado/fetchAdoTree";
import {
  primaryWorkAncestors,
  primaryWorkTypes,
  typesAbove,
} from "../../../../common/ado/workItemTypes";
import type { ItemContextMenuCommand } from "../../../../common/view-common/control/ItemContextMenu/ItemContextMenu";

/** What the "add a child" command needs to know about the item it would create one under. */
export interface NewChildCommandOptions {
  /** The item the new one is born under: the board's root, or a row on it. */
  parent: TrackedWorkItem;
  /** The configured type catalog, which is what decides a child of the parent's type. */
  types: ReadonlyMap<string, TypeCatalogEntry>;
  /** Whether the box that asks for the title is already open under this parent. */
  adding: boolean;
  /** Opens that box. */
  onAdd(): void;
}

/**
 * The type a new child is created as: the FIRST allowed child type of its parent's type.
 *
 * The catalog stores allowed children in priority order and treats the first as the default (the
 * same one a hierarchy drag re-types an item to), so taking it here is what keeps "add" and "drag"
 * from disagreeing about what belongs under a given item. Null when the parent's type is unknown or
 * has no configured children — the command then says so instead of asking for a title it could not
 * use.
 */
export function childTypeOf(
  parent: TrackedWorkItem,
  types: ReadonlyMap<string, TypeCatalogEntry>,
): string | null {
  return types.get(parent.type)?.children?.[0] ?? null;
}

/**
 * The first configured child type under `parent` that IS the delivery the team tracks, or null when
 * this level holds only more planning.
 *
 * Taken instead of `childTypeOf` wherever the command being offered is about raising WORK: a type
 * whose children mix planning with delivery would otherwise create another planning item under a
 * command that promised the opposite.
 */
export function primaryChildTypeOf(
  parent: TrackedWorkItem,
  types: ReadonlyMap<string, TypeCatalogEntry>,
): string | null {
  const primary = primaryWorkTypes([...types.values()]);
  return types.get(parent.type)?.children?.find((child) => primary.has(child)) ?? null;
}

/** The label of each row-level "add a child" command, named for what the reader is adding. */
export type NewChildLabel = "New work identified" | "New deliverable" | "New project";

/** What a row's "add a child" command is called and which type it creates. */
export interface NewChildOffer {
  label: NewChildLabel;
  childType: string;
}

/** The configured types playing each creation role, derived once from the catalog. */
interface CreationLevels {
  /** The type whose children are newly identified work, or null when none is configured. */
  work: string | null;
  /** The types that hold deliverables (work-level items) directly. */
  deliverableParents: ReadonlySet<string>;
  /** Every type above a deliverable parent: where new projects are raised. */
  projectParents: ReadonlySet<string>;
}

/**
 * Picks the configured level for each creation command.
 *
 * The work level is the LAST planning type (not Primary work, yet leading down to it) in the order
 * the team configured its types: a team lists its hierarchy top-down, so the last planning type is
 * the one sitting directly above the delivery. Types below primary work are never candidates — a
 * Task is not where new work is identified.
 */
function creationLevels(types: ReadonlyMap<string, TypeCatalogEntry>): CreationLevels {
  const catalog = [...types.values()];
  const planning = primaryWorkAncestors(catalog);
  const work =
    catalog.filter((type) => type.isPrimaryWork !== true && planning.has(type.name)).at(-1)?.name ??
    null;
  if (work === null) {
    return { work, deliverableParents: new Set(), projectParents: new Set() };
  }
  const deliverableParents = new Set(
    catalog.filter((type) => type.children?.includes(work) === true).map((type) => type.name),
  );
  return {
    work,
    deliverableParents,
    projectParents: typesAbove(catalog, deliverableParents),
  };
}

/**
 * Which "add a child" command a row offers, or null when its level is not one new items are raised
 * under.
 *
 * Checked from the bottom up so a type that recurs at several levels takes its lowest role: the
 * command nearest the delivery is the one the reader most often needs.
 */
export function newChildOfferFor(
  parent: TrackedWorkItem,
  types: ReadonlyMap<string, TypeCatalogEntry>,
): NewChildOffer | null {
  const levels = creationLevels(types);
  if (levels.work === null) return null;
  const children = types.get(parent.type)?.children ?? [];
  if (parent.type === levels.work) {
    return offerOf("New work identified", primaryChildTypeOf(parent, types) ?? children[0]);
  }
  if (levels.deliverableParents.has(parent.type)) {
    return offerOf("New deliverable", levels.work);
  }
  if (levels.projectParents.has(parent.type)) {
    return offerOf("New project", projectChildTypeOf(children, levels));
  }
  return null;
}

/**
 * The type a new project is created as under one of `children`'s parent.
 *
 * Directly above the deliverable parents a project is one of them; further up, the child on the way
 * down to them is the only type that keeps the new project inside the hierarchy.
 */
function projectChildTypeOf(
  children: readonly string[],
  levels: CreationLevels,
): string | undefined {
  return (
    children.find((child) => levels.deliverableParents.has(child)) ??
    children.find((child) => levels.projectParents.has(child))
  );
}

function offerOf(label: NewChildLabel, childType: string | undefined): NewChildOffer | null {
  return childType === undefined ? null : { label, childType };
}

/**
 * The type a child added under `parent` is created as on a board offering the leveled commands:
 * the type its row command promises, else the parent's default child type.
 */
export function newChildTypeOf(
  parent: TrackedWorkItem,
  types: ReadonlyMap<string, TypeCatalogEntry>,
): string | null {
  return newChildOfferFor(parent, types)?.childType ?? childTypeOf(parent, types);
}

/**
 * The command that adds a child under `parent`, labelled for the level it sits on.
 *
 * Built here rather than inside the shared menu because what "a child" means is a fact about THIS
 * board's configured hierarchy — which type the process allows underneath the parent, and whether
 * the box that asks for a title is already on screen. The menu only shows it.
 */
export function buildNewChildCommand(
  label: string,
  options: NewChildCommandOptions,
): ItemContextMenuCommand {
  return {
    label,
    separatorBefore: true,
    disabledReason: refusal(options),
    run: options.onAdd,
  };
}

/** Why a child cannot be added right now, or null when it can. */
function refusal(options: NewChildCommandOptions): string | null {
  if (childTypeOf(options.parent, options.types) === null) {
    return (
      `No child work item type is configured under "${options.parent.type}". ` +
      "Set the hierarchy under Options → Azure DevOps."
    );
  }
  return options.adding ? "The box asking for the title is already open." : null;
}

/** The one line stating everything about the new item the reader is not being asked to type. */
export function newChildSummary(parent: TrackedWorkItem, typeName: string): string {
  const parts = [`under ${parent.title}`];
  if (parent.areaPath !== null) {
    parts.push(`in area ${parent.areaPath}`);
  }
  if (parent.iterationPath !== null) {
    parts.push(`in iteration ${parent.iterationPath}`);
  }
  return `Created as a ${typeName} ${parts.join(", ")}.`;
}

/**
 * The in-memory item a freshly created child is shown as, ranked ahead of every sibling.
 *
 * Built from the fields Azure DevOps returned FROM THE CREATION, through the same mapper the tree
 * loader uses, so everything the process defaulted — the starting state, the priority, the
 * classification paths — is on the row immediately instead of showing as blanks that quietly correct
 * themselves on the next refresh.
 *
 * The rank is the one value not taken from ADO: a brand-new item holds no backlog position, and an
 * unranked item sorts AFTER every ranked one — so it would drop to the bottom of the list the reader
 * just added it to the top of. A rank below the whole level stands in until the reorder lands.
 */
export function newChildItem(params: {
  id: number;
  rev: number;
  /** The item's fields as Azure DevOps created it; absent falls back to what the board can infer. */
  fields: Record<string, unknown> | undefined;
  type: string;
  title: string;
  parent: TrackedWorkItem;
  types: ReadonlyMap<string, TypeCatalogEntry>;
  createdAt: string;
}): TrackedWorkItem {
  const ranks = params.parent.children.map((child) => child.importance);
  const item =
    params.fields === undefined
      ? inferredChildItem(params)
      : hydrateTrackedWorkItem(
          params.id,
          { rev: params.rev, fields: params.fields },
          etaFieldsOf(params.types),
        );
  return { ...item, importance: Math.min(0, ...ranks) - 1 };
}

/** Each type's configured ETA field, in the shape the shared hydrator reads them from. */
function etaFieldsOf(types: ReadonlyMap<string, TypeCatalogEntry>): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  for (const [name, entry] of types) {
    if (entry.etaField) fields.set(name, entry.etaField);
  }
  return fields;
}

/**
 * The item as the board can describe it when Azure DevOps returned no fields — an older background
 * worker, or a response the parse could not read.
 *
 * Deliberately conservative: it states only what the board already knows (what it asked to create,
 * and where), and leaves every value the process owns unset rather than guessing at a default that
 * would be wrong for half the teams using this.
 */
function inferredChildItem(params: {
  id: number;
  rev: number;
  type: string;
  title: string;
  parent: TrackedWorkItem;
  types: ReadonlyMap<string, TypeCatalogEntry>;
  createdAt: string;
}): TrackedWorkItem {
  const { parent } = params;
  return {
    id: params.id,
    rev: params.rev,
    type: params.type,
    title: params.title,
    // The first board column is where the team's workflow starts, so its primary state is the
    // closest the board can get to where ADO has just put the item.
    state: params.types.get(params.type)?.columns[0]?.states[0] ?? "",
    priority: null,
    assignedTo: null,
    areaPath: parent.areaPath,
    iterationPath: parent.iterationPath,
    sprintName: parent.sprintName,
    createdDate: params.createdAt,
    createdBy: null,
    changedDate: params.createdAt,
    changedBy: null,
    stateChangeDate: params.createdAt,
    description: "",
    noteCount: 0,
    tags: [],
    importance: 0,
    eta: null,
    children: [],
  };
}
