import {
  isRevealBindingSettingsMessage,
  isRevealOptionsSectionMessage,
  type OptionsSection,
  readErrorsOnlyFromSearch,
  readOptionsSectionFromSearch,
  readQueryIdFromSearch,
  readQueryNameFromSearch,
  sectionTabId,
} from "../common/bindings/BindingRequest";
import { createQueryBindingStore } from "../common/bindings/createQueryBindingStore";
import { ChromeAdoMetadataReader } from "../common/browser/ChromeAdoMetadataReader";
import { ChromeAdoTabReader } from "../common/browser/ChromeAdoTabReader";
import { ChromeTeamConfigClient } from "../common/browser/ChromeTeamConfigClient";
import { createLogging } from "../common/logging/createLogger";
import { createSettingsStore } from "../common/settings/createSettingsStore";
import { TeamConfigSynchronizer } from "../common/settings-transfer/TeamConfigSynchronizer";
import { createTeamConfigSourceStore } from "../common/settings-transfer/createTeamConfigSourceStore";

import {
  AzureDevOpsController,
  type AzureDevOpsElements,
} from "./ado-config/AzureDevOpsController";
import { AdoAccessBannerController } from "./alerts/AdoAccessBannerController";
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
import {
  TeamConfigController,
  type TeamConfigElements,
} from "./settings-transfer/TeamConfigController";
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

// Assigned when the Diagnostics tab is wired below, so a deep link that asks for "errors only" can
// switch its filter on. Null only when the page is missing the log view entirely (already reported).
let diagnostics: DiagnosticsController | null = null;

// Reveal a deep-linked section: the top-bar "View Log" menu asks for the Diagnostics tab, and the
// board's "Couldn't save…" chip additionally asks for its errors-only filter so the user lands on
// the failure they clicked instead of on the newest informational lines.
const revealSection = (section: OptionsSection, errorsOnly: boolean): void => {
  tabs.activate(sectionTabId(section));
  if (errorsOnly) {
    diagnostics?.showErrorsOnly();
  }
};

// When this tab is already open and the user clicks "View Log" (or the failure chip) again, the
// service worker focuses it and sends this message instead of spawning a duplicate — so switch to
// the requested section in place rather than relying on a fresh page load to read it from the URL.
chrome.runtime.onMessage.addListener((message: unknown) => {
  if (isRevealOptionsSectionMessage(message)) {
    revealSection(message.section, message.errorsOnly === true);
  }
});

// One settings store shared by the controllers that read/write synced settings.
const settingsStore = createSettingsStore(loggers.forSource("common/settings"));

// One binding store shared by the query-binding form and the configuration banner, so both react to
// the same synced list without competing subscriptions.
const bindingStore = createQueryBindingStore(loggers.forSource("common/bindings"));

const teamConfigSourceStore = createTeamConfigSourceStore(
  loggers.forSource("common/settings-transfer"),
);
const teamConfigClient = new ChromeTeamConfigClient();
const teamConfigSynchronizer = new TeamConfigSynchronizer(
  teamConfigSourceStore,
  teamConfigClient,
  settingsStore,
  bindingStore,
  loggers.forSource("common/settings-transfer"),
);

// One tab reader shared by the controllers that read from the active ADO tab: the Appearance panel
// resolves "auto" from its theme, and the Query Bindings picker asks it which query that tab is on.
const adoTabReader = new ChromeAdoTabReader();

// The saved scope lets the metadata read address the configured project even from an ADO tab that
// names none (an org home page or a folder route), so the pickers still fill away from a query.
const adoMetadataReader = new ChromeAdoMetadataReader(async () => {
  const settings = await settingsStore.read();
  return settings.organization === "" || settings.project === ""
    ? null
    : { organization: settings.organization, project: settings.project };
});
let adoMetadataRead: ReturnType<ChromeAdoMetadataReader["read"]> | null = null;
const readAdoMetadata = (): ReturnType<ChromeAdoMetadataReader["read"]> => {
  adoMetadataRead ??= adoMetadataReader.read();
  return adoMetadataRead;
};

// The reader answers null for exactly one reason: no ADO tab is open, which in MV3 means there is no
// credentialed path to ADO at all. Every ADO-backed control on the page is gated on this one answer.
const isAdoReachable = async (): Promise<boolean> => (await readAdoMetadata()) !== null;

