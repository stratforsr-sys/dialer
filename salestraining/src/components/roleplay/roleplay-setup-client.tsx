"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { startPracticeSession } from "@/actions/practice";
import { startRoleplay } from "@/actions/roleplay";

const USER_ID = "default-user";

interface Persona {
  id: string;
  name: string;
  title: string;
  company: string;
  industry: string;
  companySize: string;
  personality: string;
}

export function RoleplaySetupClient({ personas }: { personas: Persona[] }) {
  const router = useRouter();
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [meetingType, setMeetingType] = useState("meeting_1");
  const [difficulty, setDifficulty] = useState("medium");
  const [loading, setLoading] = useState(false);

  async function handleStart() {
    if (!selectedPersona) return;
    setLoading(true);

    try {
      const session = await startPracticeSession(USER_ID, "roleplay");
      const roleplay = await startRoleplay(session.id, selectedPersona, meetingType, difficulty);
      router.push(`/roleplay/${roleplay.id}`);
    } catch {
      setLoading(false);
    }
  }

  const selected = personas.find((p) => p.id === selectedPersona);

  return (
    <div className="max-w-3xl mx-auto px-[var(--space-6)] py-[var(--space-8)]">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1
          className="font-heading text-3xl font-semibold mb-[var(--space-2)]"
          style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}
        >
          Nytt rollspel
        </h1>
        <p className="text-sm mb-[var(--space-8)]" style={{ color: "var(--text-tertiary)" }}>
          Välj persona, mötestyp och svårighetsgrad. AI:n spelar köparen.
        </p>

        {/* Personas */}
        <div className="mb-[var(--space-8)]">
          <label className="block text-xs font-medium uppercase tracking-wider mb-[var(--space-3)]" style={{ color: "var(--text-tertiary)" }}>
            Välj köpare
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-3)]">
            {personas.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPersona(p.id)}
                className="text-left card px-[var(--space-5)] py-[var(--space-4)] transition-all"
                style={{
                  borderColor: selectedPersona === p.id ? "var(--accent)" : undefined,
                  boxShadow: selectedPersona === p.id ? "var(--shadow-glow)" : undefined,
                }}
              >
                <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-2)]">
                  <div
                    className="w-9 h-9 flex items-center justify-center text-sm font-medium"
                    style={{
                      background: "var(--bg-elevated)",
                      borderRadius: "var(--radius-full)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {p.name.charAt(0)}
                  </div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {p.name}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {p.title}, {p.company}
                    </div>
                  </div>
                </div>
                <div className="text-xs line-clamp-2" style={{ color: "var(--text-tertiary)" }}>
                  {p.personality}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Meeting Type */}
        <div className="mb-[var(--space-8)]">
          <label className="block text-xs font-medium uppercase tracking-wider mb-[var(--space-3)]" style={{ color: "var(--text-tertiary)" }}>
            Mötestyp
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--space-2)]">
            {[
              { value: "cold_call", label: "Coldcall" },
              { value: "meeting_1", label: "Möte 1" },
              { value: "meeting_2", label: "Möte 2" },
              { value: "meeting_3", label: "Möte 3" },
            ].map((t) => (
              <button
                key={t.value}
                onClick={() => setMeetingType(t.value)}
                className="px-[var(--space-3)] py-[var(--space-3)] text-sm text-center transition-all"
                style={{
                  background: meetingType === t.value ? "var(--accent-muted)" : "var(--bg-card)",
                  border: `1px solid ${meetingType === t.value ? "var(--border-accent)" : "var(--border-subtle)"}`,
                  borderRadius: "var(--radius-md)",
                  color: meetingType === t.value ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Difficulty */}
        <div className="mb-[var(--space-8)]">
          <label className="block text-xs font-medium uppercase tracking-wider mb-[var(--space-3)]" style={{ color: "var(--text-tertiary)" }}>
            Svårighetsgrad
          </label>
          <div className="grid grid-cols-4 gap-[var(--space-2)]">
            {[
              { value: "easy", label: "Enkel" },
              { value: "medium", label: "Medel" },
              { value: "hard", label: "Svår" },
              { value: "expert", label: "Expert" },
            ].map((d) => (
              <button
                key={d.value}
                onClick={() => setDifficulty(d.value)}
                className="px-[var(--space-3)] py-[var(--space-3)] text-sm text-center transition-all"
                style={{
                  background: difficulty === d.value ? "var(--accent-muted)" : "var(--bg-card)",
                  border: `1px solid ${difficulty === d.value ? "var(--border-accent)" : "var(--border-subtle)"}`,
                  borderRadius: "var(--radius-md)",
                  color: difficulty === d.value ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Start Button */}
        <button
          onClick={handleStart}
          disabled={!selectedPersona || loading}
          className="w-full flex items-center justify-center gap-[var(--space-2)] px-[var(--space-6)] py-[var(--space-4)] text-sm font-medium transition-all disabled:opacity-40"
          style={{
            background: "var(--accent)",
            color: "var(--text-inverse)",
            borderRadius: "var(--radius-md)",
          }}
        >
          {loading ? (
            "Startar rollspel..."
          ) : selected ? (
            `Starta samtal med ${selected.name}`
          ) : (
            "Välj en köpare för att starta"
          )}
        </button>
      </motion.div>
    </div>
  );
}
