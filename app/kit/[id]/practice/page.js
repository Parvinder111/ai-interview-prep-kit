import PracticeView from "@/components/PracticeView.js";

export default async function PracticePage({ params }) {
  return (
    <main className="mx-auto max-w-xl p-4 sm:p-6">
      <a href={`/kit/${params.id}`} className="mb-4 inline-block text-sm text-brand-600 underline">← Back to kit</a>
      <h1 className="mb-4 text-xl font-semibold">Practice</h1>
      <PracticeView kitId={params.id} />
    </main>
  );
}
