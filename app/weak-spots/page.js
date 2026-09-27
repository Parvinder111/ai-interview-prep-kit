"use client";

import { useEffect, useState } from "react";

export default function WeakSpotsPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/weak-spots")
      .then((r) => r.json())
      .then((d) => setRows(d.weakSpots))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <a href="/dashboard" className="mb-4 inline-block text-sm text-brand-600 underline">← Back to dashboard</a>
      <h1 className="mb-1 text-xl font-semibold">Weak spots</h1>
      <p className="mb-4 text-sm text-slate-600">Your lowest-confidence requirements across every kit you've practised, weakest first.</p>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!rows && !error && <p className="text-sm text-slate-500">Loading...</p>}
      {rows && rows.length === 0 && <p className="card text-sm text-slate-500">No practice data yet. Practice mode results will show up here.</p>}

      {rows && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="card flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{r.requirement}</p>
                <p className="text-xs text-slate-500">{r.role} at {r.company}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`badge ${r.priority === "must" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{r.priority}</span>
                <span className="text-xs text-slate-500">confidence {r.confidence}/5</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
