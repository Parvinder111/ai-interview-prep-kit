import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db/connect.js";
import Kit from "@/lib/db/models/Kit.js";
import { getSessionUserId } from "@/lib/auth/session.js";
import { applyEdit } from "@/lib/pipeline/applyEdit.js";
import { validateKit } from "@/lib/validation/kitSchema.js";

async function loadOwnedKit(id, userId) {
  const doc = await Kit.findById(id);
  if (!doc) return { error: NextResponse.json({ error: { code: "NOT_FOUND", message: "Kit not found." } }, { status: 404 }) };
  // Ownership check: a user can read/modify only their own kits (Section 1). A kit that exists
  // but belongs to someone else looks identical to "not found" — this avoids leaking which ids
  // are valid for other accounts.
  if (String(doc.userId) !== String(userId)) {
    return { error: NextResponse.json({ error: { code: "NOT_FOUND", message: "Kit not found." } }, { status: 404 }) };
  }
  return { doc };
}

export async function GET(req, { params }) {
  const userId = await getSessionUserId();
  await connectDB();
  const { doc, error } = await loadOwnedKit(params.id, userId);
  if (error) return error;
  return NextResponse.json({ kit: doc });
}

export async function PATCH(req, { params }) {
  const userId = await getSessionUserId();
  const edit = await req.json().catch(() => null);
  if (!edit?.op) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Missing edit operation." } }, { status: 400 });
  }

  await connectDB();
  const { doc, error } = await loadOwnedKit(params.id, userId);
  if (error) return error;
  if (doc.status !== "ready" || !doc.kit) {
    return NextResponse.json({ error: { code: "KIT_NOT_READY", message: "Kit is not ready to be edited yet." } }, { status: 409 });
  }

  let nextKit;
  try {
    nextKit = applyEdit(doc.kit, edit);
  } catch (err) {
    return NextResponse.json({ error: { code: "INVALID_EDIT", message: err.message } }, { status: 400 });
  }
  const validation = validateKit(nextKit);
  if (!validation.ok) {
    return NextResponse.json({ error: { code: "INVALID_KIT_STRUCTURE", message: validation.errors.join("; ") } }, { status: 422 });
  }

  doc.kit = validation.kit;
  doc.markModified("kit");
  await doc.save();
  return NextResponse.json({ kit: doc });
}

export async function DELETE(req, { params }) {
  const userId = await getSessionUserId();
  await connectDB();
  const { doc, error } = await loadOwnedKit(params.id, userId);
  if (error) return error;
  await doc.deleteOne();
  return NextResponse.json({ ok: true });
}
