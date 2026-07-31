import { buildWorkItemUpdateUrl, buildWorkItemUrl } from "../ado/fetchAdoTree";
import type {
  TeamConfigReader,
  TeamConfigReadResult,
  TeamConfigWriter,
  TeamConfigWriteResult,
} from "../settings-transfer/TeamConfigSynchronizer";

import { isReadTeamConfigResponse, isWriteTeamConfigResponse } from "./TeamConfigRequest";
import { fetchTeamConfigInPage } from "./fetchTeamConfigInPage";
import { readCurrentAdoQueryContext } from "./pickAdoQueryTab";
import { writeTeamConfigInPage } from "./writeTeamConfigInPage";

const NO_QUERY_ERROR = "Open an Azure DevOps query in this organization first.";

/** Pulls and publishes through the current ADO query tab's signed-in MAIN world. */
export class ChromeTeamConfigClient implements TeamConfigReader, TeamConfigWriter {
  async read(workItemId: number): Promise<TeamConfigReadResult> {
    return this.execute(
      workItemId,
      async (target): Promise<unknown> => {
        const results = await chrome.scripting.executeScript({
          target: { tabId: target.tabId },
          world: "MAIN",
          func: fetchTeamConfigInPage,
          args: [target.url],
        });
        return results[0]?.result;
      },
      isReadTeamConfigResponse,
      (detail): TeamConfigReadResult => ({ ok: false, error: detail }),
      "read",
    );
  }

  async write(workItemId: number, text: string): Promise<TeamConfigWriteResult> {
    return this.execute(
      workItemId,
      async (target): Promise<unknown> => {
        const results = await chrome.scripting.executeScript({
          target: { tabId: target.tabId },
          world: "MAIN",
          func: writeTeamConfigInPage,
          args: [{ url: target.url, text }],
        });
        return results[0]?.result;
      },
      isWriteTeamConfigResponse,
      (detail): TeamConfigWriteResult => ({ ok: false, error: detail }),
      "publish",
      (response, target) =>
        response.ok ? { ...response, workItemUrl: target.workItemUrl } : response,
    );
  }

  private async execute<T>(
    workItemId: number,
    inject: (target: TeamConfigTarget) => Promise<unknown>,
    isResponse: (value: unknown) => value is T,
    failure: (detail: string) => T,
    action: "read" | "publish",
    accept: (response: T, target: TeamConfigTarget) => T = (response) => response,
  ): Promise<T> {
    const target = await this.target(workItemId);
    if (typeof target === "string") {
      return failure(target);
    }
    try {
      const response = await inject(target);
      return isResponse(response)
        ? accept(response, target)
        : failure(`Azure DevOps returned no valid ${action} response.`);
    } catch (error) {
      return failure(`Could not ${action} the configuration item: ${String(error)}`);
    }
  }

  private async target(workItemId: number): Promise<TeamConfigTarget | string> {
    const context = await readCurrentAdoQueryContext();
    if (context === null) {
      return NO_QUERY_ERROR;
    }
    const url = buildWorkItemUpdateUrl(context.url, workItemId);
    const workItemUrl = buildWorkItemUrl(context.url, workItemId);
    return url === null || workItemUrl === null
      ? NO_QUERY_ERROR
      : { tabId: context.tabId, url, workItemUrl };
  }
}

interface TeamConfigTarget {
  tabId: number;
  url: string;
  workItemUrl: string;
}
