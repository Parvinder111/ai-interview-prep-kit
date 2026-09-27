import { makeIdFactory } from "../pipeline/ids.js";

// Flashcards are derived deterministically from the finished question bank rather than through a
// separate LLM call: the brief only lists question generation as an explicit pipeline step, and
// every flashcard needs to trace back to the same requirement_ids as its source question anyway,
// so a transform keeps that traceability exact and avoids an extra rate-limited call per card.
export function deriveFlashcards(questions) {
  const nextFId = makeIdFactory("f");
  return questions
    .filter((q) => q.answer_outline)
    .map((q) => ({
      id: nextFId(),
      front: q.prompt,
      back: q.answer_outline.length > 280 ? `${q.answer_outline.slice(0, 277)}...` : q.answer_outline,
      requirement_ids: q.requirement_ids || [],
    }));
}
