# AI Interview Prep Kit

Turns a pasted job description + a company URL into a structured, editable, practisable interview
prep kit: a company brief, a role breakdown, a categorised question bank, flashcards and a
day-by-day study schedule.

## Tech stack

- **Framework:** Next.js 15 (App Router), used for *both* frontend and backend via Route Handlers
  under `app/api/**`. This is a deliberate deviation from the brief's preferred Node+Express split:
  Route Handlers are ordinary Node.js server code (same runtime, same `fetch`/`Request`/`Response`
  primitives Express would use), but collapsing frontend and backend into one deployable removes
  CORS entirely and means "frontend and backend both reachable" (Deployment section) is true by
  construction on a single Vercel deployment, rather than something to wire up separately. All the
  actual engineering the brief cares about — retrieval, extraction, generation, scheduling,
  validation, persistence — lives in framework-agnostic modules under `lib/`, so this choice barely
  touches that code.
- **Database:** MongoDB via Mongoose (Atlas free tier).
- **Language:** JavaScript (not TypeScript) — chosen to move faster within the timebox; runtime
  structure validation via `zod` (see `lib/validation/kitSchema.js`) covers the same ground
  TypeScript would for the one place it matters most: the kit shape.
- **Scraping:** `fetch` + `cheerio` for parsing/link extraction, `robots-parser` for robots.txt.
- **LLM:** **Groq**, model `llama-3.3-70b-versatile` (configurable via `GROQ_MODEL`). Chosen for a
  genuinely free tier with generous rate limits and fast inference (important for the batch
  command's 15-minute ceiling) and native JSON-mode output.
- **Styling:** Tailwind CSS.
- **Tests:** Vitest.

## Setup

### Local

```bash
npm install
cp .env.example .env.local   # fill in MONGODB_URI, JWT_SECRET, GROQ_API_KEY
npm run dev                  # http://localhost:3000
```

### Batch entry point (Section 9)

```bash
npm install
cp .env.example .env.local   # same env as above
npm run evaluate -- --input <cases.json> --output <kits.json>
```

This works from a clean clone with no other setup. `scripts/evaluate.js` imports
`lib/pipeline/runPipeline.js` directly — the exact same function the interactive app calls from
`app/api/kits/route.js` — so batch and interactive behaviour cannot drift apart.

A local fixture company site is included for testing the crawler end to end without depending on
a real, changeable website:

```bash
npm run fixture:serve                                    # serves http://localhost:8099
npm run evaluate -- --input fixtures/sample-cases.json --output /tmp/kits.json
```

`fixtures/sample-cases.json` includes a normal case, a two-line-stub JD, and an unreachable
company URL, exercising the honest-degradation paths described below.

### Deployed

Deploy to Vercel (or any Node host). Set the same environment variables as `.env.local` in the
platform's environment variable settings — never commit `.env.local`. MongoDB Atlas and Groq are
both free-tier and don't require a credit card.

## Environment variables

See `.env.example` for the authoritative list; summary:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | Persistence for users and kits |
| `JWT_SECRET` | Signs the session cookie |
| `GROQ_API_KEY` | LLM calls |
| `GROQ_MODEL` | Defaults to `llama-3.3-70b-versatile` |
| `NODE_ENV` | `production` enforces the SSRF guard (rejects private/loopback URLs); non-production allows `localhost` so the batch command can target a local fixture site, per Section 9 |
| `CRAWL_MAX_PAGES`, `FETCH_TIMEOUT_MS` | Tuning knobs, sensible defaults if unset |

## Architecture

```
app/                    Next.js pages + API routes (thin — delegate to lib/)
components/              React components (client-side builder, practice mode, forms)
lib/
  auth/                  password hashing, JWT session cookie
  security/               SSRF-safe URL validation
  retrieval/              fetchPage (clean+extract+retry), crawl (best-first link ranking),
                          discussion (public interview-discussion search), robots.txt cache
  llm/                    Groq client with retry/backoff, prompt-injection framing helper
  generation/             extractRequirements, companyBrief, questions, flashcards (deterministic
                          derivation), coverage (deterministic), schedule (deterministic)
  pipeline/               runPipeline (the sequenced orchestrator), regenerateSection,
                          applyEdit (builder mutations), scheduleSync, dedupe, ids
  validation/             zod schema mirroring Appendix A + cross-reference checks
  db/                     Mongoose connection + User/Kit models
  practice/               confidence-weighted next-session ordering
scripts/evaluate.js       Batch entry point (Section 9)
fixtures/                 Local test company site + sample batch cases
tests/                    schedule, coverage, structure-validation tests
```

Separation of concerns follows the brief's list directly: retrieval (`lib/retrieval`), extraction
(`extractRequirements`), generation (`lib/generation`), scheduling (`schedule.js`), persistence
(`lib/db`) are each their own module: `runPipeline.js` only orchestrates calls between them, it
contains no retrieval or generation logic itself.

## Retrieval approach and sources used

1. **Company site crawl** (`lib/retrieval/crawl.js`): starts at the homepage, does a **best-first
   search** (not BFS, not a fixed path list) — every discovered same-origin link is scored by
   keyword signals in its URL (`careers`, `jobs`, `hiring`, `join`, `vacanc*`, `handbook`,
   `culture`, `about`, etc., weighted), and the crawler always fetches the highest-scoring
   unvisited link next. It stops early once a page matching hiring signals has been fetched
   alongside a couple of general pages, or after `CRAWL_MAX_PAGES` (default 8) pages — whichever
   comes first. Link discovery happens *before* `nav`/`footer` are stripped from the page for text
   extraction, because hiring links are very often in a site's nav or footer (verified against
   this project's own fixture site, where the hiring page is deliberately buried at
   `/engineering/join.html` and is only discoverable through a nav link).
