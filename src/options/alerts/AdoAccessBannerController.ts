/** The ADO-access banner and the control that lets the user re-evaluate it. */
export interface AdoAccessBannerElements {
  banner: HTMLElement;
  recheckButton: HTMLButtonElement;
}

type ReportError = (error: unknown) => void;

/**
 * Announces the one limit the options page cannot work around: an MV3 extension can only reach the
 * Azure DevOps REST APIs from a signed-in ADO tab's own page world, so with no ADO tab open every
 * control that has to ask ADO is inert. Saying so is what separates "unavailable right now" from
 * "this extension is broken" — the empty team and work-item-type pickers otherwise look like a bug.
 *
 * Reachability is resolved once, because it is the same read the page's controls are already
 * initialized from; re-checking therefore reloads the page rather than trying to re-drive every
 * controller from a second read.
 */
export class AdoAccessBannerController {
  constructor(
    private readonly elements: AdoAccessBannerElements,
    private readonly isAdoReachable: () => Promise<boolean>,
    private readonly recheck: () => void,
    private readonly reportError: ReportError,
  ) {
    elements.banner.hidden = true;
  }

  /** Reflect reachability on the page and report it, so callers can gate their own ADO controls. */
  async init(): Promise<boolean> {
    this.elements.recheckButton.addEventListener("click", this.handleRecheck);
    const reachable = await this.probe();
    this.elements.banner.hidden = reachable;
    return reachable;
  }

  private async probe(): Promise<boolean> {
    try {
      return await this.isAdoReachable();
    } catch (error: unknown) {
      // A failed probe is itself a loss of access, so warn rather than silently claiming all is well.
      this.reportError(error);
      return false;
    }
  }

  dispose(): void {
    this.elements.recheckButton.removeEventListener("click", this.handleRecheck);
  }

  private readonly handleRecheck = (): void => {
    this.recheck();
  };
}
