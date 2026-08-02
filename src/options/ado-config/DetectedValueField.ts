/** The elements of one text setting an open ADO query tab can also propose a value for. */
export interface DetectedValueElements {
  /** The editable box holding the user's own value. */
  input: HTMLInputElement;
  /** Container the proposal row is drawn into; hidden whenever there is nothing to propose. */
  proposal: HTMLElement;
}

type ReportError = (error: unknown) => void;

/**
 * Binds one free-text Azure DevOps scope setting — the organization or the project — to the settings
 * store and reconciles it with whatever the open ADO query tab reports.
 *
 * The user owns the value, because the options page has to keep describing the scope they configured
 * even while they are looking at some other organization's tab. So a detected value is only adopted
 * outright while nothing is stored yet; after that it is offered as a one-click proposal instead of
 * silently replacing what they saved, and the offer disappears once both agree.
 *
 * The settings store is deliberately not injected: the owner passes the write for its own settings
 * key, so one field drives both settings without knowing either key (a computed-key write would also
 * lose the `Partial<ExtensionSettings>` typing).
 */
export class DetectedValueField {
  // `null` means "has not reported yet". The stored settings and the tab metadata are read
  // concurrently and can land in either order, so the seed-or-propose decision can only be taken
  // once both have actually answered.
  private saved: string | null = null;
  private detected: string | null = null;

  constructor(
    private readonly elements: DetectedValueElements,
    private readonly label: string,
    private readonly persist: (value: string) => Promise<void>,
    private readonly reportError: ReportError,
  ) {
    elements.input.disabled = true;
    elements.proposal.hidden = true;
  }

  init(): void {
    this.elements.input.addEventListener("change", this.handleChange);
  }

  dispose(): void {
    this.elements.input.removeEventListener("change", this.handleChange);
  }

  /** Show the stored value. */
  render(value: string): void {
    this.saved = value;
    this.elements.input.value = value;
    this.reconcile();
  }

  /** What the open ADO query tab reports for this scope; empty when no tab could be read. */
  setDetected(value: string): void {
    this.detected = value;
    this.reconcile();
  }

  enable(): void {
    this.elements.input.disabled = false;
  }

  private reconcile(): void {
    if (this.saved === null || this.detected === null) {
      return;
    }
    // Nothing configured yet, so the open tab is the best answer available and is taken as the
    // starting point — that is also what makes the page usable later with no ADO tab open.
    if (this.saved === "" && this.detected !== "") {
      this.apply(this.detected);
      return;
    }
    this.renderProposal();
  }

  private readonly handleChange = (): void => {
    this.apply(this.elements.input.value.trim());
  };

  private apply(value: string): void {
    const previous = this.saved ?? "";
    this.elements.input.value = value;
    if (value === previous) {
      return;
    }
    this.saved = value;
    this.renderProposal();
    void this.persist(value).catch((error: unknown) => {
      this.saved = previous;
      this.elements.input.value = previous;
      this.renderProposal();
      this.reportError(error);
    });
  }

  private renderProposal(): void {
    const { proposal } = this.elements;
    proposal.replaceChildren();
    const detected = this.detected ?? "";
    if (detected === "" || detected === this.saved) {
      proposal.hidden = true;
      return;
    }
    proposal.append(this.createProposalText(detected), this.createApplyButton(detected));
    proposal.hidden = false;
  }

  private createProposalText(detected: string): HTMLElement {
    const text = document.createElement("span");
    text.className = "detected__text";
    const value = document.createElement("strong");
    value.className = "detected__value";
    value.textContent = detected;
    text.append("The open query tab is on ", value);
    return text;
  }

  private createApplyButton(detected: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "button button--subtle detected__apply";
    button.textContent = "Use this";
    // Both fields render the same button text, so the accessible name has to name the scope itself.
    button.setAttribute("aria-label", `Use ${detected} as the ${this.label}`);
    button.addEventListener("click", () => {
      this.apply(detected);
    });
    return button;
  }
}
