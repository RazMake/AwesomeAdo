import { existsSync } from "node:fs";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { build, context } from "esbuild";

import { createVersion } from "./version.mjs";

const watch = process.argv.includes("--watch");
const outdir = "dist";
const storeBuild = Boolean(process.env.STORE_BUILD);

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const { full: fullVersion } = createVersion(pkg, process.env.BUILD_NUMBER);

/** @type {import("esbuild").Plugin} */
const copyPlugin = {
  name: "copy-extension-static-files",
  setup(pluginBuild) {
    pluginBuild.onEnd(async (result) => {
      if (result.errors.length === 0) {
        await copyStatic();
      }
    });
  },
};

// IIFE keeps each entry self-contained, which is required for classic MV3 content scripts and is
// safe for the service worker and options page too.
/** @type {import("esbuild").BuildOptions} */
const options = {
  entryPoints: {
    "background/service-worker": "src/background/index.ts",
    "content/awesomeado-content": "src/content/index.ts",
    "options/options": "src/options/index.ts",
  },
  outdir,
  bundle: true,
  format: "iife",
  target: "chrome106",
  minify: storeBuild,
  // Store builds ship without source maps; dev/CI builds keep them for breakpoints.
  sourcemap: storeBuild ? false : "linked",
  logLevel: "info",
  plugins: [copyPlugin],
};

// Classic manifest content scripts cannot themselves be ESM entries, so the large optional view is
// emitted separately and loaded by URL through the registry's dynamic import.
/** @type {import("esbuild").BuildOptions} */
const projectTrackingOptions = {
  entryPoints: {
    "content/project-tracking": "src/content/views/project-tracking/ProjectTrackingView.ts",
  },
  outdir,
  bundle: true,
  format: "esm",
  target: "chrome106",
  minify: storeBuild,
  sourcemap: storeBuild ? false : "linked",
  logLevel: "info",
};

async function copyStatic() {
  const manifest = JSON.parse(await readFile("src/manifest.json", "utf8"));
  manifest.version = fullVersion;
  await mkdir(path.join(outdir, "options"), { recursive: true });
  await writeFile(path.join(outdir, "manifest.json"), JSON.stringify(manifest, null, 2));
  await cp("src/options/options.html", path.join(outdir, "options/options.html"));
  if (existsSync("src/icons")) {
    await cp("src/icons", path.join(outdir, "icons"), { recursive: true });
  }
}

await rm(outdir, { recursive: true, force: true });

if (watch) {
  const [mainContext, projectTrackingContext] = await Promise.all([
    context(options),
    context(projectTrackingOptions),
  ]);
  console.warn("esbuild: starting watch");
  await Promise.all([mainContext.watch(), projectTrackingContext.watch()]);
  console.warn("esbuild: watching for changes");
} else {
  await Promise.all([build(options), build(projectTrackingOptions)]);
  console.warn(`esbuild: built AwesomeADO ${fullVersion}`);
}
