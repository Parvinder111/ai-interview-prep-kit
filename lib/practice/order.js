// Confidence-weighted ordering for the next practice session (Section 7). We chose the simple
// option the brief explicitly allows over a full spaced-repetition interval: this assessment's
// review cycles are short (days, not months), so recency-weighted "what did you feel worst about
// most recently" gives a better next-session order than a scheduling interval would, for much
// less code. A card never reviewed is treated as maximally unconfident (rank 0) so new material
// always surfaces before well-known material.
export function orderForNextSession(flashcards, practiceRecords) {
  const latestByCard = new Map();
  for (const record of practiceRecords) {
    const prev = latestByCard.get(record.flashcardId);
    if (!prev || new Date(record.reviewedAt) >= new Date(prev.reviewedAt)) {
      latestByCard.set(record.flashcardId, record);
    }
  }
  return [...flashcards].sort((a, b) => {
    const confA = latestByCard.get(a.id)?.confidence ?? 0;
    const confB = latestByCard.get(b.id)?.confidence ?? 0;
    return confA - confB;
  });
}

export function coverageSummary(flashcards, practiceRecords) {
  const reviewedIds = new Set(practiceRecords.map((r) => r.flashcardId));
  const covered = flashcards.filter((f) => reviewedIds.has(f.id)).length;
  return { covered, total: flashcards.length, remaining: flashcards.length - covered };
}
