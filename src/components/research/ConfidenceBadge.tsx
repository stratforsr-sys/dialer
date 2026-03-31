"use client";

import type { ConfidenceTier } from "@/types/research";

const styles: Record<ConfidenceTier, string> = {
  VERIFIED: "bg-green-100 text-green-700 border border-green-200",
  INFERRED: "bg-yellow-100 text-yellow-700 border border-yellow-200",
  ESTIMATED: "bg-zinc-100 text-zinc-500 border border-zinc-200",
};

const labels: Record<ConfidenceTier, string> = {
  VERIFIED: "Verifierad",
  INFERRED: "Härledd",
  ESTIMATED: "Uppskattad",
};

export function ConfidenceBadge({ tier }: { tier: ConfidenceTier }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${styles[tier]}`}>
      {labels[tier]}
    </span>
  );
}
