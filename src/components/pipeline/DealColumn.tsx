"use client";

import { useRef, useCallback } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DealCard } from "./DealCard";

type Stage = { id: string; name: string; color: string; isWon: boolean; isLost: boolean };

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

function stageTotalValue(deals: Deal[]): string | null {
  let total = 0;
  for (const d of deals) {
    if (d.valueType === "ARR" && d.arrValue != null) total += d.arrValue;
    else if (d.oneTimeValue != null) total += d.oneTimeValue;
  }
  if (total === 0) return null;
  return total >= 1000000
    ? `${(total / 1000000).toFixed(1)}M`
    : total >= 1000
    ? `${(total / 1000).toFixed(0)}k`
    : `${total.toLocaleString("sv-SE")}`;
}

export function DealColumn({
  stage,
  deals,
  isDragging,
}: {
  stage: Stage;
  deals: Deal[];
  isDragging: boolean;
}) {
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: stage.id });
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      setDropRef(node);
      scrollRef.current = node;
    },
    [setDropRef]
  );

  const virtualizer = useVirtualizer({
    count: deals.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 118,
    overscan: 8,
  });

  const totalValue = stageTotalValue(deals);

  return (
    <div className="flex flex-col shrink-0 h-full" style={{ width: "272px" }}>
      {/* Sticky header */}
      <div
        className="flex items-center justify-between px-3 py-2 mb-1 rounded-[10px] shrink-0"
        style={{ background: stage.color + "14", border: `1px solid ${stage.color}28` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: stage.color }} />
          <span className="text-[12px] font-semibold truncate" style={{ color: stage.color }}>
            {stage.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {totalValue && (
            <span className="text-[10px] font-medium" style={{ color: stage.color + "cc" }}>
              {totalValue} kr
            </span>
          )}
          <span
            className="text-[11px] font-bold px-[6px] py-[1px] rounded-full"
            style={{ background: stage.color + "22", color: stage.color }}
          >
            {deals.length}
          </span>
        </div>
      </div>

      {/* Virtualized drop zone */}
      <div
        ref={setRefs}
        className="flex-1 overflow-y-auto min-h-0 rounded-[12px] p-2 transition-colors duration-150"
        style={{
          background: isOver
            ? stage.color + "0e"
            : isDragging
            ? "var(--surface-inset)"
            : "transparent",
          border: isOver ? `1.5px dashed ${stage.color}60` : "1.5px dashed transparent",
        }}
      >
        {deals.length === 0 && !isDragging ? (
          <div
            className="flex items-center justify-center h-16 text-[12px]"
            style={{ color: "var(--text-dim)" }}
          >
            Inga deals
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), width: "100%", position: "relative" }}>
            {virtualizer.getVirtualItems().map((vItem) => {
              const deal = deals[vItem.index];
              return (
                <div
                  key={deal.id}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vItem.start}px)`,
                    paddingBottom: "8px",
                  }}
                >
                  <DealCard deal={deal} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
