const STATUS_ERROR_CLASS = "card__hint--error";

/** Render the shared transfer-card status convention without coupling either controller to the other. */
export function renderTransferStatus(status: HTMLElement, message: string, failed: boolean): void {
  status.textContent = message;
  status.classList.toggle(STATUS_ERROR_CLASS, failed);
}