2. **Public interview-discussion search** (`lib/retrieval/discussion.js`): queries DuckDuckGo's
   HTML (no API key, no JS) endpoint for `"<company> interview process questions glassdoor OR
   blind OR reddit"` and returns up to 5 result titles/links. This is explicitly best-effort — if
   the search is blocked, rate-limited, or returns nothing, the pipeline records that honestly
   (`NO_PUBLIC_DISCUSSION` warning) rather than failing or fabricating results.
3. **robots.txt**: fetched and cached per-origin (`lib/retrieval/robots.js`); a disallowed URL is
   skipped and reported, never fetched. An unreachable robots.txt is treated as unrestricted (the
   standard convention).
4. Every fetch goes through `lib/retrieval/fetchPage.js`: content-type restricted to
   HTML/XHTML, streamed with a 2MB size cap, timeout + exponential-backoff retry on 429/5xx, and
   never throws for a normal failure — it returns `{ ok: false, reason }` so the crawl/pipeline can
   skip and report a source instead of aborting the whole run (Section 2).

## Sequencing (Section 3) — what each step is responsible for

`lib/pipeline/runPipeline.js` runs, in order:

1. **`extractRequirements(jd)`** — one LLM call, JSON-mode, instructed to under-extract rather
   than invent, and to distinguish "must" (required-language) from "nice" (bonus-language) by how
   the posting actually phrases each line.
2. **`crawlCompanySite(companyUrl)`** — no LLM involved; pure retrieval + link ranking.
3. **`searchInterviewDiscussion(company)`** — best-effort, no LLM.
4. **`generateCompanyBrief(...)`** — only called if at least one page was retrieved; if nothing was
   retrieved, an honest fallback string is generated **in code**, not by the model, removing any
   chance of fabrication for the "company you can find nothing about" edge case.
5. **Question generation**, split by *category*, never by a single "generate everything" prompt:
   - Technical and behavioural requirements are batched **separately** — one call per category,
     never mixed — because a requirement like "5+ years of React" and one like "mentors junior
     engineers" need entirely different instructions (Section 3's explicit example). Requirements
     of the *same* kind are batched together in one call (each tagged by index, mapped back to a
     stable requirement id in code) purely to control call volume for the free-tier rate limit and
     the batch command's time budget — the brief's constraint is about not mixing categories in
     one call, not about isolating every requirement individually.
   - System-design questions are generated from the technical requirement set, only when there is
     at least one non-behavioural requirement.
   - Company-fit questions are generated from the finished company brief, so they reference what
     the company actually does rather than being generic.
   - The hiring-process text found in step 2/3 (if any) is threaded into `roleContext.hiringNotes`
     and appended to every question-generation prompt, so a company that publishes "take-home then
     system design round" measurably changes what gets generated, per Section 3's requirement.
6. **`checkCoverage`** (deterministic, Section 3/4) — set-membership comparison of requirement ids
   referenced by generated questions against every "must" requirement. Never touches the model.
7. **The second pass**: if there are uncovered musts, a second, gap-scoped generation call runs
   (batched, category-split, same as above) targeting only the uncovered requirements, then
   coverage is rechecked. Capped at **2 total passes**. Reasoning: a requirement with no question
   after two honest, targeted attempts is far more likely a symptom of a thin/ambiguous JD than
   something a third identical call would fix — looping further mostly burns free-tier tokens for
   no gain. The kit still ships in that case, with the gap recorded in `coverage.uncovered_requirement_ids`
   rather than hidden or papered over with an invented question.
8. **`deriveFlashcards`** (deterministic) — built from the finished question bank rather than a
   separate LLM call, so every flashcard's `requirement_ids` traces exactly to its source
   question's, and no extra rate-limited call is spent on content that's a direct derivative of
   questions that already exist.
