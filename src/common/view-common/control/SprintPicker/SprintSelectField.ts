import type { SprintWindow, SprintWindowEntry } from "../../../ado/sprintWindow";
import {
  renderSelectField,
  type SelectFieldChoice,
  type SelectFieldHandle,
} from "../SelectField/SelectField";

import { sprintRelationDeclarations } from "./SprintPicker";

/** What a form needs to offer a sprint without knowing anything about how sprints are read. */
export interface SprintSelectFieldOptions {
  /** The class-name stem this instance's elements are marked with. */
  classPrefix: string;
  /**
   * The iteration shown until the window lands, and whenever the team has no sprints at all.
   *
   * Usually where the item would go anyway — the parent's iteration, or the Azure DevOps project's
   * own root. An empty string reads as "(the project's default)".
   */
  fallbackPath: string;
  /** Reads the team's sprint window. Called once, when the field is built. */
  loadSprintWindow(): Promise<SprintWindow>;
}

/**
 * A single-select of the team's sprints, opening on the current one.
 *
 * The window is read when the field is BUILT rather than held by the surface around it: a form that
 * asks for a sprint is opened rarely and closed again, so nothing else on the surface would keep the
 * answer warm. The field stays inert until the read settles — and is re-enabled either way, so it
 * never reads as still loading — standing on the caller's fallback in the meantime, which is where
 * the item would land if nobody chose.
 */
export function renderSprintSelectField(
  doc: Document,
  options: SprintSelectFieldOptions,
): SelectFieldHandle {
  const { fallbackPath } = options;
  const field = renderSelectField(doc, {
    classPrefix: options.classPrefix,
    label: "Sprint",
    choices: [
      {
        value: fallbackPath,
        label: fallbackPath.length === 0 ? "(the project's default)" : fallbackPath,
      },
    ],
    selected: fallbackPath,
    disabled: true,
  });
  void options.loadSprintWindow().then((window) => {
    if (window.entries.length > 0) {
      const current = window.entries.find((entry) => entry.relation === "current");
      field.setChoices(window.entries.map(sprintChoice), (current ?? window.entries[0])!.path);
    }
    field.setDisabled(false);
  });
  return field;
}

function sprintChoice(entry: SprintWindowEntry): SelectFieldChoice {
  return {
    value: entry.path,
    label: entry.label,
    title: entry.path,
    // The same declarations the sprint dropdown paints its options with, so past and future read
    // the same here as everywhere else.
    declarations: sprintRelationDeclarations(entry.relation),
  };
}
