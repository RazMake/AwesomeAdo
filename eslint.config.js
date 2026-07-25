import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import-x";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "artifacts/**", ".debug-profiles/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["scripts/**/*.mjs", "*.config.{js,mjs,ts}"],
    languageOptions: { globals: globals.node },
  },
  {
    plugins: { "import-x": importPlugin },
    rules: {
      "import-x/order": ["error", { alphabetize: { order: "asc" }, "newlines-between": "always" }],
      // The options bundle must not reach into content code (they are separate contexts; shared code
      // belongs in common/). The sole, deliberate exception is the view *config* catalog: options
      // needs it to build the binding form, yet each view is kept whole in one content/views/<view>/
      // folder. This zone welds that doorway shut — only viewCatalog is importable, never a renderer,
      // the registry, or shared/ — so no view DOM code can leak into the options bundle. See the ADR
      // in .agents/memory-bank/decisions.md.
      "import-x/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "./src/options",
              from: "./src/content",
              except: ["./views/viewCatalog.ts"],
              message:
                "Options may only import content/views/viewCatalog (view config). Anything else shared with content belongs in src/common (see AGENTS.md §6 and the ADR in decisions.md).",
            },
          ],
        },
      ],
      eqeqeq: "error",
      complexity: ["warn", 10],
      "max-lines-per-function": ["warn", 80],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  prettier,
);
