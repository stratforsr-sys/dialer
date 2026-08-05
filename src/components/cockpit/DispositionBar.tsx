"use client";

import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import type { FlowOption, FlowStage } from "@/lib/cockpit-flow";
import { stagePrompt } from "@/lib/cockpit-flow";

/**
 * Dispositionsknapparna. Ett steg i taget, alltid samma plats på skärmen, så
 * att muskelminnet fungerar även när trappan går ett steg djupare.
 */
export function DispositionBar<T extends string>({
  stage,
  options,
  onPick,
  onBack,
  canGoBack,
}: {
  stage: FlowStage;
  options: FlowOption<T>[];
  onPick: (value: T) => void;
  onBack: () => void;
  canGoBack: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        {canGoBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-[7px] transition-colors"
            style={{
              color: "var(--text-dim)",
              background: "var(--surface-inset)",
              border: "1px solid var(--border)",
            }}
            title="Tillbaka (Backsteg)"
          >
            <ChevronLeft size={11} /> Ångra
          </button>
        )}
        <p
          className="text-[11px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--text-dim)" }}
        >
          {stagePrompt(stage)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {options.map((opt) => (
          <motion.button
            key={opt.key}
            whileTap={{ scale: 0.96 }}
            onClick={() => onPick(opt.value)}
            className="flex flex-col items-start px-3 py-[10px] text-left transition-all"
            style={{
              background: opt.color + "10",
              border: `1px solid ${opt.color}30`,
              color: opt.color,
              borderRadius: "11px",
            }}
          >
            <span className="flex items-center justify-between w-full">
              <span className="text-[12px] font-medium leading-tight">{opt.label}</span>
              <span
                className="text-[10px] px-[5px] py-[1px] rounded font-bold shrink-0 ml-1"
                style={{ background: opt.color + "22" }}
              >
                {opt.key}
              </span>
            </span>
            {opt.hint && (
              <span className="text-[10px] mt-[2px] opacity-70">{opt.hint}</span>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
