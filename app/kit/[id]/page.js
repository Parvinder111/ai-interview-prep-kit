import { notFound } from "next/navigation";
import { connectDB } from "@/lib/db/connect.js";
import Kit from "@/lib/db/models/Kit.js";
import { getSessionUserId } from "@/lib/auth/session.js";
import KitView from "@/components/KitView.js";

export default async function KitPage({ params }) {
  const userId = await getSessionUserId();
  await connectDB();
  const doc = await Kit.findById(params.id).lean();
  if (!doc || String(doc.userId) !== String(userId)) notFound();

  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-6">
      <a href="/dashboard" className="mb-4 inline-block text-sm text-brand-600 underline">← Back to dashboard</a>
      <KitView initialDoc={JSON.parse(JSON.stringify(doc))} />
    </main>
  );
}
