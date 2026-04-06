"use client";

import { useDraggable } from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, TrendingUp, Package } from "lucide-react";

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

function formatValue(deal: Deal): string | null {
  if (deal.valueType === "ARR" && deal.arrValue != null) {
    return `${(deal.arrValue / 1000).toFixed(0)}k ARR/år`;
  }
  if (deal.oneTimeValue != null) {
    return deal.oneTimeValue >= 1000
      ? `${(deal.oneTimeValue / 1000).toFixed(0)}k kr`
      : `${deal.oneTimeValue.toLocaleString("sv-SE")} kr`;
  }
  return null;
}

function formatCloseDate(date: Date | null): string | null {
  if (!date) return null;
  const d = new Date(date);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.ceil(diff / 86400000);
  if (days < 0) return "Passerat";
  if (days === 0) return "Idag";
  if (days === 1) return "Imorgon";
  if (days < 7) return `${days}d`;
  if (days < 30) return `${Math.floor(days / 7)}v`;
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}

function probabilityColor(p: number): string {
  if (p >= 70) return "var(--success)";
  if (p >= 40) return "var(--warning)";
  return "var(--text-dim)";
}

export function DealCard({
  deal,
  isDragging: isOverlay = false,
}: {
  deal: Deal;
  isDragging?: boolean;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: deal.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
  };

  const value = formatValue(deal);
  const closeDate = formatCloseDate(deal.expectedCloseAt);
  const isOverdue =
    deal.expectedCloseAt && new Date(deal.expectedCloseAt) < new Date();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab active:cursor-grabbing select-none"
    >
      <div
        className="p-3 rounded-[12px] transition-all duration-150"
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          boxShadow: isOverlay ? "0 12px 32px rgba(0,0,0,0.18)" : "var(--shadow-xs)",
        }}
        onPointerUp={() => {
          if (!isDragging && !isOverlay) router.push(`/leads/${deal.lead.id}`);
        }}
      >
        {/* Company + title */}
        <div className="mb-2.5">
          <p className="text-[11px] font-medium truncate" style={{ color: "var(--text-dim)" }}>
            {deal.lead.companyName}
          </p>
          <p className="text-[13px] font-semibold leading-snug mt-[2px] truncate" style={{ color: "var(--text)" }}>
            {deal.title}
          </p>
        </div>

        {/* Value + probability */}
        {(value || deal.probability > 0) && (
          <div className="flex items-center justify-between mb-2">
            {value ? (
              <span className="text-[12px] font-semibold" style={{ color: "var(--text)" }}>
                {value}
              </span>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-1">
              <TrendingUp size={10} style={{ color: probabilityColor(deal.probability) }} />
              <span className="text-[11px] font-medium" style={{ color: probabilityColor(deal.probability) }}>
                {deal.probability}%
              </span>
            </div>
          </div>
        )}

        {/* Probability bar */}
        <div
          className="w-full h-[3px] rounded-full mb-2.5 overflow-hidden"
          style={{ background: "var(--surface-inset)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${deal.probability}%`,
              background: probabilityColor(deal.probability),
            }}
          />
        </div>

        {/* Footer: products + close date */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 min-w-0">
            {deal.products.length > 0 && (
              <div
                className="flex items-center gap-1 text-[10px] px-1.5 py-[2px] rounded-[5px]"
                style={{ background: "var(--surface-inset)", color: "var(--text-dim)" }}
              >
                <Package size={9} />
                <span className="truncate max-w-[80px]">
                  {deal.products.length === 1
                    ? deal.products[0].name
                    : `${deal.products.length} produkter`}
                </span>
              </div>
            )}
          </div>

          {closeDate && (
            <div
              className="flex items-center gap-1 text-[10px]"
              style={{ color: isOverdue ? "var(--danger)" : "var(--text-dim)" }}
            >
              <Calendar size={9} />
              <span>{closeDate}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
