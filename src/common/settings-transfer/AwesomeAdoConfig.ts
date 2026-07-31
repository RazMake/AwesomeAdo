import { normalizeBindings, type QueryBindings } from "../bindings/QueryBinding";
import {
  DEFAULT_VIEWS,
  normalizeSettings,
  THEMES,
  WORK_ITEM_MARKERS,
  type ExtensionSettings,
} from "../settings/ExtensionSettings";

import { normalizeWorkItemId } from "./TeamConfigSourceStore";

/** File name proposed to the user when exporting, and expected (by convention) when importing. */
export const CONFIG_FILE_NAME = "AwesomeADO.config";

/**
 * Format version stamped into every exported file. It is not used to gate imports today, but a
 * newer build can branch on it to migrate an older file instead of silently misreading it.
 */
export const CONFIG_FORMAT_VERSION = 1;

/**
 * The on-disk shape of an exported `AwesomeADO.config` file.
 *
 * A file export carries the user's ENTIRE configuration: every extension setting (theme, default
 * view, current team, sprint counts, area paths, board columns, work item types, marker tags), every
 * enhanced-query binding, and the optional team configuration work item ID. The compact payload
 * published to that work item deliberately omits its own ID.
 */
export interface AwesomeAdoConfig {
  awesomeAdoConfigVersion: number;
  settings: ExtensionSettings;
  enhancedQueries: QueryBindings;
  /** Trusted team configuration source included by file export, never by the shared payload. */
  teamConfigWorkItemId?: number | null;
}

/** The normalized configuration an import yields, ready to persist to the two stores. */
export interface ImportedConfig {
  /**
   * Only the settings the file carried in a usable shape. It is a PARTIAL on purpose: a setting the
   * file omitted (an older export) or got wrong keeps whatever the user has configured today, rather
   * than being reset to a default the file never asked for.
   */
  settings: Partial<ExtensionSettings>;
  /** Every binding the file described usably. Bindings are replaced wholesale, so this is the set. */
  enhancedQueries: QueryBindings;
  /** Absent for older files and shared payloads, so the current trusted source is preserved. */
  teamConfigWorkItemId?: number | null;
  /** Everything the file got wrong, in words the user can act on. Empty means it imported cleanly. */
  problems: readonly string[];
}

/**
 * Thrown when a selected file yields nothing at all — it is not JSON, or not an AwesomeADO
 * configuration. Also used to carry the problems of a file that imported only partially, so both
 * outcomes reach the diagnostics log through the same shape.
 *
 * It carries EVERY problem found rather than only the first, because the user repairs the file
 * outside the extension: reporting one fault per attempt would turn fixing a hand-edited file into a
 * guessing game. The joined list is also the `message`, so a caller that only logs the error still
 * records the full reason.
 */
export class ConfigImportError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(problems.join(" "));
    this.name = "ConfigImportError";
  }
}

/**
 * Serialize the full configuration to the exact JSON text written to `AwesomeADO.config`.
 *
 * Values pass through the same normalizers used on read, so an export is always a clean, current
 * snapshot even if storage still holds a value written by an older build.
 */
export function exportConfig(
  settings: ExtensionSettings,
  enhancedQueries: QueryBindings,
  teamConfigWorkItemId?: number | null,
): string {
  return serializeConfig(settings, enhancedQueries, teamConfigWorkItemId, 2);
}

/** Serialize the full configuration without presentation whitespace for an ADO work item field. */
export function exportCompactConfig(
  settings: ExtensionSettings,
  enhancedQueries: QueryBindings,
): string {
  return serializeConfig(settings, enhancedQueries);
}

function serializeConfig(
  settings: ExtensionSettings,
  enhancedQueries: QueryBindings,
  teamConfigWorkItemId?: number | null,
  space?: number,
): string {
  const config: AwesomeAdoConfig = {
    awesomeAdoConfigVersion: CONFIG_FORMAT_VERSION,
    settings: normalizeSettings(settings),
    enhancedQueries: normalizeBindings(enhancedQueries),
  };
  if (teamConfigWorkItemId !== undefined) {
    config.teamConfigWorkItemId = normalizeWorkItemId(teamConfigWorkItemId);
  }
  return JSON.stringify(config, null, space);
}

