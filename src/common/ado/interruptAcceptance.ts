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
  const taggedAt = parseTimestamp(evidence?.taggedAt ?? null);
  const token = acceptanceTag.trim();
  if (evidence === undefined || taggedAt === null || token.length === 0) return false;

  return evidence.notes.some((note) => {
    const notedAt = parseTimestamp(note.createdDate);
    return notedAt !== null && notedAt >= taggedAt && note.text.includes(token);
  });
}

function parseTimestamp(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}
