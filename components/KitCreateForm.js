"use client";

import { useState } from "react";

// A "pair" is one { jd, company_url } prep target. Single mode is just a batch of one — this
// keeps "prepare for more than one role at once" (Section 2) and the everyday single-kit flow on
// the same code path instead of two parallel forms.
export default function KitCreateForm({ onCreated }) {
  const [mode, setMode] = useState("single");
  const [jd, setJd] = useState("");
  const [companyUrl, setCompanyUrl] = useState("");
  const [days, setDays] = useState(5);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function parsePairsFromFile(f) {
    const text = await f.text();
    if (f.name.endsWith(".json")) {
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error("JSON file must be an array of { jd, company_url } objects.");
      return data.map((p) => ({ jd: p.jd, company_url: p.company_url }));
    }
    // CSV fallback: jd,company_url per line (jd itself must not contain a comma in this simple format).
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(1) // header row
      .map((line) => {
        const idx = line.lastIndexOf(",");
        return { jd: line.slice(0, idx).replace(/^"|"$/g, ""), company_url: line.slice(idx + 1).trim() };
      });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      let pairs;
      if (mode === "single") {
        if (!jd.trim() || !companyUrl.trim()) throw new Error("Job description and company website are required.");
        pairs = [{ jd, company_url: companyUrl }];
      } else {
        if (!file) throw new Error("Choose a .json or .csv file of description-and-company pairs.");
        pairs = await parsePairsFromFile(file);
        if (pairs.length === 0) throw new Error("No pairs found in that file.");
      }

      const res = await fetch("/api/kits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: Number(days), pairs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Could not start generation.");
      setJd("");
      setCompanyUrl("");
      setFile(null);
      onCreated?.(data.kits);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4" aria-labelledby="create-heading">
      <div className="flex items-center justify-between">
        <h2 id="create-heading" className="text-base font-semibold">New prep kit</h2>
        <div className="flex gap-1 rounded-md bg-slate-100 p-1 text-sm" role="tablist" aria-label="Creation mode">
          <button type="button" role="tab" aria-selected={mode === "single"} onClick={() => setMode("single")} className={`rounded px-2 py-1 ${mode === "single" ? "bg-white shadow-sm" : ""}`}>
            Single role
          </button>
          <button type="button" role="tab" aria-selected={mode === "batch"} onClick={() => setMode("batch")} className={`rounded px-2 py-1 ${mode === "batch" ? "bg-white shadow-sm" : ""}`}>
            Multiple roles (file)
          </button>
        </div>
      </div>

      {mode === "single" ? (
        <>
          <div>
            <label htmlFor="jd" className="mb-1 block text-sm font-medium text-slate-700">Job description</label>
            <textarea id="jd" required rows={6} className="input" placeholder="Paste the full job description here..." value={jd} onChange={(e) => setJd(e.target.value)} />
          </div>
          <div>
            <label htmlFor="company_url" className="mb-1 block text-sm font-medium text-slate-700">Company website</label>
            <input id="company_url" type="url" required placeholder="https://company.com" className="input" value={companyUrl} onChange={(e) => setCompanyUrl(e.target.value)} />
          </div>
        </>
      ) : (
        <div>
          <label htmlFor="pairs-file" className="mb-1 block text-sm font-medium text-slate-700">
            Description-and-company pairs (.json array of {"{ jd, company_url }"}, or .csv with a header row)
          </label>
          <input id="pairs-file" type="file" accept=".json,.csv" required className="input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
      )}

      <div>
        <label htmlFor="days" className="mb-1 block text-sm font-medium text-slate-700">Days until the interview</label>
        <input id="days" type="number" min={1} max={365} required className="input w-32" value={days} onChange={(e) => setDays(e.target.value)} />
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

      <button type="submit" className="btn-primary" disabled={submitting}>
        {submitting ? "Starting..." : "Generate kit"}
      </button>
    </form>
  );
}
