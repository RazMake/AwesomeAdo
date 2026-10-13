import type { IAttachmentUploader } from "../../../../common/ado/IAttachmentUploader";
import type { IUserDirectory } from "../../../../common/ado/IUserDirectory";
import type { ILogger } from "../../../../common/logging/ILogger";

import { renderTitledDescriptionForm, type TitledDescriptionValues } from "./TitledDescriptionForm";

const PREFIX = "awesomeado-new-question";

export const QUESTION_TITLE_HELP = "Type a short version of the question";
export const QUESTION_DESCRIPTION_HELP = "Add details if any to help the team answer the question";

/** Everything the Add new question form asked for. */
export type NewQuestionValues = TitledDescriptionValues;

export interface NewQuestionFormOptions {
  doc: Document;
  userDirectory: IUserDirectory;
  attachmentUploader: IAttachmentUploader;
  logger: ILogger;
  /** Creates the question; resolving false keeps the form open with everything typed. */
  onSubmit(values: NewQuestionValues): Promise<boolean>;
  onCancel(): void;
}

/** The Add new question form: a title and an optional Markdown description. */
export function renderNewQuestionForm(options: NewQuestionFormOptions): HTMLElement {
  return renderTitledDescriptionForm({
    ...options,
    classPrefix: PREFIX,
    titleHelp: QUESTION_TITLE_HELP,
    descriptionHelp: QUESTION_DESCRIPTION_HELP,
  });
}
