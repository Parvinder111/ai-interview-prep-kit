import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect.js";
import Kit from "@/lib/db/models/Kit.js";
import { getSessionUserId } from "@/lib/auth/session.js";
import { regenerateSection } from "@/lib/pipeline/regenerateSection.js";

const VALID_SECTIONS = ["company_brief", "schedule", "technical", "behavioural", "system-design", "company-fit"];

// Regeneration runs synchronously here (unlike initial creation) because it targets one section
// and is bounded to at most a couple of LLM calls, so it comfortably fits a normal request. The
// state-preserving merge itself happens in regenerateSection/applyEdit, not here.
export async function POST(req, { params }) {
  const userId = await getSessionUserId();
  const body = await req.json().catch(() => ({}));
  if (!VALID_SECTIONS.includes(body.section)) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: `section must be one of ${VALID_SECTIONS.join(", ")}` } }, { status: 400 });
  }

  await connectDB();
  const doc = await Kit.findById(params.id);
  if (!doc || String(doc.userId) !== String(userId)) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Kit not found." } }, { status: 404 });
  }
  if (doc.status !== "ready" || !doc.kit) {
    return NextResponse.json({ error: { code: "KIT_NOT_READY", message: "Kit is not ready yet." } }, { status: 409 });
  }

  try {
    const { kit, warnings } = await regenerateSection(doc.kit, body.section, { companyUrl: doc.inputCompanyUrl });
    doc.kit = kit;
    doc.markModified("kit");
    await doc.save();
    return NextResponse.json({ kit: doc, warnings });
  } catch (err) {
    return NextResponse.json({ error: { code: "REGENERATION_FAILED", message: err.message } }, { status: 502 });
  }
}
