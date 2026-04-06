"use client";

import { useState, useTransition } from "react";
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
import { moveDealToStage } from "@/app/actions/deals";
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

    startTransition(() => moveDealToStage(leadId, overId));
  }

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden">
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
  );
}
