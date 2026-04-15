"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createModule } from "@/actions/modules";

const USER_ID = "default-user";

export default function NewModulePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !notes.trim()) return;

    setLoading(true);
    setProgress("Analyserar anteckningar med AI...");

    try {
      const result = await createModule(USER_ID, name.trim(), notes.trim(), source.trim() || undefined);
      setProgress(`${result.techniquesCreated} tekniker extraherade!`);
      setTimeout(() => router.push(`/modules/${result.moduleId}`), 800);
    } catch {
      setProgress("Något gick fel. Försök igen.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-[var(--space-6)] py-[var(--space-8)]">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="font-heading text-3xl font-semibold mb-[var(--space-2)]" style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}>Ny modul</h1>
        <p className="text-sm mb-[var(--space-8)]" style={{ color: "var(--text-tertiary)" }}>Klistra in dina anteckningar — AI:n extraherar tekniker automatiskt.</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--space-6)]">
          <div>
            <label className="block text-xs font-medium mb-[var(--space-2)]" style={{ color: "var(--text-secondary)" }}>Modulnamn</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder='t.ex. "Behovsanalys"' disabled={loading} className="w-full px-[var(--space-4)] py-[var(--space-3)] text-sm outline-none" style={{ background: "var(--bg-input)", color: "var(--text-primary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-[var(--space-2)]" style={{ color: "var(--text-secondary)" }}>Källa <span style={{ color: "var(--text-tertiary)" }}>(valfritt)</span></label>
            <input type="text" value={source} onChange={(e) => setSource(e.target.value)} placeholder='t.ex. "Lion Academy - Video 3"' disabled={loading} className="w-full px-[var(--space-4)] py-[var(--space-3)] text-sm outline-none" style={{ background: "var(--bg-input)", color: "var(--text-primary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)" }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-[var(--space-2)]" style={{ color: "var(--text-secondary)" }}>Anteckningar</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Klistra in dina anteckningar här." rows={16} disabled={loading} className="w-full px-[var(--space-4)] py-[var(--space-3)] text-sm outline-none resize-y" style={{ background: "var(--bg-input)", color: "var(--text-primary)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-md)", minHeight: "200px" }} />
            <div className="flex justify-end mt-[var(--space-1)]"><span className="text-[11px] font-mono" style={{ color: "var(--text-tertiary)" }}>{notes.length} tecken</span></div>
          </div>
          <div className="flex items-center gap-[var(--space-4)]">
            <button type="submit" disabled={loading || !name.trim() || !notes.trim()} className="flex items-center gap-[var(--space-2)] px-[var(--space-6)] py-[var(--space-3)] text-sm font-medium disabled:opacity-40" style={{ background: "var(--accent)", color: "var(--text-inverse)", borderRadius: "var(--radius-md)" }}>
              {loading ? "Analyserar..." : "Analysera med AI"}
            </button>
            {progress && <span className="text-sm" style={{ color: loading ? "var(--accent)" : "var(--success)" }}>{progress}</span>}
          </div>
        </form>
      </motion.div>
    </div>
  );
}
