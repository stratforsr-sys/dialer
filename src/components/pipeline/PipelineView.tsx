"use client";

import { useState } from "react";
import { LayoutGrid, Activity } from "lucide-react";
import { DealKanbanBoard } from "./DealKanbanBoard";
import { PipelineHealth } from "./PipelineHealth";

type Stage = { id: string; name: string; color: string; order: number; isWon: boolean; isLost: boolean };

type Deal = {
  id: string;
  title: string;
  valueType: string;
  oneTimeValue: number | null;
  arrValue: number | null;
  probability: number;
  expectedCloseAt: Date | null;
  stageId: string;
  lead: { id: string; companyName: string; website: string | null; owner: { id: string; name: string } };
  products: { id: string; name: string }[];
};

export function PipelineView({ stages, deals }: { stages: Stage[]; deals: Deal[] }) {
  const [view, setView] = useState<"kanban" | "health">("kanban");

  // Total weighted pipeline value
  const weighted = deals.reduce((sum, d) => {
    const val = d.valueType === "ARR" ? (d.arrValue ?? 0) : (d.oneTimeValue ?? 0);
    return sum + val * d.probability / 100;
  }, 0);

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 h-[52px] border-b shrink-0"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-[15px]" style={{ color: "var(--text)", fontFamily: "var(--font-serif)" }}>
            Pipeline
          </h1>
          <span className="text-[12px] px-2 py-[2px] rounded-full font-medium"
            style={{ background: "var(--accent-muted)", color: "var(--accent)" }}>
            {deals.length} deals
          </span>
          {weighted > 0 && (
            <span className="text-[12px]" style={{ color: "var(--text-muted)" }}>
              {weighted >= 1000000
                ? `${(weighted / 1000000).toFixed(1)}M weighted`
                : `${Math.round(weighted / 1000)}k weighted`}
            </span>
          )}
        </div>

        <div
          className="flex items-center gap-[2px] p-[3px] rounded-[10px]"
          style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
        >
          {[
            { id: "kanban" as const, icon: <LayoutGrid size={13} />, label: "Kanban" },
            { id: "health" as const, icon: <Activity size={13} />, label: "Health" },
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className="flex items-center gap-1 px-3 py-[5px] text-[12px] font-medium rounded-[7px] transition-all duration-150"
              style={{
                background: view === v.id ? "var(--surface)" : "transparent",
                color: view === v.id ? "var(--text)" : "var(--text-dim)",
                boxShadow: view === v.id ? "var(--shadow-xs)" : "none",
                border: view === v.id ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              {v.icon}
              {v.label}
            </button>
          ))}
        </div>

        <div className="w-[120px]" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {view === "kanban" ? (
          <DealKanbanBoard initialStages={stages} initialDeals={deals} />
        ) : (
          // Health view needs updating too but keep for now
          <div className="flex items-center justify-center h-full" style={{ color: "var(--text-muted)" }}>
            <p className="text-sm">Health view uppdateras snart</p>
          </div>
        )}
      </div>
    </div>
  );
}
