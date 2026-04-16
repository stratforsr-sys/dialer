"use client";

import { motion } from "framer-motion";

interface StreakDisplayProps {
  currentStreak: number;
  longestStreak: number;
}

export function StreakDisplay({ currentStreak, longestStreak }: StreakDisplayProps) {
  const isActive = currentStreak > 0;
  const isHot = currentStreak >= 7;

  return (
    <div className="flex items-center gap-[var(--space-4)]">
      <motion.div
        animate={isHot ? { scale: [1, 1.1, 1] } : {}}
        transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
        className="relative flex items-center justify-center w-12 h-12"
        style={{
          background: isActive ? "rgba(249, 115, 22, 0.12)" : "var(--bg-elevated)",
          borderRadius: "var(--radius-lg)",
          border: `1px solid ${isActive ? "rgba(249, 115, 22, 0.3)" : "var(--border-subtle)"}`,
        }}
      >
        <svg width="24" height="24" viewBox="0 0 16 16" fill={isActive ? "var(--streak-flame)" : "var(--text-tertiary)"}>
          <path d="M8 1c0 2.5-3 4-3 7a4 4 0 008 0c0-2-1-3.5-2-4.5-.5 1.5-1.5 2-2 1.5C9 4 9 2.5 8 1z" />
        </svg>
        {isHot && (
          <motion.div
            animate={{ opacity: [0.3, 0.7, 0.3] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="absolute inset-0"
            style={{
              borderRadius: "var(--radius-lg)",
              boxShadow: "0 0 20px rgba(249, 115, 22, 0.3)",
            }}
          />
        )}
      </motion.div>

      <div className="flex flex-col">
        <span className="font-mono text-2xl font-bold" style={{ color: isActive ? "var(--streak-flame)" : "var(--text-tertiary)" }}>
          {currentStreak}
        </span>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          dagars streak
        </span>
      </div>

      <div className="ml-auto flex flex-col items-end">
        <span className="font-mono text-sm" style={{ color: "var(--text-secondary)" }}>
          {longestStreak}
        </span>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          bäst
        </span>
      </div>
    </div>
  );
}