// An import replaces the stored configuration wholesale. The Appearance panel and the configuration
// banner subscribe to their stores and follow it on their own, but the Azure DevOps tab and the
// query-binding form each read once at load and then treat their own state as the working copy — so
// they are registered here and re-read on demand. Without that the page keeps showing (and the next
// edit re-saves) the configuration the file just replaced.
const reloadAfterImport: (() => void)[] = [];
const reloadImportedConfiguration = (): void => {
  for (const reload of reloadAfterImport) {
    reload();
  }
};

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
    teamConfigSourceStore,
    transferElements,
    report,
    reloadImportedConfiguration,
  );
  transfer.init();
} else {
  report(new Error("The options page is missing the import/export controls and cannot load them."));
}

const teamConfigWorkItemId = document.querySelector<HTMLInputElement>("#team-config-work-item-id");
const teamConfigWorkItemLink = document.querySelector<HTMLAnchorElement>(
  "#team-config-work-item-link",
);
const teamConfigConnect = document.querySelector<HTMLButtonElement>("#team-config-connect");
const teamConfigPull = document.querySelector<HTMLButtonElement>("#team-config-pull");
const teamConfigPublish = document.querySelector<HTMLButtonElement>("#team-config-publish");
const teamConfigDisconnect = document.querySelector<HTMLButtonElement>("#team-config-disconnect");
const teamConfigStatus = document.querySelector<HTMLElement>("#team-config-status");

if (
  teamConfigWorkItemId &&
  teamConfigWorkItemLink &&
  teamConfigConnect &&
  teamConfigPull &&
  teamConfigPublish &&
  teamConfigDisconnect &&
  teamConfigStatus
) {
  const teamConfigElements: TeamConfigElements = {
    workItemId: teamConfigWorkItemId,
    workItemLink: teamConfigWorkItemLink,
    connectButton: teamConfigConnect,
    pullButton: teamConfigPull,
    publishButton: teamConfigPublish,
    disconnectButton: teamConfigDisconnect,
    status: teamConfigStatus,
  };
  const teamConfigController = new TeamConfigController(
    teamConfigSourceStore,
    teamConfigSynchronizer,
    teamConfigClient,
    teamConfigElements,
    report,
    reloadImportedConfiguration,
    (workItemId) => teamConfigClient.resolveWorkItemUrl(workItemId),
  );
  reloadAfterImport.push(() => {
    void teamConfigController.reload().catch(report);
  });
  void teamConfigController.init().catch((error: unknown) => {
    teamConfigController.dispose();
    report(error);
  });
  void isAdoReachable()
    .then((reachable) => {
      teamConfigController.setAdoReachable(reachable);
    })
    .catch(report);
} else {
  report(new Error("The options page is missing the team configuration controls."));
}

const adoOrganization = document.querySelector<HTMLInputElement>("#ado-organization");
const adoOrganizationDetected = document.querySelector<HTMLElement>("#ado-organization-detected");
const adoProject = document.querySelector<HTMLInputElement>("#ado-project");
const adoProjectDetected = document.querySelector<HTMLElement>("#ado-project-detected");
const adoTeamInput = document.querySelector<HTMLInputElement>("#ado-team-input");
const adoFutureSprints = document.querySelector<HTMLInputElement>("#ado-future-sprints");
const adoPastSprints = document.querySelector<HTMLInputElement>("#ado-past-sprints");
const adoWitColumns = document.querySelector<HTMLElement>("#ado-wit-columns");
const adoWitRows = document.querySelector<HTMLElement>("#ado-wit-rows");
const adoWorkItemTypesEmpty = document.querySelector<HTMLElement>("#ado-work-item-types-empty");
const adoWorkItemTypeAdd = document.querySelector<HTMLButtonElement>("#ado-work-item-type-add");
const adoWitEta = document.querySelector<HTMLElement>("#ado-wit-eta");
const adoWitEtaEmpty = document.querySelector<HTMLElement>("#ado-wit-eta-empty");
const adoWitHierarchy = document.querySelector<HTMLElement>("#ado-wit-hierarchy");
const adoWitHierarchyEmpty = document.querySelector<HTMLElement>("#ado-wit-hierarchy-empty");
const adoMarkerTags = document.querySelector<HTMLElement>("#ado-marker-tags");

