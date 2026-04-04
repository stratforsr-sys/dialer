"use client";

import { useDraggable } from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { CSS } from "@dnd-kit/utilities";
import { Users, Clock } from "lucide-react";

type Lead = {
  id: string;
  companyName: string;
  stageId: string;
  owner: { id: string; name: string };
  _count: { contacts: number };
  activities: { type: string; timestamp: Date }[];
  updatedAt: Date;
};

function formatRelativeTime(date: Date | string): string {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "idag";
  if (days === 1) return "igår";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}v`;
  return `${Math.floor(days / 30)}mån`;
}

export function LeadCard({
  lead,
  isDragging: isOverlay = false,
}: {
  lead: Lead;
  isDragging?: boolean;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lead.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="group cursor-grab active:cursor-grabbing select-none"
    >
      <div
        className="p-3 rounded-[10px] transition-shadow duration-150"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: isOverlay
            ? "0 8px 24px rgba(0,0,0,0.15)"
            : "var(--shadow-xs)",
        }}
        onPointerUp={(e) => {
          // Only navigate on click (not after drag)
          if (!isDragging && !isOverlay) {
            router.push(`/leads/${lead.id}`);
          }
        }}
      >
        {/* Company name */}
        <div className="flex items-start gap-2 mb-2">
          <div
            className="w-6 h-6 rounded-[6px] flex items-center justify-center text-[10px] font-bold shrink-0 mt-[1px]"
            style={{
              background: "var(--surface-inset)",
              color: "var(--text-secondary)",
            }}
          >
            {lead.companyName.charAt(0).toUpperCase()}
          </div>
          <p
            className="text-[13px] font-medium leading-snug"
            style={{ color: "var(--text)" }}
          >
            {lead.companyName}
          </p>
        </div>

        {/* Meta */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className="flex items-center gap-1 text-[11px]"
              style={{ color: "var(--text-dim)" }}
            >
              <Users size={10} />
              {lead._count.contacts}
            </span>
            <span
              className="text-[11px] px-[6px] py-[1px] rounded-full"
              style={{
                background: "var(--surface-inset)",
                color: "var(--text-dim)",
              }}
            >
              {lead.owner.name.split(" ")[0]}
            </span>
          </div>

          <span
            className="flex items-center gap-1 text-[10px]"
            style={{ color: "var(--text-dim)" }}
          >
            <Clock size={9} />
            {formatRelativeTime(lead.updatedAt)}
          </span>
        </div>
      </div>
    </div>
  );
}