9. **`buildSchedule`** (deterministic, Section 8) — see below.
10. Structure validation (`validateKit`) before the kit is ever persisted or returned.

## Builder state model: generated / edited / pinned (Section 6)

Every question and flashcard carries an internal `state` field (an allowed extension to Appendix A
— it doesn't touch any required field name): `"generated"`, `"edited"`, or `"user"`.

- A fresh LLM-generated item starts as `"generated"`.
- Any inline edit (`applyEdit.js`, `op: "edit_question"` / `"edit_flashcard"`) flips it to
  `"edited"` — unless it was already `"user"`, which stays `"user"`.
- An item added by hand (`op: "add_question"` / `"add_flashcard"`) is created directly as `"user"`.

Regenerating a question category (`regenerateSection.js`) partitions that category's questions
into **pinned** (`state !== "generated"`) and **discardable** (`state === "generated"`), throws
away only the discardable ones, generates fresh replacements, and recombines
`otherCategories + pinned + fresh`. A user-written or user-edited question is never in the
discardable set, so it survives by construction — the code never has to specifically remember not
to touch it. The same logic filters flashcards: a flashcard is dropped only if it's still
`"generated"` *and* every question it traced back to was discarded; user-touched flashcards always
survive. Deleting/replacing questions can leave the schedule referencing an id that no longer
exists, which would break Appendix A's "every `question_ids` entry must refer to a question that
exists" invariant — `pruneScheduleReferences` (`scheduleSync.js`) runs after every question-set
mutation to drop stale references and recompute that day's minutes, without touching
`days_available` or other days' content.

Regenerating the company brief or the schedule simply replaces that whole section — the brief
doesn't ask those to preserve partial in-section edits the way question categories must, and both
are cheap to regenerate in full.

## How the schedule is allocated (Section 8, deterministic)

`lib/generation/schedule.js`, no LLM call:

1. Every question gets a priority weight: `+100` if it's linked to any `"must"` requirement, plus
   `difficulty * 10`.
2. All questions are sorted by that weight, descending.
3. The sorted list is split into `min(daysAvailable, totalQuestions)` chunks — earlier chunks get
   any remainder, so the earliest days are never smaller than later ones — guaranteeing harder,
   higher-priority material lands on earlier days, never the night before.
4. If `daysAvailable` exceeds the amount of real material (e.g. a 60-day schedule over a short
   JD), the surplus days become **spaced-review days** cycling through the top-priority questions
   with a smaller duration, rather than being left empty — every day still gets a real integer
   `minutes` and a real `focus`.
5. If there is a 1-day schedule, everything lands in day 1.
6. Duration per question is a fixed integer-minutes table by difficulty (15/25/40); every day's
   `minutes` is the integer sum of its questions' minutes.

This guarantees "every must-have requirement appears somewhere in the schedule" as a corollary,
not a separate check: the schedule is built from *every* question in the bank, and coverage
already guarantees every must requirement has at least one question in that bank.

## Edge cases and failure handling (Section 10)

| Case | Behaviour |
|---|---|
| Company URL invalid/404/timeout | `fetchPage` returns `{ ok:false }`, crawl records it in `skipped`, pipeline continues with 0 pages, brief generation falls back to an honest "could not retrieve" summary in code (no LLM fabrication risk) |
| No discoverable hiring/about page | Crawl completes with whatever pages it found; `hiringPageFound: false` is threaded through; brief and questions are generated from what exists, with no hiring-process assumptions invented |
| Two-line JD stub | `extractRequirements` is instructed to under-extract; a `THIN_JD` warning is recorded if zero requirements come back; the kit is still produced, honestly thin |
| No public discussion found | `NO_PUBLIC_DISCUSSION` warning recorded; pipeline proceeds without it |
| Model returns invalid JSON / incomplete kit | `callLLMJson` retries (see below); if generation for one category ultimately fails, that category is simply empty rather than the whole kit failing, and it shows up as a coverage gap if it cost a must requirement its only question; `validateKit` runs before any kit is persisted, catching a structurally incomplete result before it reaches the user |
| Rate limit / brief provider failure | `lib/llm/client.js` retries on 429/5xx with exponential backoff (honouring `Retry-After` when present), up to 4 attempts, before surfacing an error for that one call — which the pipeline treats as a recoverable gap, not a fatal error |
| Same description + company submitted twice | `computeDedupeHash(jd, companyUrl)` (sha256) is checked per-user before creating a new kit; a repeat returns the existing kit id instead of regenerating |
| 1-day / 60-day schedule | Handled arithmetically, see above — both produce exactly the requested number of days with sane content in each |

### On "failed" vs "ok" in batch output

Per the FAQ (which explicitly resolves this): *"Reserve `failed` for a case you could not produce
a kit for at all... a company you can find nothing about should produce an honest brief rather
than a fabricated one."* So a fully unreachable company site does **not** mark a batch case as
`failed` here — the kit is still produced, with `source.pages_used: []` and an honest brief. `failed`
is reserved for the one case where a kit genuinely cannot be produced: `extractRequirements`
exhausting its retries against a completely unavailable LLM provider, since without it there is no
role/requirements data to build anything from. (Appendix B's own example uses `COMPANY_UNREACHABLE`
to illustrate the JSON *shape* of a failed entry; this README's interpretation follows the FAQ,
which speaks to this exact scenario directly.)

## Security (Section 11)

- `lib/security/url.js`: validates the URL is well-formed http(s), then resolves DNS and rejects
  private/loopback/link-local addresses (covers DNS-rebinding, not just a string check) —
  enforced in `NODE_ENV=production`. Relaxed for `localhost` outside production, which is required
  for the batch command to run against a locally-served fixture site per Section 9.
- Content-type is restricted to HTML/XHTML; responses are streamed and cut off at 2MB.
- **Prompt injection**: every piece of untrusted text (a fetched page, the pasted JD) going into a
  prompt is wrapped in `<<<UNTRUSTED_..._START/END>>>` markers (`lib/llm/promptSafety.js`), and
  every system prompt includes an explicit instruction to treat anything inside those markers as
  data, never as instructions — regardless of how it's phrased. This is applied uniformly across
  extraction, brief generation and question generation, since all three consume scraped/pasted
  text.
- Requests are validated with `zod` at every API boundary before touching the database or the LLM.

## Generation reliability (Section 13)

Kit creation kicks off the pipeline **without** awaiting it inside the HTTP request — the kit row
is created as `"generating"` immediately and the client polls `GET /api/kits/:id`. Generation
routinely involves 6+ sequential/parallel LLM calls plus crawling and can take well over the
~10-60s a serverless function is typically given; blocking the request on that would risk a
platform timeout tearing down generation mid-flight with no record of what happened. The trade-off,
noted honestly: there's no durable job queue, so a server restart mid-generation would strand a kit
in `"generating"` forever with no automatic retry — acceptable for this assessment's scope, and the
first thing I'd add (e.g. a lightweight queue + worker) if this went further. Duplicate submissions
are caught by the dedupe hash before a second generation is ever started.

## Practice mode ordering (Section 7)

Chose a **confidence-weighted sort** over a full spaced-repetition interval (`lib/practice/order.js`):
each flashcard's most recent confidence rating ranks the next session, ascending (never-reviewed
cards rank as maximally unconfident, so new material always surfaces first). This assessment's
prep window is days, not the months a spaced-repetition interval is designed to schedule around —
a simple "show me what I felt worst about most recently" gives a better next-session order for
that timescale with a fraction of the code.

