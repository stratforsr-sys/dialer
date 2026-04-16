"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { XpBar } from "@/components/gamification/xp-bar";
import { StreakDisplay } from "@/components/gamification/streak-display";
import { LevelBadge } from "@/components/gamification/level-badge";
import type { WeakTechnique, DueRepetition } from "@/lib/knowledge-base";

interface DashboardStats {
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  sessionCount: number;
  totalMinutes: number;
  totalTechniques: number;
  moduleCount: number;
  meetingCount: number;
  levelCounts: Record<string, number>;
}

interface ModuleWithTechniques {
  id: string;
  name: string;
  description: string | null;
  techniques: {
    id: string;
    name: string;
    difficulty: string;
    skillProgress: {
      level: string;
      avgScore: number;
      totalReps: number;
      lastPracticedAt: string | null;
    } | null;
  }[];
}

interface DashboardClientProps {
  stats: DashboardStats;
  dueReps: DueRepetition[];
  weakTechniques: WeakTechnique[];
  modules: ModuleWithTechniques[];
}

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

function getXpLevel(totalXp: number) {
  if (totalXp >= 7000) return { level: "expert", next: 99999 };
  if (totalXp >= 3500) return { level: "skilled", next: 7000 };
  if (totalXp >= 1500) return { level: "competent", next: 3500 };
  if (totalXp >= 500) return { level: "advanced", next: 1500 };
  return { level: "beginner", next: 500 };
}

