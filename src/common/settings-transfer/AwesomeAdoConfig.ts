import { normalizeBindings, type QueryBindings } from "../bindings/QueryBinding";
import { normalizeSettings, type ExtensionSettings } from "../settings/ExtensionSettings";

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
 * It carries the user's ENTIRE configuration: every extension setting (theme, default view, current
 * team, sprint counts, area paths, board columns, work item types, marker tags) plus every
 * enhanced-query binding (which queries are enhanced and each query's per-view property values).
 * Import restores all of it.
 */
export interface AwesomeAdoConfig {
  awesomeAdoConfigVersion: number;
  settings: ExtensionSettings;
  enhancedQueries: QueryBindings;
}

/** The normalized configuration an import yields, ready to persist to the two stores. */
export interface ImportedConfig {
  settings: ExtensionSettings;
  enhancedQueries: QueryBindings;
}

/**
 * Serialize the full configuration to the exact JSON text written to `AwesomeADO.config`.
 *
 * Values pass through the same normalizers used on read, so an export is always a clean, current
 * snapshot even if storage still holds a value written by an older build.
 */
export function exportConfig(settings: ExtensionSettings, enhancedQueries: QueryBindings): string {
  const config: AwesomeAdoConfig = {
    awesomeAdoConfigVersion: CONFIG_FORMAT_VERSION,
    settings: normalizeSettings(settings),
    enhancedQueries: normalizeBindings(enhancedQueries),
  };
  return JSON.stringify(config, null, 2);
}

/**
 * Parse and validate the text of a selected `AwesomeADO.config` file.
 *
 * Both sections must be present and object-shaped, because an import REPLACES both stores
 * wholesale: a file that merely mentions the format but carries no payload would normalize into an
 * all-defaults configuration and silently destroy the user's real one, synced to every device, and
 * report success. Recognized files are run through the same normalizers as storage reads, so a
 * hand-edited or newer-version file can never persist a malformed setting or binding. Note that
 * this validates SHAPE, not trustworthiness — an imported file is as trusted as the person the
 * user got it from.
 */
export function importConfig(text: string): ImportedConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("The selected file is not an AwesomeADO configuration.");
  }
  const candidate = raw as Record<string, unknown>;
  const isSection = (value: unknown): boolean =>
    typeof value === "object" && value !== null && !Array.isArray(value);
  if (!isSection(candidate.settings) || !isSection(candidate.enhancedQueries)) {
    throw new Error("The selected file is not a complete AwesomeADO configuration.");
  }
  return {
    settings: normalizeSettings(candidate.settings),
    enhancedQueries: normalizeBindings(candidate.enhancedQueries),
  };
}
