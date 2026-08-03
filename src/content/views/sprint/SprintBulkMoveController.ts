import type { TrackedWorkItem, TypeCatalogEntry } from "../../../common/ado/TrackedWorkItem";
import type { WorkItemWriteQueue } from "../../../common/ado/WorkItemWriteQueue/WorkItemWriteQueue";
import type { SprintWindowEntry } from "../../../common/ado/sprintWindow";
import type { ILogger } from "../../../common/logging/ILogger";

import {
  runSprintBulkMove,
  type SprintBulkMoveCandidate,
  type SprintBulkMoveProgress,
} from "./SprintBulkMove";
import { buildSprintBulkMovePlan, renderSprintBulkMoveDialog } from "./SprintBulkMoveDialog";

export interface SprintBulkMoveRequest {
  source: SprintWindowEntry;
  destination: SprintWindowEntry;
  visibleItems: readonly TrackedWorkItem[];
  types: readonly TypeCatalogEntry[];
  loadRoots(): Promise<readonly TrackedWorkItem[]>;
  onSettled(): void;
}

interface SprintBulkMoveControllerOptions {
  doc: Document;
  mountInto: HTMLElement;
  writes: Pick<WorkItemWriteQueue, "enqueue">;
  logger: ILogger;
  openDiagnosticsLog(): void;
}

function statusText(status: SprintBulkMoveProgress): string {
  if (status.phase === "running") return `Moving: ${status.moved} moved, pass ${status.pass}`;
  const outcome = status.phase === "completed" ? "Move complete" : `Move ${status.phase}`;
  return `${outcome}: ${status.moved} moved, ${status.failed} failed, ${status.skipped} skipped`;
}

function isActionable(status: SprintBulkMoveProgress): boolean {
  return status.failed > 0 || status.phase === "failed" || status.phase === "limited";
}

function cancelButton(doc: Document, onCancel: () => void): HTMLButtonElement {
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "awesomeado-sprint__cancel-bulk";
  button.title = "Finish the current item, then stop the bulk move";
  button.style.cssText = [
    "margin-left:7px",
    "padding:2px 7px",
    "border:1px solid var(--control-border)",
    "border-radius:3px",
    "background:var(--control-background-subtle)",
    "color:var(--text-primary-color)",
    "font:inherit",
    "font-size:11px",
    "cursor:pointer",
  ].join(";");
  button.addEventListener("click", onCancel);
  return button;
}

/** Owns one confirmed bulk move from modal summary through guarded completion. */
export class SprintBulkMoveController {
  private active = false;
  private cancelRequested = false;
  private progress: SprintBulkMoveProgress | null = null;
  private statusRoot: HTMLElement | null = null;
  private summary: HTMLElement | null = null;
  private cancelControl: HTMLButtonElement | null = null;
  private releaseGuards = (): void => undefined;

  constructor(private readonly options: SprintBulkMoveControllerOptions) {}

  get isActive(): boolean {
    return this.active;
  }

  attachStatus(root: HTMLElement): void {
    // A repaint hands over a brand-new slot, so the cached controls belong to a detached one.
    this.statusRoot = root;
    this.summary = null;
    this.cancelControl = null;
    this.paintStatus();
  }

  open(request: SprintBulkMoveRequest): void {
    if (this.active) return;
    const typeMap = new Map(request.types.map((type) => [type.name, type]));
    const plan = buildSprintBulkMovePlan(request.visibleItems, typeMap);
    this.options.mountInto.querySelector(".awesomeado-sprint__bulk-dialog-overlay")?.remove();
    this.options.mountInto.append(
      renderSprintBulkMoveDialog(this.options.doc, {
        destinationLabel: request.destination.label,
        plan,
        onConfirm: () => this.start(request, plan.candidates),
        onCancel: () => undefined,
      }),
    );
  }

  cancel(): void {
    if (!this.active) return;
    this.cancelRequested = true;
    this.paintStatus();
  }

  private start(
    request: SprintBulkMoveRequest,
    candidates: readonly SprintBulkMoveCandidate[],
  ): void {
    if (this.active || candidates.length === 0) return;
    this.active = true;
    this.cancelRequested = false;
    this.progress = {
      phase: "running",
      pass: 0,
      moved: 0,
      failed: 0,
      skipped: 0,
      examined: 0,
    };
    this.releaseGuards = installGuards(this.options.doc, () => this.cancel());
    this.paintStatus();
    void this.execute(request, candidates).finally(() => {
      this.active = false;
      this.releaseGuards();
      this.releaseGuards = (): void => undefined;
      request.onSettled();
    });
  }

