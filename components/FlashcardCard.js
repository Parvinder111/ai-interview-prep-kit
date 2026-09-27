"use client";

export default function FlashcardCard({ flashcard, onChange, onDelete }) {
  return (
    <li className="card space-y-2">
      <div className="flex items-center justify-between">
        {flashcard.state !== "generated" && <span className="badge bg-brand-50 text-brand-700">{flashcard.state === "user" ? "your own" : "edited"}</span>}
        <button type="button" className="btn-danger ml-auto px-2 py-1 text-xs" onClick={onDelete} aria-label="Delete flashcard">Delete</button>
      </div>
      <label className="block text-xs font-medium text-slate-500">Front</label>
      <textarea className="input" rows={2} value={flashcard.front} onChange={(e) => onChange({ front: e.target.value })} />
      <label className="block text-xs font-medium text-slate-500">Back</label>
      <textarea className="input" rows={2} value={flashcard.back} onChange={(e) => onChange({ back: e.target.value })} />
    </li>
  );
}
