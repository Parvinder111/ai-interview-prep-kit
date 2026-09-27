import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect.js";
import Kit from "@/lib/db/models/Kit.js";
import { getSessionUserId } from "@/lib/auth/session.js";
import { runPipeline, PipelineError } from "@/lib/pipeline/runPipeline.js";
import { computeDedupeHash } from "@/lib/pipeline/dedupe.js";

export async function GET() {
  const userId = await getSessionUserId();
  await connectDB();
  const kits = await Kit.find({ userId })
    .select("inputJd inputCompanyUrl inputDays status error kit.source kit.coverage createdAt updatedAt")
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json({ kits });
}

const PairSchema = z.object({ jd: z.string().min(1), company_url: z.string().min(1) });
const BodySchema = z.object({
  days: z.number().int().min(1).max(365),
  pairs: z.array(PairSchema).min(1).max(20),
});

// Generation is slow (multiple sequential/parallel LLM calls plus crawling) and can run past a
// typical serverless request timeout, so this endpoint does not block on the pipeline. It creates
// the kit row as "generating" immediately, kicks off the pipeline without awaiting it, and the
// client polls GET /api/kits/:id for status — giving the "visible progress" the brief asks for
// without depending on a long-lived HTTP response. See README for the trade-off this implies.
async function startGeneration(kitId, { jd, companyUrl, days }) {
  try {
    const { kit, warnings } = await runPipeline({ jd, companyUrl, days });
    await connectDB();
    await Kit.findByIdAndUpdate(kitId, { status: "ready", kit, error: warnings.length ? { code: "PARTIAL", warnings } : null });
  } catch (err) {
    await connectDB();
    await Kit.findByIdAndUpdate(kitId, {
      status: "failed",
      error: { code: err instanceof PipelineError ? err.code : "UNKNOWN_ERROR", message: err.message },
    });
  }
}

export async function POST(req) {
  const userId = await getSessionUserId();
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: parsed.error.issues[0].message } }, { status: 400 });
  }
  const { days, pairs } = parsed.data;

  await connectDB();
  const created = [];
  for (const pair of pairs) {
    const dedupeHash = computeDedupeHash(pair.jd, pair.company_url);
    const existing = await Kit.findOne({ userId, dedupeHash }).select("_id status").lean();
    if (existing) {
      created.push({ id: existing._id, duplicate: true, status: existing.status });
      continue;
    }
    const doc = await Kit.create({
      userId,
      inputJd: pair.jd,
      inputCompanyUrl: pair.company_url,
      inputDays: days,
      dedupeHash,
      status: "generating",
    });
    created.push({ id: doc._id, duplicate: false, status: "generating" });
    startGeneration(doc._id, { jd: pair.jd, companyUrl: pair.company_url, days });
  }

  return NextResponse.json({ kits: created }, { status: 202 });
}
