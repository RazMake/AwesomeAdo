import type { AdoRawTree } from "../ado/fetchAdoTree";

import { normalizeWorkItemId } from "./TeamConfigSourceStore";

export interface TeamConfigQueryItem {
  id: number;
  title: string;
  changedBy: string;
  changedDate: string;
}

export interface TeamConfigQueryReader {
  readQuery(queryId: string): Promise<readonly TeamConfigQueryItem[]>;
}

export function parseTeamConfigQuery(raw: AdoRawTree | undefined): TeamConfigQueryItem[] {
  if (raw?.failure !== undefined) {
    throw new Error(
      `Configuration query failed at ${raw.failure.stage}: HTTP ${raw.failure.status}.`,
    );
  }
  if (raw?.wiql === null || raw?.wiql === undefined || !Array.isArray(raw.items)) {
    throw new Error("Azure DevOps returned no valid configuration query results.");
  }
  const seen = new Set<number>();
  return (raw.items as unknown[])
    .map((item) => {
      const candidate = item as { id?: unknown; fields?: Record<string, unknown> } | null;
      const id = normalizeWorkItemId(candidate?.id);
      const fields = candidate?.fields;
      const title = fields?.["System.Title"];
      if (id === null || typeof title !== "string") {
        throw new Error("Azure DevOps returned an invalid configuration work item.");
      }
      return {
        id,
        title,
        ...modificationDetails(fields),
      };
    })
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

function modificationDetails(
  fields: Record<string, unknown> | undefined,
): Pick<TeamConfigQueryItem, "changedBy" | "changedDate"> {
  const identity = fields?.["System.ChangedBy"] as { displayName?: unknown } | undefined;
  const date = fields?.["System.ChangedDate"];
  return {
    changedBy: typeof identity?.displayName === "string" ? identity.displayName : "Unknown",
    changedDate: typeof date === "string" ? date : "",
  };
}
