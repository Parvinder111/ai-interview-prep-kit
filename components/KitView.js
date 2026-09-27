"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QuestionCard from "./QuestionCard.js";
import FlashcardCard from "./FlashcardCard.js";

const CATEGORY_ORDER = ["technical", "behavioural", "system-design", "company-fit"];
const CATEGORY_LABEL = { technical: "Technical", behavioural: "Behavioural", "system-design": "System design", "company-fit": "Company fit" };

async function patchKit(id, edit) {
  const res = await fetch(`/api/kits/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(edit),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Edit failed.");
  return data.kit;
}

async function regenerateKitSection(id, section) {
  const res = await fetch(`/api/kits/${id}/regenerate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ section }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "Regeneration failed.");
  return data.kit;
}

// The kit API routes respond with the whole kit document ({ _id, status, kit, ... }), so take
// the document as-is when that's what came back, and only treat it as bare kit content otherwise.
function mergeServerKit(doc, next) {
  if (next && typeof next === "object" && "kit" in next && "status" in next) return next;
  return { ...doc, kit: next };
}

export default function KitView({ initialDoc }) {
  const [doc, setDoc] = useState(initialDoc);
  const [busySection, setBusySection] = useState(null);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);
  const id = initialDoc._id;

  useEffect(() => {
    if (doc.status !== "generating") return;
    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/kits/${id}`);
      const data = await res.json();
      if (res.ok) setDoc(data.kit);
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [doc.status, id]);

  const kit = doc.kit;
  const requirementsById = useMemo(() => new Map((kit?.role?.requirements || []).map((r) => [r.id, r])), [kit]);

  async function runEdit(edit, { optimistic } = {}) {
    setError(null);
    if (optimistic) setDoc((d) => ({ ...d, kit: optimistic(d.kit) }));
    try {
      const next = await patchKit(id, edit);
      setDoc((d) => mergeServerKit(d, next));
    } catch (err) {
      setError(err.message);
    }
  }

  async function runRegenerate(section) {
    setBusySection(section);
    setError(null);
    try {
      const next = await regenerateKitSection(id, section);
      setDoc((d) => mergeServerKit(d, next));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusySection(null);
    }
  }

  if (doc.status === "generating") {
    return (
      <div className="card flex items-center gap-3" role="status" aria-live="polite">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        <p>Researching the company and generating your kit. This can take a minute or two — this page updates automatically.</p>
      </div>
    );
  }

  if (doc.status === "failed") {
    return (
      <div className="card border-red-200 bg-red-50 text-red-800" role="alert">
        <p className="font-medium">Kit generation failed.</p>
        <p className="text-sm">{doc.error?.message || "Unknown error."}</p>
      </div>
    );
  }

  if (!kit) return <p className="text-sm text-slate-500">No kit data.</p>;

  const questionsByCategory = CATEGORY_ORDER.map((cat) => ({ cat, items: kit.questions.filter((q) => q.category === cat) }));

  function moveQuestion(categoryItems, question, direction) {
    const idx = categoryItems.findIndex((q) => q.id === question.id);
    const swapIdx = idx + direction;
    if (swapIdx < 0 || swapIdx >= categoryItems.length) return;
    const reordered = [...kit.questions];
    const globalIdx = reordered.findIndex((q) => q.id === question.id);
    const globalSwapIdx = reordered.findIndex((q) => q.id === categoryItems[swapIdx].id);
    [reordered[globalIdx], reordered[globalSwapIdx]] = [reordered[globalSwapIdx], reordered[globalIdx]];
    runEdit({ op: "reorder_questions", order: reordered.map((q) => q.id) }, { optimistic: (k) => ({ ...k, questions: reordered }) });
  }

  return (
    <div className="space-y-6">
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {doc.error?.warnings?.length > 0 && (
        <details className="card border-amber-200 bg-amber-50 text-sm text-amber-800">
          <summary className="cursor-pointer font-medium">{doc.error.warnings.length} research note(s) from generation</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {doc.error.warnings.map((w, i) => <li key={i}>{w.message}</li>)}
          </ul>
        </details>
      )}

      <section className="card space-y-2" aria-labelledby="brief-heading">
        <div className="flex items-center justify-between">
          <h2 id="brief-heading" className="text-lg font-semibold">{kit.source.company || "Company brief"}</h2>
          <button className="btn-secondary" onClick={() => runRegenerate("company_brief")} disabled={busySection === "company_brief"}>
            {busySection === "company_brief" ? "Regenerating..." : "Regenerate brief"}
          </button>
        </div>
        <textarea
          className="input"
          rows={3}
          value={kit.company_brief.summary}
          onChange={(e) => runEdit({ op: "edit_brief", fields: { summary: e.target.value } }, { optimistic: (k) => ({ ...k, company_brief: { ...k.company_brief, summary: e.target.value } }) })}
        />
        {kit.company_brief.sources.length > 0 && (
          <p className="text-xs text-slate-500">Sources: {kit.company_brief.sources.join(", ")}</p>
        )}
      </section>

      <section className="card space-y-2" aria-labelledby="req-heading">
        <h2 id="req-heading" className="text-lg font-semibold">Role requirements</h2>
        <ul className="space-y-1 text-sm">
          {kit.role.requirements.map((r) => (
            <li key={r.id} className="flex items-center gap-2">
              <span className={`badge ${r.priority === "must" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600"}`}>{r.priority}</span>
              <span>{r.text}</span>
            </li>
          ))}
          {kit.role.requirements.length === 0 && <li className="text-slate-500">No requirements were extracted from this description.</li>}
        </ul>
        {kit.coverage.uncovered_requirement_ids.length > 0 && (
          <p className="text-sm text-amber-700">
            {kit.coverage.uncovered_requirement_ids.length} must-have requirement(s) still have no question ({kit.coverage.passes} pass(es) run).
          </p>
        )}
      </section>

      {questionsByCategory.map(({ cat, items }) => (
        <section key={cat} className="space-y-2" aria-labelledby={`${cat}-heading`}>
          <div className="flex items-center justify-between">
            <h2 id={`${cat}-heading`} className="text-lg font-semibold">{CATEGORY_LABEL[cat]} questions</h2>
            <div className="flex gap-2">
              <button
                className="btn-secondary"
                onClick={() =>
                  runEdit({ op: "add_question", question: { prompt: "New question", answer_outline: "", category: cat, difficulty: 2, requirement_ids: [] } })
                }
              >
                + Add
              </button>
              <button className="btn-secondary" onClick={() => runRegenerate(cat)} disabled={busySection === cat}>
                {busySection === cat ? "Regenerating..." : "Regenerate"}
              </button>
            </div>
          </div>
          {items.length === 0 ? (
            <p className="card text-sm text-slate-500">No {CATEGORY_LABEL[cat].toLowerCase()} questions yet.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((q, i) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  requirementsById={requirementsById}
                  isFirst={i === 0}
                  isLast={i === items.length - 1}
                  onChange={(fields) =>
                    runEdit({ op: "edit_question", id: q.id, fields }, { optimistic: (k) => ({ ...k, questions: k.questions.map((qq) => (qq.id === q.id ? { ...qq, ...fields } : qq)) }) })
                  }
                  onMove={(dir) => moveQuestion(items, q, dir)}
                  onCategoryChange={(category) => runEdit({ op: "move_question_category", id: q.id, category })}
                  onDelete={() => runEdit({ op: "delete_question", id: q.id })}
                />
              ))}
            </ul>
          )}
        </section>
      ))}

      <section className="space-y-2" aria-labelledby="flashcards-heading">
        <div className="flex items-center justify-between">
          <h2 id="flashcards-heading" className="text-lg font-semibold">Flashcards</h2>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => runEdit({ op: "add_flashcard", flashcard: { front: "New front", back: "New back", requirement_ids: [] } })}>+ Add</button>
            <a href={`/kit/${id}/practice`} className="btn-primary">Practice mode</a>
          </div>
        </div>
        {kit.flashcards.length === 0 ? (
          <p className="card text-sm text-slate-500">No flashcards yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {kit.flashcards.map((f) => (
              <FlashcardCard
                key={f.id}
                flashcard={f}
                onChange={(fields) =>
                  runEdit({ op: "edit_flashcard", id: f.id, fields }, { optimistic: (k) => ({ ...k, flashcards: k.flashcards.map((ff) => (ff.id === f.id ? { ...ff, ...fields } : ff)) }) })
                }
                onDelete={() => runEdit({ op: "delete_flashcard", id: f.id })}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3" aria-labelledby="schedule-heading">
        <div className="flex items-center justify-between">
          <h2 id="schedule-heading" className="text-lg font-semibold">Study schedule ({kit.schedule.days_available} day{kit.schedule.days_available === 1 ? "" : "s"})</h2>
          <button className="btn-secondary" onClick={() => runRegenerate("schedule")} disabled={busySection === "schedule"}>
            {busySection === "schedule" ? "Regenerating..." : "Regenerate schedule"}
          </button>
        </div>
        <ol className="space-y-2">
          {kit.schedule.days.map((day) => (
            <li key={day.day} className="rounded-md border border-slate-200 p-3 text-sm">
              <p className="font-medium">Day {day.day} — {day.focus}</p>
              <p className="text-slate-500">{day.minutes} minutes · {day.question_ids.length} question(s)</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
