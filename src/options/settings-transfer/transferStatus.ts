const STATUS_ERROR_CLASS = "card__hint--error";

/** Render the shared transfer-card status convention without coupling either controller to the other. */
export function renderTransferStatus(status: HTMLElement, message: string, failed: boolean): void {
  status.textContent = message;
  status.classList.toggle(STATUS_ERROR_CLASS, failed);
}

/** Render a status message containing one trusted link without interpreting message text as HTML. */
export function renderLinkedTransferStatus(
  status: HTMLElement,
  beforeLink: string,
  linkText: string,
  url: string,
  afterLink: string,
): void {
  const link = status.ownerDocument.createElement("a");
  link.href = url;
  link.textContent = linkText;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  status.replaceChildren(beforeLink, link, afterLink);
  status.classList.remove(STATUS_ERROR_CLASS);
}