export function DashboardClient({ stats, dueReps, weakTechniques, modules }: DashboardClientProps) {
  const { level, next } = getXpLevel(stats.totalXp);
  const hasModules = modules.length > 0;

  return (
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="flex flex-1 h-[calc(100vh-56px)]"
    >
      {/* ============================================================
          LEFT PANEL — Modules & Techniques Tree
          ============================================================ */}
      <motion.aside
        variants={fadeUp}
        className="w-[280px] flex-shrink-0 overflow-y-auto hidden lg:flex flex-col"
        style={{
          background: "var(--bg-panel)",
          borderRight: "1px solid var(--border-subtle)",
        }}
      >
        <div className="px-[var(--space-5)] py-[var(--space-4)] flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border-subtle)" }}
        >
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            Moduler
          </span>
          <Link
            href="/modules/new"
            className="flex items-center justify-center w-6 h-6 transition-colors"
            style={{
              background: "var(--bg-elevated)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-tertiary)",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2v8M2 6h8" />
            </svg>
          </Link>
        </div>

        <div className="flex-1 py-[var(--space-2)]">
          {!hasModules ? (
            <div className="px-[var(--space-5)] py-[var(--space-8)] text-center">
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                Ingen kunskapsbas ännu
              </div>
              <Link
                href="/modules/new"
                className="inline-flex items-center gap-[var(--space-2)] mt-[var(--space-4)] px-[var(--space-4)] py-[var(--space-2)] text-sm font-medium transition-all"
                style={{
                  background: "var(--accent-muted)",
                  color: "var(--accent)",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-accent)",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M6 2v8M2 6h8" />
                </svg>
                Ladda upp anteckningar
              </Link>
            </div>
          ) : (
            modules.map((mod) => (
              <div key={mod.id}>
                <Link
                  href={`/modules/${mod.id}`}
                  className="flex items-center gap-[var(--space-3)] px-[var(--space-5)] py-[var(--space-3)] text-sm transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.6">
                    <path d="M2.5 3C2.5 2.5 3 2 4 2h3.5v12H4c-1 0-1.5-.5-1.5-1V3z" />
                    <path d="M7.5 2H12c1 0 1.5.5 1.5 1v10c0 .5-.5 1-1.5 1H7.5V2z" />
                  </svg>
                  <span className="flex-1 truncate">{mod.name}</span>
                  <span className="font-mono text-[10px]" style={{ color: "var(--text-tertiary)" }}>
                    {mod.techniques.length}
                  </span>
                </Link>

                {mod.techniques.slice(0, 5).map((tech) => (
                  <div
                    key={tech.id}
                    className="flex items-center gap-[var(--space-2)] pl-[44px] pr-[var(--space-5)] py-[var(--space-1)] text-xs"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    <div
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{
                        background: tech.skillProgress
                          ? `var(--level-${tech.skillProgress.level})`
                          : "var(--level-beginner)",
                      }}
                    />
                    <span className="truncate">{tech.name}</span>
                  </div>
                ))}
                {mod.techniques.length > 5 && (
                  <div className="pl-[44px] pr-[var(--space-5)] py-[var(--space-1)] text-[10px] font-mono" style={{ color: "var(--text-tertiary)" }}>
                    +{mod.techniques.length - 5} till
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </motion.aside>

      {/* ============================================================
          CENTER PANEL — Daily exercises & Actions
          ============================================================ */}
      <motion.div variants={fadeUp} className="flex-1 overflow-y-auto px-[var(--space-6)] py-[var(--space-6)]">
        {/* Header */}
        <div className="mb-[var(--space-8)]">
          <h1
            className="font-heading text-3xl font-semibold"
            style={{ color: "var(--text-primary)", letterSpacing: "-0.03em" }}
          >
            God kväll
          </h1>
          <p className="mt-[var(--space-1)] text-sm" style={{ color: "var(--text-tertiary)" }}>
            {dueReps.length > 0
              ? `${dueReps.length} tekniker väntar på repetition`
              : hasModules
                ? "Inga repetitioner idag — dags att öva nytt?"
                : "Börja med att ladda upp dina anteckningar"
            }
          </p>
        </div>

        {/* Due Repetitions */}
        {dueReps.length > 0 && (
          <section className="mb-[var(--space-8)]">
            <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-4)]">
              <div className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
              <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Repetitioner idag
              </h2>
              <span className="font-mono text-xs px-[6px] py-[2px]" style={{
                background: "var(--accent-muted)",
                color: "var(--accent)",
                borderRadius: "var(--radius-full)",
              }}>
                {dueReps.length}
              </span>
            </div>

            <div className="grid gap-[var(--space-3)]">
              {dueReps.map((rep) => (
                <Link
                  key={rep.cardId}
                  href={`/practice?technique=${rep.techniqueId}`}
                  className="card flex items-center gap-[var(--space-4)] px-[var(--space-5)] py-[var(--space-4)]"
                >
                  <div
                    className="w-10 h-10 flex items-center justify-center flex-shrink-0"
                    style={{
                      background: "var(--accent-subtle)",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="1.5">
                      <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="3" /><circle cx="8" cy="8" r="0.75" fill="var(--accent)" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {rep.techniqueName}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {rep.moduleName}
                      {rep.daysSinceReview != null && ` · ${rep.daysSinceReview}d sedan`}
                    </div>
                  </div>
                  <LevelBadge level={rep.level} />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Weakest techniques */}
        {weakTechniques.length > 0 && (
          <section className="mb-[var(--space-8)]">
            <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-4)]">
              <div className="w-2 h-2 rounded-full" style={{ background: "var(--warning)" }} />
              <h2 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
                Behöver mest övning
              </h2>
            </div>

            <div className="grid gap-[var(--space-3)]">
              {weakTechniques.map((tech) => (
                <Link
                  key={tech.id}
                  href={`/practice?technique=${tech.id}`}
                  className="card flex items-center gap-[var(--space-4)] px-[var(--space-5)] py-[var(--space-4)]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {tech.name}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {tech.moduleName} · {tech.totalReps} reps
                    </div>
                  </div>
                  <div className="flex items-center gap-[var(--space-3)]">
                    {tech.totalReps > 0 && (
                      <span className="font-mono text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {Math.round(tech.avgScore)}%
                      </span>
                    )}
                    <LevelBadge level={tech.level} />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Quick Actions */}
        <section>
          <h2 className="text-sm font-medium mb-[var(--space-4)]" style={{ color: "var(--text-secondary)" }}>
            Snabbstart
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-3)]">
            <QuickAction
              href="/practice"
              icon="target"
              label="Scenariokort"
              description="Öva med AI-scenarier"
              accent="var(--accent)"
            />
            <QuickAction
              href="/roleplay/new"
              icon="users"
              label="Rollspel"
              description="Simulera kundmöte"
              accent="var(--level-competent)"
            />
            <QuickAction
              href="/modules/new"
              icon="plus"
              label="Ny modul"
              description="Ladda upp anteckningar"
              accent="var(--success)"
            />
            <QuickAction
              href="/meetings/new"
              icon="mic"
              label="Analysera möte"
              description="Ladda upp transkript"
              accent="var(--warning)"
            />
          </div>
        </section>
      </motion.div>

      {/* ============================================================
          RIGHT PANEL — Stats & Streak
          ============================================================ */}
      <motion.aside
        variants={fadeUp}
        className="w-[300px] flex-shrink-0 overflow-y-auto hidden xl:flex flex-col"
        style={{
          background: "var(--bg-panel)",
          borderLeft: "1px solid var(--border-subtle)",
        }}
      >
        <div className="px-[var(--space-5)] py-[var(--space-4)]" style={{ borderBottom: "1px solid var(--border-subtle)" }}>
          <span className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            Progress
          </span>
        </div>

        <div className="p-[var(--space-5)] flex flex-col gap-[var(--space-6)]">
          {/* XP Progress */}
          <XpBar current={stats.totalXp} nextLevel={next} level={level} />

          {/* Streak */}
          <StreakDisplay currentStreak={stats.currentStreak} longestStreak={stats.longestStreak} />

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-[var(--space-3)]">
            <StatCard label="Sessioner" value={stats.sessionCount} />
            <StatCard label="Tid" value={`${Math.round(stats.totalMinutes)}m`} />
            <StatCard label="Tekniker" value={stats.totalTechniques} />
            <StatCard label="Möten" value={stats.meetingCount} />
          </div>

          {/* Level Distribution */}
          {stats.totalTechniques > 0 && (
            <div>
              <h3 className="text-xs font-medium mb-[var(--space-3)]" style={{ color: "var(--text-tertiary)" }}>
                Nivåfördelning
              </h3>
              <div className="flex flex-col gap-[var(--space-2)]">
                {(["expert", "skilled", "competent", "advanced", "beginner"] as const).map((lvl) => {
                  const count = stats.levelCounts[lvl] || 0;
                  const pct = stats.totalTechniques > 0 ? (count / stats.totalTechniques) * 100 : 0;
                  if (count === 0) return null;
                  return (
                    <div key={lvl} className="flex items-center gap-[var(--space-2)]">
                      <LevelBadge level={lvl} size="sm" />
                      <div className="flex-1 h-1.5" style={{ background: "var(--bg-elevated)", borderRadius: "var(--radius-full)" }}>
                        <div
                          className="h-full"
                          style={{
                            width: `${pct}%`,
                            background: `var(--level-${lvl})`,
                            borderRadius: "var(--radius-full)",
                          }}
                        />
                      </div>
                      <span className="font-mono text-[10px] w-4 text-right" style={{ color: "var(--text-tertiary)" }}>
                        {count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </motion.aside>
    </motion.div>
  );
}

/* ============================================================
   SUB-COMPONENTS
   ============================================================ */

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card-static px-[var(--space-4)] py-[var(--space-3)]">
      <div className="font-mono text-xl font-bold" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
      <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  description,
  accent,
}: {
  href: string;
  icon: string;
  label: string;
  description: string;
  accent: string;
}) {
  return (
    <Link href={href} className="card flex items-center gap-[var(--space-4)] px-[var(--space-5)] py-[var(--space-4)]">
      <div
        className="w-10 h-10 flex items-center justify-center flex-shrink-0"
        style={{
          background: `${accent}15`,
          borderRadius: "var(--radius-md)",
          border: `1px solid ${accent}30`,
        }}
      >
        <QuickActionIcon type={icon} color={accent} />
      </div>
      <div>
        <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{label}</div>
        <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{description}</div>
      </div>
    </Link>
  );
}

function QuickActionIcon({ type, color }: { type: string; color: string }) {
  switch (type) {
    case "target":
      return (
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
          <circle cx="8" cy="8" r="6" /><circle cx="8" cy="8" r="3" /><circle cx="8" cy="8" r="0.75" fill={color} />
        </svg>
      );
    case "users":
      return (
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
          <circle cx="6" cy="5" r="2.5" /><path d="M1.5 14c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" />
        </svg>
      );
    case "plus":
      return (
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
          <path d="M8 3v10M3 8h10" />
        </svg>
      );
    case "mic":
      return (
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.5">
          <rect x="5.5" y="2" width="5" height="8" rx="2.5" /><path d="M3 8.5c0 2.5 2 4.5 5 4.5s5-2 5-4.5" /><path d="M8 13v2" />
        </svg>
      );
    default:
      return null;
  }
}
