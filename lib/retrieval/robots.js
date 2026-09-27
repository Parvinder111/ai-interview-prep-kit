import robotsParser from "robots-parser";

const cache = new Map();

// Fetches and caches robots.txt for an origin. On any failure we treat the site as unrestricted
// (the standard convention: an unreachable robots.txt does not imply "disallow everything").
export async function isAllowedByRobots(url, userAgent = "InterviewPrepKitBot") {
  const origin = new URL(url).origin;
  let robots = cache.get(origin);
  if (!robots) {
    try {
      const res = await fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(5000) });
      const body = res.ok ? await res.text() : "";
      robots = robotsParser(`${origin}/robots.txt`, body);
    } catch {
      robots = robotsParser(`${origin}/robots.txt`, "");
    }
    cache.set(origin, robots);
  }
  const allowed = robots.isAllowed(url, userAgent);
  return allowed !== false;
}
