import {
  isRevealBindingSettingsMessage,
  isRevealOptionsSectionMessage,
  readOptionsSectionFromSearch,
  readQueryIdFromSearch,
  readQueryNameFromSearch,
  sectionTabId,
} from "../common/bindings/BindingRequest";
import { createQueryBindingStore } from "../common/bindings/createQueryBindingStore";
import { ChromeAdoMetadataReader } from "../common/browser/ChromeAdoMetadataReader";
import { ChromeAdoTabReader } from "../common/browser/ChromeAdoTabReader";
import { createLogging } from "../common/logging/createLogger";
import { createSettingsStore } from "../common/settings/createSettingsStore";

import {
  AzureDevOpsController,
  type AzureDevOpsElements,
} from "./ado-config/AzureDevOpsController";
import { ConfigurationBannerController } from "./alerts/ConfigurationBannerController";
import { StatusReporter } from "./alerts/StatusReporter";
import { OptionsController, type OptionsElements } from "./appearance/OptionsController";
import {
  DiagnosticsController,
  type DiagnosticsElements,
} from "./diagnostics/DiagnosticsController";
import {
  QueryBindingsController,
  type QueryBindingsElements,
} from "./query-bindings/QueryBindingsController";
import {
  SettingsTransferController,
  type SettingsTransferElements,
} from "./settings-transfer/SettingsTransferController";
import { TabsController } from "./shell/TabsController";

// One logger factory + backing store shared by the whole options page: controllers record through
// it (via `report`/StatusReporter) each stamped with the component folder that owns the emitting
// code, and the Diagnostics tab reads the same store to display every source's lines.
const { loggers, logStore } = createLogging();
const logger = loggers.forSource("options");

// A low-frequency, user-initiated marker so the diagnostics log has an informational baseline the
// "errors only" filter can hide — background/content stay silent on success to avoid flooding the
// bounded ring buffer with routine lifecycle noise (service workers restart often).
logger.info("Options page opened");

const statusElement = document.querySelector<HTMLElement>("#status");
const statusReporter = statusElement
  ? new StatusReporter(statusElement, loggers.forSource("options/alerts"))
  : null;

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

// Deep-link from the top-bar "View Log" menu: open straight on the Diagnostics tab. The query-bind
// deep-link (queryId in the URL) activates the Bindings tab from inside its own block below.
const requestedSection = readOptionsSectionFromSearch(location.search);
if (requestedSection !== null) {
  tabs.activate(sectionTabId(requestedSection));
}

// When this tab is already open and the user clicks "View Log" again, the service worker focuses it
// and sends this message instead of spawning a duplicate — so switch to the requested section in
// place rather than relying on a fresh page load to read it from the URL.
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isRevealOptionsSectionMessage(message)) {
    tabs.activate(sectionTabId(message.section));
  }
});

// One settings store shared by the controllers that read/write synced settings.
const settingsStore = createSettingsStore(loggers.forSource("common/settings"));

// One binding store shared by the query-binding form and the configuration banner, so both react to
// the same synced list without competing subscriptions.
const bindingStore = createQueryBindingStore(loggers.forSource("common/bindings"));

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

// Import/Export lives on the Appearance tab and spans both stores, so a single file captures and
// restores the whole configuration (settings + every enhanced-query binding).
const settingsExportButton = document.querySelector<HTMLButtonElement>("#settings-export");
const settingsImportButton = document.querySelector<HTMLButtonElement>("#settings-import");
const settingsImportFile = document.querySelector<HTMLInputElement>("#settings-import-file");
const settingsTransferStatus = document.querySelector<HTMLElement>("#settings-transfer-status");

if (settingsExportButton && settingsImportButton && settingsImportFile && settingsTransferStatus) {
  const transferElements: SettingsTransferElements = {
    exportButton: settingsExportButton,
    importButton: settingsImportButton,
    fileInput: settingsImportFile,
    status: settingsTransferStatus,
  };
  const transfer = new SettingsTransferController(
    settingsStore,
    bindingStore,
    transferElements,
    report,
  );
  transfer.init();
} else {
  report(new Error("The options page is missing the import/export controls and cannot load them."));
}

const adoOrganization = document.querySelector<HTMLElement>("#ado-organization");
const adoProject = document.querySelector<HTMLElement>("#ado-project");
const adoTeamInput = document.querySelector<HTMLInputElement>("#ado-team-input");
const adoFutureSprints = document.querySelector<HTMLInputElement>("#ado-future-sprints");
const adoPastSprints = document.querySelector<HTMLInputElement>("#ado-past-sprints");
const adoAreaPaths = document.querySelector<HTMLElement>("#ado-area-paths");
const adoAreaPathsEmpty = document.querySelector<HTMLElement>("#ado-area-paths-empty");
const adoAreaPathAdd = document.querySelector<HTMLButtonElement>("#ado-area-path-add");
const adoWitColumns = document.querySelector<HTMLElement>("#ado-wit-columns");
const adoWitRows = document.querySelector<HTMLElement>("#ado-wit-rows");
const adoWorkItemTypesEmpty = document.querySelector<HTMLElement>("#ado-work-item-types-empty");
const adoWorkItemTypeAdd = document.querySelector<HTMLButtonElement>("#ado-work-item-type-add");
const adoWitEta = document.querySelector<HTMLElement>("#ado-wit-eta");
const adoWitEtaEmpty = document.querySelector<HTMLElement>("#ado-wit-eta-empty");
const adoMarkerTags = document.querySelector<HTMLElement>("#ado-marker-tags");

