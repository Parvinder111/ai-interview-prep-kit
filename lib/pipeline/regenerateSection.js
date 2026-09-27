import {
  generateQuestionsForRequirementGroup,
  generateSystemDesignQuestions,
  generateCompanyFitQuestions,
  makeIdFactory,
} from "../generation/questions.js";
import { generateCompanyBrief } from "../generation/companyBrief.js";
import { deriveFlashcards } from "../generation/flashcards.js";
import { checkCoverage } from "../generation/coverage.js";
import { buildSchedule } from "../generation/schedule.js";
import { crawlCompanySite } from "../retrieval/crawl.js";
import { normalizeUrl } from "../security/url.js";
import { pruneScheduleReferences } from "./scheduleSync.js";
import { validateKit } from "../validation/kitSchema.js";

const QUESTION_CATEGORIES = ["technical", "behavioural", "system-design", "company-fit"];

function nextIdFactory(existingIds, prefix) {
  let max = 0;
  for (const id of existingIds) {
    const n = Number(String(id).replace(prefix, ""));
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  let n = max;
  return () => `${prefix}${++n}`;
}

// The core state model for "generated / edited / pinned" (Section 6, the part the brief calls
// the hardest state problem): every question and flashcard carries a `state` field —
// "generated" (safe to discard on a category regeneration), "edited" (a generated item the user
// changed — pinned) or "user" (added by hand — pinned). Regenerating a category only ever
// replaces items still marked "generated" in that scope; anything the user touched survives by
// construction, because we never look at it.
export async function regenerateSection(kit, section, { companyUrl } = {}) {
  const warnings = [];

  if (section === "company_brief") {
    let crawlResult = { pages: [], hiringPageFound: false };
    const url = companyUrl || kit.source.company_url;
    try {
      const parsed = normalizeUrl(url);
      crawlResult = await crawlCompanySite(parsed.href);
    } catch (err) {
      warnings.push({ code: "COMPANY_UNREACHABLE", message: err.message });
    }
    const brief = await generateCompanyBrief(kit.source.company, crawlResult.pages, crawlResult.hiringPageFound);
    const next = {
      ...kit,
      company_brief: { summary: brief.summary, what_they_do: brief.what_they_do, sources: brief.sources },
      source: { ...kit.source, pages_used: crawlResult.pages.map((p) => p.url) },
    };
    return finalize(next, warnings);
  }

  if (section === "schedule") {
    const questionsById = new Map(kit.questions.map((q) => [q.id, q]));
    const schedule = buildSchedule(kit.role.requirements, kit.questions, kit.schedule.days_available);
    return finalize({ ...kit, schedule: pruneScheduleReferences(schedule, questionsById) }, warnings);
  }

  if (QUESTION_CATEGORIES.includes(section)) {
    const pinned = kit.questions.filter((q) => q.category === section && q.state !== "generated");
    const otherCategories = kit.questions.filter((q) => q.category !== section);
    const nextQId = nextIdFactory(kit.questions.map((q) => q.id), "q");

    const roleContext = { title: kit.role.title, seniority: kit.role.seniority, hiringNotes: kit.company_brief.hiring_notes || "" };

    let freshItems = [];
    if (section === "technical" || section === "behavioural") {
      const requirements = kit.role.requirements.filter((r) => (section === "behavioural" ? r.kind === "behavioural" : r.kind !== "behavioural"));
      const result = await generateQuestionsForRequirementGroup(requirements, section, roleContext, nextQId, 2);
      if (result.error) warnings.push({ code: "QUESTION_GEN_FAILED", message: result.error.message });
      freshItems = result.items;
    } else if (section === "system-design") {
      const requirements = kit.role.requirements.filter((r) => r.kind !== "behavioural");
      const result = await generateSystemDesignQuestions(roleContext, requirements, nextQId, requirements.length ? 2 : 0);
      freshItems = result.items;
    } else if (section === "company-fit") {
      const result = await generateCompanyFitQuestions(kit.company_brief, roleContext, nextQId, 2);
      freshItems = result.items;
    }

    let questions = [...otherCategories, ...pinned, ...freshItems];

    let coverage = checkCoverage(kit.role.requirements, questions);
    if (coverage.uncoveredRequirementIds.length > 0) {
      const matchesThisSectionsKind = (r) => (section === "behavioural" ? r.kind === "behavioural" : r.kind !== "behavioural");
      const gapRequirements = kit.role.requirements.filter((r) => coverage.uncoveredRequirementIds.includes(r.id) && matchesThisSectionsKind(r));
      if (gapRequirements.length) {
        const gapCategory = section === "behavioural" ? "behavioural" : "technical";
        const gapResult = await generateQuestionsForRequirementGroup(gapRequirements, gapCategory, roleContext, nextQId, 1);
        questions = [...questions, ...gapResult.items];
      }
      coverage = checkCoverage(kit.role.requirements, questions);
    }

    // Flashcards: keep anything the user touched or that belongs to a question outside this
    // category untouched; drop flashcards whose source "generated" question in this category was
    // just replaced, and derive fresh ones for the new questions.
    const keptFlashcards = kit.flashcards.filter((f) => {
      if (f.state !== "generated") return true; // user-added/edited: always pinned
      if (f.requirement_ids.length === 0) return true; // not tied to this category's requirements
      return f.requirement_ids.some((rid) => questions.some((q) => q.requirement_ids.includes(rid)));
    });
    const nextFId = nextIdFactory(kit.flashcards.map((f) => f.id), "f");
    const freshFlashcards = deriveFlashcards(freshItems).map((f) => ({ ...f, id: nextFId(), state: "generated" }));
    const flashcards = [...keptFlashcards, ...freshFlashcards];

    const questionsById = new Map(questions.map((q) => [q.id, q]));
    const schedule = pruneScheduleReferences(kit.schedule, questionsById);

    const next = {
      ...kit,
      questions,
      flashcards,
      schedule,
      coverage: { uncovered_requirement_ids: coverage.uncoveredRequirementIds, passes: kit.coverage.passes + 1 },
    };
    return finalize(next, warnings);
  }

  throw new Error(`Unknown section "${section}"`);
}

function finalize(kit, warnings) {
  const validation = validateKit(kit);
  if (!validation.ok) {
    throw new Error(`Regenerated kit failed structure validation: ${validation.errors.join("; ")}`);
  }
  return { kit: validation.kit, warnings };
}
