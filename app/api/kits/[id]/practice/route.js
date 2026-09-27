import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect.js";
import Kit from "@/lib/db/models/Kit.js";
import { getSessionUserId } from "@/lib/auth/session.js";
import { orderForNextSession, coverageSummary } from "@/lib/practice/order.js";

const BodySchema = z.object({ flashcardId: z.string(), confidence: z.number().int().min(1).max(5) });

export async function GET(req, { params }) {
  const userId = await getSessionUserId();
  await connectDB();
  const doc = await Kit.findById(params.id);
  if (!doc || String(doc.userId) !== String(userId)) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Kit not found." } }, { status: 404 });
  }
  const flashcards = doc.kit?.flashcards || [];
  const order = orderForNextSession(flashcards, doc.practiceRecords);
  const coverage = coverageSummary(flashcards, doc.practiceRecords);
  return NextResponse.json({ order, coverage, practiceRecords: doc.practiceRecords });
}

export async function POST(req, { params }) {
  const userId = await getSessionUserId();
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "flashcardId and confidence (1-5) are required." } }, { status: 400 });
  }

  await connectDB();
  const doc = await Kit.findById(params.id);
  if (!doc || String(doc.userId) !== String(userId)) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Kit not found." } }, { status: 404 });
  }
  const cardExists = (doc.kit?.flashcards || []).some((f) => f.id === parsed.data.flashcardId);
  if (!cardExists) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Unknown flashcard id." } }, { status: 400 });
  }

  doc.practiceRecords.push({ flashcardId: parsed.data.flashcardId, confidence: parsed.data.confidence, reviewedAt: new Date() });
  await doc.save();

  const flashcards = doc.kit.flashcards;
  return NextResponse.json({
    order: orderForNextSession(flashcards, doc.practiceRecords),
    coverage: coverageSummary(flashcards, doc.practiceRecords),
  });
}
