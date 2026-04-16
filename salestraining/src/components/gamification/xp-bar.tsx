"use client";

import { motion } from "framer-motion";

interface XpBarProps {
  current: number;
  nextLevel: number;
  level: string;
}

const LEVEL_CONFIG: Record<string, { label: string; color: string; next: number }> = {
  beginner:  { label: "Nybörjare",  color: "var(--level-beginner)",  next: 500 },
  advanced:  { label: "Avancerad",  color: "var(--level-advanced)",  next: 1500 },
  competent: { label: "Kompetent",  color: "var(--level-competent)", next: 3500 },
  skilled:   { label: "Skicklig",   color: "var(--level-skilled)",   next: 7000 },
  expert:    { label: "Expert",     color: "var(--level-expert)",    next: 99999 },
};

export function XpBar({ current, nextLevel, level }: XpBarProps) {
  const config = LEVEL_CONFIG[level] || LEVEL_CONFIG.beginner;
  const progress = Math.min((current / nextLevel) * 100, 100);

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[var(--space-2)]">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: config.color }}
          />
          <span className="text-xs font-medium" style={{ color: config.color }}>
            {config.label}
          </span>
        </div>
        <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
          {current.toLocaleString()} / {nextLevel.toLocaleString()} XP
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden"
        style={{
          background: "var(--bg-elevated)",
          borderRadius: "var(--radius-full)",
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] }}
          className="h-full"
          style={{
            background: `linear-gradient(90deg, ${config.color}, ${config.color}cc)`,
            borderRadius: "var(--radius-full)",
          }}
        />
      </div>
    </div>
  );
}
