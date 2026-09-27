"use client";

import { useEffect, useState } from "react";

export default function PracticeView({ kitId }) {
  const [order, setOrder] = useState(null);
  const [coverage, setCoverage] = useState(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const res = await fetch(`/api/kits/${kitId}/practice`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Could not load practice session.");
      setOrder(data.order);
      setCoverage(data.coverage);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kitId]);

  async function recordConfidence(confidence) {
    const card = order[index];
    try {
      const res = await fetch(`/api/kits/${kitId}/practice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flashcardId: card.id, confidence }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Could not record confidence.");
      setCoverage(data.coverage);
      setRevealed(false);
      setIndex((i) => Math.min(i + 1, order.length - 1));
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <p role="alert" className="card text-sm text-red-600">{error}</p>;
  if (!order) return <p className="text-sm text-slate-500">Loading practice session...</p>;
  if (order.length === 0) return <p className="card text-sm text-slate-500">This kit has no flashcards yet.</p>;

  const card = order[index];
  const done = index >= order.length;

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600" aria-live="polite">
        Covered {coverage.covered} of {coverage.total} · Card {Math.min(index + 1, order.length)} of {order.length}
      </p>

      {done ? (
        <div className="card text-center">
          <p className="font-medium">Session complete.</p>
          <button className="btn-primary mt-3" onClick={() => { setIndex(0); load(); }}>Start another round</button>
        </div>
      ) : (
        <div className="card space-y-4">
          <div className="min-h-[8rem] rounded-md border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase text-slate-400">{revealed ? "Answer" : "Question"}</p>
            <p className="mt-2 text-base">{revealed ? card.back : card.front}</p>
          </div>

          {!revealed ? (
            <button className="btn-primary" onClick={() => setRevealed(true)}>Reveal answer</button>
          ) : (
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">How confident did you feel?</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Confidence rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} className="btn-secondary" onClick={() => recordConfidence(n)}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">1 = not confident at all, 5 = very confident</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
