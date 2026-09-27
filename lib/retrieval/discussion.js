import * as cheerio from "cheerio";

const TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 8000);

// Looks for public discussion of a company's interview process via DuckDuckGo's HTML (no-JS,
// no-API-key) search endpoint. This is a best-effort source, not a hard dependency: search can be
// blocked, rate-limited or simply turn up nothing, and per Section 10 that must degrade to an
// honest "found nothing" rather than a crash or a fabricated result.
export async function searchInterviewDiscussion(companyName) {
  if (!companyName || !companyName.trim()) {
    return { ok: true, results: [], reason: "NO_COMPANY_NAME" };
  }
  const query = `${companyName} interview process questions glassdoor OR blind OR reddit`;
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "InterviewPrepKitBot/1.0 (+educational assessment project)" },
    });
    if (!res.ok) {
      return { ok: true, results: [], reason: `SEARCH_HTTP_${res.status}` };
    }
    const html = await res.text();
    const $ = cheerio.load(html);
    const results = [];
    $(".result__a").each((_, el) => {
      if (results.length >= 5) return;
      const title = $(el).text().trim();
      const href = $(el).attr("href");
      if (title && href) results.push({ title, url: href });
    });
    return { ok: true, results, reason: results.length ? null : "NO_RESULTS" };
  } catch (err) {
    return { ok: true, results: [], reason: "SEARCH_UNAVAILABLE", message: err.message };
  }
}
