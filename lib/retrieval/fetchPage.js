import * as cheerio from "cheerio";
import { normalizeUrl, assertSafeToFetch } from "../security/url.js";
import { isAllowedByRobots } from "./robots.js";

const MAX_BYTES = 2_000_000; // 2MB cap per page
const ALLOWED_CONTENT_TYPES = ["text/html", "application/xhtml+xml"];
const TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 8000);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Fetches one page, cleans it to readable text + outgoing links. Never throws for a normal
// "this source is unreachable" case — instead returns { ok: false, reason } so callers can skip
// and report a single source without failing the whole run (Section 2 requirement).
export async function fetchPage(rawUrl, { retries = 2, respectRobots = true } = {}) {
  let url;
  try {
    url = normalizeUrl(rawUrl);
  } catch (err) {
    return { ok: false, url: rawUrl, reason: err.code || "INVALID_URL", message: err.message };
  }

  try {
    await assertSafeToFetch(url);
  } catch (err) {
    return { ok: false, url: url.href, reason: err.code || "UNSAFE_URL", message: err.message };
  }

  if (respectRobots) {
    const allowed = await isAllowedByRobots(url.href).catch(() => true);
    if (!allowed) {
      return { ok: false, url: url.href, reason: "ROBOTS_DISALLOWED", message: "Disallowed by robots.txt." };
    }
  }

  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.href, {
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { "User-Agent": "InterviewPrepKitBot/1.0 (+educational assessment project)" },
      });

      if (res.status === 429 || res.status >= 500) {
        lastError = { reason: "RATE_LIMITED_OR_SERVER_ERROR", message: `HTTP ${res.status}` };
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt);
        continue;
      }
      if (!res.ok) {
        return { ok: false, url: url.href, reason: "HTTP_ERROR", message: `HTTP ${res.status}` };
      }

      const contentType = (res.headers.get("content-type") || "").split(";")[0].trim();
      if (contentType && !ALLOWED_CONTENT_TYPES.includes(contentType)) {
        return { ok: false, url: url.href, reason: "UNSUPPORTED_CONTENT_TYPE", message: contentType };
      }

      const reader = res.body?.getReader?.();
      let html = "";
      if (reader) {
        let received = 0;
        const decoder = new TextDecoder();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          received += value.length;
          if (received > MAX_BYTES) {
            reader.cancel();
            return { ok: false, url: url.href, reason: "TOO_LARGE", message: "Page exceeded size cap." };
          }
          html += decoder.decode(value, { stream: true });
        }
      } else {
        html = await res.text();
      }

      const $ = cheerio.load(html);
      const title = $("title").first().text().trim();

      // Links are extracted before nav/footer are stripped: real hiring/about links often live
      // in a site's main nav or footer (as they do in this project's own test fixture), so
      // removing those elements before link discovery would blind the crawler to exactly the
      // pages it's supposed to find.
      const links = new Set();
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
        try {
          const abs = new URL(href, url.href);
          if (abs.protocol === "http:" || abs.protocol === "https:") {
            abs.hash = "";
            links.add(abs.href);
          }
        } catch {
          // ignore malformed hrefs
        }
      });

      $("script, style, noscript, svg, nav, footer").remove();
      const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 20000);

      return { ok: true, url: url.href, title, text, links: [...links] };
    } catch (err) {
      lastError = { reason: err.name === "TimeoutError" ? "TIMEOUT" : "FETCH_ERROR", message: err.message };
      await sleep(300 * 2 ** attempt);
    }
  }

  return { ok: false, url: url.href, reason: lastError?.reason || "FETCH_ERROR", message: lastError?.message || "Failed after retries." };
}