/**
 * Parse and validate the text of a selected `AwesomeADO.config` file.
 *
 * An import salvages as much as the file offers: every setting and every binding it describes
 * usably is returned, and each one it got wrong is described in `problems` instead of being applied.
 * Only a file that yields nothing at all (unparseable, or missing a whole section) throws, because
 * an import REPLACES both stores wholesale — normalizing an absent payload into defaults would
 * silently destroy the user's real configuration on every synced device and report success.
 *
 * Faults are reported rather than quietly repaired because an import is not a storage read: the
 * normalizers exist so a running extension is never stopped by a stale value, but here the file is
 * the user's own and they can fix it, so swapping a value they wrote for a default without saying so
 * would hand them a configuration they never asked for. Note that this validates SHAPE, not
 * trustworthiness — an imported file is as trusted as the person the user got it from.
 */
export function importConfig(text: string): ImportedConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ConfigImportError(["The selected file is not valid JSON."]);
  }
  if (!isRecord(raw)) {
    throw new ConfigImportError(["The selected file is not an AwesomeADO configuration."]);
  }
  if (!isRecord(raw.settings) || !isRecord(raw.enhancedQueries)) {
    throw new ConfigImportError([
      "The selected file is not a complete AwesomeADO configuration: it must contain both a " +
        "settings and an enhancedQueries section.",
    ]);
  }
  const settings = importSettings(raw.settings);
  const teamConfigSource = importTeamConfigWorkItemId(raw.teamConfigWorkItemId);
  return {
    settings: settings.accepted,
    enhancedQueries: normalizeBindings(raw.enhancedQueries),
    teamConfigWorkItemId: teamConfigSource.accepted,
    problems: [
      ...collectVersionProblems(raw.awesomeAdoConfigVersion),
      ...settings.problems,
      ...collectQueryProblems(raw.enhancedQueries),
      ...teamConfigSource.problems,
    ],
  };
}

function importTeamConfigWorkItemId(value: unknown): {
  accepted?: number | null;
  problems: string[];
} {
  if (value === undefined) {
    return { problems: [] };
  }
  if (value === null) {
    return { accepted: null, problems: [] };
  }
  const workItemId = normalizeWorkItemId(value);
  return workItemId === null
    ? {
        problems: [
          'The setting "teamConfigWorkItemId" was skipped; expected a positive work item ID.',
        ],
      }
    : { accepted: workItemId, problems: [] };
}

/**
 * Judge the format stamp. Neither answer stops the import — the sections are validated field by
 * field either way — but both change how much the user should trust what came out of it.
 */
function collectVersionProblems(value: unknown): string[] {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    return [
      'The selected file does not declare a valid "awesomeAdoConfigVersion", so it was not ' +
        "exported by AwesomeADO.",
    ];
  }
  if (value > CONFIG_FORMAT_VERSION) {
    return [
      `The selected file uses configuration format ${value}, which is newer than this version of ` +
        `AwesomeADO can read (${CONFIG_FORMAT_VERSION}), so some of it may not have been imported.`,
    ];
  }
  return [];
}

/**
 * Split the file's settings section into the values to apply and the faults to report.
 *
 * An ABSENT key is never a fault and is never applied: a file exported by an older build legitimately
 * predates a setting, and the user's current value for it is a better answer than this build's
 * default. An INVALID key is reported and likewise left alone, so one bad value costs the user that
 * one setting instead of the whole import.
 */
function importSettings(section: Record<string, unknown>): {
  accepted: Partial<ExtensionSettings>;
  problems: string[];
} {
  const problems: string[] = [];
  const usable: Record<string, unknown> = {};
  const keys: (keyof ExtensionSettings)[] = [];
  for (const { key, isValid, expected } of SETTINGS_RULES) {
    const value = section[key];
    if (value === undefined) {
      continue;
    }
    if (!isValid(value)) {
      problems.push(`The setting "${key}" was skipped; expected ${expected}.`);
      continue;
    }
    usable[key] = value;
    keys.push(key);
  }
  // Run the accepted values through the same normalizer a storage read uses, so an imported value
  // can never be persisted in a shape consumers would have to defend against, then keep only the
  // keys the file actually carried — the normalizer fills the rest with defaults, which here would
  // silently overwrite settings the file never mentioned.
  const normalized = normalizeSettings(usable);
  const accepted = Object.fromEntries(
    keys.map((key) => [key, normalized[key]]),
  ) as Partial<ExtensionSettings>;
  return { accepted, problems };
}

