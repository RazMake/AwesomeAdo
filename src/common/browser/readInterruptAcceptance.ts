import type { RawInterruptAcceptance } from "./InterruptAcceptanceRequest";
import type { AdoPageRequestOutcome } from "./executeAdoRequestInPage";

export interface ReadInterruptAcceptanceConfig {
  requests: { workItemId: number; updatesUrl: string }[];
  interruptTag: string;
  acceptanceTag: string;
  concurrency: number;
  updatePageSize: number;
  maxUpdatePages: number;
}

export type ReadInterruptUpdatePage = (url: string) => Promise<AdoPageRequestOutcome>;

interface ItemEvidence {
  workItemId: number;
  taggedAt: string | null;
  notes: { text: string; createdDate: string }[];
}

function updateDate(update: {
  revisedDate?: unknown;
  fields?: Record<string, unknown>;
}): string | null {
  const changed = update.fields?.["System.ChangedDate"] as { newValue?: unknown } | undefined;
  const value = typeof changed?.newValue === "string" ? changed.newValue : update.revisedDate;
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
}

function containsTag(value: unknown, tag: string): boolean {
  const expected = tag.toLocaleLowerCase();
  return (
    typeof value === "string" &&
    value.split(";").some((entry) => entry.trim().toLocaleLowerCase() === expected)
  );
}

function applyUpdate(
  raw: unknown,
  config: ReadInterruptAcceptanceConfig,
  evidence: ItemEvidence,
): void {
  const update = raw as { revisedDate?: unknown; fields?: Record<string, unknown> };
  const date = updateDate(update);
  if (date === null) return;
  const tags = update.fields?.["System.Tags"] as
    { oldValue?: unknown; newValue?: unknown } | undefined;
  if (
    tags !== undefined &&
    !containsTag(tags.oldValue, config.interruptTag) &&
    containsTag(tags.newValue, config.interruptTag)
  ) {
    evidence.taggedAt = date;
  }
  const history = update.fields?.["System.History"] as { newValue?: unknown } | undefined;
  if (typeof history?.newValue === "string" && history.newValue.includes(config.acceptanceTag)) {
    evidence.notes.push({ text: history.newValue, createdDate: date });
  }
}

function failureOf(outcome: AdoPageRequestOutcome): RawInterruptAcceptance["failure"] {
  if (outcome.status === 0) return "network";
  return outcome.status >= 200 && outcome.status < 300 ? "sign-in" : "http";
}

/** Page item updates with bounded concurrency and derive current-lifetime acceptance evidence. */
export async function readInterruptAcceptance(
  config: ReadInterruptAcceptanceConfig,
  readPage: ReadInterruptUpdatePage,
): Promise<RawInterruptAcceptance> {
  const result: RawInterruptAcceptance = {
    evidence: [],
    failedIds: [],
    failure: "none",
    status: 0,
  };
  let next = 0;
  const fail = (id: number, outcome: AdoPageRequestOutcome | null): void => {
    result.failedIds.push(id);
    if (result.failure !== "none") return;
    result.failure = outcome === null ? "limit" : failureOf(outcome);
    result.status = outcome?.status ?? 0;
  };
  const readItem = async (
    entry: ReadInterruptAcceptanceConfig["requests"][number],
  ): Promise<void> => {
    const evidence: ItemEvidence = { workItemId: entry.workItemId, taggedAt: null, notes: [] };
    let skip = 0;
    for (let page = 0; page < config.maxUpdatePages; page += 1) {
      const url = entry.updatesUrl.replace(/([?&])\$skip=\d+/, `$1$skip=${skip}`);
      const outcome = await readPage(url);
      const updates = (outcome.raw as { value?: unknown } | null)?.value;
      if (!Array.isArray(updates)) return fail(entry.workItemId, outcome);
      for (const update of updates) applyUpdate(update, config, evidence);
      if (updates.length === 0 || updates.length < config.updatePageSize) {
        result.evidence.push(evidence);
        return;
      }
      skip += updates.length;
    }
    fail(entry.workItemId, null);
  };
  const pump = async (): Promise<void> => {
    while (next < config.requests.length) await readItem(config.requests[next++]!);
  };
  const width = Math.min(config.requests.length, Math.max(1, config.concurrency));
  await Promise.all(Array.from({ length: width }, pump));
  return result;
}
