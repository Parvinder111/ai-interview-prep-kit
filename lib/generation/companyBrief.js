import { callLLMJson, LLMError } from "../llm/client.js";
import { frameUntrustedContent, INJECTION_GUARD } from "../llm/promptSafety.js";

const SYSTEM = `You write a short, factual company brief from scraped web page text. ${INJECTION_GUARD}

Only state things the provided pages actually support. If the pages barely mention what the
company does, say so plainly instead of padding with generic claims — an honest "limited
information available" brief is correct behaviour, not a failure. Never invent funding, size,
founding year or product details that are not in the text. Respond with strict JSON only.`;

function buildUser(companyName, pages, hiringSummary) {
  const pageBlocks = pages
    .map((p, i) => frameUntrustedContent(`PAGE_${i + 1}_${p.url}`, `${p.title}\n${p.text}`))
    .join("\n\n");
  return `Company: ${companyName || "(name unknown, infer only if the pages make it obvious)"}

${pageBlocks || "(no pages were retrieved for this company)"}

${hiringSummary}

Respond with JSON exactly in this shape:
{
  "summary": "2-4 sentences, what the company is and does",
  "what_they_do": "1-2 sentences, product/market focus",
  "hiring_notes": "1-3 sentences on what the site says about how they hire, or empty string if nothing was found"
}`;
}

// Deterministic guard: if nothing was retrieved at all, don't call the model — go straight to an
// honest fallback. This removes any chance of the model fabricating a brief from nothing, which
// the brief explicitly calls out as worse than reporting a thin result.
export async function generateCompanyBrief(companyName, pages, hiringPageFound) {
  const sourceUrls = pages.map((p) => p.url);
  if (pages.length === 0) {
    return {
      ok: true,
      summary: companyName
        ? `We could not retrieve any pages from ${companyName}'s site, so no verified company summary is available.`
        : "We could not retrieve any pages from the company's site, so no verified company summary is available.",
      what_they_do: "Unknown — no company pages could be retrieved.",
      sources: [],
    };
  }

  const hiringSummary = hiringPageFound
    ? "A hiring/careers-related page was found among the pages above; use it if it adds useful hiring-process detail."
    : "No dedicated hiring/careers page was found on this site.";

  try {
    const result = await callLLMJson({ system: SYSTEM, user: buildUser(companyName, pages, hiringSummary), temperature: 0.3 });
    return {
      ok: true,
      summary: result.summary || "",
      what_they_do: result.what_they_do || "",
      hiring_notes: result.hiring_notes || "",
      sources: sourceUrls,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof LLMError ? err : new LLMError(err.message, "BRIEF_FAILED"),
      summary: `A company brief could not be generated (${err.code || "LLM_ERROR"}). ${pages.length} page(s) were retrieved and are listed in sources.`,
      what_they_do: "",
      hiring_notes: "",
      sources: sourceUrls,
    };
  }
}
