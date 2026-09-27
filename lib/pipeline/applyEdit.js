import { checkCoverage } from "../generation/coverage.js";
import { pruneScheduleReferences } from "./scheduleSync.js";

function nextIdFactory(existingIds, prefix) {
  let max = 0;
  for (const id of existingIds) {
    const n = Number(String(id).replace(prefix, ""));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  let n = max;
  return () => `${prefix}${++n}`;
}

// All builder mutations (Section 6) go through here as pure, synchronous, no-LLM operations on a
// kit object. Every edit to a previously-generated question/flashcard flips its state from
// "generated" to "edited"; every hand-added one is created as "user". Both are then pinned
// against a future category regeneration (see lib/pipeline/regenerateSection.js).
export function applyEdit(kit, edit) {
  switch (edit.op) {
    case "edit_question": {
      const questions = kit.questions.map((q) => {
        if (q.id !== edit.id) return q;
        const next = { ...q, ...edit.fields };
        return { ...next, state: q.state === "user" ? "user" : "edited" };
      });
      return recompute({ ...kit, questions });
    }
    case "edit_flashcard": {
      const flashcards = kit.flashcards.map((f) => {
        if (f.id !== edit.id) return f;
        const next = { ...f, ...edit.fields };
        return { ...next, state: f.state === "user" ? "user" : "edited" };
      });
      return { ...kit, flashcards };
    }
    case "edit_brief": {
      return { ...kit, company_brief: { ...kit.company_brief, ...edit.fields } };
    }
    case "reorder_questions": {
      const order = edit.order;
      const byId = new Map(kit.questions.map((q) => [q.id, q]));
      const reordered = order.map((id) => byId.get(id)).filter(Boolean);
      const remaining = kit.questions.filter((q) => !order.includes(q.id));
      return { ...kit, questions: [...reordered, ...remaining] };
    }
    case "move_question_category": {
      const questions = kit.questions.map((q) =>
        q.id === edit.id ? { ...q, category: edit.category, state: q.state === "user" ? "user" : "edited" } : q
      );
      return { ...kit, questions };
    }
    case "add_question": {
      const nextId = nextIdFactory(kit.questions.map((q) => q.id), "q")();
      const question = {
        id: nextId,
        requirement_ids: edit.question.requirement_ids || [],
        category: edit.question.category,
        prompt: edit.question.prompt,
        answer_outline: edit.question.answer_outline || "",
        difficulty: edit.question.difficulty || 2,
        state: "user",
      };
      return recompute({ ...kit, questions: [...kit.questions, question] });
    }
    case "delete_question": {
      const questions = kit.questions.filter((q) => q.id !== edit.id);
      const remainingIds = new Set(questions.map((q) => q.id));
      const flashcards = kit.flashcards.filter(
        (f) => f.state !== "generated" || f.requirement_ids.length === 0 || f.requirement_ids.some((rid) => questions.some((q) => q.requirement_ids.includes(rid)))
      );
      const schedule = pruneScheduleReferences(kit.schedule, new Map(questions.map((q) => [q.id, q])));
      void remainingIds;
      return recompute({ ...kit, questions, flashcards, schedule });
    }
    case "add_flashcard": {
      const nextId = nextIdFactory(kit.flashcards.map((f) => f.id), "f")();
      const flashcard = {
        id: nextId,
        front: edit.flashcard.front,
        back: edit.flashcard.back,
        requirement_ids: edit.flashcard.requirement_ids || [],
        state: "user",
      };
      return { ...kit, flashcards: [...kit.flashcards, flashcard] };
    }
    case "delete_flashcard": {
      return { ...kit, flashcards: kit.flashcards.filter((f) => f.id !== edit.id) };
    }
    default:
      throw new Error(`Unknown edit op "${edit.op}"`);
  }
}

function recompute(kit) {
  const coverage = checkCoverage(kit.role.requirements, kit.questions);
  return { ...kit, coverage: { uncovered_requirement_ids: coverage.uncoveredRequirementIds, passes: kit.coverage.passes } };
}
