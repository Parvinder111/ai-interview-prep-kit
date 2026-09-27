const MINUTES_BY_DIFFICULTY = { 1: 15, 2: 25, 3: 40 };
const REVIEW_MINUTES_PER_ITEM = 10;

function priorityWeight(question, requirementById) {
  const hasMust = (question.requirement_ids || []).some((rid) => requirementById.get(rid)?.priority === "must");
  return (hasMust ? 100 : 0) + (question.difficulty || 2) * 10;
}

function categoryLabel(category) {
  return { technical: "Technical", behavioural: "Behavioural", "system-design": "System design", "company-fit": "Company fit" }[category] || category;
}

function focusFor(chunk) {
  if (chunk.length === 0) return "Open review — revisit earlier material or add your own questions";
  const categories = [...new Set(chunk.map((q) => categoryLabel(q.category)))];
  return categories.join(" + ");
}

// Deterministic, arithmetic scheduling (Section 3 & 8: explicitly not the model's job).
//
// Algorithm: sort every question by priority weight descending (must-linked and harder questions
// first), then split that ordered list into `daysAvailable` chunks, giving the earliest days the
// larger/leftover chunks. This guarantees higher-priority, harder material lands on earlier days.
// If there are more days than there is material to spread thinly (a 60-day schedule over a small
// JD), the surplus days become spaced-review days that cycle back through the highest-priority
// questions rather than sitting empty — every day still gets a real focus and a real duration.
export function buildSchedule(requirements, questions, daysAvailable) {
  const days = Math.max(1, Math.round(daysAvailable) || 1);
  const requirementById = new Map(requirements.map((r) => [r.id, r]));

  const ordered = [...questions].sort((a, b) => priorityWeight(b, requirementById) - priorityWeight(a, requirementById));

  const total = ordered.length;
  const scheduleDays = [];

  if (total === 0) {
    for (let d = 1; d <= days; d++) {
      scheduleDays.push({ day: d, focus: "No questions generated yet", question_ids: [], minutes: 0 });
    }
    return { days_available: days, days: scheduleDays };
  }

  const materialDays = Math.min(days, total);
  const baseChunk = Math.floor(total / materialDays);
  const remainder = total % materialDays;

  let cursor = 0;
  const chunks = [];
  for (let d = 0; d < materialDays; d++) {
    const size = baseChunk + (d < remainder ? 1 : 0);
    chunks.push(ordered.slice(cursor, cursor + size));
    cursor += size;
  }

  for (let d = 0; d < materialDays; d++) {
    const chunk = chunks[d];
    const minutes = chunk.reduce((sum, q) => sum + (MINUTES_BY_DIFFICULTY[q.difficulty] || 20), 0);
    scheduleDays.push({
      day: d + 1,
      focus: focusFor(chunk),
      question_ids: chunk.map((q) => q.id),
      minutes,
    });
  }

  // Surplus days beyond the material: spaced review cycling through the top-priority questions.
  for (let d = materialDays; d < days; d++) {
    const reviewSlice = ordered.slice(0, Math.min(3, total));
    scheduleDays.push({
      day: d + 1,
      focus: `Spaced review: ${focusFor(reviewSlice)}`,
      question_ids: reviewSlice.map((q) => q.id),
      minutes: reviewSlice.length * REVIEW_MINUTES_PER_ITEM,
    });
  }

  return { days_available: days, days: scheduleDays };
}
