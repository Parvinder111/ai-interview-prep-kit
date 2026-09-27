import { z } from "zod";

// Mirrors Appendix A field-for-field. Field names and nesting must match exactly per the brief;
// this is what "validate a generated kit against the expected structure before saving it"
// (Section 13) actually checks against.
export const KitSchema = z.object({
  source: z.object({
    company: z.string(),
    company_url: z.string(),
    role: z.string(),
    location: z.string(),
    jd_chars: z.number().int().nonnegative(),
    researched_at: z.string(),
    pages_used: z.array(z.string()),
  }),
  company_brief: z.object({
    summary: z.string(),
    what_they_do: z.string(),
    sources: z.array(z.string()),
  }),
  role: z.object({
    title: z.string(),
    seniority: z.string(),
    responsibilities: z.array(z.string()),
    requirements: z.array(
      z.object({
        id: z.string(),
        text: z.string(),
        kind: z.enum(["technical", "behavioural", "domain"]),
        priority: z.enum(["must", "nice"]),
      })
    ),
  }),
  questions: z.array(
    z.object({
      id: z.string(),
      requirement_ids: z.array(z.string()),
      category: z.enum(["technical", "behavioural", "system-design", "company-fit"]),
      prompt: z.string(),
      answer_outline: z.string(),
      difficulty: z.number().int().min(1).max(3),
      state: z.enum(["generated", "edited", "user"]).default("generated"),
    })
  ),
  flashcards: z.array(
    z.object({
      id: z.string(),
      front: z.string(),
      back: z.string(),
      requirement_ids: z.array(z.string()),
      state: z.enum(["generated", "edited", "user"]).default("generated"),
    })
  ),
  schedule: z.object({
    days_available: z.number().int().positive(),
    days: z.array(
      z.object({
        day: z.number().int().positive(),
        focus: z.string(),
        question_ids: z.array(z.string()),
        minutes: z.number().int().nonnegative(),
      })
    ),
  }),
  coverage: z.object({
    uncovered_requirement_ids: z.array(z.string()),
    passes: z.number().int().nonnegative(),
  }),
});

// Cross-field invariant the brief calls out explicitly: "every question_ids entry in the
// schedule must refer to a question that exists." zod alone can't express a cross-array
// reference, so this runs as a second check after shape validation passes.
export function validateKitReferences(kit) {
  const errors = [];
  const questionIds = new Set(kit.questions.map((q) => q.id));
  const requirementIds = new Set(kit.role.requirements.map((r) => r.id));

  for (const day of kit.schedule.days) {
    for (const qid of day.question_ids) {
      if (!questionIds.has(qid)) errors.push(`schedule day ${day.day} references unknown question id "${qid}"`);
    }
  }
  for (const q of kit.questions) {
    for (const rid of q.requirement_ids) {
      if (!requirementIds.has(rid)) errors.push(`question ${q.id} references unknown requirement id "${rid}"`);
    }
  }
  for (const f of kit.flashcards) {
    for (const rid of f.requirement_ids) {
      if (!requirementIds.has(rid)) errors.push(`flashcard ${f.id} references unknown requirement id "${rid}"`);
    }
  }
  return errors;
}

export function validateKit(kit) {
  const result = KitSchema.safeParse(kit);
  if (!result.success) {
    return { ok: false, errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const refErrors = validateKitReferences(result.data);
  if (refErrors.length) return { ok: false, errors: refErrors };
  return { ok: true, kit: result.data };
}
