"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { LevelBadge } from "@/components/gamification/level-badge";

interface Technique {
  id: string;
  name: string;
  description: string;
  whenToUse: string;
  howToUse: string;
  difficulty: string;
  ifThenPatterns: { id: string; trigger: string; response: string; context: string | null }[];
  skillProgress: { level: string; avgScore: number; totalReps: number; lastPracticedAt: string | null } | null;
  repetitionCard: { nextReviewAt: string } | null;
}

interface ModuleData {
  id: string;
  name: string;
  description: string | null;
  techniques: Technique[];
  rawNotes: { id: string; source: string | null; createdAt: string }[];
}

export function ModuleDetailClient({ module: mod }: { module: ModuleData }) {
  const [expandedTech, setExpandedTech] = useState<string | null>(null);

  return (
    <div className="max-w-4xl mx-auto px-[var(--space-6)] py-[var(--space-8)]">
      {/* Breadcrumb */}
      <div className="flex items-center gap-[var(--space-2)] text-xs mb-[var(--space-6)]" style={{ color: "var(--text-tertiary)" }}>
        <Link href="/modules" className="hover:underline">Moduler</Link>
        <span>/</span>
        <span style={{ color: "var(--text-secondary)" }}>{mod.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-[var(--space-8)]">
        <div>
          <h1
            className="font-heading text-3xl font-semibold"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}
          >
            {mod.name}
          </h1>
          <p className="mt-[var(--space-1)] text-sm" style={{ color: "var(--text-tertiary)" }}>
            {mod.techniques.length} tekniker · {mod.rawNotes.length} anteckningsfiler
          </p>
        </div>
        <Link
          href={`/practice?module=${mod.id}`}
          className="flex items-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-2)] text-sm font-medium transition-all"
          style={{
            background: "var(--accent)",
            color: "var(--text-inverse)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="3" /><circle cx="8" cy="8" r="0.75" fill="currentColor" />
          </svg>
          Öva modul
        </Link>
      </div>

      {/* Techniques */}
      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
        className="flex flex-col gap-[var(--space-3)]"
      >
        {mod.techniques.map((tech) => {
          const isExpanded = expandedTech === tech.id;

          return (
            <motion.div
              key={tech.id}
              variants={{
                hidden: { opacity: 0, y: 12 },
                show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
              }}
            >
              <button
                onClick={() => setExpandedTech(isExpanded ? null : tech.id)}
                className="w-full text-left card px-[var(--space-5)] py-[var(--space-4)]"
              >
                <div className="flex items-center gap-[var(--space-4)]">
                  {/* Difficulty indicator */}
                  <div
                    className="w-1 h-8 rounded-full flex-shrink-0"
                    style={{
                      background: tech.difficulty === "hard"
                        ? "var(--error)"
                        : tech.difficulty === "medium"
                          ? "var(--warning)"
                          : "var(--success)",
                    }}
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-[var(--space-3)]">
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {tech.name}
                      </span>
                      <LevelBadge level={tech.skillProgress?.level || "beginner"} />
                    </div>
                    <div className="text-xs mt-[2px] line-clamp-1" style={{ color: "var(--text-tertiary)" }}>
                      {tech.description}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-[var(--space-4)] flex-shrink-0">
                    {tech.skillProgress && tech.skillProgress.totalReps > 0 && (
                      <span className="font-mono text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {Math.round(tech.skillProgress.avgScore)}%
                      </span>
                    )}
                    {tech.ifThenPatterns.length > 0 && (
                      <span className="font-mono text-[10px] px-[6px] py-[2px]" style={{
                        background: "var(--bg-elevated)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text-tertiary)",
                      }}>
                        {tech.ifThenPatterns.length} OM-DÅ
                      </span>
                    )}
                    <svg
                      width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"
                      className="transition-transform"
                      style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}
                    >
                      <path d="M4 6l4 4 4-4" />
                    </svg>
                  </div>
                </div>
              </button>

              {/* Expanded Detail */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
                    className="overflow-hidden"
                  >
                    <div
                      className="px-[var(--space-6)] py-[var(--space-5)] ml-[var(--space-5)] border-l-2 mt-[-1px]"
                      style={{
                        borderColor: "var(--border-default)",
                        background: "var(--bg-panel)",
                      }}
                    >
                      <div className="grid gap-[var(--space-5)]">
                        <DetailSection title="När den används" content={tech.whenToUse} />
                        <DetailSection title="Hur den används" content={tech.howToUse} />

                        {tech.ifThenPatterns.length > 0 && (
                          <div>
                            <h4 className="text-xs font-medium uppercase tracking-wider mb-[var(--space-3)]" style={{ color: "var(--text-tertiary)" }}>
                              OM-DÅ-mönster
                            </h4>
                            <div className="flex flex-col gap-[var(--space-3)]">
                              {tech.ifThenPatterns.map((pattern) => (
                                <div
                                  key={pattern.id}
                                  className="px-[var(--space-4)] py-[var(--space-3)]"
                                  style={{
                                    background: "var(--bg-card)",
                                    borderRadius: "var(--radius-md)",
                                    border: "1px solid var(--border-subtle)",
                                  }}
                                >
                                  <div className="text-xs mb-[var(--space-1)]">
                                    <span style={{ color: "var(--accent)" }}>OM:</span>{" "}
                                    <span style={{ color: "var(--text-secondary)" }}>{pattern.trigger}</span>
                                  </div>
                                  <div className="text-xs">
                                    <span style={{ color: "var(--success)" }}>DÅ:</span>{" "}
                                    <span style={{ color: "var(--text-secondary)" }}>{pattern.response}</span>
                                  </div>
                                  {pattern.context && (
                                    <div className="text-[10px] mt-[var(--space-1)]" style={{ color: "var(--text-tertiary)" }}>
                                      {pattern.context}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Practice button */}
                        <Link
                          href={`/practice?technique=${tech.id}`}
                          className="inline-flex items-center gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-2)] text-xs font-medium w-fit transition-all"
                          style={{
                            background: "var(--accent-muted)",
                            color: "var(--accent)",
                            borderRadius: "var(--radius-md)",
                            border: "1px solid var(--border-accent)",
                          }}
                        >
                          Öva denna teknik
                        </Link>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

function DetailSection({ title, content }: { title: string; content: string }) {
  return (
    <div>
      <h4 className="text-xs font-medium uppercase tracking-wider mb-[var(--space-1)]" style={{ color: "var(--text-tertiary)" }}>
        {title}
      </h4>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {content}
      </p>
    </div>
  );
}