/** Report every enhanced query the file cannot bind. Only query IDS are named, never query names. */
function collectQueryProblems(queries: Record<string, unknown>): string[] {
  const problems: string[] = [];
  for (const [queryId, binding] of Object.entries(queries)) {
    if (!isRecord(binding) || !isFilledString(binding.view)) {
      problems.push(`The enhanced query "${queryId}" was skipped; expected it to name a view.`);
    } else if (binding.properties !== undefined && !isPropertyMap(binding.properties)) {
      problems.push(
        `Some view settings of the enhanced query "${queryId}" were skipped; expected text values.`,
      );
    }
  }
  return problems;
}

/**
 * What each setting must look like in a file, and how to describe the shape when it does not.
 *
 * Kept as one table rather than a chain of branches so a new setting is a single line here, and so
 * the wording of every rejection stays consistent.
 */
const SETTINGS_RULES: readonly {
  readonly key: keyof ExtensionSettings;
  readonly isValid: (value: unknown) => boolean;
  readonly expected: string;
}[] = [
  { key: "theme", isValid: isOneOf(THEMES), expected: `one of ${THEMES.join(", ")}` },
  {
    key: "defaultView",
    isValid: isOneOf(DEFAULT_VIEWS),
    expected: `one of ${DEFAULT_VIEWS.join(", ")}`,
  },
  { key: "currentTeam", isValid: isTeamRef, expected: "null, or a team with an id and a name" },
  { key: "futureSprintsCount", isValid: isWholeNumber, expected: "a whole number" },
  { key: "pastSprintsCount", isValid: isWholeNumber, expected: "a whole number" },
  { key: "areaPaths", isValid: isAreaPathList, expected: "a list of area paths, each with a path" },
  { key: "boardColumns", isValid: isStringList, expected: "a list of column titles" },
  {
    key: "workItemTypes",
    isValid: isWorkItemTypeList,
    expected: "a list of work item types, each with a name and its state mapping",
  },
  { key: "markerTags", isValid: isMarkerTagMap, expected: "a tag and a commentTag per marker" },
];

/** A plain JSON object. Arrays and `null` are `typeof "object"` but are never a config section. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFilledString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringList(value: unknown): boolean {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isOneOf(allowed: readonly string[]): (value: unknown) => boolean {
  return (value) => typeof value === "string" && allowed.includes(value);
}

function isWholeNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value);
}

function isTeamRef(value: unknown): boolean {
  return (
    value === null || (isRecord(value) && isFilledString(value.id) && isFilledString(value.name))
  );
}

function isAreaPathList(value: unknown): boolean {
  return (
    Array.isArray(value) && value.every((entry) => isRecord(entry) && isFilledString(entry.path))
  );
}

function isWorkItemTypeList(value: unknown): boolean {
  return Array.isArray(value) && value.every(isWorkItemType);
}

function isWorkItemType(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFilledString(value.name) &&
    (value.columns === undefined || isStateMapping(value.columns)) &&
    (value.children === undefined || isStringList(value.children))
  );
}

function isStateMapping(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) => isRecord(entry) && typeof entry.column === "string" && isStringList(entry.states),
    )
  );
}

function isMarkerTagMap(value: unknown): boolean {
  return (
    isRecord(value) &&
    WORK_ITEM_MARKERS.every(({ key }) => value[key] === undefined || isMarkerEntry(value[key]))
  );
}

function isMarkerEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.tag === undefined || typeof value.tag === "string") &&
    (value.commentTag === undefined || typeof value.commentTag === "string")
  );
}

function isPropertyMap(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}
