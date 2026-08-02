import { isoEpoch } from "../datetime/isoEpoch";

export interface InterruptAcceptanceNote {
  text: string;
  createdDate: string;
}

export interface InterruptAcceptanceEvidence {
  /** The most recent time the interrupt tag was added, or null when no such update was found. */
  taggedAt: string | null;
  notes: readonly InterruptAcceptanceNote[];
}

/**
 * Whether an interrupt was accepted during its current tagged lifetime.
 *
 * Comparing against the most recent tag addition prevents an old acceptance from surviving an
 * untag/re-tag cycle. The exact boundary is accepted because a tag and its acceptance note may be
 * written in the same Azure DevOps revision.
 */
export function isInterruptAccepted(
  evidence: InterruptAcceptanceEvidence | undefined,
  acceptanceTag: string,
): boolean {
  const taggedAt = isoEpoch(evidence?.taggedAt);
  const token = acceptanceTag.trim();
  if (evidence === undefined || taggedAt === null || token.length === 0) return false;

  return evidence.notes.some((note) => {
    const notedAt = isoEpoch(note.createdDate);
    return notedAt !== null && notedAt >= taggedAt && note.text.includes(token);
  });
}
