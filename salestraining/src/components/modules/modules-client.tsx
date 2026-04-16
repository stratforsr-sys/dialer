"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { LevelBadge } from "@/components/gamification/level-badge";

interface ModuleSummary {
  id: string;
  name: string;
  description: string | null;
  techniqueCount: number;
  noteCount: number;
  avgLevel: number;
  avgLevelLabel: string;
  nextReview: string | null;
  lastTrained: string | null;
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

export function ModulesClient({ modules }: { modules: ModuleSummary[] }) {
  return (
    <div className="max-w-4xl mx-auto px-[var(--space-6)] py-[var(--space-8)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-[var(--space-8)]">
        <div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}
          >
            Moduler
          </h1>
          <p className="mt-[var(--space-1)] text-sm" style={{ color: "var(--text-tertiary)" }}>
            {modules.length} moduler · {modules.reduce((s, m) => s + m.techniqueCount, 0)} tekniker
          </p>
        </div>
        <Link
          href="/modules/new"
          className="flex items-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-2)] text-sm font-medium transition-all"
          style={{
            background: "var(--accent)",
            color: "var(--text-inverse)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 2v8M2 6h8" />
          </svg>
          Ny modul
        </Link>
      </div>

      {/* Module Grid */}
      {modules.length === 0 ? (
        <EmptyState />
      ) : (
        <motion.div variants={stagger} initial="hidden" animate="show" className="grid gap-[var(--space-4)]">
          {modules.map((mod) => (
            <motion.div key={mod.id} variants={fadeUp}>
              <Link href={`/modules/${mod.id}`} className="card flex items-center gap-[var(--space-5)] px-[var(--space-6)] py-[var(--space-5)]">
                {/* Icon */}
                <div
                  className="w-12 h-12 flex items-center justify-center flex-shrink-0"
                  style={{
                    background: "var(--accent-subtle)",
                    borderRadius: "var(--radius-lg)",
                    border: "1px solid var(--border-accent)",
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                    <path d="M2.5 3C2.5 2.5 3 2 4 2h3.5v12H4c-1 0-1.5-.5-1.5-1V3z" />
                    <path d="M7.5 2H12c1 0 1.5.5 1.5 1v10c0 .5-.5 1-1.5 1H7.5V2z" />
                  </svg>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-[var(--space-3)]">
                    <h2 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>
                      {mod.name}
                    </h2>
                    <LevelBadge level={mod.avgLevelLabel.toLowerCase() === "expert" ? "expert" : mod.avgLevelLabel.toLowerCase() === "skicklig" ? "skilled" : mod.avgLevelLabel.toLowerCase() === "kompetent" ? "competent" : mod.avgLevelLabel.toLowerCase() === "avancerad" ? "advanced" : "beginner"} />
                  </div>
                  <div className="flex items-center gap-[var(--space-4)] mt-[var(--space-1)] text-xs" style={{ color: "var(--text-tertiary)" }}>
                    <span>{mod.techniqueCount} tekniker</span>
                    <span>{mod.noteCount} anteckningar</span>
                    {mod.lastTrained && (
                      <span>Senast: {new Date(mod.lastTrained).toLocaleDateString("sv-SE")}</span>
                    )}
                  </div>
                </div>

                {/* Arrow */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
                  <path d="M6 4l4 4-4 4" />
                </svg>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center py-[var(--space-16)] text-center"
      style={{
        background: "var(--bg-card)",
        borderRadius: "var(--radius-xl)",
        border: "1px dashed var(--border-default)",
      }}
    >
      <div
        className="w-16 h-16 flex items-center justify-center mb-[var(--space-5)]"
        style={{
          background: "var(--accent-subtle)",
          borderRadius: "var(--radius-xl)",
        }}
      >
        <svg width="28" height="28" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.5">
          <path d="M2.5 3C2.5 2.5 3 2 4 2h3.5v12H4c-1 0-1.5-.5-1.5-1V3z" />
          <path d="M7.5 2H12c1 0 1.5.5 1.5 1v10c0 .5-.5 1-1.5 1H7.5V2z" />
        </svg>
      </div>
      <h3 className="font-heading text-xl font-semibold mb-[var(--space-2)]" style={{ color: "var(--text-primary)" }}>
        Börja din träning
      </h3>
      <p className="text-sm max-w-xs mb-[var(--space-6)]" style={{ color: "var(--text-tertiary)" }}>
        Ladda upp dina Lion Academy-anteckningar så extraherar AI:n tekniker automatiskt.
      </p>
      <Link
        href="/modules/new"
        className="flex items-center gap-[var(--space-2)] px-[var(--space-5)] py-[var(--space-3)] text-sm font-medium transition-all"
        style={{
          background: "var(--accent)",
          color: "var(--text-inverse)",
          borderRadius: "var(--radius-md)",
        }}
      >
        Ladda upp anteckningar
      </Link>
    </div>
  );
}
