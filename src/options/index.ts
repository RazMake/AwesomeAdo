import { readQueryIdFromSearch, readQueryNameFromSearch } from "../common/bindings/BindingRequest";
import { createQueryBindingStore } from "../common/bindings/createQueryBindingStore";
import { ChromeAdoMetadataReader } from "../common/browser/ChromeAdoMetadataReader";
import { ChromeAdoTabReader } from "../common/browser/ChromeAdoTabReader";
import { createLogging } from "../common/logging/createLogger";
import { createSettingsStore } from "../common/settings/createSettingsStore";

import { AzureDevOpsController, type AzureDevOpsElements } from "./AzureDevOpsController";
import { ConfigurationBannerController } from "./ConfigurationBannerController";
import { DiagnosticsController, type DiagnosticsElements } from "./DiagnosticsController";
import { OptionsController, type OptionsElements } from "./OptionsController";
import { QueryBindingsController, type QueryBindingsElements } from "./QueryBindingsController";
import { StatusReporter } from "./StatusReporter";
import { TabsController } from "./TabsController";

// One logger + backing store shared by the whole options page: controllers record errors through it
// (via `report`/StatusReporter) and the Diagnostics tab reads the same store to display them.
const { logger, logStore } = createLogging();

// A low-frequency, user-initiated marker so the diagnostics log has an informational baseline the
// "errors only" filter can hide — background/content stay silent on success to avoid flooding the
// bounded ring buffer with routine lifecycle noise (service workers restart often).
logger.info("Options page opened");

const statusElement = document.querySelector<HTMLElement>("#status");
const statusReporter = statusElement ? new StatusReporter(statusElement, logger) : null;

// Route every error through one sink so failures are shown to the user, still recording to the log
// (and console) even when the status element itself is missing.
const report = (error: unknown): void => {
  if (statusReporter) {
    statusReporter.report(error);
  } else {
    logger.error("Options page error (no status element)", error);
  }
};

