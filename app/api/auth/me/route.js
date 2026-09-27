import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth/session.js";
import { connectDB } from "@/lib/db/connect.js";
import User from "@/lib/db/models/User.js";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ user: null });

  await connectDB();
  const user = await User.findById(userId).select("email").lean();
  if (!user) return NextResponse.json({ user: null });

  return NextResponse.json({ user: { id: user._id, email: user.email } });
}
