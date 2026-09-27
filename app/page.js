import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth/session.js";

export default async function HomePage() {
  const userId = await getSessionUserId();
  redirect(userId ? "/dashboard" : "/login");
}
