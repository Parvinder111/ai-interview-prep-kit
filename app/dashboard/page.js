"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import KitCreateForm from "@/components/KitCreateForm.js";
import KitList from "@/components/KitList.js";

export default function DashboardPage() {
  const router = useRouter();
  const [kits, setKits] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [email, setEmail] = useState("");
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/kits");
      if (!res.ok) throw new Error("Could not load your kits.");
      const data = await res.json();
      setKits(data.kits);
      setLoadError(null);
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((d) => setEmail(d.user?.email || ""));
    load();
  }, [load]);

  // Poll while anything is still generating, so the dashboard shows progress without the user
  // having to refresh (Section 2/12: "watch the kit being generated, with visible progress").
  useEffect(() => {
    const anyGenerating = kits?.some((k) => k.status === "generating");
    clearInterval(pollRef.current);
    if (anyGenerating) {
      pollRef.current = setInterval(load, 3000);
    }
    return () => clearInterval(pollRef.current);
  }, [kits, load]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Your prep kits</h1>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <a href="/weak-spots" className="btn-secondary">Weak spots</a>
          <span>{email}</span>
          <button onClick={logout} className="btn-secondary">Sign out</button>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <KitCreateForm onCreated={load} />
        <section aria-labelledby="kits-heading">
          <h2 id="kits-heading" className="sr-only">Kits</h2>
          {loadError && <p role="alert" className="mb-3 text-sm text-red-600">{loadError}</p>}
          <KitList kits={kits} />
        </section>
      </div>
    </main>
  );
}
