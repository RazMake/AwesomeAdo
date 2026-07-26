import type {
  FeatureCrewReconcileRequest,
  FeatureCrewReconcileResult,
  IFeatureCrewWriter,
} from "../ado/IFeatureCrewWriter";
import type { ILogger } from "../logging/ILogger";

import {
  RECONCILE_FEATURE_CREW_MESSAGE,
  type ReconcileFeatureCrewMessage,
  type ReconcileFeatureCrewResponse,
} from "./FeatureCrewRequest";

/** Sends a reconcile-feature-crew request and resolves the background worker's reply, if any. */
export type SendReconcileRequest = (
  message: ReconcileFeatureCrewMessage,
) => Promise<ReconcileFeatureCrewResponse | undefined>;

/**
 * Reconciles the Feature Crew work item by messaging the background service worker.
 *
 * A content script cannot reach the credentialed Azure DevOps REST API directly (see
 * `FeatureCrewRequest`'s doc comment), so this writer hands the root id, type name, and assignees
 * to the worker and awaits the result. The `send` function is injected so this class never touches
 * `chrome.runtime` itself (Dependency Inversion) — the composition root supplies the real
 * `chrome.runtime.sendMessage` binding, and a test supplies a fake.
 */
export class MessagingFeatureCrewWriter implements IFeatureCrewWriter {
  constructor(
    private readonly send: SendReconcileRequest,
    private readonly logger: ILogger,
  ) {}

  async reconcile(request: FeatureCrewReconcileRequest): Promise<FeatureCrewReconcileResult> {
    const message: ReconcileFeatureCrewMessage = {
      type: RECONCILE_FEATURE_CREW_MESSAGE,
      rootId: request.rootId,
      typeName: request.typeName,
      assignees: request.assignees,
      tagAssignments: request.tagAssignments,
    };

    try {
      const response = await this.send(message);

      if (response === undefined || response === null) {
        this.logger.error(
          `Feature Crew reconcile for root ${request.rootId}: no response from the background worker.`,
        );
        return { ok: false, changed: false };
      }

      if (response.ok === false) {
        this.logger.error(
          `Feature Crew reconcile failed for root ${request.rootId}: ${response.error ?? "unknown error"}.`,
        );
        return { ok: false, changed: response.changed, id: response.id };
      }

      this.logger.info(
        `Feature Crew reconciled for root ${request.rootId}: changed=${response.changed}, id=${response.id ?? "none"}.`,
      );
      return { ok: true, changed: response.changed, id: response.id, members: response.members };
    } catch (error) {
      this.logger.error(`Could not reconcile Feature Crew for root ${request.rootId}`, error);
      return { ok: false, changed: false };
    }
  }
}
