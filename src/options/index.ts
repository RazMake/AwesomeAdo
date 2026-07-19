import { readQueryIdFromSearch, readQueryNameFromSearch } from "../common/bindings/BindingRequest";
import { createQueryBindingStore } from "../common/bindings/createQueryBindingStore";
import { ChromeAdoQueryTabsReader } from "../common/browser/ChromeAdoQueryTabsReader";
import { ChromeAdoTabReader } from "../common/browser/ChromeAdoTabReader";
import { createSettingsStore } from "../common/settings/createSettingsStore";

import { OptionsController, type OptionsElements } from "./OptionsController";
import { QueryBindingsController, type QueryBindingsElements } from "./QueryBindingsController";
import { StatusReporter } from "./StatusReporter";
import { TabsController } from "./TabsController";

const statusElement = document.querySelector<HTMLElement>("#status");
const statusReporter = statusElement ? new StatusReporter(statusElement) : null;

// Route every error through one sink so failures are shown to the user, falling back to the console
// only when the status element itself is missing.
const report = (error: unknown): void => {
  if (statusReporter) {
    statusReporter.report(error);
  } else {
    console.error("AwesomeADO options error (no status element)", error);
  }
};

// Catch anything that escapes the controller — errors thrown while the bundle loads, throwing event
// handlers, and rejected promises — so a failure can never leave the page silently stuck.
window.addEventListener("error", (event) => report(event.error ?? event.message));
window.addEventListener("unhandledrejection", (event) => report(event.reason));

const themeSelect = document.querySelector<HTMLSelectElement>("#theme-select");
const defaultViewSelect = document.querySelector<HTMLSelectElement>("#default-view-select");
const organization = document.querySelector<HTMLElement>("#ado-organization");
const project = document.querySelector<HTMLElement>("#ado-project");

const tabs = new TabsController(document);
tabs.init();

if (themeSelect && defaultViewSelect && organization && project) {
  const elements: OptionsElements = {
    root: document.documentElement,
    themeSelect,
    defaultViewSelect,
    organization,
    project,
  };
  const controller = new OptionsController(
    createSettingsStore(),
    new ChromeAdoTabReader(),
    elements,
    report,
  );
  void controller.init().catch((error: unknown) => {
    controller.dispose();
    report(error);
  });
} else {
  report(new Error("The options page is missing required elements and cannot load."));
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
    status: bindingStatus,
  };
  const queryId = readQueryIdFromSearch(location.search);
  const queryName = readQueryNameFromSearch(location.search);
  // Deep-linking from a query's button (queryId present) jumps straight to the Query Bindings tab.
  if (queryId !== null) {
    tabs.activate("tab-bindings");
  }
  const bindings = new QueryBindingsController(
    createQueryBindingStore(),
    new ChromeAdoQueryTabsReader(),
    bindingElements,
    undefined,
    report,
  );
  void bindings.init(queryId, queryName).catch((error: unknown) => {
    bindings.dispose();
    report(error);
  });
} else {
  report(new Error("The options page is missing the query-binding form and cannot bind queries."));
}
