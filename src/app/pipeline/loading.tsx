export default function PipelineLoading() {
  const cols = [
    { w: 120, count: 4 },
    { w: 140, count: 6 },
    { w: 110, count: 3 },
    { w: 130, count: 5 },
    { w: 90,  count: 2 },
  ];

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg)" }}>
      {/* Toolbar */}
      <div
        className="flex items-center gap-3 px-5 py-3 border-b shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
      >
        <div className="h-8 w-40 rounded-[8px] skeleton" />
        <div className="ml-auto h-8 w-32 rounded-[8px] skeleton" />
      </div>

      {/* Kanban columns */}
      <div className="flex-1 flex gap-3 p-4 overflow-hidden">
        {cols.map((col, ci) => (
          <div
            key={ci}
            className="flex flex-col gap-2 w-56 shrink-0"
          >
            {/* Column header */}
            <div className="flex items-center justify-between px-2 pb-1">
              <div className="h-3 rounded-[4px] skeleton" style={{ width: col.w }} />
              <div className="h-5 w-7 rounded-[6px] skeleton" />
            </div>

            {/* Cards */}
            {Array.from({ length: col.count }).map((_, ri) => (
              <div
                key={ri}
                className="rounded-[12px] p-3 space-y-2 border skeleton-card"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  opacity: 1 - ri * 0.08,
                }}
              >
                <div className="h-3 rounded-[4px] skeleton" style={{ width: 100 + (ri % 3) * 18 }} />
                <div className="h-2.5 rounded-[4px] skeleton" style={{ width: 60 + (ri % 2) * 20 }} />
                <div className="h-1.5 w-full rounded-full skeleton mt-2" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
