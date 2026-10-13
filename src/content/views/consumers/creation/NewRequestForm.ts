import type { IAttachmentUploader } from "../../../../common/ado/IAttachmentUploader";
import type { IUserDirectory } from "../../../../common/ado/IUserDirectory";
import type { ILogger } from "../../../../common/logging/ILogger";
import {
  FORM_FIELD_STYLE,
  renderFormRow,
  type FormSubmissionResult,
} from "../../../../common/view-common/control/FormLayout/FormLayout";

import { renderTitledDescriptionForm, type TitledDescriptionValues } from "./TitledDescriptionForm";

const PREFIX = "awesomeado-new-request";
const DESCRIPTION_REQUIRED_MESSAGE = "All requests must have a description.";

export const REQUEST_TITLE_HELP = "Provide a short descriptive text for the request";
export const TARGET_DATE_HELP = "When this request is needed by";

/** Everything the Add new request form asked for. */
export interface NewRequestValues extends TitledDescriptionValues {
  /** The picked day as the date input states it (`YYYY-MM-DD`), or null when none was picked. */
  targetDate: string | null;
}

export interface NewRequestFormOptions {
  doc: Document;
  userDirectory: IUserDirectory;
  attachmentUploader: IAttachmentUploader;
  logger: ILogger;
  /** Why the request type has nowhere to store a target date, or null when it has. */
  targetDateUnavailable: string | null;
  /** Creates the request; resolving false keeps the form open with everything typed. */
  onSubmit(values: NewRequestValues): Promise<boolean>;
  onCancel(): void;
}

function renderTargetDate(doc: Document, unavailable: string | null): HTMLInputElement {
  const field = doc.createElement("input");
  field.type = "date";
  field.className = `${PREFIX}__target-date`;
  field.style.cssText = `${FORM_FIELD_STYLE};width:auto;color-scheme:light dark`;
  // A date box has no ghost text of its own, so its guidance can only be the tooltip.
  field.title = unavailable ?? TARGET_DATE_HELP;
  if (unavailable !== null) field.disabled = true;
  return field;
}

/**
 * The Add new request form: a title, a Markdown description and the date the request is needed by.
 *
 * The date stays disabled, saying why, when the request type has no configured ETA field to hold it.
 */
export function renderNewRequestForm(options: NewRequestFormOptions): HTMLElement {
  const { doc } = options;
  const targetDate = renderTargetDate(doc, options.targetDateUnavailable);
  return renderTitledDescriptionForm({
    doc,
    userDirectory: options.userDirectory,
    attachmentUploader: options.attachmentUploader,
    logger: options.logger,
    classPrefix: PREFIX,
    titleHelp: REQUEST_TITLE_HELP,
    descriptionHelp: "Markdown supported.",
    extraRows: [
      renderFormRow(doc, { classPrefix: PREFIX, caption: "Target date", control: targetDate }),
    ],
    onSubmit: (values): Promise<FormSubmissionResult> => {
      if (values.description.trim().length === 0) {
        return Promise.resolve({
          accepted: false,
          failureMessage: DESCRIPTION_REQUIRED_MESSAGE,
          retryable: true,
        });
      }
      return options.onSubmit({
        ...values,
        targetDate: targetDate.value.length > 0 ? targetDate.value : null,
      });
    },
    onCancel: options.onCancel,
  });
}
