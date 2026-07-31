import type { TeamConfigSourceStore } from "../../common/settings-transfer/TeamConfigSourceStore";
import { normalizeWorkItemId } from "../../common/settings-transfer/TeamConfigSourceStore";
import {
  TeamConfigSynchronizer,
  type TeamConfigSyncResult,
  type TeamConfigWriter,
} from "../../common/settings-transfer/TeamConfigSynchronizer";

import { renderTransferStatus } from "./transferStatus";

export interface TeamConfigElements {
  workItemId: HTMLInputElement;
  connectButton: HTMLButtonElement;
  pullButton: HTMLButtonElement;
  publishButton: HTMLButtonElement;
  disconnectButton: HTMLButtonElement;
  status: HTMLElement;
}

type ReportError = (error: unknown) => void;

/** Drives the explicit team configuration connection and publish workflow on the options page. */
export class TeamConfigController {
  private disposed = false;
  private busy = false;
  private connected = false;

  constructor(
    private readonly sourceStore: TeamConfigSourceStore,
    private readonly synchronizer: TeamConfigSynchronizer,
    private readonly writer: TeamConfigWriter,
    private readonly elements: TeamConfigElements,
    private readonly reportError: ReportError,
    private readonly onPulled: () => void,
  ) {}

  async init(): Promise<void> {
    this.elements.connectButton.addEventListener("click", this.handleConnect);
    this.elements.pullButton.addEventListener("click", this.handlePull);
    this.elements.publishButton.addEventListener("click", this.handlePublish);
    this.elements.disconnectButton.addEventListener("click", this.handleDisconnect);
    await this.reload();
  }

  async reload(): Promise<void> {
    const workItemId = await this.sourceStore.read();
    if (this.disposed) {
      return;
    }
    this.connected = workItemId !== null;
    this.elements.workItemId.value = workItemId?.toString() ?? "";
    this.updateButtons();
  }

  dispose(): void {
    this.disposed = true;
    this.elements.connectButton.removeEventListener("click", this.handleConnect);
    this.elements.pullButton.removeEventListener("click", this.handlePull);
    this.elements.publishButton.removeEventListener("click", this.handlePublish);
    this.elements.disconnectButton.removeEventListener("click", this.handleDisconnect);
  }

  private readonly handleConnect = (): void => {
    void this.connect();
  };

  private readonly handlePull = (): void => {
    void this.pull();
  };

  private readonly handlePublish = (): void => {
    void this.publish();
  };

  private readonly handleDisconnect = (): void => {
    void this.disconnect();
  };

  private async connect(): Promise<void> {
    const workItemId = normalizeWorkItemId(Number(this.elements.workItemId.value));
    if (workItemId === null) {
      this.setStatus("Enter a positive Azure DevOps work item ID.", true);
      return;
    }
    await this.run(async () => {
      await this.sourceStore.write(workItemId);
      this.connected = true;
      return this.synchronizer.pull();
    });
  }

  private async pull(): Promise<void> {
    await this.run(() => this.synchronizer.pull());
  }

  private async publish(): Promise<void> {
    await this.run(() => this.synchronizer.publish(this.writer));
  }

  private async disconnect(): Promise<void> {
    await this.run(async () => {
      await this.sourceStore.write(null);
      this.connected = false;
      this.elements.workItemId.value = "";
      return { status: "disconnected" };
    });
  }

  private async run(action: () => Promise<TeamConfigSyncResult>): Promise<void> {
    if (this.busy) {
      return;
    }
    this.busy = true;
    this.updateButtons();
    try {
      this.reportResult(await action());
    } catch (error) {
      this.reportError(error);
      this.setStatus(`Could not update team configuration: ${describeError(error)}`, true);
    } finally {
      this.busy = false;
      this.updateButtons();
    }
  }

  private reportResult(result: TeamConfigSyncResult): void {
    if (result.status === "failed") {
      this.setStatus(`Could not update team configuration: ${result.error}`, true);
      return;
    }
    if (result.status === "disconnected") {
      this.setStatus("Team configuration disconnected.");
      return;
    }
    if (result.status === "empty") {
      this.setStatus(
        `Connected to work item ${result.workItemId}, but no shared configuration found yet.`,
      );
      return;
    }
    const queryCount = `${result.bindingCount} enhanced quer${result.bindingCount === 1 ? "y" : "ies"}`;
    if (result.status === "published") {
      this.setStatus(`Published ${queryCount} to work item ${result.workItemId}.`);
      return;
    }
    this.onPulled();
    this.setStatus(
      result.status === "updated"
        ? `Pulled ${queryCount} from work item ${result.workItemId}.`
        : `Team configuration is up to date (${queryCount}).`,
    );
  }

  private updateButtons(): void {
    this.elements.connectButton.textContent = this.connected ? "Connected" : "Connect";
    this.elements.connectButton.disabled = this.busy || this.connected;
    this.elements.workItemId.disabled = this.busy || this.connected;
    this.elements.pullButton.disabled = this.busy || !this.connected;
    this.elements.publishButton.disabled = this.busy || !this.connected;
    this.elements.disconnectButton.disabled = this.busy || !this.connected;
  }

  private setStatus(message: string, failed = false): void {
    if (this.disposed) {
      return;
    }
    renderTransferStatus(this.elements.status, message, failed);
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
