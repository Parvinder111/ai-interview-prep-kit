// Deterministic by design (Section 3): comparing generated questions against extracted
// requirements is a set-membership check, not a judgment call, so it is never handed to the model.
export function checkCoverage(requirements, questions) {
  const covered = new Set();
  for (const q of questions) {
    for (const rid of q.requirement_ids || []) covered.add(rid);
  }
  const uncovered = requirements.filter((r) => r.priority === "must" && !covered.has(r.id)).map((r) => r.id);
  return { uncoveredRequirementIds: uncovered, coveredRequirementIds: [...covered] };
}
