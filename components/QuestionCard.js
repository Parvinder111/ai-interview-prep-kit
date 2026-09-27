"use client";

const CATEGORIES = ["technical", "behavioural", "system-design", "company-fit"];
const STATE_LABEL = { generated: null, edited: "edited", user: "your own" };

export default function QuestionCard({ question, onChange, onMove, onDelete, onCategoryChange, isFirst, isLast, requirementsById }) {
  const label = STATE_LABEL[question.state];
  return (
    <li className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {question.requirement_ids.map((rid) => (
            <span key={rid} className="badge bg-slate-100 text-slate-600" title={requirementsById.get(rid)?.text}>
              {requirementsById.get(rid)?.priority === "must" ? "must" : "nice"}
            </span>
          ))}
          <span className="badge bg-slate-100 text-slate-500">difficulty {question.difficulty}</span>
          {label && <span className="badge bg-brand-50 text-brand-700">{label}</span>}
        </div>
        <div className="flex items-center gap-1">
          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => onMove(-1)} disabled={isFirst} aria-label="Move question up">↑</button>
          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => onMove(1)} disabled={isLast} aria-label="Move question down">↓</button>
          <select
            className="input w-auto py-1 text-xs"
            value={question.category}
            onChange={(e) => onCategoryChange(e.target.value)}
            aria-label="Move to category"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button type="button" className="btn-danger px-2 py-1 text-xs" onClick={onDelete} aria-label="Delete question">Delete</button>
        </div>
      </div>

      <label className="block text-xs font-medium text-slate-500">Question</label>
      <textarea
        className="input"
        rows={2}
        value={question.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
      />

      <label className="block text-xs font-medium text-slate-500">Answer outline</label>
      <textarea
        className="input"
        rows={2}
        value={question.answer_outline}
        onChange={(e) => onChange({ answer_outline: e.target.value })}
      />
    </li>
  );
}
