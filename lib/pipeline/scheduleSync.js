const MINUTES_BY_DIFFICULTY = { 1: 15, 2: 25, 3: 40 };

// Keeps the schedule referentially valid after questions are added/removed/moved without doing a
// full re-allocation: every question_ids entry must refer to a question that exists (Appendix A
// invariant). Dropped questions are removed from whichever day held them and that day's minutes
// are recomputed; days are never removed, so "days_available" stays exactly what the user asked
// for even as the underlying question set changes.
export function pruneScheduleReferences(schedule, questionsById) {
  const days = schedule.days.map((day) => {
    const question_ids = day.question_ids.filter((qid) => questionsById.has(qid));
    const minutes = question_ids.reduce((sum, qid) => {
      const q = questionsById.get(qid);
      return sum + (MINUTES_BY_DIFFICULTY[q?.difficulty] || 20);
    }, 0);
    return { ...day, question_ids, minutes };
  });
  return { ...schedule, days };
}
