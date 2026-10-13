import type { IAttachmentUploader } from "../../../../common/ado/IAttachmentUploader";
import type { IUserDirectory } from "../../../../common/ado/IUserDirectory";
import type { ILogger } from "../../../../common/logging/ILogger";
import {
  bindFormSubmission,
  renderFormActions,
  renderFormButton,
  renderFormFailureLine,
  renderFormRow,
  renderFormTextField,
  type FormSubmissionResult,
} from "../../../../common/view-common/control/FormLayout/FormLayout";
import { renderMarkdownField } from "../../../../common/view-common/control/TextEditor/MarkdownField";

/** The longest work item title Azure DevOps accepts. */
const TITLE_MAX_LENGTH = 255;

/** What a titled-description form asked for. */
export interface TitledDescriptionValues {
  title: string;
  /** Markdown, with mentions in their stored `@<id>` form. */
  description: string;
}

export interface TitledDescriptionFormOptions {
  doc: Document;
  userDirectory: IUserDirectory;
  attachmentUploader: IAttachmentUploader;
  logger: ILogger;
  /** Names the form and prefixes every control's class (`<prefix>__title`, `<prefix>__add`, …). */
  classPrefix: string;
  titleHelp: string;
  descriptionHelp: string;
  /** Rows shown after the description, before Add / Cancel. */
  extraRows?: readonly HTMLElement[];
  /** Creates the item; a refusal keeps the form open with everything typed. */
  onSubmit(values: TitledDescriptionValues): Promise<FormSubmissionResult>;
  onCancel(): void;
}

/**
 * A creation form led by a required title and a Markdown description.
 *
 * The description is the shared Markdown field so pasted images and `@` mentions behave exactly as
 * they do everywhere else; its images are kept when the item is created and removed from Azure
 * DevOps when the form is cancelled.
 */
export function renderTitledDescriptionForm(options: TitledDescriptionFormOptions): HTMLElement {
  const { doc, logger, classPrefix: prefix } = options;
  const form = doc.createElement("div");
  form.className = prefix;
  form.style.cssText =
    "display:flex;flex-direction:column;gap:8px;min-width:0;max-height:70vh;overflow-y:auto";
  let refresh = (): void => {};
  const title = renderFormTextField(doc, {
    className: `${prefix}__title`,
    help: options.titleHelp,
    maxLength: TITLE_MAX_LENGTH,
  });
  title.addEventListener("input", () => refresh());
  const description = renderMarkdownField(doc, {
    initialText: "",
    rows: 6,
    placeholder: options.descriptionHelp,
    mentions: { userDirectory: options.userDirectory, logger },
    images: { uploader: options.attachmentUploader, logger },
    onInput: () => refresh(),
  });
  description.input.classList.add(`${prefix}__description`);
  const submit = renderFormButton(doc, prefix, "Add", true);
  const cancel = renderFormButton(doc, prefix, "Cancel", false);
  const failure = renderFormFailureLine(doc, prefix);
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
      });
      description.trackSave(
        creation.then((result) => (typeof result === "boolean" ? result : result.accepted)),
      );
      return creation;
    },
    onCancel: () => {
      description.discardImages();
      options.onCancel();
    },
  }));
  form.append(
    renderFormRow(doc, { classPrefix: prefix, caption: "Title", control: title }),
    renderFormRow(doc, {
      classPrefix: prefix,
      caption: "Description",
      control: description.element,
    }),
    ...(options.extraRows ?? []),
    renderFormActions(doc, prefix, [submit, cancel], failure),
  );
  description.input.setAttribute("aria-label", "Description");
  queueMicrotask(() => title.focus());
  return form;
}
