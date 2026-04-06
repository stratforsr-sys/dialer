"use client";

import { useState, useTransition } from "react";
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors,
  type DragStartEvent, type DragEndEvent, type DragOverEvent,
} from "@dnd-kit/core";
import { moveDealToStage } from "@/app/actions/deals";
import { DealColumn } from "./DealColumn";
import { DealCard } from "./DealCard";

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
  lead: { id: string; companyName: string; owner: { name: string } };
  products: { id: string; name: string }[];
};

export function DealKanbanBoard({
  initialStages,
  initialDeals,
}: {
  initialStages: Stage[];
  initialDeals: Deal[];
}) {
  const [, startTransition] = useTransition();
  const [deals, setDeals] = useState<Deal[]>(initialDeals);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const overStage = initialStages.find((s) => s.id === over.id);
    if (!overStage) return;
    setDeals((prev) =>
      prev.map((d) => (d.id === active.id ? { ...d, stageId: overStage.id } : d))
    );
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    const deal = deals.find((d) => d.id === active.id);
    const overStage = initialStages.find((s) => s.id === over.id);
    if (!deal || !overStage || deal.stageId === over.id) return;
    startTransition(() => moveDealToStage(deal.id, overStage.id));
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
          {initialStages.map((stage) => (
            <DealColumn
              key={stage.id}
              stage={stage}
              deals={deals.filter((d) => d.stageId === stage.id)}
              isDragging={!!activeId}
            />
          ))}
        </div>
        <DragOverlay>
          {activeDeal && (
            <div style={{ transform: "rotate(2deg)", opacity: 0.95 }}>
              <DealCard deal={activeDeal} isDragging />
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
