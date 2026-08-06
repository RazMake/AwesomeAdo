import { isInterruptAccepted } from "../ado/interruptAcceptance";

import type { RawInterruptAcceptance } from "./InterruptAcceptanceRequest";
import type { AdoPageRequestOutcome } from "./executeAdoRequestInPage";

export interface ReadInterruptAcceptanceConfig {
  requests: { workItemId: number; updatesUrl: string; commentsUrl: string }[];
  interruptTag: string;
  acceptanceTag: string;
  concurrency: number;
  updatePageSize: number;
  maxUpdatePages: number;
  maxCommentPages: number;
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

type EvidenceFailure = AdoPageRequestOutcome | "limit" | null;

/** Collect the revision timeline, advancing `$skip` by the count Azure DevOps actually returned. */
async function collectUpdateEvidence(
  entry: ReadInterruptAcceptanceConfig["requests"][number],
  config: ReadInterruptAcceptanceConfig,
  evidence: ItemEvidence,
  readPage: ReadInterruptUpdatePage,
): Promise<EvidenceFailure> {
  let skip = 0;
  for (let page = 0; page < config.maxUpdatePages; page += 1) {
    const url = entry.updatesUrl.replace(/([?&])\$skip=\d+/, `$1$skip=${skip}`);
    const outcome = await readPage(url);
    const updates = (outcome.raw as { value?: unknown } | null)?.value;
    if (!Array.isArray(updates)) return outcome;
    for (const update of updates) applyUpdate(update, config, evidence);
    if (updates.length === 0 || updates.length < config.updatePageSize) return null;
    skip += updates.length;
  }
  return "limit";
}

function applyComment(raw: unknown, acceptanceTag: string, evidence: ItemEvidence): void {
  const comment = raw as { text?: unknown; createdDate?: unknown };
  if (
    typeof comment.text === "string" &&
    comment.text.includes(acceptanceTag) &&
    typeof comment.createdDate === "string"
  ) {
    evidence.notes.push({ text: comment.text, createdDate: comment.createdDate });
  }
}

interface CommentPage {
  comments: unknown[];
  continuationToken?: unknown;
}

function commentPageOf(raw: unknown): CommentPage | null {
  const body = raw as { comments?: unknown; continuationToken?: unknown } | null;
  return Array.isArray(body?.comments) ? { ...body, comments: body.comments } : null;
}

function nextCommentPageUrl(baseUrl: string, body: CommentPage, taggedAt: number): string | null {
  if (body.comments.length === 0) return null;
  const reachedEarlierLifetime = body.comments.some((comment) => {
    const createdDate = (comment as { createdDate?: unknown }).createdDate;
    const createdAt = typeof createdDate === "string" ? Date.parse(createdDate) : Number.NaN;
    return !Number.isNaN(createdAt) && createdAt < taggedAt;
  });
  if (reachedEarlierLifetime || typeof body.continuationToken !== "string") return null;
  const token = body.continuationToken;
  return token.length > 0 ? `${baseUrl}&continuationToken=${encodeURIComponent(token)}` : null;
}

/** Follow newest-first Discussion pages only as far back as the current Interrupt lifetime. */
async function collectCommentEvidence(
  entry: ReadInterruptAcceptanceConfig["requests"][number],
  config: ReadInterruptAcceptanceConfig,
  evidence: ItemEvidence,
  readPage: ReadInterruptUpdatePage,
): Promise<EvidenceFailure> {
  const taggedAt = Date.parse(evidence.taggedAt ?? "");
  if (Number.isNaN(taggedAt) || isInterruptAccepted(evidence, config.acceptanceTag)) return null;
  let url = entry.commentsUrl;
  for (let page = 0; page < config.maxCommentPages; page += 1) {
    const outcome = await readPage(url);
    const body = commentPageOf(outcome.raw);
    if (body === null) return outcome;
    for (const comment of body.comments) applyComment(comment, config.acceptanceTag, evidence);
    if (isInterruptAccepted(evidence, config.acceptanceTag)) return null;
    const nextUrl = nextCommentPageUrl(entry.commentsUrl, body, taggedAt);
    if (nextUrl === null) return null;
    url = nextUrl;
  }
  return "limit";
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
    const updatesFailure = await collectUpdateEvidence(entry, config, evidence, readPage);
    if (updatesFailure !== null) {
      return fail(entry.workItemId, updatesFailure === "limit" ? null : updatesFailure);
    }
    const commentsFailure = await collectCommentEvidence(entry, config, evidence, readPage);
    if (commentsFailure !== null) {
      return fail(entry.workItemId, commentsFailure === "limit" ? null : commentsFailure);
    }
    result.evidence.push(evidence);
  };
  const pump = async (): Promise<void> => {
    while (next < config.requests.length) await readItem(config.requests[next++]!);
  };
  const width = Math.min(config.requests.length, Math.max(1, config.concurrency));
  await Promise.all(Array.from({ length: width }, pump));
  return result;
}
