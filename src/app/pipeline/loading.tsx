import { Bar } from "@/components/skeletons/Skeleton";

/** Kanban-kolumnerna — tyngst sidan i bygget, så skelettet gör mest nytta här. */
export default function PipelineLoading() {
  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg)" }}>
      <div
        className="flex items-center justify-between px-6 h-[56px] shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)" }}
      >
        <div className="flex items-center gap-3">
          <Bar w={78} h={15} />
          <Bar w={34} h={18} radius={9} />
        </div>
        <Bar w={130} h={32} radius={8} />
      </div>

      <div className="flex-1 flex gap-4 p-6 overflow-hidden">
        {Array.from({ length: 5 }).map((_, col) => (
          <div
            key={col}
            className="flex flex-col gap-3 min-w-[280px] flex-1"
            style={{ opacity: Math.max(0.35, 1 - col * 0.14) }}
          >
            <div className="flex items-center justify-between px-1">
              <Bar w={96} h={12} />
              <Bar w={24} h={16} radius={8} />
            </div>
            {Array.from({ length: 3 - (col % 2) }).map((_, card) => (
              <div
                key={card}
                className="rounded-lg p-4 flex flex-col gap-2.5"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <Bar w="72%" h={13} />
                <Bar w="46%" h={10} />
                <div className="flex items-center justify-between mt-1">
                  <Bar w={62} h={18} radius={9} />
                  <Bar w={44} h={11} />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
