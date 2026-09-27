import { NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db/connect.js";
import User from "@/lib/db/models/User.js";
import { verifyPassword } from "@/lib/auth/password.js";
import { setSessionCookie } from "@/lib/auth/session.js";

const BodySchema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req) {
  const parsed = BodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Email and password are required." } }, { status: 400 });
  }
  const { email, password } = parsed.data;

  await connectDB();
  const user = await User.findOne({ email: email.toLowerCase() });
  // Same generic message whether the email or the password was wrong, so login failures don't
  // reveal which accounts exist.
  const invalid = () => NextResponse.json({ error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } }, { status: 401 });

  if (!user) return invalid();
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return invalid();

  await setSessionCookie(user._id);
  return NextResponse.json({ user: { id: user._id, email: user.email } });
}
