import { fetchPage } from "./fetchPage.js";

const MAX_PAGES = Number(process.env.CRAWL_MAX_PAGES || 8);

// Keyword weights used to rank an undiscovered link by how likely it is to be a hiring/about
// page. This is the "no fixed list of paths" requirement: we don't hard-code /careers — we score
// whatever links the site actually publishes (path segments + anchor text) and fetch best-first,
// so a company that buries hiring info at /handbook/hiring or /engineering/join-us still surfaces.
const HIRING_SIGNALS = [
  [/careers?/i, 6], [/jobs?/i, 6], [/\bjoin/i, 5], [/hiring/i, 6],
  [/work-?with-?us/i, 5], [/life-?at/i, 4], [/open-?positions?/i, 5],
  [/team/i, 2], [/culture/i, 3], [/handbook/i, 3], [/interview/i, 5],
  [/recruit/i, 4], [/talent/i, 3], [/opportunit/i, 3], [/vacanc/i, 5],
  [/\bapply/i, 3], [/\bposition/i, 3], [/employment/i, 4],
];
const ABOUT_SIGNALS = [
  [/about/i, 5], [/company/i, 3], [/mission/i, 2], [/story/i, 2], [/who-?we-?are/i, 4],
];
const BLOG_SIGNALS = [[/blog/i, 3], [/engineering/i, 3], [/news/i, 1]];

function scoreLink(link, anchorText = "") {
  const haystack = `${link} ${anchorText}`;
  let score = 0;
  for (const [re, weight] of [...HIRING_SIGNALS, ...ABOUT_SIGNALS, ...BLOG_SIGNALS]) {
    if (re.test(haystack)) score += weight;
  }
  return score;
}

function isHiringPage(url) {
  return HIRING_SIGNALS.some(([re]) => re.test(url));
}

// Best-first crawl of a company site: start at the homepage, then repeatedly fetch the
// highest-scoring undiscovered same-origin link, up to MAX_PAGES. Stops early once a page that
// clearly looks like a hiring page has been fetched and a couple of general/about pages are in
// hand, so we don't burn the whole budget on low-value pages.
export async function crawlCompanySite(companyUrl) {
  const origin = new URL(companyUrl).origin;
  const visited = new Set();
  const fetched = [];
  const skipped = [];
  const frontier = [{ url: companyUrl, score: 100 }];
  let foundHiringPage = false;

  while (frontier.length && fetched.length < MAX_PAGES) {
    frontier.sort((a, b) => b.score - a.score);
    const next = frontier.shift();
    if (visited.has(next.url)) continue;
    visited.add(next.url);

    const page = await fetchPage(next.url);
    if (!page.ok) {
      skipped.push({ url: next.url, reason: page.reason, message: page.message });
      continue;
    }
    fetched.push(page);
    if (isHiringPage(page.url)) foundHiringPage = true;

    for (const link of page.links) {
      let linkUrl;
      try {
        linkUrl = new URL(link);
      } catch {
        continue;
      }
      if (linkUrl.origin !== origin) continue;
      if (visited.has(link) || frontier.some((f) => f.url === link)) continue;
      const score = scoreLink(link);
      if (score > 0 || frontier.length < MAX_PAGES) {
        frontier.push({ url: link, score });
      }
    }

    if (foundHiringPage && fetched.length >= 3) break;
  }

  return {
    pages: fetched,
    skipped,
    hiringPageFound: foundHiringPage,
    hiringPages: fetched.filter((p) => isHiringPage(p.url)),
  };
}
