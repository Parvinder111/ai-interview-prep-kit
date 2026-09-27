import { callLLMJson, LLMError } from "../llm/client.js";
import { frameUntrustedContent, INJECTION_GUARD } from "../llm/promptSafety.js";
import { makeIdFactory } from "../pipeline/ids.js";

const SYSTEM = `You extract structured facts from a single job description. ${INJECTION_GUARD}

Rules:
- Only extract requirements the text actually states or clearly implies. If the description is thin, extract fewer requirements rather than inventing plausible-sounding ones — under-extraction is far better than fabrication.
- "kind" is "technical" (a specific tool/language/system skill), "behavioural" (soft skills, collaboration, mentoring, communication) or "domain" (industry/domain knowledge, e.g. "fintech experience", "healthcare compliance").
- "priority" is "must" only when the text uses language of requirement ("required", "must have", "X+ years of", "you will need"). Use "nice" for anything phrased as a bonus ("nice to have", "bonus points for", "preferred", "a plus").
- Respond with strict JSON only, matching the schema in the user message. No prose, no markdown fences.`;

function buildUser(jd) {
  return `Extract company/role metadata and requirements from this job description.

${frameUntrustedContent("JOB_DESCRIPTION", jd)}

Respond with JSON exactly in this shape:
{
  "company": "string or empty if not stated",
  "role_title": "string",
  "seniority": "string, e.g. Junior/Mid/Senior/Staff, or empty if unclear",
  "location": "string or empty if not stated",
  "responsibilities": ["short phrase", "..."],
  "requirements": [
    { "text": "verbatim-ish requirement text", "kind": "technical|behavioural|domain", "priority": "must|nice" }
  ]
}`;
}

export async function extractRequirements(jd) {
  const nextReqId = makeIdFactory("r");
  try {
    const result = await callLLMJson({ system: SYSTEM, user: buildUser(jd), temperature: 0.2 });
    const requirements = Array.isArray(result.requirements)
      ? result.requirements
          .filter((r) => r && typeof r.text === "string" && r.text.trim())
          .map((r) => ({
            id: nextReqId(),
            text: r.text.trim(),
            kind: ["technical", "behavioural", "domain"].includes(r.kind) ? r.kind : "technical",
            priority: r.priority === "must" ? "must" : "nice",
          }))
      : [];

    return {
      ok: true,
      company: result.company || "",
      role_title: result.role_title || "",
      seniority: result.seniority || "",
      location: result.location || "",
      responsibilities: Array.isArray(result.responsibilities) ? result.responsibilities.filter(Boolean) : [],
      requirements,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof LLMError ? err : new LLMError(err.message, "EXTRACTION_FAILED"),
      company: "",
      role_title: "",
      seniority: "",
      location: "",
      responsibilities: [],
      requirements: [],
    };
  }
}
