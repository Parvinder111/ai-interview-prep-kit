"use client";

const STATUS_STYLES = {
  generating: "bg-amber-100 text-amber-800",
  ready: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};

export default function KitList({ kits }) {
  if (kits === null) {
    return <p className="text-sm text-slate-500">Loading your kits...</p>;
  }
  if (kits.length === 0) {
    return (
      <div className="card text-center text-sm text-slate-500">
        No kits yet. Paste a job description on the left to generate your first one.
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {kits.map((k) => (
        <li key={k._id}>
          <a href={`/kit/${k._id}`} className="card block hover:border-brand-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium">{k.kit?.source?.role || k.inputCompanyUrl}</p>
                <p className="text-sm text-slate-500">{k.kit?.source?.company || k.inputCompanyUrl}</p>
              </div>
              <span className={`badge ${STATUS_STYLES[k.status] || "bg-slate-100 text-slate-700"}`}>{k.status}</span>
            </div>
            {k.status === "ready" && k.kit?.coverage?.uncovered_requirement_ids?.length > 0 && (
              <p className="mt-2 text-xs text-amber-700">
                {k.kit.coverage.uncovered_requirement_ids.length} must-have requirement(s) still uncovered
              </p>
            )}
            {k.status === "failed" && <p className="mt-2 text-xs text-red-600">{k.error?.message}</p>}
          </a>
        </li>
      ))}
    </ul>
  );
}
