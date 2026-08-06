import { defineConfig } from "vitest/config";

const domTestFiles = [
  "src/common/view-common/control/**/*.test.ts",
  "src/options/**/*.test.ts",
  "src/content/ado-probe/**/*.test.ts",
  "src/content/query-binding/**/*.test.ts",
  "src/content/views/**/*.test.ts",
  "src/content/query-page/EnhancedViewSurface.test.ts",
  "src/common/ado/createWorkItem.test.ts",
  "src/common/ado/fetchWorkItemNotes.test.ts",
  "src/common/ado/sprintWindow.test.ts",
  "src/common/ado/WorkItemNote.test.ts",
  "src/common/ado/WorkItemWriteQueue/WorkItemWriteQueue.test.ts",
  "src/common/bindings/BindingRequest.test.ts",
  "src/common/browser/ChromeAdoTabReader.test.ts",
  "src/common/browser/fetchWorkItemNotesInPage.test.ts",
  "src/common/browser/MessagingWorkItemNoteLoader.test.ts",
  "src/common/browser/reorderWorkItemInPage.test.ts",
  "src/common/browser/teamConfigInPage.test.ts",
  "src/common/browser/WorkItemFieldRequest.test.ts",
  "src/common/browser/WorkItemNoteRequest.test.ts",
  "src/common/browser/writeWorkItemRanksInPage.test.ts",
  "src/common/logging/BrowserLocalLogStore.test.ts",
  "src/common/navigation/AdoHost.test.ts",
] as const;

export default defineConfig({
  test: {
    globals: true,
    // retry: 0 prevents automatic retries from masking intermittent failures.
    retry: 0,
    restoreMocks: true,
    clearMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: [...domTestFiles],
        },
      },
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: [...domTestFiles],
        },
      },
    ],
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
