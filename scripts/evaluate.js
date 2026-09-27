#!/usr/bin/env node
// Batch entry point (Section 9, mandatory):
//   npm run evaluate -- --input <cases.json> --output <kits.json>
//
// Reads an array of { id, jd, company_url, days } cases and runs the exact same pipeline the
// interactive app uses (lib/pipeline/runPipeline.js) on each one — no parallel reimplementation.
// Never aborts the run on a single case's failure; records the failure in that case's entry and
// keeps going, so one bad case can't sink the other four.
import fs from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import pLimit from "p-limit";
import { runPipeline, PipelineError } from "../lib/pipeline/runPipeline.js";

dotenv.config({ path: [".env.local", ".env"] });

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.input = argv[++i];
    if (argv[i] === "--output") args.output = argv[++i];
  }
  return args;
}

async function main() {
  const { input, output } = parseArgs(process.argv.slice(2));
  if (!input || !output) {
    console.error("Usage: npm run evaluate -- --input <cases.json> --output <kits.json>");
    process.exit(1);
  }

  const raw = await fs.readFile(path.resolve(input), "utf8");
  const cases = JSON.parse(raw);
  if (!Array.isArray(cases)) throw new Error("Input file must be a JSON array of cases.");

  // Bounded concurrency: enough to finish 5 cases well inside the 15-minute ceiling even with
  // rate-limit retries, without firing every case's LLM calls at once and guaranteeing a 429.
  const limit = pLimit(2);
  const startedAt = Date.now();

  const results = await Promise.all(
    cases.map((testCase) =>
      limit(async () => {
        const caseId = testCase.id ?? "unknown";
        try {
          if (!testCase.id || typeof testCase.jd !== "string" || !testCase.company_url || !testCase.days) {
            throw new PipelineError("Case is missing one of: id, jd, company_url, days.", "INVALID_CASE");
          }
          const { kit } = await runPipeline({ jd: testCase.jd, companyUrl: testCase.company_url, days: testCase.days });
          return { id: caseId, status: "ok", kit, error: null };
        } catch (err) {
          const code = err instanceof PipelineError ? err.code : "UNKNOWN_ERROR";
          console.error(`[case ${caseId}] failed: ${code} - ${err.message}`);
          return { id: caseId, status: "failed", kit: null, error: { code, message: err.message } };
        }
      })
    )
  );

  const out = {
    version: "1.0",
    generated_at: new Date().toISOString(),
    kits: results,
  };

  await fs.writeFile(path.resolve(output), JSON.stringify(out, null, 2), "utf8");

  const elapsedSec = ((Date.now() - startedAt) / 1000).toFixed(1);
  const okCount = results.filter((r) => r.status === "ok").length;
  console.log(`Wrote ${results.length} kit(s) to ${output} in ${elapsedSec}s (${okCount} ok, ${results.length - okCount} failed).`);
}

main().catch((err) => {
  console.error("evaluate.js failed:", err);
  process.exit(1);
});
