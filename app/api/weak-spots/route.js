import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect.js";
import Kit from "@/lib/db/models/Kit.js";
import { getSessionUserId } from "@/lib/auth/session.js";

// Creative feature: a weak-spots report aggregated across every kit the user has practised, not
// just one. Someone preparing for several interviews in the same week wants to know "what am I
// actually shaky on across everything", not to re-read five separate kits looking for the answer.
// Ranks each requirement by its lowest recorded confidence across all flashcards that reference
// it, across all kits, so the weakest, most recently-felt gaps surface first.
export async function GET() {
  const userId = await getSessionUserId();
  await connectDB();
  const kits = await Kit.find({ userId, status: "ready" }).select("kit practiceRecords").lean();

  const rows = [];
  for (const doc of kits) {
    if (!doc.kit) continue;
    const requirementById = new Map(doc.kit.role.requirements.map((r) => [r.id, r]));
    const latestByCard = new Map();
    for (const rec of doc.practiceRecords) {
      const prev = latestByCard.get(rec.flashcardId);
      if (!prev || new Date(rec.reviewedAt) >= new Date(prev.reviewedAt)) latestByCard.set(rec.flashcardId, rec);
    }
    for (const card of doc.kit.flashcards) {
      const rec = latestByCard.get(card.id);
      if (!rec) continue;
      for (const rid of card.requirement_ids) {
        const requirement = requirementById.get(rid);
        if (!requirement) continue;
        rows.push({
          company: doc.kit.source.company || doc.kit.source.role,
          role: doc.kit.source.role,
          requirement: requirement.text,
          priority: requirement.priority,
          confidence: rec.confidence,
          reviewedAt: rec.reviewedAt,
        });
      }
    }
  }

  rows.sort((a, b) => a.confidence - b.confidence || (a.priority === "must" ? -1 : 1));
  return NextResponse.json({ weakSpots: rows.slice(0, 20) });
}
