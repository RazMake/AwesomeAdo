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
      eqeqeq: "error",
      complexity: ["warn", 10],
      "max-lines-per-function": ["warn", 80],
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
  prettier,
);
