import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
    // retry: 0 prevents automatic retries from masking intermittent failures.
    retry: 0,
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      // Composition roots and static assets carry no branching logic worth unit-testing;
      // they are exercised by manual load / future e2e, so exclude them from the gate.
      exclude: [
        "src/**/*.test.ts",
        "src/**/index.ts",
        "src/common/settings/createSettingsStore.ts",
        "src/common/bindings/createQueryBindingStore.ts",
        "src/common/logging/createLogger.ts",
        "**/*.d.ts",
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 85,
        statements: 85,
      },
    },
  },
});