  private async execute(
    request: SprintBulkMoveRequest,
    candidates: readonly SprintBulkMoveCandidate[],
  ): Promise<void> {
    try {
      await runSprintBulkMove({
        sourcePath: request.source.path,
        destinationPath: request.destination.path,
        destinationName: request.destination.name,
        candidates,
        types: request.types,
        loadRoots: request.loadRoots,
        writes: this.options.writes,
        cancelled: () => this.cancelRequested,
        wait: (delayMs) => this.wait(delayMs),
        onProgress: (progress) => {
          this.progress = progress;
          this.paintStatus();
        },
        logger: this.options.logger,
      });
    } catch (error) {
      this.options.logger.error("Sprint bulk move stopped unexpectedly", error);
      this.progress = failedProgress(this.progress, error);
      this.paintStatus();
    }
  }

  private wait(delayMs: number): Promise<void> {
    return new Promise<void>((resolve) => {
      const view = this.options.doc.defaultView;
      if (view === null) resolve();
      else view.setTimeout(resolve, delayMs);
    });
  }

  private paintStatus(): void {
    const root = this.statusRoot;
    const status = this.progress;
    if (root === null) return;
    if (status === null) {
      root.replaceChildren();
      this.summary = null;
      this.cancelControl = null;
      return;
    }
    this.paintSummary(root, status);
    this.paintCancel(root, status);
  }

  // Both controls are UPDATED, never rebuilt: every single write repaints this status, and a button
  // replaced between pointerdown and pointerup never receives the click at all — which is why Cancel
  // and the failure link used to take several tries to land during a busy run.
  private paintSummary(root: HTMLElement, status: SprintBulkMoveProgress): void {
    const actionable = isActionable(status);
    const tag = actionable ? "button" : "span";
    if (this.summary === null || this.summary.localName !== tag) {
      const element = this.options.doc.createElement(tag);
      element.className = "awesomeado-sprint__bulk-move-summary";
      element.style.cssText =
        "border:0;padding:0;background:transparent;color:var(--text-secondary-color);font:inherit;font-size:11px";
      if (actionable) this.wireDiagnostics(element as HTMLButtonElement);
      this.summary?.remove();
      this.summary = element;
      root.prepend(element);
    }
    this.summary.textContent = statusText(status);
    if (actionable) this.summary.title = status.lastError ?? "Open Diagnostics";
  }

  private paintCancel(root: HTMLElement, status: SprintBulkMoveProgress): void {
    if (status.phase !== "running") {
      this.cancelControl?.remove();
      this.cancelControl = null;
      return;
    }
    if (this.cancelControl === null) {
      this.cancelControl = cancelButton(this.options.doc, () => this.cancel());
      root.append(this.cancelControl);
    }
    this.cancelControl.disabled = this.cancelRequested;
    this.cancelControl.textContent = this.cancelRequested ? "Cancelling…" : "Cancel";
  }

  private wireDiagnostics(button: HTMLButtonElement): void {
    button.type = "button";
    button.style.cursor = "pointer";
    button.addEventListener("click", this.options.openDiagnosticsLog);
  }
}

function failedProgress(
  current: SprintBulkMoveProgress | null,
  error: unknown,
): SprintBulkMoveProgress {
  const previous: SprintBulkMoveProgress = current ?? {
    phase: "failed",
    pass: 0,
    moved: 0,
    failed: 0,
    skipped: 0,
    examined: 0,
  };
  return {
    phase: "failed",
    pass: previous.pass,
    moved: previous.moved,
    failed: previous.failed,
    skipped: previous.skipped,
    examined: previous.examined,
    lastError: error instanceof Error ? error.message : String(error),
  };
}

function installGuards(doc: Document, requestCancel: () => void): () => void {
  const block = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : null;
    // The whole status region stays live: it carries Cancel AND the link to the failure log, which
    // are exactly the two things a user needs WHILE the run is holding the rest of the view shut.
    if (target?.closest(".awesomeado-sprint__bulk-move-status") !== null) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const keydown = (event: KeyboardEvent): void => {
    if (event.key !== "Escape") return;
    requestCancel();
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const beforeUnload = (event: BeforeUnloadEvent): void => {
    event.preventDefault();
    event.returnValue = "";
  };
  doc.addEventListener("pointerdown", block, true);
  doc.addEventListener("click", block, true);
  doc.addEventListener("contextmenu", block, true);
  doc.addEventListener("keydown", keydown, true);
  doc.defaultView?.addEventListener("beforeunload", beforeUnload);
  return () => {
    doc.removeEventListener("pointerdown", block, true);
    doc.removeEventListener("click", block, true);
    doc.removeEventListener("contextmenu", block, true);
    doc.removeEventListener("keydown", keydown, true);
    doc.defaultView?.removeEventListener("beforeunload", beforeUnload);
  };
}
