import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Recursively list all files under `dir`, throwing on symlinks or other
 * non-regular, non-directory entries. Returns absolute and posix-relative paths.
 * @param {string} dir
 * @param {string} base  - Root used for computing relative paths
 * @param {string} label - Context label used in error messages
 * @returns {Array<{ absolutePath: string, relativePath: string }>}
 */
export function listFiles(dir, base, label) {
  /** @type {Array<{ absolutePath: string, relativePath: string }>} */
  const result = [];
  for (const child of readdirSync(dir)) {
    const absolutePath = path.join(dir, child);
    const stat = lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      throw new Error(`Symlink found in ${label}: ${absolutePath}`);
    }
    if (stat.isDirectory()) {
      result.push(...listFiles(absolutePath, base, label));
    } else if (stat.isFile()) {
      result.push({
        absolutePath,
        relativePath: path.relative(base, absolutePath).replace(/\\/g, "/"),
      });
    } else {
      throw new Error(`Non-regular file in ${label}: ${absolutePath}`);
    }
  }
  return result;
}