// Catch anything that escapes the controller — errors thrown while the bundle loads, throwing event
// handlers, and rejected promises — so a failure can never leave the page silently stuck.
window.addEventListener("error", (event) => report(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => report(event.reason));

const themeSelect = document.querySelector<HTMLSelectElement>("#theme-select");
const defaultViewSelect = document.querySelector<HTMLSelectElement>("#default-view-select");

const tabs = new TabsController(document);
tabs.init();

// One settings store shared by the controllers that read/write synced settings.
const settingsStore = createSettingsStore();

// One binding store shared by the query-binding form and the configuration banner, so both react to
// the same synced list without competing subscriptions.
const bindingStore = createQueryBindingStore();

// One tab reader shared by the controllers that read from the active ADO tab: the Appearance panel
// resolves "auto" from its theme, and the Query Bindings picker asks it which query that tab is on.
const adoTabReader = new ChromeAdoTabReader();

if (themeSelect && defaultViewSelect) {
  const elements: OptionsElements = {
    root: document.documentElement,
    themeSelect,
    defaultViewSelect,
  };
  const controller = new OptionsController(settingsStore, adoTabReader, elements, report);
  void controller.init().catch((error: unknown) => {
    controller.dispose();
    report(error);
  });
} else {
  report(new Error("The options page is missing required elements and cannot load."));
}

const adoOrganization = document.querySelector<HTMLElement>("#ado-organization");
const adoProject = document.querySelector<HTMLElement>("#ado-project");
const adoTeamInput = document.querySelector<HTMLInputElement>("#ado-team-input");
const adoFutureSprints = document.querySelector<HTMLInputElement>("#ado-future-sprints");
const adoAreaPaths = document.querySelector<HTMLElement>("#ado-area-paths");
const adoAreaPathsEmpty = document.querySelector<HTMLElement>("#ado-area-paths-empty");
const adoAreaPathAdd = document.querySelector<HTMLButtonElement>("#ado-area-path-add");
const adoWitColumns = document.querySelector<HTMLElement>("#ado-wit-columns");
const adoWitRows = document.querySelector<HTMLElement>("#ado-wit-rows");
const adoWorkItemTypesEmpty = document.querySelector<HTMLElement>("#ado-work-item-types-empty");
const adoWorkItemTypeAdd = document.querySelector<HTMLButtonElement>("#ado-work-item-type-add");
const adoBoardColumnAdd = document.querySelector<HTMLButtonElement>("#ado-board-column-add");

if (
  adoOrganization &&
  adoProject &&
  adoTeamInput &&
  adoFutureSprints &&
  adoAreaPaths &&
  adoAreaPathsEmpty &&
  adoAreaPathAdd &&
  adoWitColumns &&
  adoWitRows &&
  adoWorkItemTypesEmpty &&
  adoWorkItemTypeAdd &&
  adoBoardColumnAdd
) {
  const adoElements: AzureDevOpsElements = {
    organization: adoOrganization,
    project: adoProject,
    teamInput: adoTeamInput,
    futureSprintsInput: adoFutureSprints,
    areaPathsList: adoAreaPaths,
    areaPathsEmpty: adoAreaPathsEmpty,
    areaPathAddButton: adoAreaPathAdd,
    workItemTypes: {
      columnsRow: adoWitColumns,
      body: adoWitRows,
      empty: adoWorkItemTypesEmpty,
      addTypeButton: adoWorkItemTypeAdd,
      addColumnButton: adoBoardColumnAdd,
    },
  };
  const adoController = new AzureDevOpsController(
    settingsStore,
    new ChromeAdoMetadataReader(),
    adoElements,
    report,
  );
  void adoController.init().catch((error: unknown) => {
    adoController.dispose();
    report(error);
  });
} else {
  report(new Error("The options page is missing the Azure DevOps controls and cannot load them."));
}

const bindingPickerField = document.querySelector<HTMLElement>("#binding-query-picker-field");
const bindingQuerySelect = document.querySelector<HTMLSelectElement>("#binding-query-select");
const bindingNameField = document.querySelector<HTMLElement>("#binding-query-name-field");
const bindingQueryName = document.querySelector<HTMLElement>("#binding-query-name");
const bindingEmptyState = document.querySelector<HTMLElement>("#binding-empty");
const bindingForm = document.querySelector<HTMLElement>("#binding-form");
const bindingQueryId = document.querySelector<HTMLElement>("#binding-query-id");
const bindingViewSelect = document.querySelector<HTMLSelectElement>("#binding-view-select");
const bindingProperties = document.querySelector<HTMLElement>("#binding-properties");
const bindingSave = document.querySelector<HTMLButtonElement>("#binding-save");
const bindingDelete = document.querySelector<HTMLButtonElement>("#binding-delete");
const bindingViewConfigCard = document.querySelector<HTMLElement>("#binding-view-config-card");
const bindingViewConfigSlot = document.querySelector<HTMLElement>("#binding-view-config-slot");
const bindingPrimaryViewSlot = document.querySelector<HTMLElement>("#binding-primary-view-slot");
const bindingViewGroup = document.querySelector<HTMLElement>("#binding-view-config");
const bindingDeleteActions = document.querySelector<HTMLElement>("#binding-delete-actions");
const bindingStatus = document.querySelector<HTMLElement>("#binding-status");

if (
  bindingPickerField &&
  bindingQuerySelect &&
  bindingNameField &&
  bindingQueryName &&
  bindingEmptyState &&
  bindingForm &&
  bindingQueryId &&
  bindingViewSelect &&
  bindingProperties &&
  bindingSave &&
  bindingDelete &&
  bindingViewConfigCard &&
  bindingViewConfigSlot &&
  bindingPrimaryViewSlot &&
  bindingViewGroup &&
  bindingDeleteActions &&
  bindingStatus
) {
  const bindingElements: QueryBindingsElements = {
    pickerField: bindingPickerField,
    querySelect: bindingQuerySelect,
    nameField: bindingNameField,
    queryName: bindingQueryName,
    emptyState: bindingEmptyState,
    form: bindingForm,
    queryId: bindingQueryId,
    viewSelect: bindingViewSelect,
    properties: bindingProperties,
    saveButton: bindingSave,
    deleteButton: bindingDelete,
    viewConfigCard: bindingViewConfigCard,
    viewConfigSlot: bindingViewConfigSlot,
    primaryViewSlot: bindingPrimaryViewSlot,
    viewGroup: bindingViewGroup,
    deleteActions: bindingDeleteActions,
    status: bindingStatus,
  };
  const queryId = readQueryIdFromSearch(location.search);
  const queryName = readQueryNameFromSearch(location.search);
  // Deep-linking from a query's button (queryId present) jumps straight to the Query Bindings tab.
  if (queryId !== null) {
    tabs.activate("tab-bindings");
  }
  const bindings = new QueryBindingsController(
    bindingStore,
    bindingElements,
    undefined,
    report,
    () => adoTabReader.readCurrentQueryId(),
  );
  void bindings.init(queryId, queryName).catch((error: unknown) => {
    bindings.dispose();
    report(error);
  });
} else {
  report(new Error("The options page is missing the query-binding form and cannot bind queries."));
}

const configBanner = document.querySelector<HTMLElement>("#config-banner");
if (configBanner) {
  const bannerController = new ConfigurationBannerController(
    settingsStore,
    bindingStore,
    configBanner,
    report,
  );
  void bannerController.init().catch((error: unknown) => {
    bannerController.dispose();
    report(error);
  });
}

const logList = document.querySelector<HTMLElement>("#log-list");
const logEmpty = document.querySelector<HTMLElement>("#log-empty");
const logErrorsOnly = document.querySelector<HTMLInputElement>("#log-errors-only");
const logExport = document.querySelector<HTMLButtonElement>("#log-export");
const logClear = document.querySelector<HTMLButtonElement>("#log-clear");

if (logList && logEmpty && logErrorsOnly && logExport && logClear) {
  const diagnosticsElements: DiagnosticsElements = {
    list: logList,
    empty: logEmpty,
    errorsOnlyToggle: logErrorsOnly,
    exportButton: logExport,
    clearButton: logClear,
  };
  const diagnostics = new DiagnosticsController(logStore, diagnosticsElements);
  void diagnostics.init().catch((error: unknown) => {
    diagnostics.dispose();
    report(error);
  });
} else {
  report(new Error("The options page is missing the diagnostics log view and cannot show it."));
}