if (
  adoOrganization &&
  adoProject &&
  adoTeamInput &&
  adoFutureSprints &&
  adoPastSprints &&
  adoAreaPaths &&
  adoAreaPathsEmpty &&
  adoAreaPathAdd &&
  adoWitColumns &&
  adoWitRows &&
  adoWorkItemTypesEmpty &&
  adoWorkItemTypeAdd &&
  adoWitEta &&
  adoWitEtaEmpty &&
  adoMarkerTags
) {
  const adoElements: AzureDevOpsElements = {
    organization: adoOrganization,
    project: adoProject,
    teamInput: adoTeamInput,
    futureSprintsInput: adoFutureSprints,
    pastSprintsInput: adoPastSprints,
    areaPathsList: adoAreaPaths,
    areaPathsEmpty: adoAreaPathsEmpty,
    areaPathAddButton: adoAreaPathAdd,
    workItemTypes: {
      columnsRow: adoWitColumns,
      body: adoWitRows,
      empty: adoWorkItemTypesEmpty,
      addTypeButton: adoWorkItemTypeAdd,
      etaBody: adoWitEta,
      etaEmpty: adoWitEtaEmpty,
    },
    markerTags: {
      list: adoMarkerTags,
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

const bindingEmptyState = document.querySelector<HTMLElement>("#binding-empty");
const bindingAddCard = document.querySelector<HTMLElement>("#binding-add-card");
const bindingAddQuery = document.querySelector<HTMLElement>("#binding-add-query");
const bindingAddViewSelect = document.querySelector<HTMLSelectElement>("#binding-add-view");
const bindingAddSave = document.querySelector<HTMLButtonElement>("#binding-add-save");
const bindingEditCard = document.querySelector<HTMLElement>("#binding-edit-card");
const bindingQuerySelect = document.querySelector<HTMLSelectElement>("#binding-query-select");
const bindingDelete = document.querySelector<HTMLButtonElement>("#binding-delete");
const bindingViewConfigCard = document.querySelector<HTMLElement>("#binding-view-config-card");
const bindingViewSelect = document.querySelector<HTMLSelectElement>("#binding-view-select");
const bindingProperties = document.querySelector<HTMLElement>("#binding-properties");
const bindingSave = document.querySelector<HTMLButtonElement>("#binding-save");
const bindingStatus = document.querySelector<HTMLElement>("#binding-status");

if (
  bindingEmptyState &&
  bindingAddCard &&
  bindingAddQuery &&
  bindingAddViewSelect &&
  bindingAddSave &&
  bindingEditCard &&
  bindingQuerySelect &&
  bindingDelete &&
  bindingViewConfigCard &&
  bindingViewSelect &&
  bindingProperties &&
  bindingSave &&
  bindingStatus
) {
  const bindingElements: QueryBindingsElements = {
    emptyState: bindingEmptyState,
    addCard: bindingAddCard,
    addQuery: bindingAddQuery,
    addViewSelect: bindingAddViewSelect,
    addSaveButton: bindingAddSave,
    editCard: bindingEditCard,
    querySelect: bindingQuerySelect,
    deleteButton: bindingDelete,
    viewConfigCard: bindingViewConfigCard,
    viewSelect: bindingViewSelect,
    properties: bindingProperties,
    saveButton: bindingSave,
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

  // When this tab is already open and the user clicks a query's "Enable Enhanced View" again, the
  // service worker focuses it and sends this message instead of spawning a duplicate — so jump to
  // the Bindings tab and re-populate the form in place rather than relying on a fresh page load.
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (isRevealBindingSettingsMessage(message)) {
      tabs.activate("tab-bindings");
      void bindings.revealFixedQuery(message.queryId, message.queryName ?? null).catch(report);
    }
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
const logSources = document.querySelector<HTMLElement>("#log-sources");
const logExport = document.querySelector<HTMLButtonElement>("#log-export");
const logClear = document.querySelector<HTMLButtonElement>("#log-clear");

if (logList && logEmpty && logErrorsOnly && logSources && logExport && logClear) {
  const diagnosticsElements: DiagnosticsElements = {
    list: logList,
    empty: logEmpty,
    errorsOnlyToggle: logErrorsOnly,
    sourceFilter: logSources,
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
