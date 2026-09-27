import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect.js";
import User from "@/lib/db/models/User.js";
import { hashPassword } from "@/lib/auth/password.js";
import { setSessionCookie } from "@/lib/auth/session.js";

const BodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export async function POST(req) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: parsed.error.issues[0].message } }, { status: 400 });
  }
  const { email, password } = parsed.data;

  await connectDB();
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    return NextResponse.json({ error: { code: "EMAIL_TAKEN", message: "An account with this email already exists." } }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({ email: email.toLowerCase(), passwordHash });
  await setSessionCookie(user._id);

  return NextResponse.json({ user: { id: user._id, email: user.email } }, { status: 201 });
}
