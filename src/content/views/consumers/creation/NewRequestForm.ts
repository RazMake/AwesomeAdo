import type { IAttachmentUploader } from "../../../../common/ado/IAttachmentUploader";
import type { IUserDirectory } from "../../../../common/ado/IUserDirectory";
import type { ILogger } from "../../../../common/logging/ILogger";
import {
  bindFormSubmission,
  FORM_FIELD_STYLE,
  renderFormActions,
  renderFormButton,
  renderFormFailureLine,
  renderFormRow,
  renderFormTextField,
} from "../../../../common/view-common/control/FormLayout/FormLayout";
import { renderMarkdownField } from "../../../../common/view-common/control/TextEditor/MarkdownField";

const PREFIX = "awesomeado-new-request";

/** The longest work item title Azure DevOps accepts. */
const TITLE_MAX_LENGTH = 255;

export const REQUEST_TITLE_HELP = "Provide a short descriptive text for the request";
export const TARGET_DATE_HELP = "When this request is needed by";

/** Everything the Add new request form asked for. */
export interface NewRequestValues {
  title: string;
  /** Markdown, with mentions in their stored `@<id>` form. */
  description: string;
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
 * The description is the shared Markdown field so pasted images and `@` mentions behave exactly as
 * they do everywhere else; its images are kept when the request is created and removed from Azure
 * DevOps when the form is cancelled. The date stays disabled, saying why, when the request type has
 * no configured ETA field to hold it.
 */
export function renderNewRequestForm(options: NewRequestFormOptions): HTMLElement {
  const { doc, logger } = options;
  const form = doc.createElement("div");
  form.className = PREFIX;
  form.style.cssText =
    "display:flex;flex-direction:column;gap:8px;min-width:0;max-height:70vh;overflow-y:auto";
  let refresh = (): void => {};
  const title = renderFormTextField(doc, {
    className: `${PREFIX}__title`,
    help: REQUEST_TITLE_HELP,
    maxLength: TITLE_MAX_LENGTH,
  });
  title.addEventListener("input", () => refresh());
  const description = renderMarkdownField(doc, {
    initialText: "",
    rows: 6,
    placeholder: "Markdown supported.",
    mentions: { userDirectory: options.userDirectory, logger },
    images: { uploader: options.attachmentUploader, logger },
    onInput: () => refresh(),
  });
  description.input.classList.add(`${PREFIX}__description`);
  const targetDate = renderTargetDate(doc, options.targetDateUnavailable);
  const submit = renderFormButton(doc, PREFIX, "Add", true);
  const cancel = renderFormButton(doc, PREFIX, "Cancel", false);
  const failure = renderFormFailureLine(doc, PREFIX);
  ({ refresh } = bindFormSubmission({
    submit,
    cancel,
    failure,
    problem: () => {
      if (title.value.trim().length === 0) return "Provide a title.";
      return description.uploadingImages()
        ? "Wait for the pasted image to finish uploading."
        : null;
    },
    run: () => {
      const creation = options.onSubmit({
        title: title.value.trim(),
        description: description.storedText(),
        targetDate: targetDate.value.length > 0 ? targetDate.value : null,
      });
      description.trackSave(creation);
      return creation;
    },
    onCancel: () => {
      description.discardImages();
      options.onCancel();
    },
  }));
  form.append(
    renderFormRow(doc, { classPrefix: PREFIX, caption: "Title", control: title }),
    renderFormRow(doc, {
      classPrefix: PREFIX,
      caption: "Description",
      control: description.element,
    }),
    renderFormRow(doc, { classPrefix: PREFIX, caption: "Target date", control: targetDate }),
    renderFormActions(doc, PREFIX, [submit, cancel], failure),
  );
  description.input.setAttribute("aria-label", "Description");
  queueMicrotask(() => title.focus());
  return form;
}
