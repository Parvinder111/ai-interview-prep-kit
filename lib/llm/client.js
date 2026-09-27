import Groq from "groq-sdk";

let client = null;
function getClient() {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY is not set. Copy .env.example to .env.local and fill it in.");
  }
  if (!client) client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return client;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export class LLMError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// A single deliberate call to the model, always in JSON mode. Retries with exponential backoff
// on 429 (token-per-minute limits are the brief's explicit warning) and on transient 5xx errors,
// and on a response that fails to parse as JSON (the model occasionally truncates or wraps
// output in prose despite json_object mode). Throws LLMError only after exhausting retries, so
// callers can decide how to degrade (e.g. report a gap rather than fail the whole kit).
export async function callLLMJson({ system, user, maxRetries = 4, temperature = 0.4 }) {
  const groq = getClient();
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const completion = await groq.chat.completions.create({
        model,
        temperature,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      const raw = completion.choices?.[0]?.message?.content;
      if (!raw) throw new LLMError("Empty response from model.", "EMPTY_RESPONSE");
      try {
        return JSON.parse(raw);
      } catch {
        throw new LLMError("Model returned invalid JSON.", "INVALID_JSON");
      }
    } catch (err) {
      lastErr = err;
      const status = err?.status || err?.response?.status;
      const retryable = status === 429 || (status >= 500 && status < 600) || err.code === "INVALID_JSON" || err.code === "EMPTY_RESPONSE";
      if (!retryable || attempt === maxRetries) break;
      const retryAfterHeader = err?.headers?.["retry-after"];
      const wait = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 800 * 2 ** attempt;
      await sleep(wait);
    }
  }
  throw lastErr instanceof LLMError ? lastErr : new LLMError(lastErr?.message || "LLM call failed.", "LLM_UNAVAILABLE");
}
