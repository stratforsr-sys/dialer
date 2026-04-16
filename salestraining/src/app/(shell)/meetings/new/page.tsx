"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { analyzeRealMeeting } from "@/actions/meetings";

const USER_ID = "default-user";

export default function NewMeetingPage() {
  const router = useRouter();
  const [meetingType, setMeetingType] = useState("meeting_1");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!transcript.trim()) return;

    setLoading(true);
    setProgress("Analyserar transkript med AI...");

    try {
      const result = await analyzeRealMeeting(USER_ID, meetingType, transcript.trim());
      setProgress("Analys klar!");
      setTimeout(() => router.push(`/meetings/${result.id}`), 500);
    } catch {
      setProgress("Något gick fel. Försök igen.");
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-[var(--space-6)] py-[var(--space-8)]">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1
          className="font-heading text-3xl font-semibold mb-[var(--space-2)]"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}
        >
          Analysera möte
        </h1>
        <p className="text-sm mb-[var(--space-8)]" style={{ color: "var(--text-tertiary)" }}>
          Klistra in mötets transkript — AI:n analyserar mot din kunskapsbas.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-[var(--space-6)]">
          {/* Meeting Type */}
          <div>
            <label className="block text-xs font-medium mb-[var(--space-3)]" style={{ color: "var(--text-secondary)" }}>
              Mötestyp
            </label>
            <div className="grid grid-cols-3 gap-[var(--space-2)]">
              {[
                { value: "meeting_1", label: "Möte 1", desc: "Behovsanalys + demo" },
                { value: "meeting_2", label: "Möte 2", desc: "Offert + invändningar" },
                { value: "meeting_3", label: "Möte 3", desc: "Beslut" },
              ].map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setMeetingType(t.value)}
                  className="flex flex-col items-center gap-[2px] px-[var(--space-3)] py-[var(--space-3)] text-center transition-all"
                  style={{
                    background: meetingType === t.value ? "var(--accent-muted)" : "var(--bg-card)",
                    border: `1px solid ${meetingType === t.value ? "var(--border-accent)" : "var(--border-subtle)"}`,
                    borderRadius: "var(--radius-md)",
                    color: meetingType === t.value ? "var(--accent)" : "var(--text-secondary)",
                  }}
                >
                  <span className="text-sm font-medium">{t.label}</span>
                  <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Transcript */}
          <div>
            <label className="block text-xs font-medium mb-[var(--space-2)]" style={{ color: "var(--text-secondary)" }}>
              Transkript
            </label>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              placeholder="Klistra in hela transkriptet här..."
              rows={20}
              disabled={loading}
              className="w-full px-[var(--space-4)] py-[var(--space-3)] text-sm outline-none resize-y transition-colors"
              style={{
                background: "var(--bg-input)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--radius-md)",
                minHeight: "300px",
              }}
            />
          </div>

          <div className="flex items-center gap-[var(--space-4)]">
            <button
              type="submit"
              disabled={loading || !transcript.trim()}
              className="flex items-center gap-[var(--space-2)] px-[var(--space-6)] py-[var(--space-3)] text-sm font-medium transition-all disabled:opacity-40"
              style={{
                background: "var(--accent)",
                color: "var(--text-inverse)",
                borderRadius: "var(--radius-md)",
              }}
            >
              {loading ? "Analyserar..." : "Analysera möte"}
            </button>
            {progress && (
              <span className="text-sm" style={{ color: loading ? "var(--accent)" : "var(--success)" }}>
                {progress}
              </span>
            )}
          </div>
        </form>
      </motion.div>
    </div>
  );
}
