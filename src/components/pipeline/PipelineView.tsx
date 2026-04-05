"use client";

import { useState } from "react";
import { LayoutGrid, Activity } from "lucide-react";
import { KanbanBoard } from "./KanbanBoard";
import { PipelineHealth } from "./PipelineHealth";

type Stage = {
  id: string;
  name: string;
  color: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
};

type Lead = {
  id: string;
  companyName: string;
  stageId: string;
  stage: Stage;
  owner: { id: string; name: string };
  _count: { contacts: number };
  activities: { type: string; timestamp: Date }[];
  updatedAt: Date;
};

export function PipelineView({ stages, leads }: { stages: Stage[]; leads: Lead[] }) {
  const [view, setView] = useState<"kanban" | "health">("kanban");

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      {/* Page header with view toggle */}
      <div
        className="flex items-center justify-between px-6 h-[52px] border-b shrink-0"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <h1
          className="text-[16px]"
          style={{ color: "var(--text)", fontFamily: "var(--font-serif)" }}
        >
          Pipeline
        </h1>

        {/* View toggle */}
        <div
          className="flex items-center gap-[2px] p-[3px] rounded-[10px]"
          style={{ background: "var(--surface-inset)", border: "1px solid var(--border)" }}
        >
          {[
            { id: "kanban" as const, icon: <LayoutGrid size={13} />, label: "Kanban" },
            { id: "health" as const, icon: <Activity size={13} />,    label: "Health" },
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

        <div className="w-[120px]" /> {/* spacer to center title */}
      </div>

      {/* View content */}
      <div className="flex-1 overflow-hidden">
        {view === "kanban" ? (
          <KanbanBoard initialStages={stages} initialLeads={leads} />
        ) : (
          <PipelineHealth stages={stages} leads={leads} />
        )}
      </div>
    </div>
  );
}
