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
        {/* Header */}
        <h1
          className="font-heading text-3xl font-semibold mb-[var(--space-2)]"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}
        >
          Ny modul
        </h1>
        <p className="text-sm mb-[var(--space-8)]" style={{ color: "var(--text-tertiary)" }}>
          Klistra in dina anteckningar — AI:n extraherar tekniker, OM-DÅ-mönster och ramverk automatiskt.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--space-6)]">
          {/* Module Name */}
          <div>
            <label className="block text-xs font-medium mb-[var(--space-2)]" style={{ color: "var(--text-secondary)" }}>
              Modulnamn
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='t.ex. "Behovsanalys" eller "Invändningshantering"'
              disabled={loading}
              className="w-full px-[var(--space-4)] py-[var(--space-3)] text-sm outline-none transition-colors"
              style={{
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
              }}
            />
          </div>

          {/* Source */}
          <div>
            <label className="block text-xs font-medium mb-[var(--space-2)]" style={{ color: "var(--text-secondary)" }}>
              Källa <span style={{ color: "var(--text-tertiary)" }}>(valfritt)</span>
            </label>
            <input
              type="text"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder='t.ex. "Lion Academy - Video 3"'
              disabled={loading}
              className="w-full px-[var(--space-4)] py-[var(--space-3)] text-sm outline-none transition-colors"
              style={{
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
              }}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium mb-[var(--space-2)]" style={{ color: "var(--text-secondary)" }}>
              Anteckningar
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Klistra in dina anteckningar här. Bullet points, löpande text, ramverk — allt fungerar."
              rows={16}
              disabled={loading}
              className="w-full px-[var(--space-4)] py-[var(--space-3)] text-sm outline-none resize-y transition-colors"
              style={{
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                minHeight: "200px",
              }}
            />
            <div className="flex justify-end mt-[var(--space-1)]">
              <span className="text-[11px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                {notes.length} tecken
              </span>
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-[var(--space-4)]">
            <button
              type="submit"
              disabled={loading || !name.trim() || !notes.trim()}
              className="flex items-center gap-[var(--space-2)] px-[var(--space-6)] py-[var(--space-3)] text-sm font-medium transition-all disabled:opacity-40"
              style={{
                background: "var(--accent)",
                color: "var(--text-inverse)",
                borderRadius: "var(--radius-md)",
              }}
            >
              {loading ? (
                <>
                  <LoadingDots />
                  Analyserar...
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M9 1L3 9h4l-1 6 6-8H8l1-6z" />
                  </svg>
                  Analysera med AI
                </>
              )}
            </button>

            {progress && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-sm"
                style={{ color: loading ? "var(--accent)" : "var(--success)" }}
              >
                {progress}
              </motion.span>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}

function LoadingDots() {
  return (
    <span className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "currentColor" }}
        />
      ))}
    </span>
  );
}
