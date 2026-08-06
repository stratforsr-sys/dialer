"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FrameworkStep } from "@/generated/prisma/client";
import { FRAMEWORK_STEPS } from "@/lib/cockpit-flow";

export interface ResolvedScript {
  step: FrameworkStep;
  name: string;
  versionId: string;
  resolved: { variantId: string | null; label: string | null; text: string; empty: boolean };
}

/**
 * Manuset på skärmen.
 *
 * Öppningen visas alltid uppslagen — det är den säljaren behöver i sekund ett.
 * Övriga steg ligger hopfällda: en vägg av text är samma sak som ingen text,
 * eftersom ingen läser den under ett pågående samtal.
 */
export function ScriptPanel({ scripts }: { scripts: ResolvedScript[] }) {
  const usable = scripts.filter((s) => !s.resolved.empty && s.resolved.text.trim() !== "");
  const [open, setOpen] = useState<FrameworkStep | null>(null);

  if (usable.length === 0) return null;

  const order = FRAMEWORK_STEPS.map((s) => s.value);
  const sorted = [...usable].sort((a, b) => order.indexOf(a.step) - order.indexOf(b.step));
  const [first, ...rest] = sorted;

  return (
    <div className="mb-3">
      {/* Öppningen — alltid synlig */}
      <div
        className="rounded-[14px] px-4 py-3.5 mb-1.5"
        style={{ background: "var(--accent-muted)", border: "1px solid var(--border-strong)" }}
      >
        <p
          className="text-[10px] font-semibold uppercase tracking-widest mb-1.5"
          style={{ color: "var(--accent)" }}
        >
          {FRAMEWORK_STEPS.find((s) => s.value === first.step)?.label ?? first.name}
        </p>
        {/* whitespace-pre-wrap: manuset visas precis som det skrevs. HTML slår
            annars ihop radbrytningar och blankrader till mellanslag, och en
            styckeindelad öppning blir en enda oläsbar mening mitt i samtalet. */}
        <p className="text-[14.5px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text)" }}>
          {first.resolved.text}
        </p>
      </div>

      {/* Övriga steg */}
      {rest.map((s) => {
        const label = FRAMEWORK_STEPS.find((x) => x.value === s.step)?.label ?? s.name;
        const isOpen = open === s.step;
        return (
          <div
            key={s.step}
            className="rounded-[11px] mb-1 overflow-hidden"
            style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
          >
            <button
              onClick={() => setOpen(isOpen ? null : s.step)}
              className="flex items-center justify-between w-full px-3.5 py-2"
            >
              <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-dim)" }}>
                {label}
              </span>
              {isOpen
                ? <ChevronUp size={12} style={{ color: "var(--text-dim)" }} />
                : <ChevronDown size={12} style={{ color: "var(--text-dim)" }} />}
            </button>
            {isOpen && (
              <p className="text-[13.5px] leading-relaxed px-3.5 pb-3 whitespace-pre-wrap" style={{ color: "var(--text)" }}>
                {s.resolved.text}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
