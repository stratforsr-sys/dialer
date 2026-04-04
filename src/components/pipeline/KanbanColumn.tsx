"use client";

import { useDroppable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import { LeadCard } from "./LeadCard";

type Stage = {
  id: string;
  name: string;
  color: string;
  isWon: boolean;
  isLost: boolean;
};

type Lead = {
  id: string;
  companyName: string;
  stageId: string;
  owner: { id: string; name: string };
  _count: { contacts: number };
  activities: { type: string; timestamp: Date }[];
  updatedAt: Date;
};

export function KanbanColumn({
  stage,
  leads,
  isDragging,
}: {
  stage: Stage;
  leads: Lead[];
  isDragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      className="flex flex-col shrink-0"
      style={{ width: "280px" }}
    >
      {/* Column header */}
      <div
        className="flex items-center justify-between px-3 py-2 mb-2 rounded-[10px]"
        style={{
          background: stage.color + "14",
          border: `1px solid ${stage.color}28`,
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="w-[7px] h-[7px] rounded-full shrink-0"
            style={{ background: stage.color }}
          />
          <span
            className="text-[12px] font-semibold"
            style={{ color: stage.color }}
          >
            {stage.name}
          </span>
        </div>
        <span
          className="text-[11px] font-bold px-[6px] py-[1px] rounded-full"
          style={{
            background: stage.color + "22",
            color: stage.color,
          }}
        >
          {leads.length}
        </span>
      </div>

      {/* Drop zone */}
      <div
        ref={setNodeRef}
        className="flex flex-col gap-2 flex-1 min-h-[200px] rounded-[12px] p-2 transition-colors duration-150"
        style={{
          background: isOver
            ? stage.color + "0e"
            : isDragging
            ? "var(--surface-inset)"
            : "transparent",
          border: isOver
            ? `1.5px dashed ${stage.color}60`
            : "1.5px dashed transparent",
        }}
      >
        {leads.map((lead, i) => (
          <motion.div
            key={lead.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: i * 0.03 }}
          >
            <LeadCard lead={lead} />
          </motion.div>
        ))}

        {leads.length === 0 && !isDragging && (
          <div
            className="flex items-center justify-center h-16 text-[12px]"
            style={{ color: "var(--text-dim)" }}
          >
            Inga leads
          </div>
        )}
      </div>
    </div>
  );
}
