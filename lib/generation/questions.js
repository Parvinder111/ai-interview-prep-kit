import { callLLMJson, LLMError } from "../llm/client.js";
import { frameUntrustedContent, INJECTION_GUARD } from "../llm/promptSafety.js";
import { makeIdFactory } from "../pipeline/ids.js";

// Requirement-scoped, category-separated generation is the deliberate design point in Section 3:
// a technical requirement and a behavioural requirement never share a call or a system prompt —
// "5+ years of React" needs different instructions from "mentors junior engineers". Requirements
// of the *same* kind are still batched into one call (each tagged by index and mapped back to its
// requirement id afterwards): the brief's constraint is about not mixing categories in one call,
// not about isolating every requirement individually, and batching is what keeps this pipeline
// inside a free tier's tokens-per-minute budget and the batch command's 15-minute ceiling.
const CATEGORY_INSTRUCTIONS = {
  technical: "Write technical interview questions that verify hands-on depth with the specific skill in each requirement below. Prefer questions that require explaining trade-offs or debugging a scenario over trivia.",
  behavioural: "Write behavioural interview questions (STAR-style) that probe the specific soft-skill or experience in each requirement below. Avoid generic \"tell me about yourself\" questions — anchor each one to its requirement.",
  "system-design": "Write system-design interview questions appropriate for this role's seniority, grounded in the technologies/requirements listed below.",
  "company-fit": "Write company-fit / motivation interview questions that connect a candidate's likely background to what this specific company does, based on the company brief below.",
};

function roleLine(roleContext) {
  const bits = [roleContext.title || "(untitled role)"];
  if (roleContext.seniority) bits.push(`seniority: ${roleContext.seniority}`);
  if (roleContext.hiringNotes) bits.push(`known hiring process: ${roleContext.hiringNotes}`);
  return bits.join(" | ");
}

function parseQuestionList(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter((q) => q && typeof q.prompt === "string" && q.prompt.trim())
    .map((q) => ({
      prompt: q.prompt.trim(),
      answer_outline: typeof q.answer_outline === "string" ? q.answer_outline.trim() : "",
      difficulty: [1, 2, 3].includes(q.difficulty) ? q.difficulty : 2,
    }));
}

// One call covering every requirement of a given kind. The model returns questions grouped by
// requirement index; we map that back to stable requirement ids in code (never trust the model
// to invent or preserve ids).
export async function generateQuestionsForRequirementGroup(requirements, category, roleContext, nextQId, perReqCount = 1) {
  if (requirements.length === 0) return { items: [], error: null };

  const system = `You generate interview questions for several requirements of a job posting at once. ${CATEGORY_INSTRUCTIONS[category]}
${INJECTION_GUARD}
Respond with strict JSON only: { "groups": [ { "requirement_index": 1, "questions": [ { "prompt": "", "answer_outline": "", "difficulty": 1 } ] } ] }
Produce exactly one group per requirement index given, with ${perReqCount} question(s) each. difficulty is an integer 1-3.`;

  const reqList = requirements.map((r, i) => `REQ_${i + 1} (${r.priority}-have): ${r.text}`).join("\n");
  const user = `${roleLine(roleContext)}\n\n${frameUntrustedContent("REQUIREMENTS", reqList)}`;

  try {
    const result = await callLLMJson({ system, user, temperature: 0.6 });
    const groups = Array.isArray(result.groups) ? result.groups : [];
    const items = [];
    for (const group of groups) {
      const idx = Number(group.requirement_index) - 1;
      const requirement = requirements[idx];
      if (!requirement) continue;
      for (const q of parseQuestionList(group.questions)) {
        items.push({ id: nextQId(), requirement_ids: [requirement.id], category, ...q });
      }
    }
    return { items, error: null };
  } catch (err) {
    return { items: [], error: err instanceof LLMError ? err : new LLMError(err.message, "QUESTION_GEN_FAILED") };
  }
}

export async function generateSystemDesignQuestions(roleContext, requirements, nextQId, count = 2) {
  const relevant = requirements.filter((r) => r.kind !== "behavioural");
  if (relevant.length === 0) return { items: [], error: null };

  const system = `You generate a small set of interview questions for one specific slice of a job. ${CATEGORY_INSTRUCTIONS["system-design"]}\n${INJECTION_GUARD}\nRespond with strict JSON only: { "questions": [ { "prompt": "", "answer_outline": "", "difficulty": 1 } ] }`;
  const user = `${roleLine(roleContext)}\nGenerate ${count} system-design question(s).\n\n${frameUntrustedContent("REQUIREMENTS", relevant.map((r) => `- ${r.text}`).join("\n"))}`;

  try {
    const result = await callLLMJson({ system, user, temperature: 0.6 });
    const ids = relevant.map((r) => r.id);
    const items = parseQuestionList(result.questions).map((q) => ({ id: nextQId(), requirement_ids: ids, category: "system-design", ...q }));
    return { items, error: null };
  } catch (err) {
    return { items: [], error: err instanceof LLMError ? err : new LLMError(err.message, "QUESTION_GEN_FAILED") };
  }
}

export async function generateCompanyFitQuestions(companyBrief, roleContext, nextQId, count = 2) {
  const system = `You generate a small set of interview questions for one specific slice of a job. ${CATEGORY_INSTRUCTIONS["company-fit"]}\n${INJECTION_GUARD}\nRespond with strict JSON only: { "questions": [ { "prompt": "", "answer_outline": "", "difficulty": 1 } ] }`;
  const user = `${roleLine(roleContext)}\nGenerate ${count} company-fit question(s).\n\n${frameUntrustedContent("COMPANY_BRIEF", `${companyBrief.summary}\n${companyBrief.what_they_do}`)}`;

  try {
    const result = await callLLMJson({ system, user, temperature: 0.6 });
    const items = parseQuestionList(result.questions).map((q) => ({ id: nextQId(), requirement_ids: [], category: "company-fit", ...q }));
    return { items, error: null };
  } catch (err) {
    return { items: [], error: err instanceof LLMError ? err : new LLMError(err.message, "QUESTION_GEN_FAILED") };
  }
}

export { makeIdFactory };