if (
  adoOrganization &&
  adoOrganizationDetected &&
  adoProject &&
  adoProjectDetected &&
  adoTeamInput &&
  adoFutureSprints &&
  adoPastSprints &&
  adoWitColumns &&
  adoWitRows &&
  adoWorkItemTypesEmpty &&
  adoWorkItemTypeAdd &&
  adoWitEta &&
  adoWitEtaEmpty &&
  adoWitHierarchy &&
  adoWitHierarchyEmpty &&
  adoMarkerTags
) {
  const adoElements: AzureDevOpsElements = {
    organization: { input: adoOrganization, proposal: adoOrganizationDetected },
    project: { input: adoProject, proposal: adoProjectDetected },
    teamInput: adoTeamInput,
    futureSprintsInput: adoFutureSprints,
    pastSprintsInput: adoPastSprints,
    workItemTypes: {
      columnsRow: adoWitColumns,
      body: adoWitRows,
      empty: adoWorkItemTypesEmpty,
      addTypeButton: adoWorkItemTypeAdd,
      etaBody: adoWitEta,
      etaEmpty: adoWitEtaEmpty,
      hierarchy: {
        body: adoWitHierarchy,
        empty: adoWitHierarchyEmpty,
      },
    },
    markerTags: {
      list: adoMarkerTags,
    },
  };
  const adoController = new AzureDevOpsController(
    settingsStore,
    { read: readAdoMetadata },
    adoElements,
    report,
  );
  void adoController.init().catch((error: unknown) => {
    adoController.dispose();
    report(error);
  });
  reloadAfterImport.push(() => void adoController.reload().catch(report));
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
  const bindingLogger = loggers.forSource("options/query-bindings");
  const bindings = new QueryBindingsController(
    bindingStore,
    bindingElements,
    (error) => bindingLogger.error("Query binding operation failed", error),
    {
      resolveCurrentQueryId: () => adoTabReader.readCurrentQueryId(),
      resolveAreaPaths: async () => (await readAdoMetadata())?.areaPaths ?? [],
      publishBindings: async (proposed) => {
        const result = await teamConfigSynchronizer.publishBindings(teamConfigClient, proposed);
        if (result.status === "failed") {
          throw new Error(`Could not publish team configuration: ${result.error}`);
        }
      },
    },
  );
  void bindings.init(queryId, queryName).catch((error: unknown) => {
    bindings.dispose();
    report(error);
  });
  reloadAfterImport.push(() => void bindings.reload().catch(report));

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

const adoAccessBanner = document.querySelector<HTMLElement>("#ado-access-banner");
const adoAccessRecheck = document.querySelector<HTMLButtonElement>("#ado-access-recheck");
if (adoAccessBanner && adoAccessRecheck) {
  const accessBanner = new AdoAccessBannerController(
    { banner: adoAccessBanner, recheckButton: adoAccessRecheck },
    isAdoReachable,
    // Reachability is resolved once and every ADO-backed control is initialized from that same read,
    // so a fresh load is the honest way to re-evaluate it rather than half-refreshing the page.
    () => {
      location.reload();
    },
    report,
  );
  void accessBanner.init().catch((error: unknown) => {
    accessBanner.dispose();
    report(error);
  });
} else {
  report(new Error("The options page is missing the Azure DevOps availability banner."));
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
  const diagnosticsController = new DiagnosticsController(logStore, diagnosticsElements, report);
  diagnostics = diagnosticsController;
  void diagnosticsController.init().catch((error: unknown) => {
    diagnosticsController.dispose();
    report(error);
  });
} else {
  report(new Error("The options page is missing the diagnostics log view and cannot show it."));
}

// Deep-link from the top-bar "View Log" menu (and from the board's failure chip): open straight on
// the Diagnostics tab. Applied last so the log view exists by the time an "errors only" link asks it
// to filter. The query-bind deep-link (queryId in the URL) activates the Bindings tab from inside
// its own block above.
const requestedSection = readOptionsSectionFromSearch(location.search);
if (requestedSection !== null) {
  revealSection(requestedSection, readErrorsOnlyFromSearch(location.search));
}