## Creative feature: Weak spots report

`app/weak-spots/page.js` + `app/api/weak-spots/route.js`. Aggregates practice-mode confidence
ratings **across every kit** the user has practised (not just one), ranking requirements by lowest
recorded confidence, must-haves first on ties. The real problem this solves: someone prepping for
several interviews in the same week doesn't want to re-open five separate kits to figure out what
they're actually weak on — they want one ranked list. It's built entirely from data the app
already has (flashcard `requirement_ids` + practice records), so it required no new generation
step or LLM call.

## Key design decisions and trade-offs

- **Batched, category-split question generation** over one call per requirement: keeps total LLM
  calls per kit around 6-8 even for a JD with a dozen requirements, which is what makes "5 cases in
  15 minutes including retries" realistic on a free tier, at the cost of a slightly more involved
  prompt (index-tagged requirement groups) than one-requirement-per-call would need.
- **`state` field instead of a diff/patch log** for tracking generated/edited/user: simpler to
  reason about and query than an edit history, at the cost of not being able to show *what* changed
  on an edited item, only *that* it was edited.
- **Up/down buttons for reordering** instead of drag-and-drop: the brief explicitly requires
  keyboard navigability, and buttons are keyboard-accessible by default where drag-and-drop needs
  extra work to be; a deliberate trade against the smoother feel of a drag library.
- **Edits save on every change, not only on blur/debounce**, for text fields — actually: local
  state updates immediately for a responsive feel, and the same change is sent to the server
  per-field-change rather than batched, favouring simplicity and always-persisted state over
  minimising request count. A production version would debounce this.

## Known limitations

- No durable background job queue for generation (see Generation reliability above).
- Public discussion search depends on an unauthenticated DuckDuckGo HTML endpoint that isn't a
  documented API and could change or start blocking; it degrades honestly (empty, not fatal) if so.
- The "nice-to-have" requirement cap (6, in `runPipeline.js`) means a JD with a very large number
  of bonus-phrased requirements won't get every single one a dedicated question — every "must"
  requirement is never capped.
- No password reset / email verification, by explicit design (out of scope per Section 1).
