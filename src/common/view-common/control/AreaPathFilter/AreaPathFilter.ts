import { renderCheckboxFilter } from "../CheckboxFilter/CheckboxFilter";

/** Options for the compact area-path multi-select control. */
export interface AreaPathFilterOptions {
  /** Visible noun used by the trigger and popup. Defaults to `Area`. */
  label?: string;
  /** A fixed tooltip for the trigger. Without it the tooltip follows the current condition. */
  fixedTitle?: string;
  /** Full Azure DevOps area paths offered by the control. */
  areaPaths: readonly string[];
  /** Full paths selected initially. Paths absent from `areaPaths` are ignored. */
  selectedAreaPaths?: readonly string[];
  /**
   * Makes the trigger empty the selection instead of reopening the popup while anything is chosen.
   *
   * For a reading-position filter the reader mostly wants to be rid of in one press; leave it off
   * where the selection is configuration they narrow down step by step.
   */
  clearOnTriggerWhenActive?: boolean;
  /** Called after a checkbox or Clear changes the selected full paths. */
  onChange?(selectedAreaPaths: string[]): void;
  /** Called after an open popup closes by trigger, outside pointer, Escape, or Clear. */
  onPopupClosed?(): void;
}

/** The mounted control plus its full-path selection API. */
export interface AreaPathFilterHandle {
  element: HTMLElement;
  selectedAreaPaths(): string[];
  setSelectedAreaPaths(areaPaths: readonly string[]): void;
}

const PATH_SEPARATOR = "\\";
const LABEL_SEPARATOR = " \u203A ";
const CLASS_PREFIX = "awesomeado-area-filter";

/** Trim, drop blanks, and deduplicate while preserving the caller's order. */
function uniqueAreaPaths(areaPaths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of areaPaths) {
    const path = raw.trim();
    if (path.length > 0 && !seen.has(path)) {
      seen.add(path);
      result.push(path);
    }
  }
  return result;
}

/** The non-empty path parts used only for display; the full input path remains the selected value. */
function pathParts(path: string): string[] {
  const parts = path
    .split(PATH_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return parts.length > 0 ? parts : [path];
}

/** Render the right-most `depth` parts of a path. */
function suffixLabel(parts: readonly string[], depth: number): string {
  return parts.slice(Math.max(parts.length - depth, 0)).join(LABEL_SEPARATOR);
}

/**
 * Find the shortest distinct display label for each full path.
 *
 * Every path starts at its leaf. Only colliding labels grow by one parent at a time, so unrelated
 * paths stay as short as possible while ambiguous leaves gain exactly the context that separates
 * them. Exact duplicate paths are represented once.
 */
export function shortestUniqueAreaPathLabels(
  areaPaths: readonly string[],
): ReadonlyMap<string, string> {
  const paths = uniqueAreaPaths(areaPaths);
  const partsByPath = new Map(paths.map((path) => [path, pathParts(path)] as const));
  const depthByPath = new Map<string, number>(paths.map((path) => [path, 1]));

  while (true) {
    const pathsByLabel = new Map<string, string[]>();
    for (const path of paths) {
      const parts = partsByPath.get(path)!;
      const label = suffixLabel(parts, depthByPath.get(path)!);
      const matches = pathsByLabel.get(label) ?? [];
      matches.push(path);
      pathsByLabel.set(label, matches);
    }

    let expanded = false;
    for (const matches of pathsByLabel.values()) {
      if (matches.length < 2) continue;
      for (const path of matches) {
        const depth = depthByPath.get(path)!;
        if (depth < partsByPath.get(path)!.length) {
          depthByPath.set(path, depth + 1);
          expanded = true;
        }
      }
    }
    if (!expanded) break;
  }

  return new Map(
    paths.map((path) => [path, suffixLabel(partsByPath.get(path)!, depthByPath.get(path)!)]),
  );
}

/** One offered path in display order, nested under the closest offered path it sits beneath. */
export interface AreaPathHierarchyEntry {
  path: string;
  depth: number;
}

/**
 * Order the offered paths so each one follows the closest other offered path it sits beneath.
 *
 * Only offered paths take part: an un-offered intermediate node adds no row, so `A` and `A\x\b`
 * still nest one level apart. Siblings and roots keep the caller's order. Azure DevOps paths are
 * case-insensitive, so nesting is too.
 */
export function areaPathHierarchy(areaPaths: readonly string[]): AreaPathHierarchyEntry[] {
  const paths = uniqueAreaPaths(areaPaths);
  const keys = new Map(paths.map((path) => [path, path.toLocaleLowerCase()] as const));
  const childrenOf = new Map<string | null, string[]>();
  for (const path of paths) {
    const key = keys.get(path)!;
    const parent =
      paths
        .filter((other) => key.startsWith(`${keys.get(other)!}${PATH_SEPARATOR}`))
        .sort((left, right) => right.length - left.length)[0] ?? null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), path]);
  }
  const ordered: AreaPathHierarchyEntry[] = [];
  const visit = (parent: string | null, depth: number): void => {
    for (const path of childrenOf.get(parent) ?? []) {
      ordered.push({ path, depth });
      visit(path, depth + 1);
    }
  };
  visit(null, 0);
  return ordered;
}

/**
 * Render a button-sized area-path filter that opens a themed full-path multi-select.
 *
 * The caller exchanges full Azure DevOps paths with the control. Labels are display-only shortest
 * unique suffixes, so filtering never depends on an abbreviated or ambiguous value. No quick-search
 * is offered: a path list is already collapsed to the shortest suffix that distinguishes it, which
 * is the text a reader would have typed. When a parent path is offered beside its descendants, the
 * descendants are listed indented under it, because a short leaf label alone hides the hierarchy.
 */
export function renderAreaPathFilter(
  doc: Document,
  options: AreaPathFilterOptions,
): AreaPathFilterHandle {
  const hierarchy = areaPathHierarchy(options.areaPaths);
  const labels = shortestUniqueAreaPathLabels(hierarchy.map(({ path }) => path));
  const filter = renderCheckboxFilter(doc, {
    label: options.label?.trim() || "Area",
    fixedTitle: options.fixedTitle,
    classPrefix: CLASS_PREFIX,
    options: hierarchy.map(({ path, depth }) => ({
      value: path,
      label: labels.get(path) ?? path,
      title: path,
      depth,
    })),
    selected: options.selectedAreaPaths,
    clearOnTriggerWhenActive: options.clearOnTriggerWhenActive,
    // An item lives at exactly one area path, so the condition can only ever be "one of these":
    // excluding a path or AND-ing two of them would describe a work item that cannot exist.
    onChange: (selection) => options.onChange?.(selection.included),
    onPopupClosed: options.onPopupClosed,
  });

  return {
    element: filter.element,
    selectedAreaPaths: () => filter.selection().included,
    setSelectedAreaPaths: filter.setSelectedValues,
  };
}
