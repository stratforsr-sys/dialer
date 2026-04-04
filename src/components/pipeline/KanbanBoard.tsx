"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Users } from "lucide-react";
import { moveLeadToStage } from "@/app/actions/pipeline";
import { KanbanColumn } from "./KanbanColumn";
import { LeadCard } from "./LeadCard";

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

export function KanbanBoard({
  initialStages,
  initialLeads,
}: {
  initialStages: Stage[];
  initialLeads: Lead[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const activeLead = activeId ? leads.find((l) => l.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const leadId = active.id as string;
    const overId = over.id as string;

    // Check if over a stage column
    const overStage = initialStages.find((s) => s.id === overId);
    if (!overStage) return;

    setLeads((prev) =>
      prev.map((l) =>
        l.id === leadId ? { ...l, stageId: overId, stage: overStage } : l
      )
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const leadId = active.id as string;
    const overId = over.id as string;

    const lead = leads.find((l) => l.id === leadId);
    const overStage = initialStages.find((s) => s.id === overId);
    if (!lead || !overStage || lead.stageId === overId) return;

    startTransition(() => moveLeadToStage(leadId, overId));
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-6 h-[56px] border-b shrink-0"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            Pipeline
          </h1>
          <span
            className="text-[12px] px-2 py-[2px] rounded-full font-medium"
            style={{ background: "var(--accent-muted)", color: "var(--accent)" }}
          >
            {leads.length} leads
          </span>
        </div>
        <button
          onClick={() => router.push("/leads")}
          className="text-[13px] px-3 py-[6px] rounded-[8px] transition-colors"
          style={{
            background: "var(--surface-inset)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
          }}
        >
          Listvy
        </button>
      </div>

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-3 p-4 h-full min-w-max">
            {initialStages.map((stage) => {
              const stageLeads = leads.filter((l) => l.stageId === stage.id);
              return (
                <KanbanColumn
                  key={stage.id}
                  stage={stage}
                  leads={stageLeads}
                  isDragging={!!activeId}
                />
              );
            })}
          </div>

          <DragOverlay>
            {activeLead && (
              <div style={{ transform: "rotate(2deg)", opacity: 0.95 }}>
                <LeadCard lead={activeLead} isDragging />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}
