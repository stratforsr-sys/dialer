interface LevelBadgeProps {
  level: string;
  size?: "sm" | "md" | "lg";
}

const LEVEL_MAP: Record<string, { label: string; color: string; bg: string }> = {
  beginner:  { label: "Nybörjare", color: "var(--level-beginner)", bg: "rgba(107, 114, 128, 0.15)" },
  advanced:  { label: "Avancerad", color: "var(--level-advanced)", bg: "rgba(59, 130, 246, 0.15)" },
  competent: { label: "Kompetent", color: "var(--level-competent)", bg: "rgba(139, 92, 246, 0.15)" },
  skilled:   { label: "Skicklig",  color: "var(--level-skilled)", bg: "rgba(245, 158, 11, 0.15)" },
  expert:    { label: "Expert",    color: "var(--level-expert)", bg: "rgba(239, 68, 68, 0.15)" },
};

const SIZE_MAP = {
  sm: "px-[6px] py-[2px] text-[10px]",
  md: "px-[var(--space-2)] py-[3px] text-xs",
  lg: "px-[var(--space-3)] py-[var(--space-1)] text-sm",
};

export function LevelBadge({ level, size = "sm" }: LevelBadgeProps) {
  const config = LEVEL_MAP[level] || LEVEL_MAP.beginner;

  return (
    <span
      className={`inline-flex items-center font-medium ${SIZE_MAP[size]}`}
      style={{
        color: config.color,
        background: config.bg,
        borderRadius: "var(--radius-full)",
        border: `1px solid ${config.color}33`,
      }}
    >
      {config.label}
    </span>
  );
}
