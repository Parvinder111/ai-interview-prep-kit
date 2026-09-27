import { extractRequirements } from "../generation/extractRequirements.js";
import { generateCompanyBrief } from "../generation/companyBrief.js";
import {
  generateQuestionsForRequirementGroup,
  generateSystemDesignQuestions,
  generateCompanyFitQuestions,
  makeIdFactory,
} from "../generation/questions.js";
import { deriveFlashcards } from "../generation/flashcards.js";
import { checkCoverage } from "../generation/coverage.js";
import { buildSchedule } from "../generation/schedule.js";
import { crawlCompanySite } from "../retrieval/crawl.js";
import { searchInterviewDiscussion } from "../retrieval/discussion.js";
import { normalizeUrl } from "../security/url.js";
import { validateKit } from "../validation/kitSchema.js";

const MAX_NICE_REQUIREMENTS = 6; // caps call volume so a long JD doesn't blow the rate/time budget
const MAX_PASSES = 2; // initial generation + one gap-filling pass; see README for the reasoning

export class PipelineError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// The single sequenced pipeline described in Section 3. Both the interactive app (app/api/kits)
// and the batch entry point (scripts/evaluate.js) call this exact function — never a parallel
// reimplementation — so their behaviour is guaranteed identical.
export async function runPipeline({ jd, companyUrl, days }) {
  if (!jd || !jd.trim()) throw new PipelineError("Job description is empty.", "EMPTY_JD");

  const warnings = [];
  const researchedAt = new Date().toISOString();

  // Step 1: extract requirements from the pasted JD. Pasted text needs no retrieval of its own.
  const extraction = await extractRequirements(jd);
  if (!extraction.ok) {
    throw new PipelineError(`Could not extract requirements from the job description: ${extraction.error.message}`, "EXTRACTION_FAILED");
  }
  if (extraction.requirements.length === 0) {
    warnings.push({ code: "THIN_JD", message: "The job description yielded no extractable requirements; the kit will be thin and honest about that." });
  }

  // Step 2: crawl the company site — homepage first, then best-first through ranked links —
  // looking for hiring/about pages. Unreachable sources are skipped and reported, never fatal.
  let crawlResult = { pages: [], skipped: [], hiringPageFound: false };
  let normalizedCompanyUrl = companyUrl;
  try {
    const parsed = normalizeUrl(companyUrl);
    normalizedCompanyUrl = parsed.href;
    crawlResult = await crawlCompanySite(parsed.href);
  } catch (err) {
    warnings.push({ code: "COMPANY_UNREACHABLE", message: `Company site could not be crawled: ${err.message}` });
  }
  if (crawlResult.skipped.length) {
    for (const s of crawlResult.skipped) {
      warnings.push({ code: "SOURCE_SKIPPED", message: `Skipped ${s.url}: ${s.reason}` });
    }
  }

  // Step 3: look for public discussion of the company's interview process (best-effort).
  const discussion = await searchInterviewDiscussion(extraction.company);
  if (!discussion.results.length) {
    warnings.push({ code: "NO_PUBLIC_DISCUSSION", message: "No public discussion of this company's interview process was found." });
  }

  // Step 4: company brief, generated only from what was actually retrieved (Section 10: an
  // honest thin brief beats a fabricated one).
  const brief = await generateCompanyBrief(extraction.company, crawlResult.pages, crawlResult.hiringPageFound);
  const hiringNotes = [brief.hiring_notes, discussion.results.map((r) => r.title).join("; ")].filter(Boolean).join(" | ");

  const roleContext = { title: extraction.role_title, seniority: extraction.seniority, hiringNotes };
  const nextQId = makeIdFactory("q");

  // Step 5: generate questions. Technical and behavioural requirements are split into separate
  // calls with separate instructions (Section 3) — never combined. "Nice" requirements are capped
  // to keep total call volume bounded for the batch command's time/rate budget; every "must"
  // requirement is always included.
  const musts = extraction.requirements.filter((r) => r.priority === "must");
  const nices = extraction.requirements.filter((r) => r.priority === "nice").slice(0, MAX_NICE_REQUIREMENTS);
  const inScope = [...musts, ...nices];
  const technicalReqs = inScope.filter((r) => r.kind !== "behavioural");
  const behaviouralReqs = inScope.filter((r) => r.kind === "behavioural");

  let questions = [];

  async function generatePass(targetRequirements) {
    const technical = targetRequirements.filter((r) => r.kind !== "behavioural");
    const behavioural = targetRequirements.filter((r) => r.kind === "behavioural");
    const [techResult, behResult] = await Promise.all([
      generateQuestionsForRequirementGroup(technical, "technical", roleContext, nextQId, 2),
      generateQuestionsForRequirementGroup(behavioural, "behavioural", roleContext, nextQId, 2),
    ]);
    if (techResult.error) warnings.push({ code: "QUESTION_GEN_FAILED", message: `Technical question generation failed: ${techResult.error.message}` });
    if (behResult.error) warnings.push({ code: "QUESTION_GEN_FAILED", message: `Behavioural question generation failed: ${behResult.error.message}` });
    return [...techResult.items, ...behResult.items];
  }

  questions.push(...(await generatePass(inScope)));

  const [systemDesign, companyFit] = await Promise.all([
    generateSystemDesignQuestions(roleContext, technicalReqs, nextQId, technicalReqs.length ? 2 : 0),
    generateCompanyFitQuestions(brief, roleContext, nextQId, 2),
  ]);
  questions.push(...systemDesign.items, ...companyFit.items);

  // Step 6 (deterministic, Section 3/4): compare questions against requirements, find gaps.
  let passes = 1;
  let coverage = checkCoverage(extraction.requirements, questions);

  // The second pass: act on gaps by generating questions targeted at exactly the uncovered
  // must-have requirements, then check again. Capped at MAX_PASSES total — see README for why.
  while (coverage.uncoveredRequirementIds.length > 0 && passes < MAX_PASSES) {
    const gapRequirements = extraction.requirements.filter((r) => coverage.uncoveredRequirementIds.includes(r.id));
    questions.push(...(await generatePass(gapRequirements)));
    passes += 1;
    coverage = checkCoverage(extraction.requirements, questions);
  }
  if (coverage.uncoveredRequirementIds.length > 0) {
    warnings.push({ code: "COVERAGE_GAP", message: `${coverage.uncoveredRequirementIds.length} must-have requirement(s) remain uncovered after ${passes} pass(es).` });
  }

  // Step 7 (deterministic): flashcards derived from the finished question bank.
  const flashcards = deriveFlashcards(questions);

  // Step 8 (deterministic, Section 8): allocate the schedule across exactly the days requested.
  const schedule = buildSchedule(extraction.requirements, questions, days);

  const kit = {
    source: {
      company: extraction.company,
      company_url: normalizedCompanyUrl,
      role: extraction.role_title,
      location: extraction.location,
      jd_chars: jd.length,
      researched_at: researchedAt,
      pages_used: crawlResult.pages.map((p) => p.url),
    },
    company_brief: {
      summary: brief.summary,
      what_they_do: brief.what_they_do,
      sources: brief.sources,
    },
    role: {
      title: extraction.role_title,
      seniority: extraction.seniority,
      responsibilities: extraction.responsibilities,
      requirements: extraction.requirements,
    },
    questions: questions.map((q) => ({ ...q, state: q.state || "generated" })),
    flashcards: flashcards.map((f) => ({ ...f, state: "generated" })),
    schedule,
    coverage: { uncovered_requirement_ids: coverage.uncoveredRequirementIds, passes },
  };

  const validation = validateKit(kit);
  if (!validation.ok) {
    throw new PipelineError(`Generated kit failed structure validation: ${validation.errors.join("; ")}`, "INVALID_KIT_STRUCTURE");
  }

  return { kit: validation.kit, warnings };
}
